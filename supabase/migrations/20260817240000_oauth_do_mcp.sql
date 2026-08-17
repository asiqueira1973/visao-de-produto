-- ============================================================================
-- 0016 — OAuth do servidor MCP (épico 8.8)
--
-- O que faz: cria as duas tabelas que sustentam o fluxo OAuth 2.1 usado pelos
--            clientes de agente que não aceitam token colado à mão — o Claude
--            Desktop entre eles.
-- Implementa: o épico 8.8, que está FORA do spec v1 e foi decidido com o dono:
--             o produto precisa das duas portas, o arquivo de configuração para
--             quem usa terminal e o OAuth para quem só tem o app.
--
-- O que NÃO muda: o token continua sendo uma linha de `credenciais` do tipo
-- `leitura`, com o mesmo hash, a mesma revogação pela tela e a mesma regra
-- 5.1.2 — nunca escreve. O OAuth é só um jeito diferente de a pessoa receber
-- esse token, sem copiar e colar nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clientes_oauth
-- Os clientes que se registram sozinhos (RFC 7591). São clientes públicos: não
-- há segredo, porque um app de desktop não consegue guardar segredo nenhum. A
-- segurança vem do PKCE e da lista de redirecionamentos.
-- ----------------------------------------------------------------------------
create table clientes_oauth (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null unique,
  nome          text not null,
  -- Para onde o navegador pode voltar depois da autorização. Qualquer outro
  -- destino é recusado.
  redirect_uris text[] not null,
  criado_em     timestamptz not null default now()
);

comment on table clientes_oauth is
  'Clientes de agente registrados dinamicamente para o fluxo OAuth do MCP (épico 8.8).';

-- ----------------------------------------------------------------------------
-- codigos_oauth
-- O código de autorização vive minutos e some depois de usado. Guardamos o
-- hash, e não o código — mesmo princípio das credenciais (seção 6.3).
-- ----------------------------------------------------------------------------
create table codigos_oauth (
  id             uuid primary key default gen_random_uuid(),
  codigo_hash    text not null unique,
  client_id      text not null references clientes_oauth (client_id) on delete cascade,
  conta_id       uuid not null references contas (id) on delete cascade,
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  -- Desafio do PKCE (S256). É o que impede outro app de trocar um código que
  -- não é dele.
  code_challenge text not null,
  redirect_uri   text not null,
  expira_em      timestamptz not null,
  usado_em       timestamptz,
  criado_em      timestamptz not null default now()
);

create index idx_codigos_oauth_expira on codigos_oauth (expira_em);

-- ----------------------------------------------------------------------------
-- RLS: ninguém alcança estas tabelas pela API. Quem manipula é o servidor de
-- autorização, com service_role, nas rotas do site.
-- ----------------------------------------------------------------------------
alter table clientes_oauth enable row level security;
alter table codigos_oauth  enable row level security;

revoke all on clientes_oauth, codigos_oauth from anon, authenticated;

-- ----------------------------------------------------------------------------
-- fn_expurga_codigos_oauth
-- O que faz: apaga código expirado ou já usado.
-- Recebe:    nada. Roda por pg_cron, de hora em hora.
-- Devolve:   nada.
-- Código de autorização é lixo em minutos; deixar acumular é só superfície.
-- ----------------------------------------------------------------------------
create or replace function fn_expurga_codigos_oauth()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.codigos_oauth
  where expira_em < now() - interval '1 hour'
     or usado_em is not null;
end;
$$;

revoke all on function fn_expurga_codigos_oauth() from public, anon, authenticated;

select cron.schedule(
  'expurga_codigos_oauth',
  '7 * * * *',
  $$select public.fn_expurga_codigos_oauth()$$
);
