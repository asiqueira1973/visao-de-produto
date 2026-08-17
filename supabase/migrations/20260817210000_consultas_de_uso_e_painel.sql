-- ============================================================================
-- 0013 — Consultas de uso, painel, pessoas e catálogo
--
-- O que faz: cria as funções de leitura das telas do épico 8.5.
-- Implementa: épico 8.5; regras 11.11, 11.12, 11.14 e 11.18.
--
-- Todas SECURITY INVOKER: rodam com o papel de quem chamou, então a RLS da
-- seção 6.2 continua valendo dentro delas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_dias_da_janela — apoio das duas funções abaixo
-- O que faz: traduz a janela do seletor (7d, 14d, 30d, 90d) em número de dias.
-- Recebe:    a janela como texto.
-- Devolve:   os dias correspondentes; 30 quando vier algo inesperado.
-- ----------------------------------------------------------------------------
create or replace function fn_dias_da_janela(p_janela text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_janela
    when '7d'  then 7
    when '14d' then 14
    when '30d' then 30
    when '90d' then 90
    else 30
  end
$$;

revoke all on function fn_dias_da_janela(text) from public, anon;
grant execute on function fn_dias_da_janela(text) to authenticated;

-- ----------------------------------------------------------------------------
-- fn_uso_por_evento — tela de Uso (épico 8.5)
-- O que faz: lista TODOS os eventos do catálogo do projeto com o total no
--            período, os usuários únicos no período e a última ocorrência.
-- Recebe:    o projeto e a janela.
-- Devolve:   uma linha por evento do catálogo.
--
-- Regra 11.12: evento com zero ocorrências no período APARECE, com zero
-- explícito. É por isso que a base da consulta é `definicoes_evento` e não
-- `eventos` — omitir o zero é exatamente o comportamento que esta plataforma
-- existe para corrigir.
-- Regra 11.11: "usuários únicos" é contagem de distinct_id distintos. Não há
-- noção de sessão, e a plataforma não infere uma.
-- ----------------------------------------------------------------------------
create or replace function fn_uso_por_evento(p_projeto_id uuid, p_janela text default '30d')
returns table (
  nome                 text,
  descricao            text,
  total_no_periodo     bigint,
  usuarios_unicos      bigint,
  ultima_ocorrencia_em timestamptz,
  total_acumulado      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with limites as (
    select
      p.conta_id,
      greatest(
        now() - (public.fn_dias_da_janela(p_janela) || ' days')::interval,
        public.fn_janela_visivel(p.conta_id)
      ) as desde
    from public.projetos p
    where p.id = p_projeto_id
  )
  select
    d.nome,
    d.descricao,
    count(e.id) as total_no_periodo,
    count(distinct e.distinct_id) as usuarios_unicos,
    max(e.ocorrido_em) as ultima_ocorrencia_em,
    d.total_ocorrencias as total_acumulado
  from public.definicoes_evento d
  cross join limites l
  left join public.eventos e
    on e.projeto_id = d.projeto_id
   and e.nome = d.nome
   and e.ocorrido_em >= l.desde
  where d.projeto_id = p_projeto_id
  group by d.nome, d.descricao, d.total_ocorrencias
  order by count(e.id) desc, d.nome
$$;

revoke all on function fn_uso_por_evento(uuid, text) from public, anon;
grant execute on function fn_uso_por_evento(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- fn_serie_do_evento — tiles do Painel (épico 8.5)
-- O que faz: devolve as barras de um evento na janela pedida, já agrupadas.
-- Recebe:    o projeto, o nome do evento e a janela.
-- Devolve:   uma linha por barra, com início, fim, total e usuários únicos.
--
-- Regra 11.14 — o agrupamento não é livre:
--   7d  = 7 barras  (1 por dia)
--   14d = 14 barras (1 por dia)
--   30d = 10 barras (1 a cada 3 dias)
--   90d = 13 barras (1 por semana)
-- O teto de 14 barras vem da largura do tile: acima disso a barra fica
-- ilegível. Barra sem ocorrência volta com zero, e não sumindo da série.
-- ----------------------------------------------------------------------------
create or replace function fn_serie_do_evento(
  p_projeto_id uuid,
  p_nome       text,
  p_janela     text default '30d'
)
returns table (
  inicio          timestamptz,
  fim             timestamptz,
  total           bigint,
  usuarios_unicos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with config as (
    select
      case p_janela when '7d' then 7 when '14d' then 14 when '30d' then 10 else 13 end as barras,
      case p_janela when '7d' then 1 when '14d' then 1  when '30d' then 3  else 7  end as dias_por_barra
  ),
  faixas as (
    select
      c.barras,
      c.dias_por_barra,
      generate_series(0, c.barras - 1) as indice
    from config c
  ),
  janelas as (
    select
      date_trunc('day', now())
        - ((f.barras - 1 - f.indice + 1) * f.dias_por_barra || ' days')::interval
        + interval '1 day' as inicio,
      date_trunc('day', now())
        - ((f.barras - 1 - f.indice) * f.dias_por_barra || ' days')::interval
        + interval '1 day' as fim
    from faixas f
  )
  select
    j.inicio,
    j.fim,
    count(e.id) as total,
    count(distinct e.distinct_id) as usuarios_unicos
  from janelas j
  left join public.eventos e
    on e.projeto_id = p_projeto_id
   and e.nome = p_nome
   and e.ocorrido_em >= j.inicio
   and e.ocorrido_em <  j.fim
  group by j.inicio, j.fim
  order by j.inicio
$$;

revoke all on function fn_serie_do_evento(uuid, text, text) from public, anon;
grant execute on function fn_serie_do_evento(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- fn_pessoas — tela de Pessoas (épico 8.5)
-- O que faz: lista os identificadores enviados pelo app, com total de eventos e
--            primeiro e último acesso.
-- Recebe:    o projeto.
-- Devolve:   uma linha por pessoa, da mais recente para a mais antiga.
-- ----------------------------------------------------------------------------
create or replace function fn_pessoas(p_projeto_id uuid)
returns table (
  distinct_id       text,
  total_eventos     bigint,
  primeiro_visto_em timestamptz,
  ultimo_visto_em   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pe.distinct_id, pe.total_eventos, pe.primeiro_visto_em, pe.ultimo_visto_em
  from public.pessoas pe
  where pe.projeto_id = p_projeto_id
  order by pe.ultimo_visto_em desc
$$;

revoke all on function fn_pessoas(uuid) from public, anon;
grant execute on function fn_pessoas(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- fn_catalogo — tela de Catálogo e tool `catalogo` do MCP
-- O que faz: devolve todos os eventos que o projeto já registrou, com descrição,
--            telas, total acumulado e primeira e última ocorrência.
-- Recebe:    o projeto.
-- Devolve:   uma linha por evento do catálogo.
-- Um evento que parou de disparar continua listado — é essa a informação útil.
-- ----------------------------------------------------------------------------
create or replace function fn_catalogo(p_projeto_id uuid)
returns table (
  nome                   text,
  descricao              text,
  telas                  text[],
  total_ocorrencias      bigint,
  primeira_ocorrencia_em timestamptz,
  ultima_ocorrencia_em   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.nome, d.descricao, d.telas, d.total_ocorrencias,
         d.primeira_ocorrencia_em, d.ultima_ocorrencia_em
  from public.definicoes_evento d
  where d.projeto_id = p_projeto_id
  order by d.total_ocorrencias desc, d.nome
$$;

revoke all on function fn_catalogo(uuid) from public, anon;
grant execute on function fn_catalogo(uuid) to authenticated;
