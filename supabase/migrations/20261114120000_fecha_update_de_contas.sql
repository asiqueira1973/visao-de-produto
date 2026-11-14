-- O dono da conta só edita o nome e o cancelamento.
-- Plano, cortesia, limites e assinatura são escritos apenas por service_role
-- (webhook da Stripe, painel admin e jobs). Antes, o grant de update valia para
-- a tabela inteira, e qualquer usuário logado conseguia se dar plano pago,
-- cortesia e ingestão sem limite com um PATCH na API REST.
revoke update on public.contas from authenticated;
grant update (nome, cancelada_em) on public.contas to authenticated;
