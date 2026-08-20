-- Fecha `fn_email_do_dono`, que continuou aberta ao `anon` mesmo com revoke.
--
-- O que faz: revoga a execução dos três lugares de onde ela é concedida.
-- Implementa: a matriz de acesso da seção 5.1 — `anon` não lê nada.
--
-- O DEFEITO, E A LIÇÃO QUE ELE CORRIGE: a migration 20260820060000 revogou de
-- `public`, seguindo a conclusão que a 20260820050000 tinha registrado. Estava
-- pela metade, e a função ficou chamável por `/rest/v1/rpc/` com a chave
-- anônima — provado com um POST devolvendo 200.
--
-- São DUAS concessões independentes, e cada uma sozinha basta para deixar a
-- porta aberta:
--
--   1. O PostgreSQL concede EXECUTE a `PUBLIC` em toda função nova.
--   2. O Supabase mantém um ALTER DEFAULT PRIVILEGES que concede EXECUTE a
--      `anon`, `authenticated` e `service_role` em toda função nova do schema
--      `public` — visível em `pg_default_acl`.
--
-- Revogar de `public` deixa a concessão explícita do item 2 de pé. Revogar de
-- `anon, authenticated` deixa a herança do item 1 de pé. **Só revogar dos três
-- fecha.** Foi por isso que as funções de aviso pareceram consertadas: elas
-- tinham as duas revogações, em migrations diferentes, por acidente.
--
-- Regra para toda função nova daqui em diante: revogue dos três, e confirme com
-- `has_function_privilege('anon', …, 'EXECUTE')` — não pela leitura do código.

revoke all on function public.fn_email_do_dono(uuid) from public;
revoke all on function public.fn_email_do_dono(uuid) from anon, authenticated;
