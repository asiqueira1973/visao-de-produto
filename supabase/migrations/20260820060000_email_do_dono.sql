-- O e-mail do dono de uma conta, para os avisos que nascem fora da sessão dele.
--
-- O que faz: devolve o endereço de quem é dono da conta.
-- Recebe:    o id da conta.
-- Devolve:   o e-mail, ou nulo se a conta não existe.
-- Implementa: o e-mail 2 do backlog de e-mail transacional — o webhook do
--             Stripe roda sem sessão de usuário e não tem como chegar em
--             `auth.users` pela RLS.
--
-- É SECURITY DEFINER porque `auth.users` não é visível para `authenticated`, e
-- **por isso mesmo** a execução é revogada de `public`. Revogar de `anon` e
-- `authenticated` nominalmente não bastaria: o Postgres concede EXECUTE a
-- `public` por padrão, e foi assim que as duas funções de aviso ficaram abertas
-- na migration 20260820030000. Só a chave de serviço chama esta função.

create or replace function fn_email_do_dono(p_conta_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select u.email::text
  from public.usuarios_conta uc
  join auth.users u on u.id = uc.usuario_id
  where uc.conta_id = p_conta_id
  limit 1;
$$;

comment on function fn_email_do_dono(uuid) is
  'E-mail do dono da conta. Só para o webhook e os jobs, que rodam com a chave '
  'de serviço — execução revogada de public.';

revoke all on function fn_email_do_dono(uuid) from public;
