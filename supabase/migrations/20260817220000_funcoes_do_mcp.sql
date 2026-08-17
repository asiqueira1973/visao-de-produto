-- ============================================================================
-- 0014 — Funções do servidor MCP
--
-- O que faz: valida o token de leitura e contabiliza a consulta no uso mensal.
-- Implementa: épico 8.6, seções 6.3 e 7.9.2, regra 5.1.2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_valida_token_leitura — seção 6.3 e regra 5.1.2
-- O que faz: encontra a credencial de LEITURA ativa pelo hash do valor e
--            devolve a conta dona dela.
-- Recebe:    p_valor_hash, o SHA-256 em hexadecimal do token.
-- Devolve:   a conta; nenhuma linha quando o token não existe ou foi revogado —
--            é assim que o servidor MCP sabe responder 401.
-- `ultimo_uso_em` é atualizado no máximo 1x por minuto, como na ingestão.
-- ----------------------------------------------------------------------------
create or replace function fn_valida_token_leitura(p_valor_hash text)
returns table (conta_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credencial_id uuid;
  v_conta_id      uuid;
  v_ultimo_uso    timestamptz;
begin
  select c.id, c.conta_id, c.ultimo_uso_em
    into v_credencial_id, v_conta_id, v_ultimo_uso
  from public.credenciais c
  where c.valor_hash = p_valor_hash
    and c.tipo = 'leitura'
    and c.revogada_em is null;

  if v_credencial_id is null then
    return;
  end if;

  if v_ultimo_uso is null or v_ultimo_uso < now() - interval '1 minute' then
    update public.credenciais set ultimo_uso_em = now() where id = v_credencial_id;
  end if;

  conta_id := v_conta_id;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_registra_consulta_mcp — seção 7.9.2
-- O que faz: soma 1 em `uso_mensal.consultas_mcp` do mês corrente da conta.
-- Recebe:    a conta que fez a consulta.
-- Devolve:   nada.
-- É o servidor MCP que conta, e não o job diário: não existe tabela de log de
-- consulta no modelo, e criar uma só para contar chamada seria complexidade
-- prematura (princípio 0.4).
-- ----------------------------------------------------------------------------
create or replace function fn_registra_consulta_mcp(p_conta_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.uso_mensal (conta_id, competencia, consultas_mcp, atualizado_em)
  values (p_conta_id, date_trunc('month', now())::date, 1, now())
  on conflict (conta_id, competencia) do update set
    consultas_mcp = public.uso_mensal.consultas_mcp + 1,
    atualizado_em = now();
end;
$$;

revoke all on function fn_valida_token_leitura(text)   from public, anon, authenticated;
revoke all on function fn_registra_consulta_mcp(uuid)  from public, anon, authenticated;
grant execute on function fn_valida_token_leitura(text)  to service_role;
grant execute on function fn_registra_consulta_mcp(uuid) to service_role;
