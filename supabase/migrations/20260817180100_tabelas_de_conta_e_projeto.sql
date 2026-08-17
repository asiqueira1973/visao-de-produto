-- ============================================================================
-- 0002 — Tabelas de conta e de projeto
--
-- O que faz: cria a raiz do isolamento multi-conta (`contas`), o vínculo com o
--            usuário do Supabase Auth (`usuarios_conta`), a medição mensal
--            (`uso_mensal`) e os projetos.
-- Implementa: seções 7.9, 7.9.1, 7.9.2 e 7.3 do spec; item D8 do escopo.
--
-- Multi-tenancy entra na PRIMEIRA migration de propósito: retrofitar `conta_id`
-- numa tabela particionada depois é caro; escrevê-lo agora é uma coluna.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- contas — seção 7.9
-- A raiz do isolamento. Criada automaticamente no primeiro login com Google
-- (seção 5.2), sem aprovação de ninguém (princípio 0.6).
-- Exclusão: soft delete por `cancelada_em`; expurgo definitivo após 30 dias
-- por fn_expurga_contas_canceladas() (regra 11.17).
-- ----------------------------------------------------------------------------
create table contas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  plano             plano_conta not null default 'gratuito',
  -- Janela visível de eventos, aplicada na consulta (regras 11.8 e 11.18):
  -- 1 mês no gratuito, 12 no pago.
  retencao_meses    integer not null default 1,
  -- Nulo significa "sem limite" (plano pago). O spec descreve essa semântica,
  -- que exige coluna anulável — ver divergência 9 na documentação técnica.
  limite_projetos   integer default 1,
  -- Criada na v1 e NÃO usada até a v2 (F10), para não exigir migration na
  -- tabela raiz quando a cobrança entrar.
  stripe_cliente_id text,
  criada_em         timestamptz not null default now(),
  cancelada_em      timestamptz
);

comment on table contas is
  'Raiz do isolamento multi-conta (seção 7.9). Uma conta tem vários projetos; ter mais de uma pessoa na mesma conta é v2 (F4).';

-- ----------------------------------------------------------------------------
-- usuarios_conta — seção 7.9.1
-- Vínculo entre o usuário do Supabase Auth e a conta. Na v1 há sempre uma
-- linha por conta; a tabela existe agora para que o convite da v2 seja
-- inserção de linha, não mudança de esquema.
-- ----------------------------------------------------------------------------
create table usuarios_conta (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  papel      papel_conta not null default 'dono',
  criado_em  timestamptz not null default now()
);

-- Na v1 uma pessoa pertence a uma conta só (seção 7.9.1).
create unique index uq_usuarios_conta_usuario on usuarios_conta (usuario_id);

-- ----------------------------------------------------------------------------
-- uso_mensal — seção 7.9.2
-- Precondição de qualquer cobrança: não dá para faturar um mês que nunca foi
-- contado, e backfill de medição é retrabalho garantido. Mede quatro dimensões
-- mesmo que a regra 11.15 só cobre por duas.
-- ----------------------------------------------------------------------------
create table uso_mensal (
  id                uuid primary key default gen_random_uuid(),
  conta_id          uuid not null references contas (id) on delete cascade,
  -- Primeiro dia do mês de referência.
  competencia       date not null,
  eventos_recebidos bigint not null default 0,
  -- Projetos com ao menos um evento no mês.
  projetos_ativos   integer not null default 0,
  pessoas_distintas integer not null default 0,
  consultas_mcp     integer not null default 0,
  atualizado_em     timestamptz not null default now()
);

create unique index uq_uso_conta_competencia on uso_mensal (conta_id, competencia);

-- ----------------------------------------------------------------------------
-- projetos — seção 7.3
-- Um projeto por aplicativo. Exclusão: soft delete por `arquivado_em`, que
-- tira o projeto das listas mas preserva os eventos.
-- ----------------------------------------------------------------------------
create table projetos (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid not null references contas (id) on delete cascade,
  nome           text not null,
  -- Usado na URL e na CLI. Formato garantido pelo check abaixo.
  slug           text not null,
  descricao      text,
  -- Convenção de nome do projeto, ex. 'psi_'. Nulo quando o projeto não adota
  -- prefixo. Lido pela skill de instrumentação antes de propor nome (regra 11.1).
  prefixo_evento text,
  -- Fuso usado nas telas e nas respostas do MCP. O banco opera em UTC e a
  -- conversão acontece na apresentação (regra 11.7).
  fuso_exibicao  text not null default 'America/Sao_Paulo',
  criado_em      timestamptz not null default now(),
  arquivado_em   timestamptz,
  constraint chk_projeto_slug check (slug ~ '^[a-z0-9-]+$')
);

create unique index uq_projetos_slug on projetos (slug);
create index idx_projetos_conta on projetos (conta_id) where arquivado_em is null;
