-- ============================================================================
-- 0015 — A descrição do catálogo vence a do evento na exibição
--
-- O que faz: inverte a precedência da descrição em `fn_atividade`.
-- Implementa: seções 7.4 e 7.5, e a promessa que a tela de Catálogo faz por
--             escrito: "A descrição é editada aqui e passa a aparecer em todas
--             as telas".
--
-- POR QUE ISTO MUDOU: a versão anterior usava coalesce(e.descricao, d.descricao),
-- ou seja, a descrição gravada no evento vencia. Isso contraria o desenho: a
-- fonte de verdade EDITÁVEL é `definicoes_evento.descricao` (seção 7.5), e a
-- coluna em `eventos` é apenas o registro do que valia no momento (seção 7.4).
-- Com a ordem errada, o dono editava a descrição no catálogo e a Atividade
-- continuava mostrando a antiga — encontrado ao ler a resposta do MCP.
-- ============================================================================

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
    -- O catálogo primeiro: é ele que o dono edita e que vale em todas as telas.
    -- A descrição do evento é a reserva, para o que chegou antes de existir
    -- entrada no catálogo.
    coalesce(d.descricao, e.descricao) as descricao,
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
