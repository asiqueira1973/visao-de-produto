-- ============================================================================
-- 0018 — Funções de administração e o job de rebaixamento
--
-- O que faz: cria as funções que a tela de admin usa — todas devolvendo
--            AGREGADO, nunca evento — e o job que rebaixa quem parou de pagar.
-- Implementa: EPICO-COBRANCA.md, seções 3.3, 6 e 7; decisões C5 e C6.
--
-- A REGRA QUE GOVERNA ESTE ARQUIVO (decisão C5): nenhuma política de RLS das
-- tabelas existentes é tocada. Admin não vira `or eh_admin()` espalhado por
-- catorze políticas — seriam catorze lugares novos para errar, e vazamento
-- entre contas é o único erro deste produto que não tem conserto.
--
-- Em vez disso: funções próprias, `security definer`, que **conferem o admin
-- dentro delas mesmas** e devolvem só o que um painel de negócio precisa.
-- Quem não é admin recebe exceção, não uma lista vazia — lista vazia esconde
-- erro de permissão e faz alguém achar que não há contas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_admin_exige — o portão de todas as funções abaixo
-- O que faz: interrompe a execução se quem chamou não for admin.
-- Recebe:    nada; lê auth.uid().
-- Devolve:   o id do admin, para as funções registrarem a auditoria.
-- ----------------------------------------------------------------------------
create or replace function fn_admin_exige()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'sem_sessao: esta função exige alguém autenticado';
  end if;

  if not exists (select 1 from public.administradores a where a.usuario_id = v_usuario) then
    raise exception 'nao_autorizado: esta função é só para administradores da plataforma';
  end if;

  return v_usuario;
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_admin_registra — a auditoria
-- O que faz: grava o que um admin fez.
-- Recebe:    o admin, a ação, a conta alvo e o detalhe.
-- Devolve:   nada.
-- Vale para o dono também: auditoria com exceção para o dono não é auditoria.
-- ----------------------------------------------------------------------------
create or replace function fn_admin_registra(
  p_admin uuid, p_acao acao_admin, p_conta uuid, p_detalhe jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.acoes_admin (admin_id, acao, conta_alvo, detalhe)
  values (p_admin, p_acao, p_conta, coalesce(p_detalhe, '{}'::jsonb));
$$;

-- ----------------------------------------------------------------------------
-- fn_admin_contas — a lista do painel
-- O que faz: devolve uma linha por conta, com plano, assinatura e a medição do
--            mês corrente.
-- Recebe:    nada.
-- Devolve:   o retrato de negócio de cada conta.
--
-- Repare no que NÃO está aqui: nome de evento, propriedade, `distinct_id`,
-- catálogo. Para saber se uma conta está viva basta `uso_mensal`; ler os
-- eventos dela não acrescenta nada e destrói a confiança que o produto vende.
-- ----------------------------------------------------------------------------
create or replace function fn_admin_contas()
returns table (
  conta_id          uuid,
  nome              text,
  email_do_dono     text,
  plano             plano_conta,
  cortesia          boolean,
  assinatura_status status_assinatura,
  periodo_fim       timestamptz,
  criada_em         timestamptz,
  cancelada_em      timestamptz,
  projetos          bigint,
  eventos_no_mes    bigint,
  pessoas_no_mes    integer,
  consultas_no_mes  integer,
  tem_dados_de_nota boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.fn_admin_exige();
begin
  perform public.fn_admin_registra(v_admin, 'consultou_contas', null);

  return query
  select
    c.id,
    c.nome,
    u.email::text,
    c.plano,
    c.cortesia,
    c.assinatura_status,
    c.periodo_fim,
    c.criada_em,
    c.cancelada_em,
    (select count(*) from public.projetos p where p.conta_id = c.id and p.arquivado_em is null),
    coalesce(m.eventos_recebidos, 0),
    coalesce(m.pessoas_distintas, 0),
    coalesce(m.consultas_mcp, 0),
    exists (select 1 from public.dados_de_cobranca d where d.conta_id = c.id)
  from public.contas c
  left join public.usuarios_conta uc on uc.conta_id = c.id
  left join auth.users u on u.id = uc.usuario_id
  left join public.uso_mensal m
    on m.conta_id = c.id and m.competencia = date_trunc('month', now())::date
  order by c.criada_em desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_admin_define_cortesia — dar e tirar cortesia (decisão C7)
-- O que faz: marca ou desmarca a conta como cortesia, ajustando os limites.
-- Recebe:    a conta e se é para conceder ou remover.
-- Devolve:   nada.
--
-- Cortesia é uma coluna, não uma integração: a conta fica paga sem cliente no
-- Stripe, sem assinatura e sem cobrança. Remover devolve a conta ao gratuito —
-- e isso só é seguro porque rebaixar não apaga nada (decisão C6).
-- ----------------------------------------------------------------------------
create or replace function fn_admin_define_cortesia(p_conta_id uuid, p_conceder boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.fn_admin_exige();
  v_antes jsonb;
begin
  select to_jsonb(x) into v_antes
  from (select plano, cortesia, retencao_meses, limite_projetos
        from public.contas where id = p_conta_id) x;

  if v_antes is null then
    raise exception 'conta_inexistente: não há conta com este id';
  end if;

  if p_conceder then
    update public.contas
    set cortesia = true, plano = 'pago', retencao_meses = 12, limite_projetos = null
    where id = p_conta_id;
  else
    -- Só volta para o gratuito quem não tem assinatura ativa pagando: tirar a
    -- cortesia de quem também paga não pode rebaixar quem está em dia.
    update public.contas
    set cortesia = false,
        plano = case when assinatura_status = 'ativa' then plano else 'gratuito' end,
        retencao_meses = case when assinatura_status = 'ativa' then retencao_meses else 1 end,
        limite_projetos = case when assinatura_status = 'ativa' then limite_projetos else 1 end
    where id = p_conta_id;
  end if;

  perform public.fn_admin_registra(
    v_admin,
    case when p_conceder then 'concedeu_cortesia' else 'removeu_cortesia' end,
    p_conta_id,
    jsonb_build_object('antes', v_antes)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_admin_auditoria — o que os admins andaram fazendo
-- O que faz: devolve as ações mais recentes, com quem fez e sobre quem.
-- Recebe:    quantas linhas trazer.
-- Devolve:   a lista, da mais recente para a mais antiga.
-- ----------------------------------------------------------------------------
create or replace function fn_admin_auditoria(p_limite integer default 50)
returns table (
  feito_em    timestamptz,
  email_admin text,
  acao        acao_admin,
  conta_alvo  uuid,
  nome_alvo   text,
  detalhe     jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_admin_exige();

  return query
  select a.feito_em, u.email::text, a.acao, a.conta_alvo, c.nome, a.detalhe
  from public.acoes_admin a
  left join auth.users u on u.id = a.admin_id
  left join public.contas c on c.id = a.conta_alvo
  order by a.feito_em desc
  limit least(coalesce(p_limite, 50), 200);
end;
$$;

-- Só quem está logado chama; o portão de admin é dentro de cada função.
revoke all on function fn_admin_exige()                          from public, anon, authenticated;
revoke all on function fn_admin_registra(uuid, acao_admin, uuid, jsonb) from public, anon, authenticated;
revoke all on function fn_admin_contas()                         from public, anon;
revoke all on function fn_admin_define_cortesia(uuid, boolean)   from public, anon;
revoke all on function fn_admin_auditoria(integer)               from public, anon;
grant execute on function fn_admin_contas()                       to authenticated;
grant execute on function fn_admin_define_cortesia(uuid, boolean) to authenticated;
grant execute on function fn_admin_auditoria(integer)             to authenticated;

-- ============================================================================
-- O job de rebaixamento (decisão C6)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_rebaixa_contas_vencidas
-- O que faz: devolve ao plano gratuito as contas cuja assinatura foi cancelada
--            e cujo período pago já venceu.
-- Recebe:    nada. Roda por pg_cron, diariamente.
-- Devolve:   quantas contas foram rebaixadas.
--
-- O QUE ELE NÃO FAZ, e isso é o ponto: não apaga evento, não apaga projeto,
-- não arquiva nada, não bloqueia leitura. Uma conta que tinha quatro projetos
-- continua com quatro, todos legíveis e todos recebendo evento. Ela só não
-- cria o quinto, e passa a enxergar 1 mês em vez de 12.
--
-- Conta em cortesia é pulada: ela não tem assinatura para vencer.
-- ----------------------------------------------------------------------------
create or replace function fn_rebaixa_contas_vencidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantas integer;
begin
  with rebaixadas as (
    update public.contas
    set plano = 'gratuito', retencao_meses = 1, limite_projetos = 1
    where cortesia = false
      and plano = 'pago'
      and assinatura_status = 'cancelada'
      and periodo_fim is not null
      and periodo_fim < now()
    returning 1
  )
  select count(*) into v_quantas from rebaixadas;

  return v_quantas;
end;
$$;

revoke all on function fn_rebaixa_contas_vencidas() from public, anon, authenticated;

select cron.schedule(
  'rebaixa_contas_vencidas',
  '15 5 * * *',
  $$select public.fn_rebaixa_contas_vencidas()$$
);
