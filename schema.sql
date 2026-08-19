-- Esquema do banco de ntdjmdqiqjpnufrekorp, gerado do catálogo do Postgres.
-- Gerado por scripts/gerar-schema.sh em 2026-08-19T01:41:37Z.
--
-- NÃO EDITE À MÃO. Quem manda são os arquivos de supabase/migrations/;
-- este arquivo é o retrato do que eles produziram no banco de verdade.

-- ==========================================================================
-- Extensões

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_partman with schema partman;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ==========================================================================
-- Enums (seção 7.2)

create type acao_admin as enum ('consultou_contas', 'consultou_conta', 'concedeu_cortesia', 'removeu_cortesia', 'promoveu_admin', 'revogou_admin');
create type janela_periodo as enum ('7d', '14d', '30d', '90d');
create type papel_conta as enum ('dono', 'membro', 'leitor');
create type plano_conta as enum ('gratuito', 'pago');
create type status_assinatura as enum ('nenhuma', 'ativa', 'atrasada', 'cancelada');
create type tipo_credencial as enum ('ingestao', 'leitura');
create type tipo_tomador as enum ('pf', 'pj');
create type tipo_visualizacao as enum ('serie_temporal', 'total_periodo', 'usuarios_unicos');

-- ==========================================================================
-- Papéis

create role visao_mcp_leitor nologin;

-- ==========================================================================
-- Tabelas

create table acoes_admin (
  id uuid not null default gen_random_uuid(),
  admin_id uuid not null,
  acao acao_admin not null,
  conta_alvo uuid,
  detalhe jsonb not null default '{}'::jsonb,
  feito_em timestamp with time zone not null default now(),
  constraint acoes_admin_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint acoes_admin_conta_alvo_fkey FOREIGN KEY (conta_alvo) REFERENCES contas(id) ON DELETE SET NULL,
  constraint acoes_admin_pkey PRIMARY KEY (id)
);

create table administradores (
  usuario_id uuid not null,
  criado_em timestamp with time zone not null default now(),
  criado_por uuid,
  constraint administradores_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  constraint administradores_pkey PRIMARY KEY (usuario_id),
  constraint administradores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table clientes_oauth (
  id uuid not null default gen_random_uuid(),
  client_id text not null,
  nome text not null,
  redirect_uris text[] not null,
  criado_em timestamp with time zone not null default now(),
  constraint clientes_oauth_client_id_key UNIQUE (client_id),
  constraint clientes_oauth_pkey PRIMARY KEY (id)
);

create table codigos_oauth (
  id uuid not null default gen_random_uuid(),
  codigo_hash text not null,
  client_id text not null,
  conta_id uuid not null,
  usuario_id uuid not null,
  code_challenge text not null,
  redirect_uri text not null,
  expira_em timestamp with time zone not null,
  usado_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  constraint codigos_oauth_client_id_fkey FOREIGN KEY (client_id) REFERENCES clientes_oauth(client_id) ON DELETE CASCADE,
  constraint codigos_oauth_codigo_hash_key UNIQUE (codigo_hash),
  constraint codigos_oauth_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint codigos_oauth_pkey PRIMARY KEY (id),
  constraint codigos_oauth_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table contas (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  plano plano_conta not null default 'gratuito'::plano_conta,
  retencao_meses integer not null default 1,
  limite_projetos integer default 1,
  stripe_cliente_id text,
  criada_em timestamp with time zone not null default now(),
  cancelada_em timestamp with time zone,
  cortesia boolean not null default false,
  assinatura_id text,
  assinatura_status status_assinatura not null default 'nenhuma'::status_assinatura,
  periodo_fim timestamp with time zone,
  limite_eventos_mes integer not null default 1000000,
  constraint contas_pkey PRIMARY KEY (id)
);

create table credenciais (
  id uuid not null default gen_random_uuid(),
  conta_id uuid not null,
  tipo tipo_credencial not null,
  projeto_id uuid,
  nome text not null,
  prefixo text not null,
  valor_hash text not null,
  criada_em timestamp with time zone not null default now(),
  ultimo_uso_em timestamp with time zone,
  revogada_em timestamp with time zone,
  constraint chk_credencial_projeto CHECK ((((tipo = 'ingestao'::tipo_credencial) AND (projeto_id IS NOT NULL)) OR ((tipo = 'leitura'::tipo_credencial) AND (projeto_id IS NULL)))),
  constraint credenciais_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint credenciais_pkey PRIMARY KEY (id),
  constraint credenciais_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

create table dados_de_cobranca (
  id uuid not null default gen_random_uuid(),
  conta_id uuid not null,
  tipo tipo_tomador not null,
  documento text not null,
  nome text not null,
  email_nota text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint chk_documento_digitos CHECK ((documento ~ '^[0-9]+$'::text)),
  constraint chk_documento_tamanho CHECK ((((tipo = 'pf'::tipo_tomador) AND (length(documento) = 11)) OR ((tipo = 'pj'::tipo_tomador) AND (length(documento) = 14)))),
  constraint chk_endereco_da_pj CHECK (((tipo = 'pf'::tipo_tomador) OR ((cep IS NOT NULL) AND (logradouro IS NOT NULL) AND (numero IS NOT NULL) AND (bairro IS NOT NULL) AND (municipio IS NOT NULL) AND (uf IS NOT NULL)))),
  constraint chk_uf CHECK (((uf IS NULL) OR (uf ~ '^[A-Z]{2}$'::text))),
  constraint dados_de_cobranca_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint dados_de_cobranca_pkey PRIMARY KEY (id)
);

create table definicoes_evento (
  id uuid not null default gen_random_uuid(),
  projeto_id uuid not null,
  nome text not null,
  descricao text,
  telas text[] not null default '{}'::text[],
  total_ocorrencias bigint not null default 0,
  primeira_ocorrencia_em timestamp with time zone,
  ultima_ocorrencia_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  constraint chk_definicao_nome CHECK (fn_valida_nome_evento(nome)),
  constraint definicoes_evento_pkey PRIMARY KEY (id),
  constraint definicoes_evento_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

create table eventos (
  id uuid not null,
  conta_id uuid not null,
  projeto_id uuid not null,
  nome text not null,
  distinct_id text not null,
  tela text,
  descricao text,
  propriedades jsonb not null default '{}'::jsonb,
  ocorrido_em timestamp with time zone not null,
  recebido_em timestamp with time zone not null default now(),
  constraint chk_nome_evento CHECK (fn_valida_nome_evento(nome)),
  constraint eventos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint eventos_pkey PRIMARY KEY (ocorrido_em, id),
  constraint eventos_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
) partition by RANGE (ocorrido_em);

create table eventos_stripe (
  id text not null,
  tipo text not null,
  conta_id uuid,
  carga jsonb,
  recebido_em timestamp with time zone not null default now(),
  processado_em timestamp with time zone,
  constraint eventos_stripe_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE SET NULL,
  constraint eventos_stripe_pkey PRIMARY KEY (id)
);

create table paineis (
  id uuid not null default gen_random_uuid(),
  projeto_id uuid not null,
  nome text not null,
  janela_padrao janela_periodo not null default '30d'::janela_periodo,
  criado_em timestamp with time zone not null default now(),
  constraint paineis_pkey PRIMARY KEY (id),
  constraint paineis_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

create table paineis_itens (
  id uuid not null default gen_random_uuid(),
  painel_id uuid not null,
  nome_evento text not null,
  titulo text,
  tipo_visualizacao tipo_visualizacao not null default 'serie_temporal'::tipo_visualizacao,
  posicao integer not null default 0,
  constraint paineis_itens_painel_id_fkey FOREIGN KEY (painel_id) REFERENCES paineis(id) ON DELETE CASCADE,
  constraint paineis_itens_pkey PRIMARY KEY (id)
);

create table pessoas (
  id uuid not null default gen_random_uuid(),
  projeto_id uuid not null,
  distinct_id text not null,
  propriedades jsonb not null default '{}'::jsonb,
  total_eventos bigint not null default 0,
  primeiro_visto_em timestamp with time zone not null,
  ultimo_visto_em timestamp with time zone not null,
  constraint pessoas_pkey PRIMARY KEY (id),
  constraint pessoas_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

create table projetos (
  id uuid not null default gen_random_uuid(),
  conta_id uuid not null,
  nome text not null,
  slug text not null,
  descricao text,
  prefixo_evento text,
  fuso_exibicao text not null default 'America/Sao_Paulo'::text,
  criado_em timestamp with time zone not null default now(),
  arquivado_em timestamp with time zone,
  constraint chk_projeto_slug CHECK ((slug ~ '^[a-z0-9-]+$'::text)),
  constraint projetos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint projetos_pkey PRIMARY KEY (id)
);

create table uso_mensal (
  id uuid not null default gen_random_uuid(),
  conta_id uuid not null,
  competencia date not null,
  eventos_recebidos bigint not null default 0,
  projetos_ativos integer not null default 0,
  pessoas_distintas integer not null default 0,
  consultas_mcp integer not null default 0,
  atualizado_em timestamp with time zone not null default now(),
  constraint uso_mensal_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint uso_mensal_pkey PRIMARY KEY (id)
);

create table usuarios_conta (
  id uuid not null default gen_random_uuid(),
  conta_id uuid not null,
  usuario_id uuid not null,
  papel papel_conta not null default 'dono'::papel_conta,
  criado_em timestamp with time zone not null default now(),
  constraint usuarios_conta_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  constraint usuarios_conta_pkey PRIMARY KEY (id),
  constraint usuarios_conta_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE
);


-- ==========================================================================
-- Índices

CREATE INDEX idx_acoes_admin_admin ON public.acoes_admin USING btree (admin_id, feito_em DESC);
CREATE INDEX idx_acoes_admin_conta ON public.acoes_admin USING btree (conta_alvo);
CREATE INDEX idx_acoes_admin_feito ON public.acoes_admin USING btree (feito_em DESC);
CREATE UNIQUE INDEX clientes_oauth_client_id_key ON public.clientes_oauth USING btree (client_id);
CREATE INDEX idx_codigos_oauth_expira ON public.codigos_oauth USING btree (expira_em);
CREATE UNIQUE INDEX codigos_oauth_codigo_hash_key ON public.codigos_oauth USING btree (codigo_hash);
CREATE INDEX idx_credenciais_conta ON public.credenciais USING btree (conta_id);
CREATE INDEX idx_credenciais_projeto ON public.credenciais USING btree (projeto_id);
CREATE INDEX idx_credenciais_tipo_ativa ON public.credenciais USING btree (tipo, revogada_em);
CREATE UNIQUE INDEX uq_credenciais_valor_hash ON public.credenciais USING btree (valor_hash);
CREATE UNIQUE INDEX uq_dados_de_cobranca_conta ON public.dados_de_cobranca USING btree (conta_id);
CREATE UNIQUE INDEX uq_definicoes_projeto_nome ON public.definicoes_evento USING btree (projeto_id, nome);
CREATE INDEX idx_eventos_conta_data ON ONLY public.eventos USING btree (conta_id, ocorrido_em DESC);
CREATE INDEX idx_eventos_ocorrido_brin ON ONLY public.eventos USING brin (ocorrido_em);
CREATE INDEX idx_eventos_projeto_data ON ONLY public.eventos USING btree (projeto_id, ocorrido_em DESC);
CREATE INDEX idx_eventos_projeto_nome_data ON ONLY public.eventos USING btree (projeto_id, nome, ocorrido_em DESC);
CREATE INDEX idx_eventos_projeto_pessoa_data ON ONLY public.eventos USING btree (projeto_id, distinct_id, ocorrido_em DESC);
CREATE INDEX idx_eventos_stripe_conta ON public.eventos_stripe USING btree (conta_id);
CREATE INDEX idx_eventos_stripe_pendentes ON public.eventos_stripe USING btree (recebido_em) WHERE (processado_em IS NULL);
CREATE INDEX idx_paineis_projeto ON public.paineis USING btree (projeto_id);
CREATE INDEX idx_paineis_itens_painel ON public.paineis_itens USING btree (painel_id, posicao);
CREATE UNIQUE INDEX uq_pessoas_projeto_distinct ON public.pessoas USING btree (projeto_id, distinct_id);
CREATE INDEX idx_projetos_conta ON public.projetos USING btree (conta_id) WHERE (arquivado_em IS NULL);
CREATE UNIQUE INDEX uq_projetos_slug ON public.projetos USING btree (slug);
CREATE UNIQUE INDEX uq_uso_conta_competencia ON public.uso_mensal USING btree (conta_id, competencia);
CREATE INDEX idx_usuarios_conta_conta ON public.usuarios_conta USING btree (conta_id);
CREATE UNIQUE INDEX uq_usuarios_conta_usuario ON public.usuarios_conta USING btree (usuario_id);

-- ==========================================================================
-- Funções (seção 7.10 e as consultas das telas)

CREATE OR REPLACE FUNCTION public.fn_admin_auditoria(p_limite integer DEFAULT 50)
 RETURNS TABLE(feito_em timestamp with time zone, email_admin text, acao acao_admin, conta_alvo uuid, nome_alvo text, detalhe jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fn_admin_exige();

  return query
  select a.feito_em, u.email::text, a.acao, a.conta_alvo, c.nome, a.detalhe
  from public.acoes_admin a
  left join auth.users u on u.id = a.admin_id
  left join public.contas c on c.id = a.conta_alvo
  order by a.feito_em desc
  limit least(coalesce(p_limite, 50), 200);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_admin_contas()
 RETURNS TABLE(conta_id uuid, nome text, email_do_dono text, plano plano_conta, cortesia boolean, assinatura_status status_assinatura, periodo_fim timestamp with time zone, criada_em timestamp with time zone, cancelada_em timestamp with time zone, projetos bigint, eventos_no_mes bigint, pessoas_no_mes integer, consultas_no_mes integer, tem_dados_de_nota boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := public.fn_admin_exige();
begin
  perform public.fn_admin_registra(v_admin, 'consultou_contas', null);

  return query
  select
    c.id,
    c.nome,
    u.email::text,
    c.plano,
    c.cortesia,
    c.assinatura_status,
    c.periodo_fim,
    c.criada_em,
    c.cancelada_em,
    (select count(*) from public.projetos p where p.conta_id = c.id and p.arquivado_em is null),
    coalesce(m.eventos_recebidos, 0),
    coalesce(m.pessoas_distintas, 0),
    coalesce(m.consultas_mcp, 0),
    exists (select 1 from public.dados_de_cobranca d where d.conta_id = c.id)
  from public.contas c
  left join public.usuarios_conta uc on uc.conta_id = c.id
  left join auth.users u on u.id = uc.usuario_id
  left join public.uso_mensal m
    on m.conta_id = c.id and m.competencia = date_trunc('month', now())::date
  order by c.criada_em desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_admin_define_cortesia(p_conta_id uuid, p_conceder boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := public.fn_admin_exige();
  v_antes jsonb;
begin
  select to_jsonb(x) into v_antes
  from (select plano, cortesia, retencao_meses, limite_projetos
        from public.contas where id = p_conta_id) x;

  if v_antes is null then
    raise exception 'conta_inexistente: não há conta com este id';
  end if;

  if p_conceder then
    update public.contas
    set cortesia = true, plano = 'pago', retencao_meses = 12, limite_projetos = null
    where id = p_conta_id;
  else
    -- Só volta para o gratuito quem não tem assinatura ativa pagando: tirar a
    -- cortesia de quem também paga não pode rebaixar quem está em dia.
    update public.contas
    set cortesia = false,
        plano = case when assinatura_status = 'ativa' then plano else 'gratuito' end,
        retencao_meses = case when assinatura_status = 'ativa' then retencao_meses else 1 end,
        limite_projetos = case when assinatura_status = 'ativa' then limite_projetos else 1 end
    where id = p_conta_id;
  end if;

  perform public.fn_admin_registra(
    v_admin,
    case when p_conceder then 'concedeu_cortesia' else 'removeu_cortesia' end,
    p_conta_id,
    jsonb_build_object('antes', v_antes)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_admin_exige()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'sem_sessao: esta função exige alguém autenticado';
  end if;

  if not exists (select 1 from public.administradores a where a.usuario_id = v_usuario) then
    raise exception 'nao_autorizado: esta função é só para administradores da plataforma';
  end if;

  return v_usuario;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_admin_registra(p_admin uuid, p_acao acao_admin, p_conta uuid, p_detalhe jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.acoes_admin (admin_id, acao, conta_alvo, detalhe)
  values (p_admin, p_acao, p_conta, coalesce(p_detalhe, '{}'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_agrega_uso_mensal()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_competencia date := date_trunc('month', now())::date;
begin
  insert into public.uso_mensal (
    conta_id, competencia, eventos_recebidos,
    projetos_ativos, pessoas_distintas, atualizado_em
  )
  select
    e.conta_id,
    v_competencia,
    count(*),
    count(distinct e.projeto_id),
    count(distinct e.distinct_id),
    now()
  from public.eventos e
  where e.recebido_em >= v_competencia
    and e.recebido_em < (v_competencia + interval '1 month')
  group by e.conta_id
  on conflict (conta_id, competencia) do update set
    eventos_recebidos = excluded.eventos_recebidos,
    projetos_ativos   = excluded.projetos_ativos,
    pessoas_distintas = excluded.pessoas_distintas,
    atualizado_em     = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_atividade(p_projeto_id uuid, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_evento text DEFAULT NULL::text, p_pessoa text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, descricao text, distinct_id text, tela text, propriedades jsonb, ocorrido_em timestamp with time zone, recebido_em timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    e.id,
    e.nome,
    -- O catálogo primeiro: é ele que o dono edita e que vale em todas as telas.
    -- A descrição do evento é a reserva, para o que chegou antes de existir
    -- entrada no catálogo.
    coalesce(d.descricao, e.descricao) as descricao,
    e.distinct_id,
    e.tela,
    e.propriedades,
    e.ocorrido_em,
    e.recebido_em
  from public.eventos e
  join public.projetos p on p.id = e.projeto_id
  left join public.definicoes_evento d
    on d.projeto_id = e.projeto_id and d.nome = e.nome
  where e.projeto_id = p_projeto_id
    and e.ocorrido_em >= public.fn_janela_visivel(p.conta_id)
    and (p_desde  is null or e.ocorrido_em >= p_desde)
    and (p_ate    is null or e.ocorrido_em <= p_ate)
    and (p_evento is null or e.nome = p_evento)
    and (p_pessoa is null or e.distinct_id = p_pessoa)
  order by e.ocorrido_em desc
  limit least(coalesce(p_limite, 50), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_atualiza_definicao_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.definicoes_evento (
    projeto_id, nome, descricao, telas,
    total_ocorrencias, primeira_ocorrencia_em, ultima_ocorrencia_em
  )
  values (
    new.projeto_id,
    new.nome,
    new.descricao,
    case when new.tela is null then '{}'::text[] else array[new.tela] end,
    1,
    new.ocorrido_em,
    new.ocorrido_em
  )
  on conflict (projeto_id, nome) do update set
    total_ocorrencias = public.definicoes_evento.total_ocorrencias + 1,
    -- Eventos podem chegar fora de ordem (fila offline), por isso least/greatest
    -- em vez de atribuição direta.
    primeira_ocorrencia_em = least(
      coalesce(public.definicoes_evento.primeira_ocorrencia_em, excluded.primeira_ocorrencia_em),
      excluded.primeira_ocorrencia_em
    ),
    ultima_ocorrencia_em = greatest(
      coalesce(public.definicoes_evento.ultima_ocorrencia_em, excluded.ultima_ocorrencia_em),
      excluded.ultima_ocorrencia_em
    ),
    -- Regra 11.2: só preenche quando está nula.
    descricao = coalesce(public.definicoes_evento.descricao, excluded.descricao),
    telas = case
              when new.tela is null or new.tela = any (public.definicoes_evento.telas)
                then public.definicoes_evento.telas
              else public.definicoes_evento.telas || new.tela
            end;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_atualiza_pessoa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_props_pessoa jsonb;
begin
  -- Só faz merge se o app declarou um objeto em propriedades->'pessoa'.
  v_props_pessoa := case
    when jsonb_typeof(new.propriedades -> 'pessoa') = 'object'
      then new.propriedades -> 'pessoa'
    else '{}'::jsonb
  end;

  insert into public.pessoas (
    projeto_id, distinct_id, propriedades,
    total_eventos, primeiro_visto_em, ultimo_visto_em
  )
  values (
    new.projeto_id, new.distinct_id, v_props_pessoa,
    1, new.ocorrido_em, new.ocorrido_em
  )
  on conflict (projeto_id, distinct_id) do update set
    total_eventos     = public.pessoas.total_eventos + 1,
    primeiro_visto_em = least(public.pessoas.primeiro_visto_em, excluded.primeiro_visto_em),
    ultimo_visto_em   = greatest(public.pessoas.ultimo_visto_em, excluded.ultimo_visto_em),
    propriedades      = public.pessoas.propriedades || excluded.propriedades;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_catalogo(p_projeto_id uuid)
 RETURNS TABLE(nome text, descricao text, telas text[], total_ocorrencias bigint, primeira_ocorrencia_em timestamp with time zone, ultima_ocorrencia_em timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select d.nome, d.descricao, d.telas, d.total_ocorrencias,
         d.primeira_ocorrencia_em, d.ultima_ocorrencia_em
  from public.definicoes_evento d
  where d.projeto_id = p_projeto_id
  order by d.total_ocorrencias desc, d.nome
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consulta_leitura(p_sql text, p_conta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resultado jsonb;
begin
  -- Ponto e vírgula é recusado aqui também, e não só no servidor MCP: sem isso
  -- o agente poderia emendar uma segunda instrução na mesma string.
  if position(';' in p_sql) > 0 then
    raise exception 'consulta_invalida: a consulta não pode conter ponto e vírgula';
  end if;

  -- Isolamento por conta: é este ajuste que as políticas acima leem.
  perform set_config('visao.conta_id', p_conta_id::text, true);
  -- Uma consulta do agente não pode prender o banco (requisito 14: p95 < 2 s).
  perform set_config('statement_timeout', '5000', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) origem limit 500) t',
    p_sql
  )
  into v_resultado;

  return v_resultado;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contas_do_usuario()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select conta_id from public.usuarios_conta where usuario_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cria_conta_no_cadastro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conta_id uuid;
  v_nome     text;
begin
  -- Nome vindo do perfil do Google; cai para o e-mail quando o provedor não
  -- manda nome.
  v_nome := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.email,
    'Conta sem nome'
  );

  insert into public.contas (nome)
  values (v_nome)
  returning id into v_conta_id;

  insert into public.usuarios_conta (conta_id, usuario_id, papel)
  values (v_conta_id, new.id, 'dono');

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_dias_da_janela(p_janela text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_janela
    when '7d'  then 7
    when '14d' then 14
    when '30d' then 30
    when '90d' then 90
    else 30
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_eh_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.administradores a where a.usuario_id = auth.uid())
$function$
;

CREATE OR REPLACE FUNCTION public.fn_expurga_codigos_oauth()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from public.codigos_oauth
  where expira_em < now() - interval '1 hour'
     or usado_em is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_expurga_contas_canceladas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from public.contas
  where cancelada_em is not null
    and cancelada_em < now() - interval '30 days';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_ingere_eventos(p_conta_id uuid, p_projeto_id uuid, p_eventos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_aceitos integer;
begin
  with entrada as (
    select *
    from jsonb_to_recordset(p_eventos) as e(
      id           uuid,
      nome         text,
      distinct_id  text,
      tela         text,
      descricao    text,
      propriedades jsonb,
      ocorrido_em  timestamptz
    )
  ),
  inseridos as (
    insert into public.eventos (
      id, conta_id, projeto_id, nome, distinct_id, tela, descricao, propriedades, ocorrido_em
    )
    select
      e.id, p_conta_id, p_projeto_id, e.nome, e.distinct_id, e.tela, e.descricao,
      coalesce(e.propriedades, '{}'::jsonb), e.ocorrido_em
    from entrada e
    on conflict do nothing
    returning 1
  )
  select count(*) into v_aceitos from inseridos;

  return v_aceitos;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_janela_visivel(p_conta_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select now() - (coalesce(c.retencao_meses, 1) || ' months')::interval
  from public.contas c
  where c.id = p_conta_id
$function$
;

CREATE OR REPLACE FUNCTION public.fn_manutencao_particoes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  call partman.run_maintenance_proc();
  perform public.fn_protege_particoes_eventos();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_opcoes_de_filtro(p_projeto_id uuid)
 RETURNS TABLE(tipo text, valor text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select 'evento'::text, d.nome
  from public.definicoes_evento d
  where d.projeto_id = p_projeto_id
  union all
  select 'pessoa'::text, pe.distinct_id
  from public.pessoas pe
  where pe.projeto_id = p_projeto_id
  order by 1, 2
$function$
;

CREATE OR REPLACE FUNCTION public.fn_paineis_do_usuario()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pa.id
  from public.paineis pa
  where pa.projeto_id in (select public.fn_projetos_do_usuario())
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pessoas(p_projeto_id uuid)
 RETURNS TABLE(distinct_id text, total_eventos bigint, primeiro_visto_em timestamp with time zone, ultimo_visto_em timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select pe.distinct_id, pe.total_eventos, pe.primeiro_visto_em, pe.ultimo_visto_em
  from public.pessoas pe
  where pe.projeto_id = p_projeto_id
  order by pe.ultimo_visto_em desc
$function$
;

CREATE OR REPLACE FUNCTION public.fn_poda_cron_historico()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from cron.job_run_details
  where end_time < now() - interval '30 days';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_projetos_do_usuario()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id
  from public.projetos p
  where p.conta_id in (select public.fn_contas_do_usuario())
$function$
;

CREATE OR REPLACE FUNCTION public.fn_protege_particoes_eventos()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rebaixa_contas_vencidas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quantas integer;
begin
  with rebaixadas as (
    update public.contas
    set plano = 'gratuito', retencao_meses = 1, limite_projetos = 1
    where cortesia = false
      and plano = 'pago'
      and assinatura_status = 'cancelada'
      and periodo_fim is not null
      and periodo_fim < now()
    returning 1
  )
  select count(*) into v_quantas from rebaixadas;

  return v_quantas;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_registra_consulta_mcp(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.uso_mensal (conta_id, competencia, consultas_mcp, atualizado_em)
  values (p_conta_id, date_trunc('month', now())::date, 1, now())
  on conflict (conta_id, competencia) do update set
    consultas_mcp = public.uso_mensal.consultas_mcp + 1,
    atualizado_em = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resumo_projetos()
 RETURNS TABLE(id uuid, nome text, slug text, descricao text, fuso_exibicao text, eventos_24h bigint, ultimo_evento_em timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    p.id,
    p.nome,
    p.slug,
    p.descricao,
    p.fuso_exibicao,
    coalesce(count(e.id) filter (where e.ocorrido_em >= now() - interval '24 hours'), 0) as eventos_24h,
    max(e.ocorrido_em) as ultimo_evento_em
  from public.projetos p
  left join public.eventos e
    on e.projeto_id = p.id
   and e.ocorrido_em >= public.fn_janela_visivel(p.conta_id)
  where p.arquivado_em is null
  group by p.id, p.nome, p.slug, p.descricao, p.fuso_exibicao
  order by max(e.ocorrido_em) desc nulls last, p.nome
$function$
;

CREATE OR REPLACE FUNCTION public.fn_serie_do_evento(p_projeto_id uuid, p_nome text, p_janela text DEFAULT '30d'::text)
 RETURNS TABLE(inicio timestamp with time zone, fim timestamp with time zone, total bigint, usuarios_unicos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with config as (
    select
      case p_janela when '7d' then 7 when '14d' then 14 when '30d' then 10 else 13 end as barras,
      case p_janela when '7d' then 1 when '14d' then 1  when '30d' then 3  else 7  end as dias_por_barra
  ),
  faixas as (
    select
      c.barras,
      c.dias_por_barra,
      generate_series(0, c.barras - 1) as indice
    from config c
  ),
  janelas as (
    select
      date_trunc('day', now())
        - ((f.barras - 1 - f.indice + 1) * f.dias_por_barra || ' days')::interval
        + interval '1 day' as inicio,
      date_trunc('day', now())
        - ((f.barras - 1 - f.indice) * f.dias_por_barra || ' days')::interval
        + interval '1 day' as fim
    from faixas f
  )
  select
    j.inicio,
    j.fim,
    count(e.id) as total,
    count(distinct e.distinct_id) as usuarios_unicos
  from janelas j
  left join public.eventos e
    on e.projeto_id = p_projeto_id
   and e.nome = p_nome
   and e.ocorrido_em >= j.inicio
   and e.ocorrido_em <  j.fim
  group by j.inicio, j.fim
  order by j.inicio
$function$
;

CREATE OR REPLACE FUNCTION public.fn_uso_do_teto(p_conta_id uuid)
 RETURNS TABLE(eventos_no_mes bigint, teto integer, fracao numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    coalesce(m.eventos_recebidos, 0),
    c.limite_eventos_mes,
    case
      when c.limite_eventos_mes is null or c.limite_eventos_mes = 0 then 0
      else round(coalesce(m.eventos_recebidos, 0)::numeric / c.limite_eventos_mes, 4)
    end
  from public.contas c
  left join public.uso_mensal m
    on m.conta_id = c.id and m.competencia = date_trunc('month', now())::date
  where c.id = p_conta_id
$function$
;

CREATE OR REPLACE FUNCTION public.fn_uso_por_evento(p_projeto_id uuid, p_janela text DEFAULT '30d'::text)
 RETURNS TABLE(nome text, descricao text, total_no_periodo bigint, usuarios_unicos bigint, ultima_ocorrencia_em timestamp with time zone, total_acumulado bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with limites as (
    select
      p.conta_id,
      greatest(
        now() - (public.fn_dias_da_janela(p_janela) || ' days')::interval,
        public.fn_janela_visivel(p.conta_id)
      ) as desde
    from public.projetos p
    where p.id = p_projeto_id
  )
  select
    d.nome,
    d.descricao,
    count(e.id) as total_no_periodo,
    count(distinct e.distinct_id) as usuarios_unicos,
    max(e.ocorrido_em) as ultima_ocorrencia_em,
    d.total_ocorrencias as total_acumulado
  from public.definicoes_evento d
  cross join limites l
  left join public.eventos e
    on e.projeto_id = d.projeto_id
   and e.nome = d.nome
   and e.ocorrido_em >= l.desde
  where d.projeto_id = p_projeto_id
  group by d.nome, d.descricao, d.total_ocorrencias
  order by count(e.id) desc, d.nome
$function$
;

CREATE OR REPLACE FUNCTION public.fn_valida_chave_ingestao(p_valor_hash text)
 RETURNS TABLE(conta_id uuid, projeto_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_credencial_id uuid;
  v_conta_id      uuid;
  v_projeto_id    uuid;
  v_ultimo_uso    timestamptz;
begin
  select c.id, c.conta_id, c.projeto_id, c.ultimo_uso_em
    into v_credencial_id, v_conta_id, v_projeto_id, v_ultimo_uso
  from public.credenciais c
  where c.valor_hash = p_valor_hash
    and c.tipo = 'ingestao'
    and c.revogada_em is null;

  if v_credencial_id is null then
    return;
  end if;

  if v_ultimo_uso is null or v_ultimo_uso < now() - interval '1 minute' then
    update public.credenciais set ultimo_uso_em = now() where id = v_credencial_id;
  end if;

  conta_id := v_conta_id;
  projeto_id := v_projeto_id;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_valida_nome_evento(p_nome text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_nome ~ '^[a-z][a-z0-9_]{2,63}$'
$function$
;

CREATE OR REPLACE FUNCTION public.fn_valida_token_leitura(p_valor_hash text)
 RETURNS TABLE(conta_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_credencial_id uuid;
  v_conta_id      uuid;
  v_ultimo_uso    timestamptz;
begin
  select c.id, c.conta_id, c.ultimo_uso_em
    into v_credencial_id, v_conta_id, v_ultimo_uso
  from public.credenciais c
  where c.valor_hash = p_valor_hash
    and c.tipo = 'leitura'
    and c.revogada_em is null;

  if v_credencial_id is null then
    return;
  end if;

  if v_ultimo_uso is null or v_ultimo_uso < now() - interval '1 minute' then
    update public.credenciais set ultimo_uso_em = now() where id = v_credencial_id;
  end if;

  conta_id := v_conta_id;
  return next;
end;
$function$
;


-- ==========================================================================
-- Triggers

CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_default FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_default FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260720 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260720 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260727 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260727 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260803 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260803 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260810 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260810 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260817 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260817 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260824 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260824 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260831 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260831 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260907 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260907 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260914 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260914 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260921 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260921 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20260928 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20260928 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_eventos_definicao AFTER INSERT ON public.eventos_p20261005 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_definicao_evento();
CREATE TRIGGER trg_eventos_pessoa AFTER INSERT ON public.eventos_p20261005 FOR EACH ROW EXECUTE FUNCTION fn_atualiza_pessoa();
CREATE TRIGGER trg_usuario_criado_cria_conta AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION fn_cria_conta_no_cadastro();

-- ==========================================================================
-- Row Level Security

alter table acoes_admin enable row level security;
alter table administradores enable row level security;
alter table clientes_oauth enable row level security;
alter table codigos_oauth enable row level security;
alter table contas enable row level security;
alter table credenciais enable row level security;
alter table dados_de_cobranca enable row level security;
alter table definicoes_evento enable row level security;
alter table eventos enable row level security;
alter table eventos_stripe enable row level security;
alter table paineis enable row level security;
alter table paineis_itens enable row level security;
alter table pessoas enable row level security;
alter table projetos enable row level security;
alter table uso_mensal enable row level security;
alter table usuarios_conta enable row level security;

-- As partições de eventos são tabelas de verdade e recebem RLS uma a uma.
-- Quem faz isso é fn_protege_particoes_eventos(), chamada pelo job diário.


-- ==========================================================================
-- Políticas — todas com predicado de propriedade (seção 6.2)

create policy contas_dono_total on contas
  for all to authenticated
  using ((id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ((id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)));

create policy credenciais_dono_total on credenciais
  for all to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)));

create policy dados_de_cobranca_dono on dados_de_cobranca
  for all to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)));

create policy definicoes_dono_total on definicoes_evento
  for all to authenticated
  using ((projeto_id IN ( SELECT fn_projetos_do_usuario() AS fn_projetos_do_usuario)))
  with check ((projeto_id IN ( SELECT fn_projetos_do_usuario() AS fn_projetos_do_usuario)));

create policy definicoes_mcp_leitura on definicoes_evento
  for select to visao_mcp_leitor
  using ((projeto_id IN ( SELECT projetos.id
   FROM projetos)))
  with check ();

create policy eventos_dono_leitura on eventos
  for select to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ();

create policy eventos_mcp_leitura on eventos
  for select to visao_mcp_leitor
  using ((conta_id = ( SELECT (NULLIF(current_setting('visao.conta_id'::text, true), ''::text))::uuid AS "nullif")))
  with check ();

create policy paineis_dono_total on paineis
  for all to authenticated
  using ((projeto_id IN ( SELECT fn_projetos_do_usuario() AS fn_projetos_do_usuario)))
  with check ((projeto_id IN ( SELECT fn_projetos_do_usuario() AS fn_projetos_do_usuario)));

create policy paineis_itens_dono_total on paineis_itens
  for all to authenticated
  using ((painel_id IN ( SELECT fn_paineis_do_usuario() AS fn_paineis_do_usuario)))
  with check ((painel_id IN ( SELECT fn_paineis_do_usuario() AS fn_paineis_do_usuario)));

create policy pessoas_dono_leitura on pessoas
  for select to authenticated
  using ((projeto_id IN ( SELECT fn_projetos_do_usuario() AS fn_projetos_do_usuario)))
  with check ();

create policy pessoas_mcp_leitura on pessoas
  for select to visao_mcp_leitor
  using ((projeto_id IN ( SELECT projetos.id
   FROM projetos)))
  with check ();

create policy projetos_dono_total on projetos
  for all to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)));

create policy projetos_mcp_leitura on projetos
  for select to visao_mcp_leitor
  using ((conta_id = ( SELECT (NULLIF(current_setting('visao.conta_id'::text, true), ''::text))::uuid AS "nullif")))
  with check ();

create policy uso_mensal_dono_leitura on uso_mensal
  for select to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ();

create policy usuarios_conta_dono_leitura on usuarios_conta
  for select to authenticated
  using ((conta_id IN ( SELECT fn_contas_do_usuario() AS fn_contas_do_usuario)))
  with check ();


-- ==========================================================================
-- Privilégios de tabela

grant delete on acoes_admin to service_role;
grant insert on acoes_admin to service_role;
grant references on acoes_admin to service_role;
grant select on acoes_admin to service_role;
grant trigger on acoes_admin to service_role;
grant truncate on acoes_admin to service_role;
grant update on acoes_admin to service_role;
grant delete on administradores to service_role;
grant insert on administradores to service_role;
grant references on administradores to service_role;
grant select on administradores to service_role;
grant trigger on administradores to service_role;
grant truncate on administradores to service_role;
grant update on administradores to service_role;
grant delete on clientes_oauth to service_role;
grant insert on clientes_oauth to service_role;
grant references on clientes_oauth to service_role;
grant select on clientes_oauth to service_role;
grant trigger on clientes_oauth to service_role;
grant truncate on clientes_oauth to service_role;
grant update on clientes_oauth to service_role;
grant delete on codigos_oauth to service_role;
grant insert on codigos_oauth to service_role;
grant references on codigos_oauth to service_role;
grant select on codigos_oauth to service_role;
grant trigger on codigos_oauth to service_role;
grant truncate on codigos_oauth to service_role;
grant update on codigos_oauth to service_role;
grant select on contas to authenticated;
grant update on contas to authenticated;
grant delete on contas to service_role;
grant insert on contas to service_role;
grant references on contas to service_role;
grant select on contas to service_role;
grant trigger on contas to service_role;
grant truncate on contas to service_role;
grant update on contas to service_role;
grant delete on credenciais to authenticated;
grant insert on credenciais to authenticated;
grant references on credenciais to authenticated;
grant select on credenciais to authenticated;
grant trigger on credenciais to authenticated;
grant truncate on credenciais to authenticated;
grant update on credenciais to authenticated;
grant delete on credenciais to service_role;
grant insert on credenciais to service_role;
grant references on credenciais to service_role;
grant select on credenciais to service_role;
grant trigger on credenciais to service_role;
grant truncate on credenciais to service_role;
grant update on credenciais to service_role;
grant delete on dados_de_cobranca to authenticated;
grant insert on dados_de_cobranca to authenticated;
grant references on dados_de_cobranca to authenticated;
grant select on dados_de_cobranca to authenticated;
grant trigger on dados_de_cobranca to authenticated;
grant truncate on dados_de_cobranca to authenticated;
grant update on dados_de_cobranca to authenticated;
grant delete on dados_de_cobranca to service_role;
grant insert on dados_de_cobranca to service_role;
grant references on dados_de_cobranca to service_role;
grant select on dados_de_cobranca to service_role;
grant trigger on dados_de_cobranca to service_role;
grant truncate on dados_de_cobranca to service_role;
grant update on dados_de_cobranca to service_role;
grant insert on definicoes_evento to authenticated;
grant select on definicoes_evento to authenticated;
grant update on definicoes_evento to authenticated;
grant delete on definicoes_evento to service_role;
grant insert on definicoes_evento to service_role;
grant references on definicoes_evento to service_role;
grant select on definicoes_evento to service_role;
grant trigger on definicoes_evento to service_role;
grant truncate on definicoes_evento to service_role;
grant update on definicoes_evento to service_role;
grant select on definicoes_evento to visao_mcp_leitor;
grant select on eventos to authenticated;
grant delete on eventos to service_role;
grant insert on eventos to service_role;
grant references on eventos to service_role;
grant select on eventos to service_role;
grant trigger on eventos to service_role;
grant truncate on eventos to service_role;
grant update on eventos to service_role;
grant select on eventos to visao_mcp_leitor;
grant delete on eventos_stripe to service_role;
grant insert on eventos_stripe to service_role;
grant references on eventos_stripe to service_role;
grant select on eventos_stripe to service_role;
grant trigger on eventos_stripe to service_role;
grant truncate on eventos_stripe to service_role;
grant update on eventos_stripe to service_role;
grant delete on paineis to authenticated;
grant insert on paineis to authenticated;
grant references on paineis to authenticated;
grant select on paineis to authenticated;
grant trigger on paineis to authenticated;
grant truncate on paineis to authenticated;
grant update on paineis to authenticated;
grant delete on paineis to service_role;
grant insert on paineis to service_role;
grant references on paineis to service_role;
grant select on paineis to service_role;
grant trigger on paineis to service_role;
grant truncate on paineis to service_role;
grant update on paineis to service_role;
grant delete on paineis_itens to authenticated;
grant insert on paineis_itens to authenticated;
grant references on paineis_itens to authenticated;
grant select on paineis_itens to authenticated;
grant trigger on paineis_itens to authenticated;
grant truncate on paineis_itens to authenticated;
grant update on paineis_itens to authenticated;
grant delete on paineis_itens to service_role;
grant insert on paineis_itens to service_role;
grant references on paineis_itens to service_role;
grant select on paineis_itens to service_role;
grant trigger on paineis_itens to service_role;
grant truncate on paineis_itens to service_role;
grant update on paineis_itens to service_role;
grant select on pessoas to authenticated;
grant delete on pessoas to service_role;
grant insert on pessoas to service_role;
grant references on pessoas to service_role;
grant select on pessoas to service_role;
grant trigger on pessoas to service_role;
grant truncate on pessoas to service_role;
grant update on pessoas to service_role;
grant select on pessoas to visao_mcp_leitor;
grant delete on projetos to authenticated;
grant insert on projetos to authenticated;
grant references on projetos to authenticated;
grant select on projetos to authenticated;
grant trigger on projetos to authenticated;
grant truncate on projetos to authenticated;
grant update on projetos to authenticated;
grant delete on projetos to service_role;
grant insert on projetos to service_role;
grant references on projetos to service_role;
grant select on projetos to service_role;
grant trigger on projetos to service_role;
grant truncate on projetos to service_role;
grant update on projetos to service_role;
grant select on projetos to visao_mcp_leitor;
grant select on uso_mensal to authenticated;
grant delete on uso_mensal to service_role;
grant insert on uso_mensal to service_role;
grant references on uso_mensal to service_role;
grant select on uso_mensal to service_role;
grant trigger on uso_mensal to service_role;
grant truncate on uso_mensal to service_role;
grant update on uso_mensal to service_role;
grant select on usuarios_conta to authenticated;
grant delete on usuarios_conta to service_role;
grant insert on usuarios_conta to service_role;
grant references on usuarios_conta to service_role;
grant select on usuarios_conta to service_role;
grant trigger on usuarios_conta to service_role;
grant truncate on usuarios_conta to service_role;
grant update on usuarios_conta to service_role;

-- ==========================================================================
-- Jobs agendados (pg_cron, seção 7.10)

select cron.schedule('agrega_uso_mensal', '0 4 * * *', 'select public.fn_agrega_uso_mensal()');
select cron.schedule('expurga_codigos_oauth', '7 * * * *', 'select public.fn_expurga_codigos_oauth()');
select cron.schedule('expurga_contas_canceladas', '30 4 * * *', 'select public.fn_expurga_contas_canceladas()');
select cron.schedule('manutencao_particoes', '0 3 * * *', 'select public.fn_manutencao_particoes()');
select cron.schedule('poda_cron_historico', '0 5 * * 0', 'select public.fn_poda_cron_historico()');
select cron.schedule('rebaixa_contas_vencidas', '15 5 * * *', 'select public.fn_rebaixa_contas_vencidas()');

-- ==========================================================================
-- Particionamento (pg_partman, regras 11.8 e 11.18)

-- public.eventos: intervalo 7 days, premake 7, retenção 12 months, apaga a tabela: f

-- Fim.
