-- ============================================================================
-- 0006 — RLS e políticas de propriedade
--
-- O que faz: habilita RLS em TODAS as tabelas, cria as três funções de apoio
--            que resolvem "o que é meu", escreve as políticas com predicado de
--            propriedade real e tira do papel `anon` qualquer acesso.
-- Implementa: seção 6.2 do spec; item D8 do escopo.
--
-- Nenhuma política usa `using (true)`. Escrever o predicado agora custa uma
-- linha por política; descobrir na v2 que oito políticas dizem `true` custa uma
-- auditoria inteira — e vazamento entre contas é o único erro deste produto
-- que não tem conserto.
--
-- Toda escrita de evento passa pela Edge Function usando `service_role`, que
-- ignora RLS por desenho: a autorização da ingestão acontece na função,
-- validando a chave (regra 11.5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_contas_do_usuario — seção 6.2
-- O que faz: devolve os ids de conta a que o usuário autenticado pertence.
-- Recebe:    nada; lê auth.uid().
-- Devolve:   conjunto de uuid.
-- É SECURITY DEFINER porque `usuarios_conta` também tem RLS: sem isso, a
-- política dessa tabela consultaria a si mesma e entraria em recursão.
-- ----------------------------------------------------------------------------
create or replace function fn_contas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select conta_id from public.usuarios_conta where usuario_id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- fn_projetos_do_usuario — seção 6.2
-- O que faz: devolve os ids de projeto das contas do usuário autenticado.
-- Devolve:   conjunto de uuid.
-- Usada pelas tabelas filhas de projeto que não têm `conta_id` próprio.
-- ----------------------------------------------------------------------------
create or replace function fn_projetos_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projetos p
  where p.conta_id in (select public.fn_contas_do_usuario())
$$;

-- ----------------------------------------------------------------------------
-- fn_paineis_do_usuario — seção 6.2
-- O que faz: devolve os ids de painel dos projetos do usuário autenticado.
-- Devolve:   conjunto de uuid.
-- Existe para que a política de `paineis_itens` não precise atravessar duas
-- tabelas que também têm RLS.
-- ----------------------------------------------------------------------------
create or replace function fn_paineis_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id
  from public.paineis pa
  where pa.projeto_id in (select public.fn_projetos_do_usuario())
$$;

-- ----------------------------------------------------------------------------
-- RLS habilitada em todas as tabelas, sem exceção (seção 6.2).
-- ----------------------------------------------------------------------------
alter table contas            enable row level security;
alter table usuarios_conta    enable row level security;
alter table uso_mensal        enable row level security;
alter table projetos          enable row level security;
alter table eventos           enable row level security;
alter table definicoes_evento enable row level security;
alter table pessoas           enable row level security;
alter table paineis           enable row level security;
alter table paineis_itens     enable row level security;
alter table credenciais       enable row level security;

-- ----------------------------------------------------------------------------
-- Nenhuma tabela é acessível por `anon` (seção 6.2). O revoke é o que faz o
-- acesso anônimo falhar por permissão, e não apenas devolver zero linhas.
-- ----------------------------------------------------------------------------
revoke all on contas, usuarios_conta, uso_mensal, projetos, eventos,
              definicoes_evento, pessoas, paineis, paineis_itens, credenciais
  from anon;

-- ----------------------------------------------------------------------------
-- Privilégios do papel `authenticated`. A matriz da seção 5.1 diz o que a
-- sessão do dono pode fazer; o que ela não pode, não é concedido aqui — é por
-- isso que `eventos` e `pessoas` recebem apenas select, e `definicoes_evento`
-- não recebe delete (o catálogo não tem exclusão, seção 7.5).
-- ----------------------------------------------------------------------------
revoke all on eventos, pessoas, definicoes_evento, contas, usuarios_conta, uso_mensal
  from authenticated;

grant select                         on eventos           to authenticated;
grant select                         on pessoas           to authenticated;
grant select, insert, update         on definicoes_evento to authenticated;
grant select, update                 on contas            to authenticated;
grant select                         on usuarios_conta    to authenticated;
grant select                         on uso_mensal        to authenticated;

-- ----------------------------------------------------------------------------
-- Políticas. Todas usam o predicado de propriedade desde a v1.
-- ----------------------------------------------------------------------------

-- contas: o dono lê e edita a própria conta (nome, cancelamento). A criação é
-- da trigger de cadastro e a exclusão é do job de expurgo — nenhuma das duas
-- passa por aqui.
create policy contas_dono_total on contas
  for all to authenticated
  using (id in (select fn_contas_do_usuario()))
  with check (id in (select fn_contas_do_usuario()));

-- usuarios_conta: leitura do próprio vínculo. Convite é v2 (F4).
create policy usuarios_conta_dono_leitura on usuarios_conta
  for select to authenticated
  using (conta_id in (select fn_contas_do_usuario()));

-- uso_mensal: leitura da própria medição. Quem escreve é o job (regra 11.15).
create policy uso_mensal_dono_leitura on uso_mensal
  for select to authenticated
  using (conta_id in (select fn_contas_do_usuario()));

-- projetos: criar, editar e arquivar (matriz 5.1).
create policy projetos_dono_total on projetos
  for all to authenticated
  using (conta_id in (select fn_contas_do_usuario()))
  with check (conta_id in (select fn_contas_do_usuario()));

-- eventos: leitura apenas. O predicado usa a coluna `conta_id` desnormalizada,
-- sem join — é o motivo de ela existir (seção 7.4).
create policy eventos_dono_leitura on eventos
  for select to authenticated
  using (conta_id in (select fn_contas_do_usuario()));

-- definicoes_evento: o dono edita a descrição (seção 7.5).
create policy definicoes_dono_total on definicoes_evento
  for all to authenticated
  using (projeto_id in (select fn_projetos_do_usuario()))
  with check (projeto_id in (select fn_projetos_do_usuario()));

-- pessoas: leitura apenas. A exclusão de titular (seção 17.2) passa por rota
-- de servidor com service_role, não pelo cliente.
create policy pessoas_dono_leitura on pessoas
  for select to authenticated
  using (projeto_id in (select fn_projetos_do_usuario()));

create policy paineis_dono_total on paineis
  for all to authenticated
  using (projeto_id in (select fn_projetos_do_usuario()))
  with check (projeto_id in (select fn_projetos_do_usuario()));

create policy paineis_itens_dono_total on paineis_itens
  for all to authenticated
  using (painel_id in (select fn_paineis_do_usuario()))
  with check (painel_id in (select fn_paineis_do_usuario()));

-- credenciais: gerar e revogar (matriz 5.1). O valor completo nunca está aqui,
-- só o hash e o prefixo (seção 6.3).
create policy credenciais_dono_total on credenciais
  for all to authenticated
  using (conta_id in (select fn_contas_do_usuario()))
  with check (conta_id in (select fn_contas_do_usuario()));
