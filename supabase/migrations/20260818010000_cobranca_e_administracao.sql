-- ============================================================================
-- 0017 — Modelo de dados da cobrança e da administração (épico F10)
--
-- O que faz: cria o que a cobrança precisa guardar — estado da assinatura,
--            dados do tomador da nota fiscal, idempotência dos webhooks — e a
--            base da administração: quem é admin e o registro do que ele fez.
-- Implementa: EPICO-COBRANCA.md, decidido com o dono em 17/08/2026. A seção 25
--             do spec mantinha F10 fora do MVP; o dono trouxe para dentro.
--
-- O que NÃO entra aqui: nenhuma política nova nas tabelas que já existem. A
-- decisão C5 é explícita — admin não vira `or eh_admin()` espalhado por catorze
-- políticas de RLS, porque seriam catorze lugares novos para errar, e vazamento
-- entre contas é o único erro deste produto que não tem conserto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums novos
-- ----------------------------------------------------------------------------

-- O estado da assinatura no Stripe, ESPELHADO aqui. A verdade mora lá, e é por
-- isso que existe o job de reconciliação: espelho desatualiza.
create type status_assinatura as enum ('nenhuma', 'ativa', 'atrasada', 'cancelada');

-- Quem recebe a nota. A diferença importa: pessoa física precisa de dois
-- campos, pessoa jurídica precisa de endereço inteiro (EPICO-COBRANCA.md, 5).
create type tipo_tomador as enum ('pf', 'pj');

-- O que um admin fez. Enum, e não texto livre, para a auditoria ser consultável.
create type acao_admin as enum (
  'consultou_contas',
  'consultou_conta',
  'concedeu_cortesia',
  'removeu_cortesia',
  'promoveu_admin',
  'revogou_admin'
);

-- ----------------------------------------------------------------------------
-- contas — colunas da assinatura
-- `plano`, `retencao_meses`, `limite_projetos` e `stripe_cliente_id` já existiam
-- desde a primeira migration, justamente para este dia não exigir reescrita.
-- ----------------------------------------------------------------------------
alter table contas
  -- Conta paga sem Stripe (decisão C7). Enquanto verdadeira, nenhuma rotina de
  -- cobrança encosta nela: não é cobrada, não vence e não é rebaixada.
  add column cortesia          boolean           not null default false,
  add column assinatura_id     text,
  add column assinatura_status status_assinatura not null default 'nenhuma',
  -- Até quando o período pago vale. É o que a carência do rebaixamento usa:
  -- cancelar não rebaixa na hora, rebaixa quando este prazo passa (decisão C6).
  add column periodo_fim       timestamptz;

comment on column contas.cortesia is
  'Conta paga por cortesia, sem Stripe. Concedida por admin e registrada em acoes_admin.';
comment on column contas.assinatura_status is
  'Espelho do estado no Stripe. A verdade está no Stripe; quem corrige a divergência é o job de reconciliação.';

-- ----------------------------------------------------------------------------
-- dados_de_cobranca — o tomador da nota fiscal
--
-- Tabela própria, e não colunas em `contas`, por três motivos: só existe para
-- quem paga; carrega CPF ou CNPJ, que é dado pessoal de outra natureza e merece
-- política e exclusão próprias; e assim `contas` não incha com onze colunas que
-- ficam nulas na conta gratuita.
--
-- Os campos obrigatórios saíram do formulário real da Contabilizei, que é por
-- onde a nota é emitida hoje:
--   pessoa física  -> documento e nome. Só isso.
--   pessoa jurídica -> documento, nome (razão social) e endereço completo.
-- ----------------------------------------------------------------------------
create table dados_de_cobranca (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references contas (id) on delete cascade,
  tipo         tipo_tomador not null,
  -- Só dígitos, sem ponto nem traço. 11 no CPF, 14 no CNPJ.
  documento    text not null,
  -- Nome completo na pessoa física; razão social na jurídica.
  nome         text not null,
  -- Para onde a nota é enviada. Nulo usa o e-mail de quem é dono da conta.
  email_nota   text,
  -- Endereço: obrigatório só para pessoa jurídica, garantido pelo check abaixo.
  cep          text,
  logradouro   text,
  numero       text,
  complemento  text,
  bairro       text,
  municipio    text,
  uf           text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint chk_documento_digitos check (documento ~ '^[0-9]+$'),
  constraint chk_documento_tamanho check (
    (tipo = 'pf' and length(documento) = 11) or
    (tipo = 'pj' and length(documento) = 14)
  ),
  -- A nota da pessoa jurídica não sai sem endereço. A da física sai.
  constraint chk_endereco_da_pj check (
    tipo = 'pf' or (
      cep is not null and logradouro is not null and numero is not null and
      bairro is not null and municipio is not null and uf is not null
    )
  ),
  constraint chk_uf check (uf is null or uf ~ '^[A-Z]{2}$')
);

-- Uma linha por conta.
create unique index uq_dados_de_cobranca_conta on dados_de_cobranca (conta_id);

comment on table dados_de_cobranca is
  'Tomador da nota fiscal de serviço. Campos obrigatórios conforme o tipo (EPICO-COBRANCA.md, seção 5).';

-- ----------------------------------------------------------------------------
-- eventos_stripe — a tabela que impede cobrar ou liberar duas vezes
--
-- Webhook chega duplicado, fora de ordem, e às vezes duas vezes ao mesmo tempo.
-- A chave primária é o `event.id` do PRÓPRIO Stripe: o insert é o que torna o
-- processamento idempotente. Se a linha já existe e já foi processada, o
-- handler responde 200 e não faz nada.
-- ----------------------------------------------------------------------------
create table eventos_stripe (
  id           text primary key,
  tipo         text not null,
  conta_id     uuid references contas (id) on delete set null,
  carga        jsonb,
  recebido_em  timestamptz not null default now(),
  -- Nulo enquanto o efeito não foi aplicado. Erro no meio deixa nulo de
  -- propósito, para o reenvio do Stripe conseguir tentar de novo.
  processado_em timestamptz
);

create index idx_eventos_stripe_pendentes on eventos_stripe (recebido_em) where processado_em is null;
create index idx_eventos_stripe_conta on eventos_stripe (conta_id);

-- ----------------------------------------------------------------------------
-- administradores — quem enxerga a plataforma inteira
--
-- Admin é papel de PLATAFORMA, não de conta: por isso tabela própria, e não um
-- valor novo em `papel_conta`, que descreve papel dentro de uma conta.
-- ----------------------------------------------------------------------------
create table administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now(),
  -- Qual admin concedeu. Nulo apenas no primeiro, semeado por migration.
  criado_por uuid references auth.users (id) on delete set null
);

-- ----------------------------------------------------------------------------
-- acoes_admin — auditoria
--
-- Vale para o dono também. Auditoria que abre exceção para o dono não é
-- auditoria.
-- ----------------------------------------------------------------------------
create table acoes_admin (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users (id) on delete cascade,
  acao       acao_admin not null,
  conta_alvo uuid references contas (id) on delete set null,
  -- O antes e o depois, quando a ação muda alguma coisa.
  detalhe    jsonb not null default '{}'::jsonb,
  feito_em   timestamptz not null default now()
);

create index idx_acoes_admin_feito on acoes_admin (feito_em desc);
create index idx_acoes_admin_admin on acoes_admin (admin_id, feito_em desc);
create index idx_acoes_admin_conta on acoes_admin (conta_alvo);

-- ============================================================================
-- RLS — nas quatro tabelas novas, como em todas as outras
-- ============================================================================

alter table dados_de_cobranca enable row level security;
alter table eventos_stripe    enable row level security;
alter table administradores   enable row level security;
alter table acoes_admin       enable row level security;

-- Ninguém alcança nada disso anonimamente.
revoke all on dados_de_cobranca, eventos_stripe, administradores, acoes_admin from anon;

-- Das quatro, só uma é do usuário: os próprios dados de cobrança dele.
-- As outras três são operadas por rota de servidor com service_role, e por isso
-- `authenticated` não recebe privilégio nenhum nelas. Sem política = nega tudo.
revoke all on eventos_stripe, administradores, acoes_admin from authenticated;

grant select, insert, update on dados_de_cobranca to authenticated;

-- O dono lê e edita os próprios dados de cobrança. Não apaga: enquanto houver
-- nota emitida, o tomador daquela nota precisa continuar existindo.
create policy dados_de_cobranca_dono on dados_de_cobranca
  for all to authenticated
  using (conta_id in (select fn_contas_do_usuario()))
  with check (conta_id in (select fn_contas_do_usuario()));

-- ----------------------------------------------------------------------------
-- fn_eh_admin — a única porta para saber se quem está logado é admin
--
-- O que faz: diz se o usuário autenticado está em `administradores`.
-- Recebe:    nada; lê auth.uid().
-- Devolve:   verdadeiro ou falso.
-- É SECURITY DEFINER porque a tabela `administradores` é fechada para
-- `authenticated`: sem isso, a resposta seria sempre falso.
--
-- Repare no que esta função NÃO faz: ela não dá acesso a nada. As telas de
-- admin usam funções próprias, que devolvem agregado. Isto aqui só responde uma
-- pergunta de sim ou não.
-- ----------------------------------------------------------------------------
create or replace function fn_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.administradores a where a.usuario_id = auth.uid())
$$;

revoke all on function fn_eh_admin() from public, anon;
grant execute on function fn_eh_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- O primeiro admin, pelo e-mail do dono.
--
-- Escrito para ser inofensivo onde esse e-mail não existe: no banco de dev não
-- há esse usuário, e a migration simplesmente não insere nada.
-- ----------------------------------------------------------------------------
insert into administradores (usuario_id, criado_por)
select u.id, null
from auth.users u
where u.email = 'alexandre.silva.siqueira@gmail.com'
on conflict (usuario_id) do nothing;
