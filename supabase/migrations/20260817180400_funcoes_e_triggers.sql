-- ============================================================================
-- 0005 — Funções e triggers (a lógica que vive no banco)
--
-- O que faz: cria as funções e triggers da seção 7.10 — catálogo automático,
--            pessoas, criação de conta no primeiro login, agregação de uso
--            mensal, expurgo de contas canceladas e poda do histórico do cron.
-- Implementa: seção 7.10; regras 11.2, 11.12, 11.17; princípios 0.2 e 0.6.
--
-- Trade-off declarado (seção 7.10): trigger FOR EACH ROW numa tabela de
-- ingestão é a escolha errada em escala; a certa seria agregação em lote por
-- pg_cron. Foi escolhida a trigger porque no volume da v1 (dezenas de eventos
-- por dia) o custo é irrelevante e o catálogo fica correto em tempo real, que
-- é requisito da tela de Atividade. Gatilho de revisão: acima de 100 eventos
-- por segundo sustentados, migrar para agregação em lote (risco R2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_atualiza_definicao_evento — seção 7.10
-- O que faz: mantém o catálogo sozinho. Cria a definição se não existir,
--            incrementa o contador, atualiza primeira e última ocorrência,
--            acrescenta a tela ao array se ainda não estiver lá, e preenche a
--            descrição APENAS se estiver nula.
-- Recebe:    a linha recém-inserida em `eventos` (NEW).
-- Devolve:   NEW (trigger AFTER, o retorno é ignorado).
-- Regra 11.2: descrição editada à mão pelo dono nunca é sobrescrita.
-- ----------------------------------------------------------------------------
create or replace function fn_atualiza_definicao_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.definicoes_evento (
    projeto_id, nome, descricao, telas,
    total_ocorrencias, primeira_ocorrencia_em, ultima_ocorrencia_em
  )
  values (
    new.projeto_id,
    new.nome,
    new.descricao,
    case when new.tela is null then '{}'::text[] else array[new.tela] end,
    1,
    new.ocorrido_em,
    new.ocorrido_em
  )
  on conflict (projeto_id, nome) do update set
    total_ocorrencias = public.definicoes_evento.total_ocorrencias + 1,
    -- Eventos podem chegar fora de ordem (fila offline), por isso least/greatest
    -- em vez de atribuição direta.
    primeira_ocorrencia_em = least(
      coalesce(public.definicoes_evento.primeira_ocorrencia_em, excluded.primeira_ocorrencia_em),
      excluded.primeira_ocorrencia_em
    ),
    ultima_ocorrencia_em = greatest(
      coalesce(public.definicoes_evento.ultima_ocorrencia_em, excluded.ultima_ocorrencia_em),
      excluded.ultima_ocorrencia_em
    ),
    -- Regra 11.2: só preenche quando está nula.
    descricao = coalesce(public.definicoes_evento.descricao, excluded.descricao),
    telas = case
              when new.tela is null or new.tela = any (public.definicoes_evento.telas)
                then public.definicoes_evento.telas
              else public.definicoes_evento.telas || new.tela
            end;

  return new;
end;
$$;

create trigger trg_eventos_definicao
  after insert on eventos
  for each row
  execute function fn_atualiza_definicao_evento();

-- ----------------------------------------------------------------------------
-- fn_atualiza_pessoa — seção 7.10
-- O que faz: mantém a tabela `pessoas`. Cria a pessoa se não existir,
--            incrementa o total de eventos, atualiza primeiro e último visto e
--            faz merge das propriedades de pessoa.
-- Recebe:    a linha recém-inserida em `eventos` (NEW).
-- Devolve:   NEW.
-- Contrato: as propriedades de pessoa viajam em propriedades->'pessoa', que é
--           onde o SDK grava o que foi passado no identify(). Nada é inferido
--           (princípio 0.1).
-- ----------------------------------------------------------------------------
create or replace function fn_atualiza_pessoa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_props_pessoa jsonb;
begin
  -- Só faz merge se o app declarou um objeto em propriedades->'pessoa'.
  v_props_pessoa := case
    when jsonb_typeof(new.propriedades -> 'pessoa') = 'object'
      then new.propriedades -> 'pessoa'
    else '{}'::jsonb
  end;

  insert into public.pessoas (
    projeto_id, distinct_id, propriedades,
    total_eventos, primeiro_visto_em, ultimo_visto_em
  )
  values (
    new.projeto_id, new.distinct_id, v_props_pessoa,
    1, new.ocorrido_em, new.ocorrido_em
  )
  on conflict (projeto_id, distinct_id) do update set
    total_eventos     = public.pessoas.total_eventos + 1,
    primeiro_visto_em = least(public.pessoas.primeiro_visto_em, excluded.primeiro_visto_em),
    ultimo_visto_em   = greatest(public.pessoas.ultimo_visto_em, excluded.ultimo_visto_em),
    propriedades      = public.pessoas.propriedades || excluded.propriedades;

  return new;
end;
$$;

create trigger trg_eventos_pessoa
  after insert on eventos
  for each row
  execute function fn_atualiza_pessoa();

-- ----------------------------------------------------------------------------
-- fn_cria_conta_no_cadastro — seção 5.2
-- O que faz: no primeiro login com Google, cria a conta no plano gratuito e
--            vincula o usuário a ela como dono.
-- Recebe:    a linha recém-criada em auth.users (NEW).
-- Devolve:   NEW.
-- Princípio 0.6: não há aprovação, lista de espera nem criação manual no
-- console. Se alguém precisar "liberar" um cadastro, o princípio foi violado.
-- ----------------------------------------------------------------------------
create or replace function fn_cria_conta_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_nome     text;
begin
  -- Nome vindo do perfil do Google; cai para o e-mail quando o provedor não
  -- manda nome.
  v_nome := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'Conta sem nome'
  );

  insert into public.contas (nome)
  values (v_nome)
  returning id into v_conta_id;

  insert into public.usuarios_conta (conta_id, usuario_id, papel)
  values (v_conta_id, new.id, 'dono');

  return new;
end;
$$;

create trigger trg_usuario_criado_cria_conta
  after insert on auth.users
  for each row
  execute function fn_cria_conta_no_cadastro();

-- ----------------------------------------------------------------------------
-- fn_agrega_uso_mensal — seções 7.9.2 e 7.10
-- O que faz: faz upsert em `uso_mensal` para o mês corrente de cada conta:
--            eventos recebidos, projetos ativos e pessoas distintas.
--            `consultas_mcp` NÃO é tocada aqui — quem incrementa é o próprio
--            servidor MCP a cada chamada, para não precisar de tabela de log.
-- Recebe:    nada. Roda por pg_cron, diariamente às 04:00 UTC.
-- Devolve:   nada.
-- É a medição do princípio 0.6 e a precondição da cobrança (regra 11.15):
-- não dá para faturar um mês que nunca foi contado.
-- ----------------------------------------------------------------------------
create or replace function fn_agrega_uso_mensal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competencia date := date_trunc('month', now())::date;
begin
  insert into public.uso_mensal (
    conta_id, competencia, eventos_recebidos,
    projetos_ativos, pessoas_distintas, atualizado_em
  )
  select
    e.conta_id,
    v_competencia,
    count(*),
    count(distinct e.projeto_id),
    count(distinct e.distinct_id),
    now()
  from public.eventos e
  where e.recebido_em >= v_competencia
    and e.recebido_em < (v_competencia + interval '1 month')
  group by e.conta_id
  on conflict (conta_id, competencia) do update set
    eventos_recebidos = excluded.eventos_recebidos,
    projetos_ativos   = excluded.projetos_ativos,
    pessoas_distintas = excluded.pessoas_distintas,
    atualizado_em     = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_expurga_contas_canceladas — regra 11.17
-- O que faz: apaga definitivamente os dados de contas canceladas há mais de
--            30 dias. Dentro dos 30 dias a exportação continua disponível e o
--            cancelamento é reversível pelo próprio usuário.
-- Recebe:    nada. Roda por pg_cron, diariamente.
-- Devolve:   nada.
-- O delete em cascata leva projetos, eventos, catálogo, pessoas, painéis e
-- credenciais junto. Nenhum passo exige intervenção do dono da plataforma.
-- ----------------------------------------------------------------------------
create or replace function fn_expurga_contas_canceladas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.contas
  where cancelada_em is not null
    and cancelada_em < now() - interval '30 days';
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_poda_cron_historico — seção 7.10
-- O que faz: apaga registros de cron.job_run_details com mais de 30 dias.
-- Recebe:    nada. Roda por pg_cron, semanalmente.
-- Devolve:   nada.
-- A documentação do Supabase avisa explicitamente que o pg_cron não limpa
-- essa tabela sozinho e que o crescimento dela atrapalha upgrades.
-- ----------------------------------------------------------------------------
create or replace function fn_poda_cron_historico()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from cron.job_run_details
  where end_time < now() - interval '30 days';
end;
$$;
