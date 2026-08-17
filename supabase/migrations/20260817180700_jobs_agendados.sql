-- ============================================================================
-- 0008 — Jobs agendados (pg_cron)
--
-- O que faz: agenda os quatro jobs da seção 7.10.
-- Implementa: seção 7.10; regras 11.8, 11.15, 11.17 e 11.18.
--
-- Os horários são UTC, que é o fuso em que o banco opera (regra 11.7).
-- ============================================================================

-- Manutenção das partições de `eventos`: pré-cria as partições futuras e
-- aplica a retenção física de 12 meses, dropando as vencidas (regra 11.8).
select cron.schedule(
  'manutencao_particoes',
  '0 3 * * *',
  $$call partman.run_maintenance_proc()$$
);

-- Medição de uso do mês corrente, por conta (regra 11.15). Precondição de
-- qualquer cobrança futura: não dá para faturar um mês que nunca foi contado.
select cron.schedule(
  'agrega_uso_mensal',
  '0 4 * * *',
  $$select public.fn_agrega_uso_mensal()$$
);

-- Exclusão definitiva de contas canceladas há mais de 30 dias (regra 11.17).
-- Nenhum passo exige intervenção do dono da plataforma (princípio 0.6).
select cron.schedule(
  'expurga_contas_canceladas',
  '30 4 * * *',
  $$select public.fn_expurga_contas_canceladas()$$
);

-- Poda do histórico do próprio pg_cron, aos domingos. A documentação do
-- Supabase avisa que essa tabela não se limpa sozinha e que o crescimento dela
-- atrapalha upgrades.
select cron.schedule(
  'poda_cron_historico',
  '0 5 * * 0',
  $$select public.fn_poda_cron_historico()$$
);
