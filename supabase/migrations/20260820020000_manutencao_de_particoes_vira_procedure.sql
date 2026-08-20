-- Conserta a manutenção de partições, que nunca funcionou uma vez sequer.
--
-- O que faz: troca `fn_manutencao_particoes()` por uma procedure e reagenda o
--            cron para chamá-la.
-- Implementa: o particionamento do épico 8.1, seção 7.4.
--
-- O DEFEITO: `fn_manutencao_particoes()` era uma FUNCTION que dava
-- `call partman.run_maintenance_proc()`. Essa procedure faz `COMMIT` a cada
-- partição criada, e função em PL/pgSQL roda sempre dentro de uma transação —
-- então o commit é ilegal e o Postgres aborta com "invalid transaction
-- termination". As duas execuções que existiam no histórico do cron falharam, e
-- nenhuma partição nova foi criada desde a instalação.
--
-- POR QUE ERA GRAVE: as partições pré-criadas cobriam até 12/10/2026. A partir
-- dali todo INSERT em `eventos` falharia por não achar partição — ingestão
-- parada, sem nenhum aviso antes da hora.
--
-- O CONSERTO, E A PEGADINHA DENTRO DELE: virar procedure não basta. Uma
-- procedure com `security definer` **ou** com cláusula `set` também não pode
-- conter `COMMIT` — as duas coisas criam um nível de configuração que o
-- Postgres se recusa a encerrar, e o erro é exatamente o mesmo. A primeira
-- tentativa de conserto tinha as duas, e falhou igual.
--
-- Por isso esta procedure não tem `security definer` nem `set search_path`. A
-- proteção contra sequestro de search_path vem de qualificar todo nome pelo
-- esquema, aqui dentro. Quem chama é o pg_cron, como o dono do banco.

drop function if exists public.fn_manutencao_particoes();

create or replace procedure public.pr_manutencao_particoes()
language plpgsql
as $$
begin
  -- Cria as partições futuras e aplica a retenção. Dá COMMIT lá dentro.
  call partman.run_maintenance_proc();

  -- Partição nova nasce sem RLS e sem grant: reaplica os dois.
  perform public.fn_protege_particoes_eventos();
end;
$$;

comment on procedure public.pr_manutencao_particoes() is
  'Manutenção diária das partições de eventos. Não tem SECURITY DEFINER nem '
  'SET search_path: as duas coisas proíbem o COMMIT que '
  'partman.run_maintenance_proc() faz por dentro. Por isso todo nome aqui é '
  'qualificado pelo esquema. Ver a migration 20260820020000.';

select cron.unschedule('manutencao_particoes');

select cron.schedule(
  'manutencao_particoes',
  '0 3 * * *',
  $$call public.pr_manutencao_particoes()$$
);
