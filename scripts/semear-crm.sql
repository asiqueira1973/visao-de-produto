-- ============================================================================
-- Base de demonstração: um CRM de vendas.
--
-- O que faz: cria dois projetos e ~45 dias de eventos realistas na conta do
--            dono, para as telas e as respostas do MCP terem o que mostrar.
-- Recebe:    nada; encontra a conta pelo e-mail do dono.
-- Devolve:   nada.
--
-- POR QUE OS NÚMEROS SÃO ESTES: um CRM de time pequeno, oito vendedores, com
-- funil que estreita — muitos leads, menos qualificados, menos propostas,
-- menos negócios fechados. Fim de semana quase parado. Crescimento leve ao
-- longo do período.
--
-- Dois eventos NUNCA disparam, e é de propósito. `crm_integracao_whatsapp` é
-- uma feature que subiu e ninguém usou; `crm_campo_personalizado` idem. Eles
-- existem no catálogo e aparecem com zero na tela de Uso — que é literalmente
-- a pergunta que esta plataforma existe para responder (regra 11.12).
--
-- E `crm_nota_de_voz` disparava e parou: outra história que só se enxerga
-- quando o evento continua listado depois de morrer.
-- ============================================================================

do $$
declare
  v_conta   uuid;
  v_web     uuid;
  v_celular uuid;
begin
  select c.id into v_conta
  from public.contas c
  join public.usuarios_conta uc on uc.conta_id = c.id
  join auth.users u on u.id = uc.usuario_id
  where u.email = 'alexandre.silva.siqueira@gmail.com';

  if v_conta is null then
    raise exception 'não achei a conta do dono';
  end if;

  delete from public.projetos where conta_id = v_conta and slug in ('crm-vendas', 'crm-celular');

  insert into public.projetos (conta_id, nome, slug, descricao, prefixo_evento, fuso_exibicao)
  values (v_conta, 'CRM Vendas', 'crm-vendas',
          'O CRM na web, usado pelo time comercial todo dia.', 'crm_', 'America/Sao_Paulo')
  returning id into v_web;

  insert into public.projetos (conta_id, nome, slug, descricao, prefixo_evento, fuso_exibicao)
  values (v_conta, 'CRM no Celular', 'crm-celular',
          'O aplicativo que os vendedores usam na rua, entre uma visita e outra.', 'mob_', 'America/Sao_Paulo')
  returning id into v_celular;

  -- --------------------------------------------------------------------------
  -- O CRM na web
  -- --------------------------------------------------------------------------
  insert into public.eventos (id, conta_id, projeto_id, nome, distinct_id, tela, descricao, propriedades, ocorrido_em)
  select
    gen_random_uuid(), v_conta, v_web, e.nome, p.pessoa, e.tela, e.descricao,
    e.props,
    -- Horário comercial, com pico no meio da manhã e no meio da tarde.
    (current_date - d.dia) + (interval '1 hour' * (8 + floor(random() * 11)))
                           + (interval '1 minute' * floor(random() * 60))
  from generate_series(0, 44) as d(dia)
  cross join lateral (
    select unnest(array[
      'ana.souza@empresa.com','bruno.lima@empresa.com','carla.dias@empresa.com',
      'diego.reis@empresa.com','elisa.matos@empresa.com','fabio.nunes@empresa.com',
      'gabi.rocha@empresa.com','henrique.alves@empresa.com'
    ]) as pessoa
  ) p
  cross join lateral (
    values
      ('crm_lead_criado',        'Funil',           'vendedor cadastrou um lead novo',                    jsonb_build_object('origem', (array['site','indicacao','evento','anuncio'])[1 + floor(random()*4)]), 3.0),
      ('crm_lead_qualificado',   'LeadDetalhe',     'vendedor marcou o lead como qualificado',             jsonb_build_object('nota', floor(random()*5)+1), 1.7),
      ('crm_reuniao_agendada',   'Agenda',          'vendedor agendou uma reunião com o cliente',          '{}'::jsonb, 1.1),
      ('crm_proposta_enviada',   'PropostaEditor',  'vendedor enviou uma proposta ao cliente',             jsonb_build_object('valor', (floor(random()*90)+10) * 1000), 0.9),
      ('crm_negocio_ganho',      'NegocioDetalhe',  'negócio fechado e marcado como ganho',                jsonb_build_object('valor', (floor(random()*90)+10) * 1000), 0.30),
      ('crm_negocio_perdido',    'NegocioDetalhe',  'negócio marcado como perdido',                        jsonb_build_object('motivo', (array['preço','concorrente','sem verba','sem resposta'])[1 + floor(random()*4)]), 0.38),
      ('crm_tarefa_concluida',   'Funil',           'vendedor concluiu uma tarefa do funil',               '{}'::jsonb, 4.2),
      ('crm_relatorio_exportado','Relatorios',      'usuário exportou o relatório de vendas em planilha',  jsonb_build_object('formato','csv'), 0.10),
      ('crm_contatos_importados','Importacao',      'usuário importou contatos de uma planilha',           jsonb_build_object('linhas', floor(random()*400)+20), 0.05)
  ) as e(nome, tela, descricao, props, media)
  -- A quantidade do dia sai de uma Poisson pobre: média por pessoa, menos no
  -- fim de semana, crescendo devagar ao longo do período.
  cross join lateral generate_series(1, greatest(0, (
    round(
      e.media
      * case when extract(dow from current_date - d.dia) in (0, 6) then 0.18 else 1.0 end
      * (0.72 + (44 - d.dia)::numeric / 44 * 0.5)
      * (0.55 + random())
    )::int
  ))) as repeticao;

  -- Um evento que disparava e PAROU: a integração de nota de voz saiu do ar
  -- há duas semanas e ninguém percebeu.
  insert into public.eventos (id, conta_id, projeto_id, nome, distinct_id, tela, descricao, propriedades, ocorrido_em)
  select gen_random_uuid(), v_conta, v_web, 'crm_nota_de_voz_transcrita', p.pessoa, 'NegocioDetalhe',
         'a nota de voz do vendedor foi transcrita automaticamente', '{}'::jsonb,
         (current_date - d.dia) + interval '1 hour' * (9 + floor(random() * 9))
  from generate_series(16, 44) as d(dia)
  cross join lateral (select unnest(array['ana.souza@empresa.com','diego.reis@empresa.com','gabi.rocha@empresa.com']) as pessoa) p
  cross join lateral generate_series(1, (1 + floor(random() * 2))::int);

  -- --------------------------------------------------------------------------
  -- O aplicativo de celular
  -- --------------------------------------------------------------------------
  insert into public.eventos (id, conta_id, projeto_id, nome, distinct_id, tela, descricao, propriedades, ocorrido_em)
  select
    gen_random_uuid(), v_conta, v_celular, e.nome, p.pessoa, e.tela, e.descricao, '{}'::jsonb,
    (current_date - d.dia) + (interval '1 hour' * (7 + floor(random() * 13)))
                           + (interval '1 minute' * floor(random() * 60))
  from generate_series(0, 44) as d(dia)
  cross join lateral (
    select unnest(array[
      'ana.souza@empresa.com','diego.reis@empresa.com','elisa.matos@empresa.com',
      'fabio.nunes@empresa.com','henrique.alves@empresa.com'
    ]) as pessoa
  ) p
  cross join lateral (
    values
      ('mob_app_aberto',          'Inicio',       'vendedor abriu o aplicativo',                    2.6),
      ('mob_lead_criado',         'LeadRapido',   'vendedor cadastrou um lead pelo celular',        0.9),
      ('mob_ligacao_registrada',  'Ligacao',      'vendedor registrou uma ligação feita na rua',    1.3),
      ('mob_visita_registrada',   'Visita',       'vendedor registrou uma visita ao cliente',       0.7),
      ('mob_busca_por_cliente',   'Busca',        'vendedor buscou um cliente na base',             1.5)
  ) as e(nome, tela, descricao, media)
  cross join lateral generate_series(1, greatest(0, (
    round(
      e.media
      * case when extract(dow from current_date - d.dia) in (0, 6) then 0.12 else 1.0 end
      * (0.7 + (44 - d.dia)::numeric / 44 * 0.6)
      * (0.5 + random())
    )::int
  ))) as repeticao;

  -- --------------------------------------------------------------------------
  -- Os eventos que NUNCA dispararam.
  -- Entram só no catálogo, e é isso que a tela de Uso mostra com zero.
  -- --------------------------------------------------------------------------
  insert into public.definicoes_evento (projeto_id, nome, descricao)
  values
    (v_web, 'crm_integracao_whatsapp_ligada', 'usuário conectou o WhatsApp ao CRM'),
    (v_web, 'crm_campo_personalizado_criado', 'administrador criou um campo personalizado no funil'),
    (v_celular, 'mob_nota_de_voz_gravada',    'vendedor gravou uma nota de voz depois da visita')
  on conflict (projeto_id, nome) do nothing;

  raise notice 'semeado';
end $$;
