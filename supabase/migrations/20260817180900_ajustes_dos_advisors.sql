-- ============================================================================
-- 0010 — Ajustes apontados pelo get_advisors
--
-- O que faz: fecha a execução das funções de manutenção pela API pública,
--            indexa as duas chaves estrangeiras que faltavam e reescreve as
--            políticas do MCP para não reavaliar current_setting() por linha.
-- Implementa: seção 17.3 (get_advisors roda após toda DDL, sem alerta crítico
--             pendente) e o requisito não-funcional de latência da seção 14.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nenhuma função de manutenção pode ser chamada pela API.
--
-- O advisor `anon_security_definer_function_executable` mostrou que todas elas
-- estavam expostas em /rest/v1/rpc/. `fn_expurga_contas_canceladas` apagaria
-- contas, e `fn_agrega_uso_mensal` reescreveria a medição — os dois sem
-- ninguém autenticado. Quem chama estas funções é o pg_cron, que roda como
-- `postgres` e não passa por estes privilégios.
-- ----------------------------------------------------------------------------
revoke all on function fn_agrega_uso_mensal()          from public, anon, authenticated;
revoke all on function fn_expurga_contas_canceladas()  from public, anon, authenticated;
revoke all on function fn_poda_cron_historico()        from public, anon, authenticated;
revoke all on function fn_manutencao_particoes()       from public, anon, authenticated;
revoke all on function fn_protege_particoes_eventos()  from public, anon, authenticated;

-- Funções de trigger: são chamadas pelo próprio Postgres quando a trigger
-- dispara, nunca por HTTP. O revoke não afeta a trigger.
revoke all on function fn_atualiza_definicao_evento()  from public, anon, authenticated;
revoke all on function fn_atualiza_pessoa()            from public, anon, authenticated;
revoke all on function fn_cria_conta_no_cadastro()     from public, anon, authenticated;

-- A tool `consulta` é chamada pelo servidor MCP com service_role. O revoke
-- anterior atingia só PUBLIC; os papéis da API precisam ser nomeados.
revoke all on function fn_consulta_leitura(text, uuid) from public, anon, authenticated;
grant execute on function fn_consulta_leitura(text, uuid) to service_role;

-- As três funções de apoio da RLS continuam executáveis por `authenticated`:
-- a política é avaliada com o papel de quem consulta, então sem EXECUTE a
-- leitura do próprio dado quebraria. Elas devolvem apenas os ids da própria
-- conta de quem chama, e para `anon` não sobra nada.
revoke all on function fn_contas_do_usuario()   from public, anon;
revoke all on function fn_projetos_do_usuario() from public, anon;
revoke all on function fn_paineis_do_usuario()  from public, anon;
grant execute on function fn_contas_do_usuario()   to authenticated;
grant execute on function fn_projetos_do_usuario() to authenticated;
grant execute on function fn_paineis_do_usuario()  to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Chaves estrangeiras sem índice de cobertura (advisor de performance).
-- ----------------------------------------------------------------------------
create index idx_credenciais_projeto on credenciais (projeto_id);
create index idx_usuarios_conta_conta on usuarios_conta (conta_id);

-- ----------------------------------------------------------------------------
-- 3. Políticas do MCP: `current_setting()` dentro de subselect é avaliado uma
--    vez por consulta, e não uma vez por linha (advisor auth_rls_initplan).
--    Numa tabela particionada de alta leitura isso é a diferença entre varrer
--    e não varrer.
-- ----------------------------------------------------------------------------
drop policy projetos_mcp_leitura on projetos;
create policy projetos_mcp_leitura on projetos
  for select to visao_mcp_leitor
  using (conta_id = (select nullif(current_setting('visao.conta_id', true), '')::uuid));

drop policy eventos_mcp_leitura on eventos;
create policy eventos_mcp_leitura on eventos
  for select to visao_mcp_leitor
  using (conta_id = (select nullif(current_setting('visao.conta_id', true), '')::uuid));
