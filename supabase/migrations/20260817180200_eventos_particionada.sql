-- ============================================================================
-- 0003 — `eventos`, particionada por data
--
-- O que faz: cria a tabela de maior escrita, particionada por range em
--            `ocorrido_em` com intervalo de 7 dias, seus índices, o check de
--            formato de nome, e registra a tabela no pg_partman com 7
--            partições futuras e retenção física de 12 meses.
-- Implementa: seções 7.4 e 7.10; regras 11.1, 11.3, 11.4, 11.8 e 11.18.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_valida_nome_evento — seção 7.10
-- O que faz: valida o formato do nome do evento contra a regra 11.1 —
--            minúsculas, começa com letra, de 3 a 64 caracteres, só letras,
--            números e underscore. Espaço é inválido de propósito: o evento
--            `swim_geracao de treino` que existe hoje no PostHog seria rejeitado.
-- Recebe:    o nome do evento.
-- Devolve:   verdadeiro se o nome é válido.
-- É IMMUTABLE porque é usada em check constraint.
-- ----------------------------------------------------------------------------
create or replace function fn_valida_nome_evento(p_nome text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_nome ~ '^[a-z][a-z0-9_]{2,63}$'
$$;

comment on function fn_valida_nome_evento(text) is
  'Valida o formato do nome de evento (regra 11.1). Usada no check chk_nome_evento de eventos.';

-- ----------------------------------------------------------------------------
-- eventos — seção 7.4
--
-- Chave primária composta (ocorrido_em, id): a coluna de partição precisa
-- estar em todo índice único. O `id` vem do CLIENTE e é a chave de
-- deduplicação (regra 11.4) — o retry do SDK só é seguro por causa dela.
--
-- `conta_id` é desnormalizado de propósito: permite que a política de RLS
-- filtre sem join numa tabela particionada de alta escrita (seção 6.2).
--
-- `tela` e `descricao` são colunas próprias em vez de chaves em `propriedades`.
-- Desnormaliza e é assumido: são os dois campos que o princípio 0.2 torna
-- centrais. A fonte de verdade editável da descrição é definicoes_evento;
-- a coluna aqui é o registro do que valia no momento.
-- ----------------------------------------------------------------------------
create table eventos (
  -- Gerado no cliente (UUID v4), não no banco.
  id           uuid not null,
  conta_id     uuid not null references contas (id) on delete cascade,
  projeto_id   uuid not null references projetos (id) on delete cascade,
  nome         text not null,
  -- Identificador do usuário dentro do app do cliente. Frequentemente é um
  -- e-mail e portanto dado pessoal: tratado como identificador, nunca
  -- enriquecido (seção 17.2).
  distinct_id  text not null,
  -- Nulo em evento disparado do backend, que não tem tela.
  tela         text,
  -- O que o evento significa, em português (princípio 0.2).
  descricao    text,
  -- Tudo que não cabe nas colunas acima. Sem índice GIN de propósito: caro na
  -- escrita e a v1 não filtra por propriedade (seção 7.4).
  propriedades jsonb not null default '{}'::jsonb,
  -- Quando aconteceu NO DISPOSITIVO. Coluna de partição.
  ocorrido_em  timestamptz not null,
  -- Quando chegou no servidor. A diferença entre os dois revela fila offline.
  recebido_em  timestamptz not null default now(),
  constraint chk_nome_evento check (fn_valida_nome_evento(nome)),
  primary key (ocorrido_em, id)
)
partition by range (ocorrido_em);

comment on table eventos is
  'Eventos declarados pelos apps (seção 7.4). Nada é capturado automaticamente: só existe aqui o que o app enviou de propósito (princípio 0.1).';

-- Coluna sempre-crescente em tabela append-only: o BRIN fica ~10x menor que o
-- B-tree equivalente (seção 7.4).
create index idx_eventos_ocorrido_brin on eventos using brin (ocorrido_em);

-- Atende ao predicado de RLS, que filtra por conta_id sem join.
create index idx_eventos_conta_data on eventos (conta_id, ocorrido_em desc);
-- Atende à tela de Atividade e à tool `atividade_recente`.
create index idx_eventos_projeto_data on eventos (projeto_id, ocorrido_em desc);
-- Atende à tela de Uso e à tool `uso_por_evento`.
create index idx_eventos_projeto_nome_data on eventos (projeto_id, nome, ocorrido_em desc);
-- Atende à tela de Pessoas e à tool `pessoa`.
create index idx_eventos_projeto_pessoa_data on eventos (projeto_id, distinct_id, ocorrido_em desc);

-- ----------------------------------------------------------------------------
-- Particionamento — seção 7.4 e 7.10
-- Intervalo de 7 dias, 7 partições futuras pré-criadas. A partição inicial
-- começa 28 dias atrás para acomodar evento de fila offline antiga; o que for
-- mais antigo que isso cai na partição default criada pelo pg_partman.
-- ----------------------------------------------------------------------------
select partman.create_parent(
  p_parent_table    := 'public.eventos',
  p_control         := 'ocorrido_em',
  p_type            := 'range',
  p_interval        := '7 days',
  p_premake         := 7,
  p_start_partition := (date_trunc('day', now()) - interval '28 days')::text
);

-- Retenção FÍSICA de 12 meses: o drop de partição segue a janela da conta mais
-- generosa (regra 11.8). A janela VISÍVEL por conta é contas.retencao_meses e
-- é aplicada na consulta (regra 11.18). retention_keep_table = false faz o
-- DROP de fato — instantâneo, sem bloat, sem VACUUM FULL.
update partman.part_config
set retention              = '12 months',
    retention_keep_table   = false,
    infinite_time_partitions = true,
    premake                = 7
where parent_table = 'public.eventos';
