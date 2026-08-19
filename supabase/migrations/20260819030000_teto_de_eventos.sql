-- ============================================================================
-- 0019 — Teto de eventos: válvula de segurança, não preço
--
-- O que faz: dá a cada conta um teto mensal de eventos e a consulta que diz
--            quem está chegando perto.
-- Implementa: EPICO-COBRANCA.md, decisão C1 e item V2 da seção 11.
--
-- O QUE ESTE TETO NÃO É: preço. A decisão C1 é explícita — volume de evento
-- nunca entra na conta. Cobrar por evento faria a pessoa instrumentar menos, e
-- catálogo pobre é produto inútil. Isto aqui existe para parar loop maluco e
-- abuso, e o número foi escolhido para ninguém do público-alvo esbarrar nele
-- por acidente: um app com dezenas de usuários manda dezenas de eventos por
-- dia, não trinta mil.
--
-- E o que acontece ao chegar perto: **avisa**. Não corta. Quem passa do teto
-- vira conversa, não erro 429.
-- ============================================================================

alter table contas
  -- Nulo significa "sem teto", como em `limite_projetos`. Coluna, e não
  -- constante no código, para levantar o teto de alguém não exigir deploy.
  add column limite_eventos_mes integer not null default 1000000;

comment on column contas.limite_eventos_mes is
  'Válvula de segurança contra abuso e loop, nunca gatilho de preço (decisão C1 de EPICO-COBRANCA.md).';

-- ----------------------------------------------------------------------------
-- fn_uso_do_teto — quanto da válvula a conta já gastou neste mês
-- O que faz: devolve os eventos do mês, o teto e a fração usada.
-- Recebe:    a conta.
-- Devolve:   uma linha; fração acima de 0.8 é o que a interface avisa.
-- Lê `uso_mensal`, que o job diário mantém — a conta não é refeita aqui.
-- ----------------------------------------------------------------------------
create or replace function fn_uso_do_teto(p_conta_id uuid)
returns table (eventos_no_mes bigint, teto integer, fracao numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(m.eventos_recebidos, 0),
    c.limite_eventos_mes,
    case
      when c.limite_eventos_mes is null or c.limite_eventos_mes = 0 then 0
      else round(coalesce(m.eventos_recebidos, 0)::numeric / c.limite_eventos_mes, 4)
    end
  from public.contas c
  left join public.uso_mensal m
    on m.conta_id = c.id and m.competencia = date_trunc('month', now())::date
  where c.id = p_conta_id
$$;

revoke all on function fn_uso_do_teto(uuid) from public, anon;
grant execute on function fn_uso_do_teto(uuid) to authenticated;
