-- ============================================================================
-- 0009 — Proteção das partições de `eventos`
--
-- O que faz: fecha o acesso direto às partições de `eventos` e passa a fazer
--            isso de novo a cada manutenção, para que partição nova já nasça
--            fechada.
-- Implementa: seção 6.2 ("nenhuma tabela é acessível por anon") e o item do
--             Definition of Done que exige teste de leitura anônima.
--
-- POR QUE ISTO EXISTE: RLS habilitada na tabela particionada vale para quem
-- consulta pelo pai. Cada partição, porém, é uma tabela de verdade no schema
-- `public` — e portanto um endpoint do PostgREST. Sem este ajuste,
-- `select * from eventos_p20260817` devolveria eventos de qualquer conta a
-- qualquer usuário autenticado, contornando `eventos_dono_leitura`.
-- Verificado na prática antes de escrever esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_protege_particoes_eventos
-- O que faz: habilita RLS e retira todo privilégio de `anon` e `authenticated`
--            em cada partição de `eventos`, inclusive a partição default.
-- Recebe:    nada.
-- Devolve:   nada.
-- É idempotente: rodar de novo em partição já protegida não faz nada.
-- ----------------------------------------------------------------------------
create or replace function fn_protege_particoes_eventos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_particao regclass;
begin
  for v_particao in
    select i.inhrelid::regclass
    from pg_catalog.pg_inherits i
    where i.inhparent = 'public.eventos'::regclass
  loop
    execute format('alter table %s enable row level security', v_particao);
    execute format('revoke all on %s from anon, authenticated', v_particao);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- fn_manutencao_particoes
-- O que faz: roda a manutenção do pg_partman (pré-cria partições futuras e
--            aplica a retenção de 12 meses) e, logo depois, protege o que
--            acabou de ser criado.
-- Recebe:    nada. Roda por pg_cron, diariamente às 03:00 UTC.
-- Devolve:   nada.
-- As partições são criadas com 7 semanas de antecedência, então uma partição
-- nova é fechada muito antes de receber o primeiro evento.
-- ----------------------------------------------------------------------------
create or replace function fn_manutencao_particoes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  call partman.run_maintenance_proc();
  perform public.fn_protege_particoes_eventos();
end;
$$;

-- Fecha as partições que já existem.
select fn_protege_particoes_eventos();

-- O job passa a chamar a versão que protege depois de criar (seção 7.10).
select cron.unschedule('manutencao_particoes');
select cron.schedule(
  'manutencao_particoes',
  '0 3 * * *',
  $$select public.fn_manutencao_particoes()$$
);
