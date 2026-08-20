-- Quem já recebeu qual aviso, e quem precisa receber hoje.
--
-- O que faz: cria o registro de avisos enviados e as duas consultas que o job
--            diário usa para saber a quem escrever.
-- Implementa: os e-mails 1 e 3 do backlog de e-mail transacional do CLAUDE.md.
--
-- POR QUE UMA TABELA, E NÃO UMA COLUNA EM `contas`: o mesmo aviso pode ser
-- mandado mais de uma vez com sentidos diferentes — o de cancelamento vai a 30,
-- a 7 e a 1 dia do fim, e o de teto vai uma vez por mês. Uma coluna guardaria
-- só a última e não saberia responder "este já foi?". A chave única de
-- (conta, tipo, referência) é o que torna o envio idempotente: o job pode rodar
-- duas vezes no mesmo dia sem escrever duas vezes para ninguém.

create type aviso_email as enum ('boas_vindas', 'cancelamento', 'teto', 'pagamento');

create table avisos_enviados (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas(id) on delete cascade,
  tipo       aviso_email not null,
  -- Discrimina o momento: 'unica' nas boas-vindas, os dias restantes no
  -- cancelamento, a competência do mês no teto.
  referencia text not null,
  enviado_em timestamptz not null default now(),
  constraint avisos_enviados_unico unique (conta_id, tipo, referencia)
);

create index avisos_enviados_conta_idx on avisos_enviados (conta_id);

alter table avisos_enviados enable row level security;
revoke all on avisos_enviados from anon, authenticated;
grant select on avisos_enviados to authenticated;

-- A pessoa pode ver o que a plataforma mandou para ela, e nada além disso.
-- Escrever é só do job, que roda com a chave de serviço.
create policy avisos_enviados_dono_leitura on avisos_enviados
  for select to authenticated
  using (conta_id in (select fn_contas_do_usuario()));

comment on table avisos_enviados is
  'Um registro por aviso enviado. A chave única (conta, tipo, referência) é o '
  'que impede o job diário de escrever duas vezes para a mesma pessoa.';


-- Contas canceladas que merecem o lembrete de hoje.
-- Recebe nada.
-- Devolve conta, e-mail do dono, nome, dias restantes e o que será apagado.
-- Implementa a regra 11.17: a janela de 30 dias só protege quem lembra que
-- pediu. Avisa a 7 e a 1 dia do fim — o de 30 sai na hora do cancelamento, na
-- própria tela, e não depende deste job.
create or replace function fn_avisos_de_cancelamento()
returns table (
  conta_id   uuid,
  email      text,
  nome       text,
  dias       integer,
  projetos   integer,
  eventos    bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with restantes as (
    select c.id,
           30 - floor(extract(epoch from (now() - c.cancelada_em)) / 86400)::integer as dias
    from public.contas c
    where c.cancelada_em is not null
  )
  select r.id,
         u.email::text,
         (u.raw_user_meta_data ->> 'full_name')::text,
         r.dias,
         (select count(*)::integer from public.projetos p
           where p.conta_id = r.id and p.arquivado_em is null),
         (select count(*) from public.eventos e where e.conta_id = r.id)
  from restantes r
  join public.usuarios_conta uc on uc.conta_id = r.id
  join auth.users u on u.id = uc.usuario_id
  where r.dias in (7, 1)
    and not exists (
      select 1 from public.avisos_enviados a
      where a.conta_id = r.id
        and a.tipo = 'cancelamento'
        and a.referencia = r.dias::text
    );
$$;

comment on function fn_avisos_de_cancelamento() is
  'Contas a 7 e a 1 dia do expurgo que ainda não receberam o lembrete daquele '
  'dia. Ver a regra 11.17.';


-- Contas que passaram de 80% do teto de eventos do mês.
-- Recebe nada.
-- Devolve conta, e-mail do dono, nome, o consumo, o teto e o percentual.
-- O aviso é uma vez por mês por conta: a referência é a competência.
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
  select c.id,
         u.email::text,
         (u.raw_user_meta_data ->> 'full_name')::text,
         t.eventos_no_mes,
         t.teto,
         round(t.fracao * 100)::integer
  from public.contas c
  join public.usuarios_conta uc on uc.conta_id = c.id
  join auth.users u on u.id = uc.usuario_id
  cross join lateral public.fn_uso_do_teto(c.id) t
  where c.cancelada_em is null
    and t.fracao >= 0.8
    and not exists (
      select 1 from public.avisos_enviados a
      where a.conta_id = c.id
        and a.tipo = 'teto'
        and a.referencia = to_char(now() at time zone 'utc', 'YYYY-MM')
    );
$$;

comment on function fn_avisos_de_teto() is
  'Contas acima de 80% do teto de eventos do mês que ainda não foram avisadas '
  'nesta competência.';

revoke all on function fn_avisos_de_cancelamento() from anon, authenticated;
revoke all on function fn_avisos_de_teto() from anon, authenticated;
