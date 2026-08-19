-- ============================================================================
-- 0021 — A plataforma registra quando uma conta nasce
--
-- O que faz: acrescenta à trigger de cadastro o envio de um evento para a
--            própria plataforma, dizendo que uma conta foi criada.
-- Implementa: a instrumentação da própria plataforma (Definition of Done,
--             seção 23) e o princípio 0.1 — o evento é declarado aqui, e nada
--             além dele entra.
--
-- POR QUE NO BANCO, E NÃO NO SITE: a conta nasce numa trigger sobre
-- `auth.users`, que o Supabase dispara quando o Google confirma o login. Não
-- há código nosso rodando naquele instante — o callback só descobre a conta
-- depois de ela existir. O único lugar que sabe a hora exata é aqui.
--
-- A PARTE DELICADA, e o motivo de o bloco de exceção ser estreito: esta função
-- é a que cria conta para todo mundo que entra. Se ela falhar, ninguém se
-- cadastra. Por isso o `exception` cobre **apenas a chamada HTTP** — um erro
-- na criação da conta continua estourando, como antes, e não é engolido em
-- silêncio. Foi o conserto de uma primeira versão minha que envolvia a função
-- inteira e teria escondido falha de cadastro.
--
-- `pg_net` faz o request de forma assíncrona: a transação do cadastro não
-- espera a ingestão responder.
--
-- O identificador enviado é o ID DA CONTA, nunca o e-mail — mesma decisão do
-- `lib/instrumentacao.ts`, e pelo mesmo motivo: não duplicar dado pessoal em
-- milhares de linhas de evento.
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- ajustes_da_plataforma — os poucos valores que o próprio banco precisa saber
--
-- Existe porque a trigger roda dentro do Postgres, onde não há variável de
-- ambiente. Fechada para `anon` e `authenticated`: só o banco lê.
-- ----------------------------------------------------------------------------
create table if not exists ajustes_da_plataforma (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);

alter table ajustes_da_plataforma enable row level security;
revoke all on ajustes_da_plataforma from anon, authenticated;

comment on table ajustes_da_plataforma is
  'Ajustes que a própria plataforma usa de dentro do banco. Hoje: para onde mandar os eventos sobre ela mesma.';

-- ----------------------------------------------------------------------------
-- fn_cria_conta_no_cadastro — seção 5.2, agora instrumentada
-- ----------------------------------------------------------------------------
create or replace function fn_cria_conta_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_nome     text;
  v_host     text;
  v_chave    text;
begin
  v_nome := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'Conta sem nome'
  );

  -- Fora de qualquer bloco de exceção, de propósito: falha aqui precisa
  -- aparecer, e não ser engolida.
  insert into public.contas (nome)
  values (v_nome)
  returning id into v_conta_id;

  insert into public.usuarios_conta (conta_id, usuario_id, papel)
  values (v_conta_id, new.id, 'dono');

  -- A partir daqui é só instrumentação, e ela nunca pode impedir alguém de
  -- se cadastrar.
  begin
    select valor into v_host  from public.ajustes_da_plataforma where chave = 'visao_host';
    select valor into v_chave from public.ajustes_da_plataforma where chave = 'visao_api_key';

    if v_host is not null and v_chave is not null then
      perform net.http_post(
        url     := v_host || '/functions/v1/ingest',
        headers := jsonb_build_object('content-type', 'application/json', 'x-api-key', v_chave),
        body    := jsonb_build_object('eventos', jsonb_build_array(jsonb_build_object(
          'id',          gen_random_uuid(),
          'nome',        'visao_conta_criada',
          'distinct_id', v_conta_id::text,
          'ocorrido_em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'tela',        'Login',
          'descricao',   'alguém entrou pela primeira vez e a conta foi criada'
        )))
      );
    end if;
  exception when others then
    -- Silêncio de propósito: medir o cadastro não vale mais do que o cadastro.
    null;
  end;

  return new;
end;
$$;
