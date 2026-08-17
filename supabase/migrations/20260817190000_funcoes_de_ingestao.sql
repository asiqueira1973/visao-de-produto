-- ============================================================================
-- 0011 — Funções de ingestão
--
-- O que faz: cria as duas funções que a Edge Function de ingestão usa —
--            validar a chave e gravar o lote numa única instrução.
-- Implementa: seções 8.2, 12.1 e 6.3; regras 11.4 e 11.5.
--
-- Por que no banco e não só na função: gravar 100 eventos em uma instrução SQL
-- é critério de aceite do épico 8.2, e a deduplicação precisa acontecer dentro
-- do mesmo INSERT para que o retry do SDK seja seguro (regra 11.4).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_valida_chave_ingestao — seção 6.3 e regra 11.5
-- O que faz: encontra a credencial de ingestão ativa pelo hash do valor e
--            devolve a conta e o projeto donos dela. De quebra, marca o uso.
-- Recebe:    p_valor_hash, o SHA-256 em hexadecimal do valor da chave.
-- Devolve:   uma linha com conta e projeto; NENHUMA linha quando a chave não
--            existe ou foi revogada — é assim que a função sinaliza 401.
-- Regra 11.5: é a chave que determina o projeto. O que vier no payload é
-- ignorado, e por isso o projeto sai daqui e não do corpo do request.
-- `ultimo_uso_em` é atualizado no máximo 1x por minuto por credencial, para
-- não transformar cada ingestão numa escrita extra (seção 6.3).
-- ----------------------------------------------------------------------------
create or replace function fn_valida_chave_ingestao(p_valor_hash text)
returns table (conta_id uuid, projeto_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credencial_id uuid;
  v_conta_id      uuid;
  v_projeto_id    uuid;
  v_ultimo_uso    timestamptz;
begin
  select c.id, c.conta_id, c.projeto_id, c.ultimo_uso_em
    into v_credencial_id, v_conta_id, v_projeto_id, v_ultimo_uso
  from public.credenciais c
  where c.valor_hash = p_valor_hash
    and c.tipo = 'ingestao'
    and c.revogada_em is null;

  if v_credencial_id is null then
    return;
  end if;

  if v_ultimo_uso is null or v_ultimo_uso < now() - interval '1 minute' then
    update public.credenciais set ultimo_uso_em = now() where id = v_credencial_id;
  end if;

  conta_id := v_conta_id;
  projeto_id := v_projeto_id;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_ingere_eventos — seção 8.2
-- O que faz: grava o lote inteiro em UMA instrução INSERT multi-row, ignorando
--            em silêncio os eventos cujo id já existe.
-- Recebe:    a conta e o projeto resolvidos pela chave, e o array de eventos já
--            validado pela Edge Function.
-- Devolve:   quantos eventos foram realmente gravados. A diferença entre o que
--            foi enviado e o que voltou é a contagem de duplicados.
-- Regra 11.4: deduplicação por id via ON CONFLICT DO NOTHING sobre a chave
-- primária (ocorrido_em, id). É o que torna o retry do SDK seguro.
-- Princípio 0.1: nenhuma propriedade é acrescentada aqui. O que vai para a
-- tabela é exatamente o que o app enviou, mais o `recebido_em` do banco.
-- ----------------------------------------------------------------------------
create or replace function fn_ingere_eventos(
  p_conta_id   uuid,
  p_projeto_id uuid,
  p_eventos    jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aceitos integer;
begin
  with entrada as (
    select *
    from jsonb_to_recordset(p_eventos) as e(
      id           uuid,
      nome         text,
      distinct_id  text,
      tela         text,
      descricao    text,
      propriedades jsonb,
      ocorrido_em  timestamptz
    )
  ),
  inseridos as (
    insert into public.eventos (
      id, conta_id, projeto_id, nome, distinct_id, tela, descricao, propriedades, ocorrido_em
    )
    select
      e.id, p_conta_id, p_projeto_id, e.nome, e.distinct_id, e.tela, e.descricao,
      coalesce(e.propriedades, '{}'::jsonb), e.ocorrido_em
    from entrada e
    on conflict do nothing
    returning 1
  )
  select count(*) into v_aceitos from inseridos;

  return v_aceitos;
end;
$$;

-- Só a Edge Function chama, e ela usa service_role.
revoke all on function fn_valida_chave_ingestao(text)          from public, anon, authenticated;
revoke all on function fn_ingere_eventos(uuid, uuid, jsonb)    from public, anon, authenticated;
grant execute on function fn_valida_chave_ingestao(text)       to service_role;
grant execute on function fn_ingere_eventos(uuid, uuid, jsonb) to service_role;
