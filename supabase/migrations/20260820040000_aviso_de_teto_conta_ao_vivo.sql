-- O aviso de teto passa a contar os eventos do mês ao vivo.
--
-- O que faz: troca a fonte de `fn_avisos_de_teto` de `uso_mensal` para
--            `eventos`.
-- Implementa: o e-mail 3 do backlog de e-mail transacional do CLAUDE.md.
--
-- O DEFEITO: a versão anterior usava `fn_uso_do_teto`, que lê de `uso_mensal`.
-- Aquela tabela é escrita uma vez por dia, às 04:00 UTC, por
-- `fn_agrega_uso_mensal`. O aviso, portanto, enxergava uma foto de até 24 horas
-- atrás.
--
-- POR QUE ISSO IMPORTA JUSTAMENTE AQUI: o teto existe para conter loop de
-- código. Um loop enche o teto em horas — a ingestão aceita 2.000 eventos por
-- minuto, então um milhão cabe em pouco mais de oito. Com a foto de ontem, a
-- pessoa seria bloqueada antes de receber o aviso que existe para chegar antes
-- do bloqueio. O único caso em que o aviso realmente serve era o caso em que
-- ele não funcionava.
--
-- O CUSTO: uma contagem por conta por dia, servida pelo índice
-- (conta_id, ocorrido_em). `uso_mensal` continua sendo a fonte das telas, onde
-- a foto diária é adequada e barata.

create or replace function fn_avisos_de_teto()
returns table (
  conta_id   uuid,
  email      text,
  nome       text,
  usados     bigint,
  teto       integer,
  percentual integer
)
language sql
security definer
set search_path = ''
stable
as $$
  with consumo as (
    select c.id,
           c.limite_eventos_mes as teto,
           (select count(*) from public.eventos e
             where e.conta_id = c.id
               and e.ocorrido_em >= date_trunc('month', now())) as usados
    from public.contas c
    where c.cancelada_em is null
      and c.limite_eventos_mes is not null
      and c.limite_eventos_mes > 0
  )
  select k.id,
         u.email::text,
         (u.raw_user_meta_data ->> 'full_name')::text,
         k.usados,
         k.teto,
         floor(k.usados::numeric * 100 / k.teto)::integer
  from consumo k
  join public.usuarios_conta uc on uc.conta_id = k.id
  join auth.users u on u.id = uc.usuario_id
  where k.usados::numeric / k.teto >= 0.8
    and not exists (
      select 1 from public.avisos_enviados a
      where a.conta_id = k.id
        and a.tipo = 'teto'
        and a.referencia = to_char(now() at time zone 'utc', 'YYYY-MM')
    );
$$;

comment on function fn_avisos_de_teto() is
  'Contas acima de 80% do teto de eventos do mês, contado ao vivo em `eventos` '
  'e não pela foto diária de `uso_mensal` — ver a migration 20260820040000.';

revoke all on function fn_avisos_de_teto() from anon, authenticated;
