-- Fecha as duas funções de aviso, que estavam abertas ao público.
--
-- O que faz: revoga execução de `public` nas funções que listam quem avisar.
-- Implementa: a matriz de acesso da seção 5.1 — `anon` não lê nada.
--
-- O DEFEITO: a migration 20260820030000 revogou execução de `anon` e
-- `authenticated`, e isso não bastou. O Postgres concede EXECUTE a `public` por
-- padrão em toda função nova, e `public` inclui os dois papéis: revogar deles
-- nominalmente não remove a concessão herdada. As funções continuaram
-- chamáveis por `/rest/v1/rpc/…` com a chave anônima — que é pública, por
-- definição, e vai no bundle do navegador.
--
-- POR QUE ERA GRAVE: as duas são SECURITY DEFINER e devolvem o **e-mail** do
-- dono de cada conta que se qualifica. Bastava uma conta cancelada, ou uma
-- acima de 80% do teto, para a chamada devolver o endereço dela a qualquer um.
--
-- A LIÇÃO, e ela vale para toda função nova daqui em diante: revogar de
-- `public` é o que fecha; revogar de `anon` e `authenticated` é enfeite. Quem
-- pegou isso foi o get_advisors, não a revisão do código.

revoke all on function public.fn_avisos_de_cancelamento() from public;
revoke all on function public.fn_avisos_de_teto() from public;
