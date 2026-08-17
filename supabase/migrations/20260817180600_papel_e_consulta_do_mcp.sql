-- ============================================================================
-- 0007 — Papel somente-leitura do MCP e a função da tool `consulta`
--
-- O que faz: cria o papel `visao_mcp_leitor`, que só enxerga quatro tabelas e
--            só sabe ler, dá a ele políticas de RLS por conta, e cria a função
--            que a tool `consulta` usa para rodar SQL do agente com esse papel.
-- Implementa: seções 12.2 e 17.3; regra 5.1.2.
--
-- Por que um papel, e não só um parser: validação de string sozinha não é
-- controle de acesso (seção 17.3). A função é SECURITY DEFINER e PERTENCE ao
-- papel restrito, então um `insert` que escapasse do parser ainda falharia por
-- falta de permissão no banco.
-- ============================================================================

-- Papel sem login: ninguém se conecta com ele. Ele existe para ser o dono da
-- função abaixo, e é isso que limita o que aquele SQL consegue fazer.
create role visao_mcp_leitor nologin;

-- Sem esta associação o `postgres` não consegue transferir a posse da função
-- para o papel restrito (o Postgres exige poder assumir o papel de destino).
grant visao_mcp_leitor to postgres;

grant usage on schema public to visao_mcp_leitor;

-- As quatro tabelas da tool `consulta` (seção 12.2), e nada além delas.
grant select on eventos, definicoes_evento, pessoas, projetos to visao_mcp_leitor;

-- ----------------------------------------------------------------------------
-- Políticas de RLS do papel do MCP.
-- O token de leitura pertence a uma conta, e o isolamento continua valendo
-- aqui: a função abaixo grava a conta do token em `visao.conta_id` e estas
-- políticas filtram por ela. Sem o ajuste, o papel não lê nada.
-- ----------------------------------------------------------------------------
create policy projetos_mcp_leitura on projetos
  for select to visao_mcp_leitor
  using (conta_id = nullif(current_setting('visao.conta_id', true), '')::uuid);

create policy eventos_mcp_leitura on eventos
  for select to visao_mcp_leitor
  using (conta_id = nullif(current_setting('visao.conta_id', true), '')::uuid);

create policy definicoes_mcp_leitura on definicoes_evento
  for select to visao_mcp_leitor
  using (projeto_id in (select id from projetos));

create policy pessoas_mcp_leitura on pessoas
  for select to visao_mcp_leitor
  using (projeto_id in (select id from projetos));

-- ----------------------------------------------------------------------------
-- fn_consulta_leitura — tool `consulta` da seção 12.2
-- O que faz: executa um SELECT do agente com o papel `visao_mcp_leitor`,
--            limitado à conta do token e a no máximo 500 linhas.
-- Recebe:    p_sql, o SELECT já validado pelo servidor MCP; p_conta_id, a
--            conta dona do token de leitura.
-- Devolve:   as linhas como um array jsonb (vazio quando não há resultado).
-- Regra 5.1.2: o token de leitura nunca escreve. Aqui isso é garantido pela
-- permissão do papel dono da função, não pela boa vontade do parser.
-- ----------------------------------------------------------------------------
create or replace function fn_consulta_leitura(p_sql text, p_conta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_resultado jsonb;
begin
  -- Ponto e vírgula é recusado aqui também, e não só no servidor MCP: sem isso
  -- o agente poderia emendar uma segunda instrução na mesma string.
  if position(';' in p_sql) > 0 then
    raise exception 'consulta_invalida: a consulta não pode conter ponto e vírgula';
  end if;

  -- Isolamento por conta: é este ajuste que as políticas acima leem.
  perform set_config('visao.conta_id', p_conta_id::text, true);
  -- Uma consulta do agente não pode prender o banco (requisito 14: p95 < 2 s).
  perform set_config('statement_timeout', '5000', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) origem limit 500) t',
    p_sql
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- É a posse da função pelo papel restrito que faz o controle de acesso.
-- O Postgres exige que o novo dono tenha CREATE no schema da função, então o
-- privilégio é concedido, usado e devolvido na mesma migration: depois disto o
-- papel não consegue criar nada, e a posse permanece.
grant create on schema public to visao_mcp_leitor;
alter function fn_consulta_leitura(text, uuid) owner to visao_mcp_leitor;
revoke create on schema public from visao_mcp_leitor;

-- Só o servidor MCP chama, e ele usa service_role.
revoke all on function fn_consulta_leitura(text, uuid) from public;
grant execute on function fn_consulta_leitura(text, uuid) to service_role;
