-- ============================================================================
-- 0020 — O limite de projetos do plano passa a valer
--
-- O que faz: impede que uma conta crie mais projetos do que o plano dela
--            permite, e diz o que fazer quando isso acontece.
-- Implementa: regra 11.15 do spec — 1 projeto no gratuito, ilimitado no pago.
--
-- POR QUE SÓ AGORA: a regra sempre disse "aplicação na v2; os campos existem na
-- v1", e isso estava certo enquanto o dono era o único usuário. Com o cadastro
-- aberto e divulgação começando, deixa de estar: qualquer pessoa entra com o
-- Google, e o plano gratuito viraria ilimitado na prática.
--
-- POR QUE NO BANCO, E NÃO NA TELA: uma checagem no código do site é
-- contornável por quem chamar `/rest/v1/projetos` diretamente com o próprio
-- token de sessão. A RLS deixa a pessoa inserir na própria conta — e deve
-- mesmo. Quem precisa dizer "só que não mais que um" é o banco.
--
-- Projeto ARQUIVADO não conta. Arquivar é soft delete (seção 7.3), e se
-- contasse, ninguém nunca liberaria a vaga.
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
    raise exception 'limite_de_projetos: o plano % permite % projeto(s) ativo(s), e esta conta já tem %. Arquive um projeto que não usa mais — arquivar não apaga evento nenhum — ou assine o plano pago para ter projetos ilimitados.',
      v_plano, v_limite, v_ativos
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_projetos_limite
  before insert on projetos
  for each row
  execute function fn_valida_limite_de_projetos();

revoke all on function fn_valida_limite_de_projetos() from public, anon, authenticated;
