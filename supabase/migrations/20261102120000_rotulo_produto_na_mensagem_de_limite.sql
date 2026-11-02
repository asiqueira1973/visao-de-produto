-- ============================================================================
-- Troca "projeto" por "produto" na mensagem que a pessoa lê ao bater no limite.
--
-- Por quê: a seção 13 chama a entidade de Produto em toda a interface. Esta
-- mensagem nasce no banco e aparece na tela de Produtos, então era o único
-- lugar onde a palavra antiga sobrevivia à renomeação dos rótulos.
--
-- O que NÃO muda: o nome da função (o gatilho trg_projetos_limite depende
-- dele), a tabela `projetos`, e o prefixo `limite_de_projetos:` — o app casa
-- esse prefixo por regex para extrair o texto, e mexer nele quebraria o aviso.
-- ============================================================================

create or replace function fn_valida_limite_de_projetos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_ativos integer;
  v_plano  public.plano_conta;
begin
  select limite_projetos, plano into v_limite, v_plano
  from public.contas where id = new.conta_id;

  -- Nulo significa "sem limite" (plano pago). Mesma semântica da coluna.
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_ativos
  from public.projetos
  where conta_id = new.conta_id and arquivado_em is null;

  if v_ativos >= v_limite then
    -- A mensagem diz o que fazer, e não só que não deu. Quem bate no limite
    -- precisa saber que tem duas saídas, e que nenhuma delas apaga nada.
    raise exception 'limite_de_projetos: o plano % permite % produto(s) ativo(s), e esta conta já tem %. Arquive um produto que não usa mais — arquivar não apaga evento nenhum — ou assine o plano pago para ter produtos ilimitados.',
      v_plano, v_limite, v_ativos
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Fecha nos dois lados: o PostgreSQL concede EXECUTE a PUBLIC por padrão, e o
-- Supabase ainda concede a anon/authenticated via ALTER DEFAULT PRIVILEGES.
-- Revogar de um só deixa a função aberta pelo outro.
revoke all on function fn_valida_limite_de_projetos() from public;
revoke all on function fn_valida_limite_de_projetos() from anon, authenticated;
