-- ============================================================================
-- 0001 — Extensões e enums
--
-- O que faz: habilita as extensões de que o esquema depende e cria os cinco
--            enums da seção 7.2 do spec.
-- Recebe:    nada.
-- Devolve:   nada.
-- Implementa: seção 7.2 (enums) e seção 7.10 (jobs de pg_cron e pg_partman).
-- ============================================================================

-- pg_cron: agenda a manutenção de partições, a agregação de uso mensal, o
-- expurgo de contas canceladas e a poda do próprio histórico do cron (7.10).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- pg_partman: mantém as partições de `eventos` (seção 7.4).
create schema if not exists partman;
create extension if not exists pg_partman with schema partman;

-- ----------------------------------------------------------------------------
-- Enums — seção 7.2. Os valores são exatamente os do spec, em português.
-- ----------------------------------------------------------------------------

-- Plano da conta. Governa retenção e limite de projetos (regra 11.15).
create type plano_conta as enum ('gratuito', 'pago');

-- Papel da pessoa dentro da conta. A v1 só usa 'dono'; 'membro' e 'leitor'
-- existem para que os convites da v2 (F4) sejam inserção de linha.
create type papel_conta as enum ('dono', 'membro', 'leitor');

-- Tipo de credencial de máquina. 'ingestao' só escreve (regra 5.1.1);
-- 'leitura' só lê (regra 5.1.2).
create type tipo_credencial as enum ('ingestao', 'leitura');

-- Como um tile do painel desenha o dado (seção 7.7).
create type tipo_visualizacao as enum ('serie_temporal', 'total_periodo', 'usuarios_unicos');

-- Janelas de período aceitas nas telas e no MCP (regra 11.14).
create type janela_periodo as enum ('7d', '14d', '30d', '90d');
