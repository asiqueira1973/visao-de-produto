-- ============================================================================
-- 0022 — A ingestão passa a se proteger
--
-- O que faz: dá à ingestão duas defesas que ela não tinha — o teto mensal de
--            eventos, que já existia como número mas ninguém consultava, e um
--            limite de taxa por minuto.
-- Implementa: EPICO-COBRANCA.md, decisão C1 (o teto é válvula, não preço) e a
--             abertura do cadastro ao público.
--
-- POR QUE AS DUAS, E NÃO SÓ UMA:
--
-- O teto mensal lê `uso_mensal`, que o job diário mantém — ou seja, ele está
-- até 24 h atrasado. Isso serve para abuso sustentado, e é inútil contra um
-- laço mal escrito que manda dez milhões de eventos em uma hora. Quem pega o
-- laço é o limite por minuto, que conta em tempo real.
--
-- O QUE ACONTECE AO BATER: 429, com a informação de quanto esperar. Não é
-- 403 nem erro genérico — quem está do outro lado é um programa, e 429 é o
-- código que um programa sabe interpretar e repetir depois.
--
-- Os dois limites são COLUNAS, e não constantes: levantar o teto de alguém que
-- pediu não pode exigir deploy.
-- ============================================================================

alter table contas
  -- Quantos eventos por minuto uma conta pode mandar. Um app de time pequeno
  -- manda dezenas por dia; precisar de 33 por segundo sustentados significa
  -- que alguma coisa está errada, e é isso que o número existe para pegar.
  add column limite_eventos_minuto integer not null default 2000;

comment on column contas.limite_eventos_minuto is
  'Freio de emergência contra laço mal escrito. Nunca gatilho de preço (decisão C1).';

-- ----------------------------------------------------------------------------
-- taxa_de_ingestao — a contagem por minuto
--
-- Uma linha por credencial e por minuto. Guardar assim, em vez de manter um
-- contador que precisa ser zerado, evita a corrida de zerar no instante errado:
-- o minuto novo simplesmente é outra linha.
-- ----------------------------------------------------------------------------
create table taxa_de_ingestao (
  credencial_id uuid not null references credenciais (id) on delete cascade,
  minuto        timestamptz not null,
  eventos       integer not null default 0,
  primary key (credencial_id, minuto)
);

alter table taxa_de_ingestao enable row level security;
revoke all on taxa_de_ingestao from anon, authenticated;

create index idx_taxa_minuto on taxa_de_ingestao (minuto);

-- ----------------------------------------------------------------------------
-- fn_autoriza_ingestao — a única pergunta que a Edge Function precisa fazer
--
-- O que faz: valida a chave, contabiliza a taxa e confere os dois limites, numa
--            ida só ao banco.
-- Recebe:    o hash da chave e quantos eventos vêm no lote.
-- Devolve:   a conta e o projeto quando pode passar; `permitido` falso e o
--            motivo quando não.
--
-- Substitui `fn_valida_chave_ingestao` no caminho da ingestão. A antiga
-- continua existindo porque a suíte de testes a usa para verificar credencial
-- isoladamente.
-- ----------------------------------------------------------------------------
create or replace function fn_autoriza_ingestao(p_valor_hash text, p_quantidade integer)
returns table (
  conta_id      uuid,
  projeto_id    uuid,
  permitido     boolean,
  motivo        text,
  esperar_seg   integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credencial  uuid;
  v_conta       uuid;
  v_projeto     uuid;
  v_ultimo_uso  timestamptz;
  v_lim_minuto  integer;
  v_lim_mes     integer;
  v_no_minuto   integer;
  v_no_mes      bigint;
  v_minuto      timestamptz := date_trunc('minute', now());
begin
  select c.id, c.conta_id, c.projeto_id, c.ultimo_uso_em,
         ct.limite_eventos_minuto, ct.limite_eventos_mes
    into v_credencial, v_conta, v_projeto, v_ultimo_uso, v_lim_minuto, v_lim_mes
  from public.credenciais c
  join public.contas ct on ct.id = c.conta_id
  where c.valor_hash = p_valor_hash
    and c.tipo = 'ingestao'
    and c.revogada_em is null;

  -- Chave desconhecida ou revogada: nenhuma linha, e a função devolve vazio.
  -- É assim que a Edge Function sabe responder 401.
  if v_credencial is null then
    return;
  end if;

  if v_ultimo_uso is null or v_ultimo_uso < now() - interval '1 minute' then
    update public.credenciais set ultimo_uso_em = now() where id = v_credencial;
  end if;

  -- Contabiliza ANTES de decidir: assim duas requisições ao mesmo tempo somam
  -- em vez de as duas lerem o valor antigo e as duas passarem.
  insert into public.taxa_de_ingestao (credencial_id, minuto, eventos)
  values (v_credencial, v_minuto, p_quantidade)
  on conflict (credencial_id, minuto)
    do update set eventos = public.taxa_de_ingestao.eventos + excluded.eventos
  returning eventos into v_no_minuto;

  if v_lim_minuto is not null and v_no_minuto > v_lim_minuto then
    conta_id := v_conta; projeto_id := v_projeto; permitido := false;
    motivo := format('taxa_excedida: %s eventos neste minuto, e o limite é %s por minuto.', v_no_minuto, v_lim_minuto);
    -- Quanto falta para o minuto virar.
    esperar_seg := greatest(1, 60 - extract(second from now())::integer);
    return next;
    return;
  end if;

  -- O teto mensal vem da medição diária, então ele está até 24 h atrasado.
  -- Serve para abuso sustentado; quem pega o laço é o limite acima.
  if v_lim_mes is not null then
    select coalesce(m.eventos_recebidos, 0) into v_no_mes
    from public.uso_mensal m
    where m.conta_id = v_conta and m.competencia = date_trunc('month', now())::date;

    if coalesce(v_no_mes, 0) > v_lim_mes then
      conta_id := v_conta; projeto_id := v_projeto; permitido := false;
      motivo := format('teto_mensal_excedido: esta conta já recebeu %s eventos neste mês, e o teto é %s. Fale com a gente que a gente levanta.', v_no_mes, v_lim_mes);
      esperar_seg := null;
      return next;
      return;
    end if;
  end if;

  conta_id := v_conta; projeto_id := v_projeto; permitido := true;
  motivo := null; esperar_seg := null;
  return next;
end;
$$;

revoke all on function fn_autoriza_ingestao(text, integer) from public, anon, authenticated;
grant execute on function fn_autoriza_ingestao(text, integer) to service_role;

-- ----------------------------------------------------------------------------
-- Limpeza: a contagem por minuto só serve pelo minuto em que vale.
-- ----------------------------------------------------------------------------
create or replace function fn_poda_taxa_de_ingestao()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.taxa_de_ingestao where minuto < now() - interval '2 hours';
$$;

revoke all on function fn_poda_taxa_de_ingestao() from public, anon, authenticated;

select cron.schedule(
  'poda_taxa_de_ingestao',
  '*/30 * * * *',
  $$select public.fn_poda_taxa_de_ingestao()$$
);
