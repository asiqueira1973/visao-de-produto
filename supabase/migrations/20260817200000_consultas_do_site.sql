-- ============================================================================
-- 0012 — Consultas do site
--
-- O que faz: cria as funções de leitura que as telas usam, com a janela de
--            retenção da conta já aplicada.
-- Implementa: épico 8.4; regras 11.7, 11.11 e 11.18.
--
-- Por que função e não consulta direta do PostgREST: a tela de Atividade
-- precisa da descrição do catálogo como reserva quando o evento chegou sem
-- descrição, e isso é um join que o PostgREST não faz (não há FK entre
-- `eventos` e `definicoes_evento` — a referência é por nome, seção 7.5).
--
-- Todas são SECURITY INVOKER de propósito: rodam com o papel de quem chamou,
-- então a RLS da seção 6.2 continua valendo. Nenhuma delas confia em parâmetro
-- para decidir acesso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_janela_visivel — regra 11.18
-- O que faz: devolve a data mais antiga que a conta pode enxergar, conforme o
--            plano dela (1 mês no gratuito, 12 no pago).
-- Recebe:    a conta.
-- Devolve:   o instante a partir do qual os eventos aparecem.
-- A retenção FÍSICA é maior (12 meses, por drop de partição, regra 11.8). Esta
-- é a janela VISÍVEL, aplicada na consulta.
-- ----------------------------------------------------------------------------
create or replace function fn_janela_visivel(p_conta_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() - (coalesce(c.retencao_meses, 1) || ' months')::interval
  from public.contas c
  where c.id = p_conta_id
$$;

revoke all on function fn_janela_visivel(uuid) from public, anon;
grant execute on function fn_janela_visivel(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- fn_resumo_projetos — tela de Projetos (épico 8.4)
-- O que faz: lista os projetos ativos da conta com o total de eventos nas
--            últimas 24 h e o horário do último evento.
-- Recebe:    nada; a RLS decide o que aparece.
-- Devolve:   uma linha por projeto ativo.
-- Projeto arquivado não aparece (soft delete, seção 7.3).
-- ----------------------------------------------------------------------------
create or replace function fn_resumo_projetos()
returns table (
  id                uuid,
  nome              text,
  slug              text,
  descricao         text,
  fuso_exibicao     text,
  eventos_24h       bigint,
  ultimo_evento_em  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.nome,
    p.slug,
    p.descricao,
    p.fuso_exibicao,
    coalesce(count(e.id) filter (where e.ocorrido_em >= now() - interval '24 hours'), 0) as eventos_24h,
    max(e.ocorrido_em) as ultimo_evento_em
  from public.projetos p
  left join public.eventos e
    on e.projeto_id = p.id
   and e.ocorrido_em >= public.fn_janela_visivel(p.conta_id)
  where p.arquivado_em is null
  group by p.id, p.nome, p.slug, p.descricao, p.fuso_exibicao
  order by max(e.ocorrido_em) desc nulls last, p.nome
$$;

revoke all on function fn_resumo_projetos() from public, anon;
grant execute on function fn_resumo_projetos() to authenticated;

-- ----------------------------------------------------------------------------
-- fn_atividade — tela de Atividade (épico 8.4)
-- O que faz: devolve os eventos do projeto em ordem decrescente de ocorrência,
--            com a descrição do catálogo como reserva quando o evento chegou
--            sem descrição própria.
-- Recebe:    o projeto e os filtros da tela — intervalo de data, nome de evento
--            e pessoa —, além do tamanho da página e do deslocamento.
-- Devolve:   os eventos da página, já dentro da janela visível da conta.
-- Os filtros compõem entre si: cada um que vier nulo simplesmente não filtra.
-- ----------------------------------------------------------------------------
create or replace function fn_atividade(
  p_projeto_id uuid,
  p_desde      timestamptz default null,
  p_ate        timestamptz default null,
  p_evento     text        default null,
  p_pessoa     text        default null,
  p_limite     integer     default 50,
  p_offset     integer     default 0
)
returns table (
  id           uuid,
  nome         text,
  descricao    text,
  distinct_id  text,
  tela         text,
  propriedades jsonb,
  ocorrido_em  timestamptz,
  recebido_em  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.nome,
    -- Princípio 0.2: o nome sozinho é sigla. Se o evento não trouxe descrição,
    -- usa a do catálogo, que é a fonte de verdade editável.
    coalesce(e.descricao, d.descricao) as descricao,
    e.distinct_id,
    e.tela,
    e.propriedades,
    e.ocorrido_em,
    e.recebido_em
  from public.eventos e
  join public.projetos p on p.id = e.projeto_id
  left join public.definicoes_evento d
    on d.projeto_id = e.projeto_id and d.nome = e.nome
  where e.projeto_id = p_projeto_id
    and e.ocorrido_em >= public.fn_janela_visivel(p.conta_id)
    and (p_desde  is null or e.ocorrido_em >= p_desde)
    and (p_ate    is null or e.ocorrido_em <= p_ate)
    and (p_evento is null or e.nome = p_evento)
    and (p_pessoa is null or e.distinct_id = p_pessoa)
  order by e.ocorrido_em desc
  limit least(coalesce(p_limite, 50), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function fn_atividade(uuid, timestamptz, timestamptz, text, text, integer, integer)
  from public, anon;
grant execute on function fn_atividade(uuid, timestamptz, timestamptz, text, text, integer, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
-- fn_opcoes_de_filtro — tela de Atividade (épico 8.4)
-- O que faz: devolve os nomes de evento do catálogo e as pessoas do projeto,
--            para montar os dois seletores de filtro.
-- Recebe:    o projeto.
-- Devolve:   uma linha por opção, com o tipo dizendo se é evento ou pessoa.
-- ----------------------------------------------------------------------------
create or replace function fn_opcoes_de_filtro(p_projeto_id uuid)
returns table (tipo text, valor text)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'evento'::text, d.nome
  from public.definicoes_evento d
  where d.projeto_id = p_projeto_id
  union all
  select 'pessoa'::text, pe.distinct_id
  from public.pessoas pe
  where pe.projeto_id = p_projeto_id
  order by 1, 2
$$;

revoke all on function fn_opcoes_de_filtro(uuid) from public, anon;
grant execute on function fn_opcoes_de_filtro(uuid) to authenticated;
