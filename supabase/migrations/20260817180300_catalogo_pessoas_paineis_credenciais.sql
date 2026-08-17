-- ============================================================================
-- 0004 — Catálogo, pessoas, painéis e credenciais
--
-- O que faz: cria as tabelas filhas de projeto — o catálogo que se popula
--            sozinho, as pessoas, os painéis e suas peças, e as credenciais
--            de máquina.
-- Implementa: seções 7.5, 7.6, 7.7 e 7.8 do spec.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- definicoes_evento — seção 7.5
-- O catálogo. Se popula sozinho pela trigger trg_eventos_definicao e é
-- editável pelo dono. Exclusão: não há. Um evento que parou de disparar
-- continua listado — é justamente essa a informação útil (regra 11.12).
-- ----------------------------------------------------------------------------
create table definicoes_evento (
  id                     uuid primary key default gen_random_uuid(),
  projeto_id             uuid not null references projetos (id) on delete cascade,
  nome                   text not null,
  -- Fonte de verdade EDITÁVEL da descrição. Nunca sobrescrita pela trigger
  -- depois de preenchida (regra 11.2).
  descricao              text,
  -- Todas as telas em que este evento já foi visto.
  telas                  text[] not null default '{}',
  total_ocorrencias      bigint not null default 0,
  -- Nulos em definição criada à mão antes do primeiro evento.
  primeira_ocorrencia_em timestamptz,
  ultima_ocorrencia_em   timestamptz,
  criado_em              timestamptz not null default now(),
  constraint chk_definicao_nome check (fn_valida_nome_evento(nome))
);

create unique index uq_definicoes_projeto_nome on definicoes_evento (projeto_id, nome);

comment on table definicoes_evento is
  'Catálogo de eventos do projeto (seção 7.5). A descrição é o que dá sentido ao nome (princípio 0.2).';

-- ----------------------------------------------------------------------------
-- pessoas — seção 7.6
-- Mantida pela trigger trg_eventos_pessoa. Não há noção de sessão: a
-- plataforma conta distinct_id distintos e não infere nada (regra 11.11).
-- ----------------------------------------------------------------------------
create table pessoas (
  id                uuid primary key default gen_random_uuid(),
  projeto_id        uuid not null references projetos (id) on delete cascade,
  distinct_id       text not null,
  -- Merge das propriedades que o app declarou como de pessoa, enviadas pelo
  -- SDK dentro de propriedades->'pessoa' (ver documentação técnica).
  propriedades      jsonb not null default '{}'::jsonb,
  total_eventos     bigint not null default 0,
  primeiro_visto_em timestamptz not null,
  ultimo_visto_em   timestamptz not null
);

create unique index uq_pessoas_projeto_distinct on pessoas (projeto_id, distinct_id);

-- ----------------------------------------------------------------------------
-- paineis e paineis_itens — seção 7.7
-- ----------------------------------------------------------------------------
create table paineis (
  id            uuid primary key default gen_random_uuid(),
  projeto_id    uuid not null references projetos (id) on delete cascade,
  nome          text not null,
  janela_padrao janela_periodo not null default '30d',
  criado_em     timestamptz not null default now()
);

create index idx_paineis_projeto on paineis (projeto_id);

create table paineis_itens (
  id                uuid primary key default gen_random_uuid(),
  painel_id         uuid not null references paineis (id) on delete cascade,
  -- Referência por NOME, não por FK para definicoes_evento (assunção 21.6):
  -- permite montar tile para evento que ainda não disparou nenhuma vez, que é
  -- caso de uso legítimo (feature acabou de subir). Tile de evento inexistente
  -- exibe aviso em vez de gráfico vazio (regra 11.9).
  nome_evento       text not null,
  -- Nulo = usa a descrição do catálogo.
  titulo            text,
  tipo_visualizacao tipo_visualizacao not null default 'serie_temporal',
  posicao           integer not null default 0
);

create index idx_paineis_itens_painel on paineis_itens (painel_id, posicao);

-- ----------------------------------------------------------------------------
-- credenciais — seção 7.8
-- Só o hash SHA-256 do valor é armazenado; o valor completo aparece uma única
-- vez, no momento da criação (seção 6.3).
-- Exclusão: soft delete por `revogada_em` — preserva o rastro de qual chave
-- escreveu o quê. Credencial revogada nunca é reativada.
-- ----------------------------------------------------------------------------
create table credenciais (
  id            uuid primary key default gen_random_uuid(),
  -- A credencial pertence à conta, não só ao projeto.
  conta_id      uuid not null references contas (id) on delete cascade,
  tipo          tipo_credencial not null,
  -- Obrigatório em 'ingestao'; nulo em 'leitura', que vale para todos os
  -- projetos da conta.
  projeto_id    uuid references projetos (id) on delete cascade,
  nome          text not null,
  -- 8 primeiros caracteres do valor, só para exibição na tela.
  prefixo       text not null,
  valor_hash    text not null,
  criada_em     timestamptz not null default now(),
  -- Atualizado no máximo 1x por minuto por credencial, para não transformar
  -- cada ingestão numa escrita extra (seção 6.3).
  ultimo_uso_em timestamptz,
  revogada_em   timestamptz,
  constraint chk_credencial_projeto check (
    (tipo = 'ingestao' and projeto_id is not null)
    or (tipo = 'leitura' and projeto_id is null)
  )
);

create unique index uq_credenciais_valor_hash on credenciais (valor_hash);
create index idx_credenciais_tipo_ativa on credenciais (tipo, revogada_em);
create index idx_credenciais_conta on credenciais (conta_id);
