# Visão de Produto — spec.md

**Plataforma de product analytics MCP-native.**

> **Nomenclatura.** O nome do produto é **Visão de Produto**. No código, o identificador curto é `visao`: pacote do SDK `@dablab/visao`, CLI `npx visao init`, variáveis de ambiente `VISAO_*`, repositório e slug `visao-de-produto`. O nome longo aparece na interface e nos documentos; o curto, em tudo que é técnico. Se o nome mudar antes de publicar (pergunta 22.2), o que se troca é o identificador curto em seis lugares, não o documento.

| | |
|---|---|
| **Versão do documento** | 1.2 |
| **Responsável de produto** | Alexandre Siqueira (Dab Lab) |
| **Status** | rascunho — aguardando revisão da seção 21 |
| **Data** | 17 de agosto de 2026 |

**Mudanças na 1.2** — decorrentes da exigência de autosserviço: princípio 0.6 novo; multi-tenancy no modelo de dados desde a primeira migration (seções 5, 6, 7); login com Google; medição de uso (`uso_mensal`) e exportação dos próprios dados promovidas para o MVP; LGPD revista para o papel de operadora (17.2); cobrança definida como USD global via Stripe, com gatilho por projetos e retenção (25); riscos R9 e R10 novos. **O `.dbml` mudou** — a seção 7 ganhou `contas`, `uso_mensal` e a coluna `conta_id`.

**Mudanças na 1.1**, todas decorrentes das telas geradas no Claude Design: paleta fixada na seção 13 (deixou de ser livre); regra 11.10 reescrita (barras sempre); regra 11.14 nova (agrupamento das barras por janela); seção 8.3 com a assinatura do SDK alinhada às telas (`init`/`track` em vez de `capture`); seção 12.3 nova, com o exemplo de configuração do MCP remoto; seção 4.4 nova, com a regra de precedência entre este documento e as telas (a antiga 4.4, Dependências externas, virou 4.5). **A seção 7 não mudou — o `modelo-visao-de-produto.dbml` segue válido.**

---

## Como usar este documento

Este é o documento-fonte da plataforma. Ele foi escrito para ser colado num agente de código (Claude Code) e implementado sem que o agente precise inventar decisões.

**Antes de gerar qualquer código, leia a seção 24 (Assunções declaradas).** Ali estão as decisões que foram tomadas sem consulta, por serem de baixo impacto ou por não valerem uma rodada de conversa. Assunção não revisada vira verdade no minuto em que o agente começa a codar.

A seção 25 (Perguntas abertas) lista o que ninguém decidiu ainda. Diante de qualquer item dela, o agente **pergunta em vez de assumir**.

A numeração das seções é estável e será referenciada em conversas futuras ("regra 11.3", "seção 8.2"). Não renumere.

---

## 0. Princípios não-negociáveis

Regras de desempate. Diante de dúvida de UX, modelagem ou trade-off, resolve-se a favor destes princípios, nesta ordem.

**0.1 — Nada entra que não foi declarado.** A plataforma não captura nada automaticamente. Sem autocapture, sem geolocalização, sem IP, sem user-agent, sem pageview implícito. Só existe no banco o que o código do app enviou de propósito. Isso é o oposto da decisão do PostHog e é deliberado.

**0.2 — Todo evento carrega o que significa.** Nome de evento sozinho não é dado; é sigla. Todo evento tem uma descrição em linguagem natural, em português, e a plataforma trata isso como campo de primeira classe — não como propriedade solta num saco de JSON.

**0.3 — O agente é usuário de primeira classe, não integração.** Toda pergunta que se responde pela tela também se responde pelo MCP, com a mesma qualidade. Se uma funcionalidade só existe na tela, ela está incompleta.

**0.4 — Simplicidade antes de complexidade prematura.** Na dúvida entre a solução completa e a solução que resolve o caso real de hoje, escolhe-se a segunda e registra-se o trade-off. Volume esperado na v1 é de dezenas de eventos por dia, não milhões.

**0.5 — Zero decisão no onboarding.** Instalar a plataforma num app novo é um comando. Nenhuma tela de configuração é obrigatória antes do primeiro evento aparecer.

**0.6 — Autosserviço do cadastro ao cancelamento.** Nenhum caminho do produto pode exigir intervenção do dono da plataforma. A pessoa se cadastra, usa, atinge o limite, paga, exporta os próprios dados e cancela sozinha. Toda funcionalidade que exigiria alguém do outro lado — aprovar cadastro, gerar cobrança, enviar arquivo, apagar conta a pedido — está errada por construção e precisa ser redesenhada. Este princípio vale desde a v1, mesmo enquanto o único usuário é o dono: é ele que impede que a v1 tome decisões que a abertura teria de desfazer.

---

## 1. Visão e problema

### O que é

Uma plataforma de product analytics deliberadamente pequena. Os aplicativos enviam eventos relevantes por uma API REST; a plataforma armazena; e o resultado fica disponível de duas formas equivalentes: um site com painéis, e um servidor MCP pelo qual o Claude responde as mesmas perguntas em linguagem natural.

### O problema

Quem constrói software com IA — via SDD, vibecoding ou qualquer fluxo assistido por agente — entrega feature rápido e não faz ideia do que está sendo usado. As ferramentas que resolveriam isso (PostHog, Amplitude, Mixpanel) são invisíveis para esse público: ele não procura ferramenta de analytics, não compara tabela de preço, e não passa do primeiro muro de onboarding (criar conta, criar organização, criar projeto, escolher entre mil opções).

O resultado observado em campo: times inteiros de tecnologia que nunca ouviram falar de product analytics, e apps em produção com dezenas de usuários onde ninguém sabe qual tela é usada.

A hipótese desta plataforma é que **o canal de distribuição não é a busca, é o agente**: se o Claude instrumenta enquanto constrói e lê quando perguntam, a pessoa é atendida sem nunca ter procurado.

### Anti-escopo — o que esta plataforma explicitamente NÃO é

- Não é web analytics. Não conta pageview, sessão, bounce rate, origem de tráfego nem campanha.
- Não é ferramenta de crescimento. Não tem funil, retenção, coorte, path analysis nem stickiness.
- Não é plataforma de experimentação. Não tem feature flag nem teste A/B.
- Não é ferramenta de suporte. Não tem session replay nem error tracking.
- Não é substituto do PostHog para quem já usa o PostHog bem. É a ferramenta para quem nunca chegaria lá.

---

## 2. Personas e cenários de uso

A v1 tem **duas personas, e uma delas não é humana**. Isso muda o desenho e por isso a seção existe mesmo com um único usuário.

### 2.1 — O construtor (Alexandre, v1; time da BBZ, v2)

Constrói apps sozinho ou em time pequeno, com o Claude Code, a partir de specs SDD. Não é analista de dados. As perguntas que ele faz são de três tipos, e só três:

- *"Alguém está usando isso?"*
- *"Quem usou, e o quê?"*
- *"O que aconteceu no app hoje?"*

Contexto de uso: entre uma sessão de código e outra, no meio do dia, sem intenção de "abrir o dashboard". O momento mais provável de consulta é **dentro do editor, conversando com o agente** — não no navegador.

### 2.2 — O agente (Claude Code, Claude Desktop, Cursor)

Consome a plataforma por MCP, em dois momentos distintos:

- **Escrevendo:** enquanto implementa uma feature, adiciona a chamada de evento no código, seguindo a convenção de nome já usada no projeto e escrevendo a descrição em português.
- **Lendo:** quando perguntam sobre uso, consulta a plataforma e responde já sabendo o que cada evento significa, porque o catálogo carrega a descrição.

Consequência de desenho: **as respostas do MCP precisam ser econômicas em token e autoexplicativas.** Um dump de mil linhas de evento é resposta ruim mesmo quando está tecnicamente correta.

---

## 3. Escopo do MVP

### 3.1 — Dentro

| # | Item |
|---|---|
| D1 | Endpoint de ingestão REST, autenticado por chave de projeto, com lote de até 100 eventos por request |
| D2 | Armazenamento em Postgres particionado por data, com catálogo de eventos e pessoas mantidos automaticamente |
| D3 | SDK JavaScript/TypeScript único, funcionando em web, React Native/Expo e Node |
| D4 | Site com login, projetos, atividade ao vivo, detalhe de evento, uso por evento, painel, pessoas, catálogo e configurações |
| D5 | Servidor MCP remoto com 5 tools de leitura |
| D6 | Skill de instrumentação (o agente adiciona chamadas no código) e skill de leitura (o agente responde sobre uso) |
| D7 | Comando de inicialização que cria o projeto, gera a chave e instala o SDK sem tela de configuração |
| D8 | **Multi-tenancy no modelo de dados desde a primeira migration** — `contas`, `conta_id` em todas as tabelas e RLS com predicado de propriedade, mesmo com um único usuário |
| D9 | **Login com Google** (OAuth), com autocadastro criando a conta |
| D10 | **Medição de uso** (`uso_mensal`): projetos ativos, eventos e janela de retenção por conta e por mês. Precondição de qualquer cobrança futura |
| D11 | **Exportação dos próprios dados** pelo usuário, sem intervenção de ninguém (princípio 0.6 e portabilidade sob LGPD) |

### 3.2 — Fora

| # | Item | Destino | Motivo |
|---|---|---|---|
| F1 | Funil, retenção, coorte, stickiness, paths | **Descartado** | Anti-escopo (seção 1). Não são as perguntas do usuário (seção 2.1) |
| F2 | Session replay, error tracking, feature flags, experimentos | **Descartado** | Anti-escopo |
| F3 | Autocapture, geolocalização, IP, user-agent | **Descartado** | Viola o princípio 0.1 |
| F4 | Convite de membros e papéis dentro de uma conta | **v2** | A **estrutura** multi-conta entra na v1 (D8); o que fica para depois é ter mais de uma pessoa na mesma conta |
| F5 | SDK nativo para Flutter e Python | **v2** | v1 atende os dois por REST direto, que é contrato estável (seção 13.1). SDK só se o uso justificar |
| F6 | ~~Exportação CSV~~ | **promovido ao MVP (D11)** | Deixou de ser conveniência: com autosserviço, exportar é requisito de confiança e de portabilidade sob LGPD |
| F7 | Alertas e resumo semanal automático | **v2** | Depende de ter volume suficiente para o resumo dizer algo |
| F8 | Cobertura contra a spec (cruzar catálogo com features entregues) | **v2** | É a funcionalidade mais diferenciada da plataforma, mas exige um formato de spec estável para ler. Precede: definir como a spec declara suas features |
| F9 | Deduplicação retroativa e resolução de identidade (anônimo → identificado) | **v2** | Nenhum app da Dab Lab tem fluxo anônimo hoje |
| F10 | Stripe: checkout, webhooks, portal do cliente, aplicação de limite de plano | **v2** | A medição (D10) e o `conta_id` (D8) entram na v1 justamente para que isto seja uma adição, não uma reescrita. Subiu de v3 para v2 |

---

## 4. Arquitetura

### 4.1 — Stack

| Camada | Tecnologia | Versão de referência (16/08/2026) |
|---|---|---|
| App web | Next.js, App Router | **16.3.1** |
| Runtime | Node.js | **20.9+** (mínimo do Next 16) |
| Linguagem | TypeScript | 5.1+ (7.x suportado no build) |
| Banco | Supabase Postgres | **17** |
| Ingestão | Supabase Edge Function (Deno 2) | edge-runtime linha 1.74+ |
| Autenticação do site | Supabase Auth | — |
| MCP | `@modelcontextprotocol/server` + `/hono` | **2.0.0** — ver risco R3 |
| Spec MCP | Model Context Protocol | **2026-07-28** |
| SDK cliente | pacote próprio, `@dablab/visao` | — |
| Deploy do site | Vercel | — |
| Deploy da ingestão e do MCP | Supabase Edge Functions | — |

**Por quê:** é a stack que o responsável já usa e já tem conectada. Reaproveita conhecimento e evita uma curva de aprendizado que não agrega ao produto.

**Alternativa descartada:** serviço Node dedicado (Fly/Railway) para a ingestão. Foi descartado porque no volume da v1 (dezenas de eventos/dia) o limite de 2 s de CPU da Edge Function é folgado, e mais uma peça de infra é custo operacional sem contrapartida. **Premissa a validar:** se a ingestão passar de ~1M eventos/mês, reavaliar — a cota do plano Pro é de 2M invocações de Edge Function, e com lote de 20 eventos por request isso equivale a 40M eventos.

**Alternativa descartada:** PostgREST direto (`POST /rest/v1/eventos` via anon key). Mais barato — não consome cota de Edge Function — mas expõe a forma da tabela ao cliente e não permite chave de API própria por projeto, validação de payload nem rate limit. A chave por projeto é requisito do princípio 0.5 e da seção 6.3.

### 4.2 — Topologia

```
App do cliente (web / RN / backend)
        │  POST lote de até 100 eventos
        │  header: x-api-key
        ▼
Edge Function  /functions/v1/ingest        ← valida chave, valida payload, 1 INSERT multi-row, responde 202
        │
        ▼
Postgres 17 (Supabase)
   eventos (particionada por range em ocorrido_em)
   ├─ trigger → definicoes_evento   (catálogo se popula sozinho)
   └─ trigger → pessoas             (quem apareceu, quando)
        │
        ├──────────────► Next.js 16 (Vercel)  ← site, autenticado por Supabase Auth
        │
        └──────────────► Edge Function /functions/v1/mcp  ← MCP Streamable HTTP, Bearer token
                                 │
                                 ▼
                         Claude Code / Desktop / Cursor
```

### 4.3 — Onde o código vive

Monorepo único, `pnpm` workspaces:

```
apps/web            → Next.js (site)
supabase/functions/ingest   → Edge Function de ingestão
supabase/functions/mcp      → Edge Function do MCP server
supabase/migrations         → migrations SQL versionadas
packages/sdk-js     → SDK JavaScript/TypeScript publicado no npm
packages/cli        → comando de inicialização (`npx visao init`)
skills/             → skills de instrumentação e leitura
```

### 4.4 — Precedência entre este documento e as telas

As telas mockadas em `visao de produto-telas claude design/` são um bundle de handoff do Claude Design. Elas são **protótipo em HTML/CSS, não código de produção**, e existem como referência visual.

**Regra de precedência, sem exceção:**

- As telas prevalecem em **layout, espaçamento, hierarquia visual, paleta, tipografia, densidade e estados de UI**.
- Este documento prevalece em **comportamento, conteúdo, contrato de API, nome de função, assinatura de SDK, texto de snippet, modelo de dados e regra de negócio**.

Onde os dois divergirem num ponto do segundo grupo, siga o spec e **registre a divergência no `DOCUMENTACAO-TECNICA.md`**. Onde divergirem em layout, siga as telas.

Divergências já conhecidas e resolvidas nesta versão — nos três casos **o spec ganha**:

| Ponto | O que o mock mostra | O que vale |
|---|---|---|
| Configuração do MCP | `{"command":"npx","args":["-y","@dablab/analytics-mcp"]}` — servidor local por stdio | Servidor **remoto** por Streamable HTTP (seções 8.6 e 12.2). Um servidor local exigiria credencial do banco na máquina de quem usa |
| Nomes de evento no mock | `psi_sessao_agendada`, `psi_prontuario_editado` etc. | Dados falsos. Os reais são `psi_nova_sessao`, `psi_novo_agendamento`, `psi_novo_pagamento`, `psi_novo_paciente`, `psi_nova_despesa`, `psi_atualizacao_preco`, `psi_screen_view_detalhe_agendamento` |
| Nome do pacote | `@dablab/analytics` | `@dablab/visao` |
| Tela de Login | dois campos, e-mail e senha | **Um botão "Entrar com Google"** no lugar dos campos, mesmo enquadramento e largura de 352px (seção 6.1). Não há senha no produto |
| Configurações do projeto | sem exportação | Ganha a ação **"Exportar dados"** (seção 13.4). Adição simples, mesmo padrão de botão secundário já usado na tela |

### 4.5 — Dependências externas

| Dependência | Propósito | Risco se cair |
|---|---|---|
| Supabase | banco, auth, edge functions | plataforma inteira fora do ar |
| Vercel | hospedagem do site | site fora; ingestão e MCP continuam funcionando |
| npm | distribuição do SDK e da CLI | apps existentes continuam enviando; instalações novas travam |

---

## 5. Perfis de usuário e credenciais

A v1 tem **um único usuário humano**. Não há organizações, convites nem papéis. O que existe são **três tipos de credencial** com escopos deliberadamente diferentes, e é essa separação que carrega o controle de acesso.

### 5.1 — Matriz credencial × ação

| Ação | Sessão do dono (Supabase Auth) | Chave de ingestão (`x-api-key`) | Token de leitura MCP (`Bearer`) |
|---|---|---|---|
| Criar/editar/arquivar projeto | ✅ qualquer | ❌ | ❌ |
| Gravar evento | ✅ (via site, para teste) | ✅ **só no projeto dono da chave** | ❌ |
| Ler eventos | ✅ qualquer projeto | ❌ | ✅ **qualquer projeto** |
| Ler catálogo e pessoas | ✅ qualquer projeto | ❌ | ✅ qualquer projeto |
| Editar descrição no catálogo | ✅ qualquer projeto | ❌ | ❌ |
| Criar/editar painel | ✅ qualquer projeto | ❌ | ❌ |
| Gerar e revogar credenciais | ✅ | ❌ | ❌ |
| Executar SQL livre | ✅ (não exposto na UI da v1) | ❌ | ✅ **somente leitura** |

**Regra 5.1.1 — a chave de ingestão só escreve.** Ela nunca lê. Vaza chave de ingestão de um app publicado numa loja? O dano máximo é evento falso naquele projeto, e a chave se troca em um clique.

**Regra 5.1.2 — o token de leitura nunca escreve.** Nem evento, nem catálogo, nem painel. O MCP da v1 é integralmente read-only.

**Regra 5.1.3 — chave de ingestão é pública por natureza.** Ela vai embutida em app mobile e em bundle de front-end. O desenho parte do princípio de que ela é conhecida, e por isso ela não dá acesso a nada além de escrever no seu próprio projeto.

### 5.2 — Contas e primeiro acesso

**Existe autocadastro desde a v1** (princípio 0.6). Entrar com Google cria automaticamente:

1. Um registro em `contas`, com o plano `gratuito`.
2. O vínculo do usuário do Supabase Auth àquela conta.

Na v1 só o dono da plataforma vai passar por esse fluxo — mas o fluxo é o mesmo que qualquer pessoa usará depois. Não há aprovação, não há lista de espera, não há criação manual no console. Se em algum momento a implementação exigir que alguém "libere" um cadastro, o princípio 0.6 foi violado.

Uma conta pode ter vários projetos. Ter mais de uma **pessoa** na mesma conta é a v2 (F4).

---

## 6. Autenticação e identidade

### 6.1 — Login do site

- **Supabase Auth com Google OAuth.** É o único método da v1. E-mail e senha não são implementados — menos superfície, menos suporte, e nenhuma senha para recuperar. Sessão persistida em cookie httpOnly.
- **Divergência conhecida com as telas:** o mock do Claude Design desenha campos de e-mail e senha. Vale o spec (seção 4.4): a tela de Login tem um botão "Entrar com Google" no lugar dos dois campos, mantendo o mesmo enquadramento, tipografia e largura de 352px.
- Expiração da sessão: 30 dias com refresh automático. Logout explícito disponível no rodapé do menu lateral.
- **Não existe recuperação de senha** porque não existe senha. O Google resolve isso.

### 6.2 — Autorização no banco (RLS)

RLS **habilitada em todas as tabelas**, sem exceção. Toda escrita de evento passa pela Edge Function usando `service_role`, que ignora RLS por desenho — a autorização da ingestão acontece na função, validando a chave (regra 11.5).

| Tabela | Política | Quem | O quê |
|---|---|---|---|
| `projetos` | `projetos_dono_total` | `authenticated` | select, insert, update, delete |
| `eventos` | `eventos_dono_leitura` | `authenticated` | select |
| `definicoes_evento` | `definicoes_dono_total` | `authenticated` | select, insert, update |
| `pessoas` | `pessoas_dono_leitura` | `authenticated` | select |
| `paineis` | `paineis_dono_total` | `authenticated` | select, insert, update, delete |
| `paineis_itens` | `paineis_itens_dono_total` | `authenticated` | select, insert, update, delete |
| `credenciais` | `credenciais_dono_total` | `authenticated` | select, insert, update, delete |
| `configuracoes` | `configuracoes_dono_leitura` | `authenticated` | select |

**Todas as políticas usam o predicado de propriedade desde a v1**, nunca `using (true)`:

```sql
using (conta_id in (select conta_id from usuarios_conta where usuario_id = auth.uid()))
```

Em `eventos` o predicado usa a coluna `conta_id` desnormalizada, sem join — é o motivo de ela existir (seção 7.4). Nas tabelas filhas de projeto sem `conta_id` próprio (`definicoes_evento`, `pessoas`, `paineis`), o predicado passa por `projetos`.

Escrever o predicado agora custa uma linha por política. Descobrir na v2 que oito políticas dizem `true` custa uma auditoria inteira — e um vazamento entre contas é o único erro deste produto que não tem conserto.

Nenhuma tabela é acessível por `anon`.

### 6.3 — Credenciais de máquina

Ambas vivem na tabela `credenciais`, diferenciadas pelo enum `tipo_credencial`.

- **Geração:** valor aleatório de 32 bytes, codificado em base64url, com prefixo legível: `ing_` para ingestão, `mcp_` para leitura.
- **Armazenamento:** apenas o hash SHA-256 do valor (`valor_hash`) e os 8 primeiros caracteres em claro (`prefixo`), para exibição na tela. **O valor completo é mostrado uma única vez, no momento da criação, e nunca mais.**
- **Validação:** a função recebe o valor, calcula o hash e busca em `credenciais` por `valor_hash`, com `revogada_em is null`.
- **Revogação:** preenche `revogada_em`. Credencial revogada nunca é reativada; gera-se outra.
- **Uso:** `ultimo_uso_em` é atualizado no máximo uma vez por minuto por credencial, para não transformar cada ingestão em uma escrita extra.

---

## 7. Modelo de dados

Banco em **português**, `snake_case`. Postgres 17. Todos os timestamps são `timestamptz`; o banco opera em UTC e a conversão de fuso acontece na apresentação (regra 11.7).

### 7.1 — Diagrama

```
contas ──┬──< usuarios_conta  (v1: sempre um)
         ├──< uso_mensal
         └──< projetos
                    │
projetos ──┬──< eventos (particionada por ocorrido_em)
           ├──< definicoes_evento
           ├──< pessoas
           ├──< paineis ──< paineis_itens
           └──< credenciais   (credenciais de leitura têm projeto_id nulo = valem para todos)
```

### 7.2 — Enums

```
plano_conta:          gratuito | pago
papel_conta:          dono | membro | leitor
tipo_credencial:      ingestao | leitura
tipo_visualizacao:    serie_temporal | total_periodo | usuarios_unicos
janela_periodo:       7d | 14d | 30d | 90d
```

### 7.3 — `projetos`

Um por aplicativo. Hoje Agenda Psi, Swim e os apps da BBZ estão misturados num projeto único no PostHog; aqui eles são separados desde o início.

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `contas.id`. **Presente desde a v1** mesmo com uma conta só (D8) |
| `nome` | text | não | — | "Agenda Psi" |
| `slug` | text | não | — | único, `^[a-z0-9-]+$`, usado na URL e na CLI |
| `descricao` | text | **sim** | — | nulo quando o dono não escreveu descrição — campo de conveniência |
| `prefixo_evento` | text | **sim** | — | convenção de nome do projeto, ex. `psi_`. Nulo quando o projeto não adota prefixo. Usado pela skill de instrumentação (regra 11.1) |
| `fuso_exibicao` | text | não | `'America/Sao_Paulo'` | fuso usado nas telas e nas respostas do MCP |
| `criado_em` | timestamptz | não | `now()` | |
| `arquivado_em` | timestamptz | **sim** | — | nulo = ativo. **Soft delete**: projeto arquivado some das listas mas preserva os eventos |

Índices: `unique (slug)`.

### 7.4 — `eventos`

Tabela de maior escrita. **Particionada por range em `ocorrido_em`**, intervalo de 7 dias, mantida por `pg_partman`.

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | — | **gerado no cliente**, não no banco. É a chave de deduplicação (regra 11.4) |
| `conta_id` | uuid | não | — | FK → `contas.id`. **Desnormalizado de propósito**: permite que a política de RLS filtre sem join numa tabela particionada de alta escrita. Preenchido pela função de ingestão a partir do projeto da chave |
| `projeto_id` | uuid | não | — | FK → `projetos.id` |
| `nome` | text | não | — | `psi_novo_pagamento`. Formato validado (regra 11.1) |
| `distinct_id` | text | não | — | identificador do usuário no app do cliente |
| `tela` | text | **sim** | — | onde aconteceu. Nulo em evento disparado do backend, que não tem tela |
| `descricao` | text | **sim** | — | o que o evento significa, em português. Nulo quando o SDK não enviou e o catálogo ainda não tem entrada |
| `propriedades` | jsonb | não | `'{}'::jsonb` | tudo que não cabe nas colunas acima |
| `ocorrido_em` | timestamptz | não | — | quando aconteceu **no dispositivo**. Coluna de partição |
| `recebido_em` | timestamptz | não | `now()` | quando chegou no servidor. A diferença entre os dois revela fila offline |

**Chave primária composta: `(ocorrido_em, id)`** — obrigatória porque a coluna de partição precisa estar em todo índice único.

Índices:
- `using brin (ocorrido_em)` — coluna sempre-crescente em tabela append-only; a documentação do Supabase reporta índice ~10x menor que o B-tree equivalente.
- `btree (projeto_id, ocorrido_em desc)` — atende a tela de Atividade e a tool `atividade_recente`.
- `btree (projeto_id, nome, ocorrido_em desc)` — atende Uso por evento e `uso_por_evento`.
- `btree (projeto_id, distinct_id, ocorrido_em desc)` — atende Pessoas e a tool `pessoa`.

Deliberadamente **não** há índice em `propriedades`. Índice GIN em jsonb é caro na escrita e a v1 não filtra por propriedade. Se isso mudar, cria-se índice parcial na chave específica.

**Exclusão: hard delete por partição.** Retenção de 12 meses (regra 11.8), aplicada por `DROP` de partição via `pg_partman` — instantâneo, sem bloat, sem `VACUUM FULL`.

**Trade-off declarado:** `tela` e `descricao` são colunas próprias em vez de chaves dentro de `propriedades`. Isso desnormaliza (a descrição se repete em cada linha) e é assumido de propósito — são os dois campos que o princípio 0.2 torna centrais, e tê-los como coluna torna a query e a leitura pelo agente triviais. O custo é armazenamento repetido, irrelevante no volume da v1. O que isso impede: mudar a descrição de um evento retroativamente no histórico. A fonte de verdade editável é `definicoes_evento.descricao` (7.5); a coluna em `eventos` é o registro do que valia no momento.

### 7.5 — `definicoes_evento`

O catálogo. **Se popula sozinho** por trigger, e é editável pelo dono.

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `projeto_id` | uuid | não | — | FK → `projetos.id` |
| `nome` | text | não | — | nome do evento |
| `descricao` | text | **sim** | — | fonte de verdade editável. Nulo até o primeiro evento chegar com descrição ou o dono escrever |
| `telas` | text[] | não | `'{}'` | todas as telas em que este evento já foi visto |
| `total_ocorrencias` | bigint | não | `0` | contador mantido por trigger |
| `primeira_ocorrencia_em` | timestamptz | **sim** | — | nulo em definição criada à mão antes do primeiro evento |
| `ultima_ocorrencia_em` | timestamptz | **sim** | — | nulo pelo mesmo motivo |
| `criado_em` | timestamptz | não | `now()` | |

Índice: `unique (projeto_id, nome)`.

**Exclusão: não há.** Evento sai do catálogo apenas se o projeto for apagado. Um evento que parou de disparar continua listado — e é justamente essa a informação útil.

### 7.6 — `pessoas`

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `projeto_id` | uuid | não | — | FK → `projetos.id` |
| `distinct_id` | text | não | — | |
| `propriedades` | jsonb | não | `'{}'::jsonb` | merge das propriedades marcadas como de pessoa pelo SDK |
| `total_eventos` | bigint | não | `0` | mantido por trigger |
| `primeiro_visto_em` | timestamptz | não | — | |
| `ultimo_visto_em` | timestamptz | não | — | |

Índice: `unique (projeto_id, distinct_id)`.

### 7.7 — `paineis` e `paineis_itens`

```
paineis
  id              uuid  pk  default gen_random_uuid()
  projeto_id      uuid  not null  → projetos.id
  nome            text  not null
  janela_padrao   janela_periodo  not null  default '30d'
  criado_em       timestamptz not null default now()

paineis_itens
  id                    uuid  pk  default gen_random_uuid()
  painel_id             uuid  not null  → paineis.id  (on delete cascade)
  nome_evento           text  not null          -- referência por nome, não por FK
  titulo                text  null              -- nulo = usa a descrição do catálogo
  tipo_visualizacao     tipo_visualizacao not null default 'serie_temporal'
  posicao               integer not null default 0
```

**Decisão:** `paineis_itens` referencia o evento **por nome**, não por FK para `definicoes_evento`. Motivo: o dono pode montar um tile para um evento que ainda não disparou nenhuma vez — é um caso de uso legítimo e frequente (feature acabou de subir). FK obrigaria a criar a definição antes. Trade-off: nome digitado errado gera tile permanentemente vazio; mitigado pelo aviso da regra 11.9.

### 7.8 — `credenciais`

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `tipo` | tipo_credencial | não | — | `ingestao` ou `leitura` |
| `projeto_id` | uuid | **sim** | — | obrigatório em `ingestao`; **nulo em `leitura`**, que vale para todos os projetos. Garantido por check |
| `nome` | text | não | — | "Agenda Psi produção", "Claude Code do notebook" |
| `prefixo` | text | não | — | 8 primeiros caracteres, para exibição |
| `valor_hash` | text | não | — | SHA-256 do valor completo |
| `criada_em` | timestamptz | não | `now()` | |
| `ultimo_uso_em` | timestamptz | **sim** | — | nulo enquanto nunca usada |
| `revogada_em` | timestamptz | **sim** | — | nulo = ativa. **Soft delete** — preserva o rastro de qual chave escreveu o quê |

Índices: `unique (valor_hash)`; `btree (tipo, revogada_em)`.

Check: `chk_credencial_projeto` — `(tipo = 'ingestao' and projeto_id is not null) or (tipo = 'leitura' and projeto_id is null)`.

### 7.9 — `contas`

A raiz do isolamento. Criada automaticamente no primeiro login com Google (seção 5.2).

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | preenchido com o nome da conta Google no cadastro; editável |
| `plano` | plano_conta | não | `'gratuito'` | ver regra 11.15 |
| `retencao_meses` | integer | não | `1` | 1 no gratuito, 12 no pago (regra 11.15) |
| `limite_projetos` | integer | não | `1` | 1 no gratuito, ilimitado no pago — `null` significa sem limite |
| `stripe_cliente_id` | text | **sim** | — | nulo até a conta virar paga. Coluna criada na v1 e **não usada** até a v2, para não exigir migration na tabela raiz depois |
| `criada_em` | timestamptz | não | `now()` | |
| `cancelada_em` | timestamptz | **sim** | — | nulo = ativa. Soft delete; a exclusão efetiva dos dados segue a regra 11.17 |

### 7.9.1 — `usuarios_conta`

Vínculo entre o usuário do Supabase Auth e a conta. Na v1 há sempre exatamente uma linha por conta; a tabela existe agora para que os convites da v2 (F4) sejam inserção de linha, não mudança de esquema.

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `contas.id` |
| `usuario_id` | uuid | não | — | usuário do Supabase Auth |
| `papel` | papel_conta | não | `'dono'` | v1 só usa `dono` |
| `criado_em` | timestamptz | não | `now()` | |

Índice: `unique (usuario_id)` — na v1 uma pessoa pertence a uma conta só.

### 7.9.2 — `uso_mensal`

**Precondição de qualquer cobrança.** Não dá para faturar por um mês que nunca foi contado, e backfill de medição é retrabalho garantido. Populada por job diário (seção 7.10), uma linha por conta e mês.

| Campo | Tipo | Null? | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `contas.id` |
| `competencia` | date | não | — | primeiro dia do mês de referência |
| `eventos_recebidos` | bigint | não | `0` | |
| `projetos_ativos` | integer | não | `0` | projetos com ao menos um evento no mês |
| `pessoas_distintas` | integer | não | `0` | |
| `consultas_mcp` | integer | não | `0` | |
| `atualizado_em` | timestamptz | não | `now()` | |

Índice: `unique (conta_id, competencia)`.

Mede as quatro dimensões mesmo que a regra 11.15 só cobre por duas. Medir é barato; descobrir depois que você não mediu, não.

### 7.10 — Lógica que vive no banco

| Nome | Tipo | Onde | O que faz |
|---|---|---|---|
| `fn_atualiza_definicao_evento()` | função | — | Faz upsert em `definicoes_evento`: cria a definição se não existir, incrementa `total_ocorrencias`, atualiza `ultima_ocorrencia_em`, preenche `primeira_ocorrencia_em` na primeira vez, adiciona a `tela` ao array se ainda não estiver lá, e preenche `descricao` **apenas se estiver nula** (a edição manual do dono nunca é sobrescrita — regra 11.2) |
| `trg_eventos_definicao` | trigger | `eventos`, AFTER INSERT FOR EACH ROW | Chama a função acima |
| `fn_atualiza_pessoa()` | função | — | Faz upsert em `pessoas`: cria se não existir, incrementa `total_eventos`, atualiza `ultimo_visto_em`, faz merge das propriedades de pessoa |
| `trg_eventos_pessoa` | trigger | `eventos`, AFTER INSERT FOR EACH ROW | Chama a função acima |
| `fn_valida_nome_evento()` | função | — | Valida o formato do nome contra a regra 11.1. Usada como check constraint em `eventos.nome` |
| `partman.run_maintenance_proc()` | job pg_cron | diário, 03:00 UTC | Pré-cria partições futuras e aplica a retenção (drop de partições vencidas) |
| `fn_agrega_uso_mensal()` | função + job pg_cron | diário, 04:00 UTC | Faz upsert em `uso_mensal` para o mês corrente de cada conta: eventos recebidos, projetos ativos, pessoas distintas e consultas MCP. É a medição do princípio 0.6 e a precondição da cobrança (regra 11.15) |
| `fn_expurga_contas_canceladas()` | função + job pg_cron | diário | Apaga definitivamente os dados de contas com `cancelada_em` há mais de 30 dias (regra 11.17) |
| `fn_poda_cron_historico()` | função + job pg_cron | semanal | Apaga registros de `cron.job_run_details` com mais de 30 dias. **A documentação do Supabase avisa explicitamente que o `pg_cron` não limpa essa tabela sozinho** e que o crescimento dela atrapalha upgrades |

**Trade-off declarado — trigger FOR EACH ROW numa tabela de ingestão.** É a escolha errada em escala; a certa seria agregação em lote por `pg_cron`. Foi escolhida a trigger porque no volume da v1 (dezenas de eventos/dia) o custo é irrelevante e o catálogo fica correto em tempo real, o que é requisito da tela de Atividade. **Gatilho de revisão:** se a ingestão passar de 100 eventos por segundo sustentados, migrar para agregação em lote. Isso está registrado como risco R2.

### 7.11 — Seed e migrations

Migrations versionadas em `supabase/migrations`, aplicadas via CLI do Supabase. Seed cria:

1. A linha de `configuracoes` com o `usuario_id` do dono.
2. Nenhum projeto. O primeiro projeto nasce do comando de inicialização (épico 8.7).

---

## 8. Épicos e critérios de aceite

Ordem de implementação. Cada épico só começa quando o anterior passa nos critérios.

### 8.1 — Banco, RLS e catálogo automático

**Objetivo:** o esquema completo da seção 7 no ar, com partições, triggers e políticas.

**Critérios de aceite**

- [ ] Todas as tabelas da seção 7 existem, com nomes em português conforme especificado.
- [ ] `eventos` é particionada por range em `ocorrido_em`, com intervalo de 7 dias e 7 partições futuras pré-criadas.
- [ ] Inserir um evento com nome inédito cria automaticamente uma linha em `definicoes_evento` com `total_ocorrencias = 1` e `primeira_ocorrencia_em` igual ao `ocorrido_em` do evento.
- [ ] Inserir um segundo evento do mesmo nome incrementa `total_ocorrencias` para 2 e atualiza `ultima_ocorrencia_em`, sem criar linha nova.
- [ ] Editar `definicoes_evento.descricao` à mão e inserir novo evento com descrição diferente **não** sobrescreve a descrição editada.
- [ ] Inserir evento de `distinct_id` inédito cria linha em `pessoas` com `total_eventos = 1`.
- [ ] RLS está habilitada em todas as tabelas e o papel `anon` não lê nenhuma delas (verificado por teste).
- [ ] `get_advisors` (segurança e performance) roda sem alerta crítico.

### 8.2 — Endpoint de ingestão

**Objetivo:** receber lotes de eventos autenticados por chave de projeto.

**Fluxo:** app envia `POST` com `x-api-key` e lote → função valida chave → valida payload → insere em uma única instrução multi-row → responde `202` com a contagem aceita.

**Critérios de aceite**

- [ ] `POST /functions/v1/ingest` com chave válida e lote de 1 evento responde `202` com `{"aceitos": 1, "rejeitados": 0}`.
- [ ] Lote de 100 eventos é aceito em uma única instrução SQL; lote de 101 responde `400` com `codigo: "lote_excedido"`.
- [ ] Chave ausente responde `401`; chave inválida ou revogada responde `401`; nunca `403` nem `500`.
- [ ] Evento com `id` já existente é ignorado silenciosamente e contabilizado em `duplicados`, sem erro (regra 11.4).
- [ ] Evento com nome fora do formato da regra 11.1 é rejeitado individualmente; os demais do mesmo lote são aceitos, e a resposta lista os rejeitados com o motivo.
- [ ] Evento com `ocorrido_em` mais de 48 h no futuro tem `ocorrido_em` substituído por `recebido_em` e é aceito (regra 11.6).
- [ ] O tempo de CPU da função permanece abaixo de 500 ms para um lote de 100 eventos (limite da plataforma é 2 s).
- [ ] Nenhuma propriedade é adicionada pelo servidor. O evento gravado contém exatamente o que foi enviado (princípio 0.1), mais `recebido_em`.

### 8.3 — SDK JavaScript/TypeScript

**Objetivo:** um pacote que funcione em web, React Native/Expo e Node, com fila e retry.

**Comportamento:** modelado no padrão consolidado do mercado, verificado no SDK do PostHog para React Native.

| Parâmetro | Default |
|---|---|
| `flushAt` (eventos na fila antes de enviar) | 20 |
| `flushInterval` | 10.000 ms |
| `maxBatchSize` | 100 |
| `maxQueueSize` | 1.000 — ao encher, **descarta o mais antigo** |
| `retries` | 3 |
| `retryDelay` | 3.000 ms, fixo |
| `requestTimeout` | 10.000 ms |
| persistência | `AsyncStorage` (RN), `localStorage` (web), memória (Node) |

**Critérios de aceite**

- [ ] `init({ key, projeto, host? })` configura o SDK uma vez, na inicialização do app.
- [ ] `track(nome, { descricao, tela, props })` enfileira e retorna imediatamente, sem `await`. **Esta é a assinatura definitiva** — `descricao` e `tela` são de primeira classe, no nível de cima (princípio 0.2), e as propriedades livres do app ficam aninhadas em `props`.
- [ ] Cada evento recebe um `id` UUID v4 gerado no cliente no momento do `track`.
- [ ] `ocorrido_em` é carimbado no momento do `track`, não no do envio.
- [ ] Com a rede desligada, 30 eventos capturados permanecem na fila persistida; ao religar a rede, todos chegam ao servidor exatamente uma vez.
- [ ] Fila com 1.001 eventos descarta o mais antigo e mantém 1.000.
- [ ] Falha de rede dispara 3 tentativas com 3 s de intervalo antes de devolver o lote à fila.
- [ ] `identify(distinct_id, propriedades?)` passa a associar os eventos seguintes àquele identificador.
- [ ] `flush()` força o envio e resolve quando a fila esvazia ou o retry se esgota.
- [ ] O pacote funciona em Expo SDK 57 (React Native 0.86) sem módulo nativo.

### 8.4 — Site: projetos, atividade e detalhe do evento

**Objetivo:** ver o que está acontecendo. É a tela que substitui o Activity do PostHog, sem os campos que ninguém olha.

**Critérios de aceite**

- [ ] Login com e-mail e senha leva à lista de projetos; sem sessão, qualquer rota redireciona para o login.
- [ ] A lista de projetos mostra, por projeto: nome, total de eventos nas últimas 24 h, e horário do último evento.
- [ ] A tela de Atividade lista os eventos em ordem decrescente de `ocorrido_em`, com: nome do evento, descrição, `distinct_id`, tela e horário relativo ("há 21 minutos").
- [ ] Um separador de data aparece entre eventos de dias diferentes.
- [ ] Filtros: intervalo de data, nome do evento e `distinct_id`. Os filtros compõem entre si.
- [ ] Clicar num evento abre o detalhe com todas as propriedades. **A tela não exibe nenhum campo que o app não enviou.**
- [ ] Estado vazio de projeto sem eventos mostra o trecho de código de instrumentação e a chave de ingestão, não uma ilustração genérica.
- [ ] Estado de carregamento usa skeleton, não spinner de tela cheia.
- [ ] A lista pagina por rolagem infinita, 50 por página.

### 8.5 — Site: uso por evento, painel e pessoas

**Objetivo:** responder "alguém está usando isso?".

**Critérios de aceite**

- [ ] A tela de Uso lista todos os eventos do catálogo com: descrição, total no período, usuários únicos no período, e data da última ocorrência.
- [ ] **Evento do catálogo com zero ocorrências no período aparece na lista, com zero explícito e marcação visual de inativo.** Não é omitido.
- [ ] Seletor de período com as opções 7, 14, 30 e 90 dias.
- [ ] O painel exibe os tiles configurados, cada um com o título (ou a descrição do catálogo, se o título for nulo) e a visualização escolhida.
- [ ] Todo tile de série temporal usa **barras com rótulo de valor por barra**, em qualquer volume (regra 11.10), com o agrupamento da regra 11.14.
- [ ] Todo tile exibe o número absoluto do período junto do gráfico.
- [ ] Adicionar tile ao painel é feito escolhendo um evento do catálogo ou digitando um nome de evento ainda não visto.
- [ ] A tela de Pessoas lista os `distinct_id` com total de eventos, primeiro e último acesso; clicar abre a linha do tempo daquela pessoa.

### 8.6 — Servidor MCP

**Objetivo:** as mesmas respostas do site, pelo agente. Princípio 0.3.

**Critérios de aceite**

- [ ] O servidor responde em `/functions/v1/mcp/mcp` por **Streamable HTTP**, conforme a spec MCP `2026-07-28`. SSE legado não é implementado.
- [ ] `server/discover` está implementado e anuncia versão, capabilities e identidade.
- [ ] Autenticação por `Authorization: Bearer <token>` em todo request; token inválido responde `401`.
- [ ] As 5 tools da seção 13.2 existem, com os parâmetros e retornos ali especificados.
- [ ] `consulta` rejeita qualquer instrução que não seja `select` e qualquer referência a tabela fora de `eventos`, `definicoes_evento`, `pessoas` e `projetos`.
- [ ] Toda resposta de tool inclui a **descrição** dos eventos envolvidos, não só o nome (princípio 0.2).
- [ ] `atividade_recente` sem parâmetro de limite retorna no máximo 50 eventos, para não estourar contexto.
- [ ] Conectado ao Claude Code, a pergunta "quantas pessoas usaram o Agenda Psi essa semana e o que elas fizeram" é respondida corretamente sem que o usuário mencione nome de evento.

### 8.7 — CLI de inicialização e skills

**Objetivo:** o princípio 0.5 na prática — instalar sem tela de configuração.

**Fluxo:** `npx visao init` dentro do repo do app → pede o token do dono uma vez → cria o projeto → gera a chave de ingestão → instala o SDK → escreve o `.env` → registra o MCP no cliente de agente detectado → imprime o próximo passo.

**Critérios de aceite**

- [ ] O comando roda do zero num projeto Next.js e num projeto Expo, sem pergunta além do nome do projeto.
- [ ] Ao final, o `.env` contém a chave de ingestão e o SDK está instalado e inicializado.
- [ ] O comando detecta Claude Code, Cursor e Claude Desktop instalados e registra o MCP em cada um que encontrar.
- [ ] A skill de instrumentação, quando invocada, lê o `prefixo_evento` do projeto e o catálogo existente antes de propor nomes, e **não** propõe nome que colida com evento já existente com significado diferente.
- [ ] A skill de instrumentação sempre escreve `descricao` em português na chamada que adiciona.
- [ ] A skill de leitura responde perguntas de uso consultando o MCP, sem inventar nome de evento não presente no catálogo.

---

## 9. Fluxos principais ponta a ponta

### 9.1 — Instrumentar uma feature nova (o fluxo que define o produto)

1. O construtor pede ao agente uma feature nova, a partir da spec do app.
2. O agente implementa a feature.
3. A skill de instrumentação dispara: o agente chama a tool `catalogo` do MCP e lê os eventos que já existem no projeto e o `prefixo_evento`.
4. O agente propõe **um** evento novo, seguindo a convenção observada, com nome e descrição em português.
5. O agente adiciona a chamada `capture()` no ponto correto do código, com `tela` e `descricao`.
6. O construtor revisa o diff — a chamada aparece junto da feature, no mesmo PR.
7. No primeiro disparo em produção, a trigger cria a entrada no catálogo automaticamente.

**Caminho de exceção:** se o agente não encontrar convenção (projeto novo, catálogo vazio), ele propõe a convenção `<prefixo>_<verbo>_<substantivo>` e a grava em `projetos.prefixo_evento` — passando a valer para todas as instrumentações seguintes.

### 9.2 — Descobrir o que está sendo usado

1. O construtor pergunta ao Claude, dentro do editor: *"o que aconteceu no Agenda Psi essa semana?"*
2. O agente chama `uso_por_evento` com janela de 7 dias.
3. A resposta traz, por evento: descrição, total, usuários únicos — **incluindo os eventos com zero**.
4. O agente responde em prosa, citando as descrições e não os nomes técnicos.

**Caminho de exceção:** projeto sem nenhum evento no período. A resposta precisa distinguir "ninguém usou" de "nada foi instrumentado" — se o catálogo está vazio, a resposta é a segunda, e o agente diz isso explicitamente.

---

## 10. Inventário de telas

| Tela | Mostra | Ações | Lê | Escreve |
|---|---|---|---|---|
| **Login** | e-mail, senha | entrar | — | — |
| **Projetos** | lista de projetos ativos, eventos em 24 h, último evento | criar projeto, abrir, arquivar | `projetos`, `eventos` | `projetos` |
| **[Projeto] Atividade** | stream de eventos: nome, descrição, pessoa, tela, horário | filtrar por data/evento/pessoa, abrir detalhe | `eventos`, `definicoes_evento` | — |
| **[Projeto] Detalhe do evento** | todas as propriedades do evento selecionado | copiar valor, filtrar por esta pessoa | `eventos` | — |
| **[Projeto] Uso** | todos os eventos do catálogo com total, únicos e última ocorrência no período | trocar período, ordenar, abrir a atividade daquele evento | `eventos`, `definicoes_evento` | — |
| **[Projeto] Painel** | tiles configurados | adicionar, remover e reordenar tile; trocar período | `eventos`, `paineis`, `paineis_itens` | `paineis`, `paineis_itens` |
| **[Projeto] Pessoas** | `distinct_id`, total de eventos, primeiro e último acesso | abrir a linha do tempo da pessoa | `pessoas`, `eventos` | — |
| **[Projeto] Catálogo** | todos os eventos: nome, descrição, telas, total, primeira e última ocorrência | **editar descrição**, ver eventos zerados | `definicoes_evento` | `definicoes_evento` |
| **[Projeto] Configurações** | nome, slug, prefixo de evento, fuso, chave de ingestão, trecho de instalação | editar projeto, gerar e revogar chave de ingestão | `projetos`, `credenciais` | `projetos`, `credenciais` |
| **Credenciais MCP** | tokens de leitura: nome, prefixo, último uso | gerar token, revogar token | `credenciais` | `credenciais` |

---

## 11. Regras de negócio

| # | Regra | Onde é aplicada |
|---|---|---|
| **11.1** | Nome de evento válido: `^[a-z][a-z0-9_]{2,63}$`. Minúsculas, começa com letra, entre 3 e 64 caracteres, só letras, números e underscore. **Espaço é inválido** — o evento `swim_geracao de treino`, existente hoje no PostHog, seria rejeitado e precisa ser renomeado para `swim_geracao_treino` | Check constraint `chk_nome_evento` no banco + validação na Edge Function + validação no SDK |
| **11.2** | `definicoes_evento.descricao` editada manualmente nunca é sobrescrita por evento novo. A trigger só preenche quando o campo está nulo | `fn_atualiza_definicao_evento()` |
| **11.3** | Um evento pertence a exatamente um projeto. Não existe evento sem projeto | FK not null |
| **11.4** | Deduplicação por `id`: evento cujo `id` já existe é descartado silenciosamente. É o que torna o retry do SDK seguro | `ON CONFLICT DO NOTHING` no insert da Edge Function |
| **11.5** | A chave de ingestão determina o `projeto_id`. O `projeto_id` enviado no payload, se houver, é **ignorado** | Edge Function de ingestão |
| **11.6** | `ocorrido_em` mais de 48 h no futuro é substituído por `recebido_em`. Relógio de dispositivo errado não pode criar partição futura nem sujar o gráfico | Edge Function de ingestão |
| **11.7** | O banco armazena tudo em UTC. A conversão para `projetos.fuso_exibicao` acontece na apresentação — site e respostas do MCP | Frontend e MCP; nunca no banco |
| **11.8** | Retenção física: o drop de partição segue a janela da conta mais generosa (12 meses no plano pago). A janela **visível** por conta é `contas.retencao_meses` e é aplicada na consulta — ver regra 11.18 | `pg_partman` via `pg_cron` + filtro na query |
| **11.9** | Tile de painel cujo `nome_evento` não existe em `definicoes_evento` exibe aviso "este evento nunca foi recebido" em vez de gráfico vazio | Frontend |
| **11.10** | Série temporal é **sempre** renderizada em barras, com rótulo de valor sobre cada barra. Nunca linha, nunca curva suavizada, em nenhum volume. Curva interpolada sobre 1 ou 2 eventos comunica tendência onde só existe ruído — e como o volume normal desta plataforma é pequeno, a exceção viraria a regra | Frontend |
| **11.11** | "Usuários únicos" é a contagem de `distinct_id` distintos no período. Não há nenhuma noção de sessão, e a plataforma não infere uma | Query |
| **11.12** | Um evento no catálogo com zero ocorrências no período **sempre aparece** nas listagens de uso, com zero explícito. Omitir o zero é o comportamento que a plataforma existe para corrigir | Query e frontend |
| **11.13** | Nada é calculado automaticamente além dos contadores das triggers. Não há métrica derivada, score de engajamento, projeção nem detecção de anomalia | — |
| **11.15** | Plano **gratuito**: 1 projeto, 1 mês de retenção. Plano **pago**: projetos ilimitados, 12 meses de retenção, e (na v2) mais de uma pessoa por conta. O gatilho de cobrança é **projetos e retenção, nunca volume de eventos** — o custo marginal por evento é próximo de zero (seção 20, R8) e cobrar por ele puniria exatamente o uso que a plataforma quer estimular | Aplicação na v2; os campos existem na v1 |
| **11.16** | Toda conta pode exportar seus próprios dados a qualquer momento, em qualquer plano, sem pedir nada a ninguém (princípio 0.6). Formato na seção 14 | Site e API |
| **11.17** | Cancelar a conta preenche `cancelada_em` e mantém os dados por **30 dias**, período em que a exportação continua disponível e o cancelamento é reversível pelo próprio usuário. Após 30 dias, exclusão definitiva por job. Nenhum passo exige intervenção do dono da plataforma | `fn_expurga_contas_canceladas()` via `pg_cron` |
| **11.18** | Retenção efetiva de eventos é `contas.retencao_meses`, não um valor global. O drop de partição só pode apagar dado que está fora da janela **da conta mais generosa**; o filtro por conta acontece na consulta | `pg_partman` + filtro na query |
| **11.14** | Agrupamento das barras por janela: **7d** = 7 barras (1 por dia); **14d** = 14 barras (1 por dia); **30d** = 10 barras (1 por 3 dias); **90d** = 13 barras (1 por semana). O teto de 14 barras vem da largura do tile — 288px, barras em `flex:1` com gap de 5px; acima disso a barra fica ilegível. O rótulo de período do tile mostra a data inicial e final da janela, não de cada barra | Query e frontend |

---

## 12. Contratos de API

### 12.1 — Ingestão

```
POST /functions/v1/ingest
Headers:  x-api-key: ing_<valor>
          content-type: application/json
```

```jsonc
{
  "eventos": [
    {
      "id": "9f1c...-uuid-v4",          // obrigatório, gerado no cliente
      "nome": "psi_novo_pagamento",      // obrigatório, formato da regra 11.1
      "distinct_id": "carla@exemplo.com",// obrigatório
      "ocorrido_em": "2026-08-16T22:56:01.510Z", // obrigatório, ISO 8601
      "tela": "novo pagamento",          // opcional
      "descricao": "usuário registrou um pagamento de um paciente", // opcional
      "propriedades": { "valor": 250 }   // opcional
    }
  ]
}
```

**Respostas**

| Código | Corpo | Quando |
|---|---|---|
| `202` | `{"aceitos": 18, "duplicados": 2, "rejeitados": []}` | sempre que a chave é válida e o lote está dentro do limite |
| `400` | `{"codigo": "lote_excedido", "mensagem": "..."}` | mais de 100 eventos, ou JSON malformado |
| `401` | `{"codigo": "credencial_invalida"}` | chave ausente, desconhecida ou revogada |
| `429` | `{"codigo": "limite_excedido"}` | reservado, não implementado na v1 |

Eventos individualmente inválidos **não derrubam o lote**: entram em `rejeitados`, cada um com `id`, `campo` e `motivo`.

**Idempotência** garantida pelo `id` do evento (regra 11.4). Reenviar o mesmo lote é seguro e não duplica.

### 12.2 — Tools do MCP

Servidor remoto, Streamable HTTP, spec `2026-07-28`, autenticado por `Authorization: Bearer mcp_<valor>`.

| Tool | Parâmetros | Retorna |
|---|---|---|
| `atividade_recente` | `projeto` (slug, opcional — sem ele, todos), `limite` (default 50, máx 200), `desde` (ISO, opcional), `evento` (opcional), `pessoa` (opcional) | Lista de eventos com nome, **descrição**, pessoa, tela e horário no fuso do projeto |
| `uso_por_evento` | `projeto` (slug, obrigatório), `janela` (`7d`\|`14d`\|`30d`\|`90d`, default `30d`), `evento` (opcional) | Por evento: nome, **descrição**, total, usuários únicos, última ocorrência. **Inclui os eventos com zero** (regra 11.12) |
| `pessoa` | `projeto` (slug, obrigatório), `distinct_id` (obrigatório), `limite` (default 50) | Perfil e linha do tempo daquela pessoa, com descrição de cada evento |
| `catalogo` | `projeto` (slug, obrigatório) | Todos os eventos do projeto: nome, descrição, telas, total acumulado, primeira e última ocorrência, e o `prefixo_evento` do projeto |
| `consulta` | `sql` (obrigatório) | Resultado de um `select` somente leitura sobre `eventos`, `definicoes_evento`, `pessoas` e `projetos`. Máximo 500 linhas |

**Regra transversal:** toda resposta que cita evento cita a descrição junto. O agente nunca precisa adivinhar o que `psi_atualizacao_preco` significa.

### 12.3 — Configuração do MCP no cliente de agente

**Servidor remoto, não local.** Esta é a configuração correta, e é a que a tela "Credenciais MCP" deve exibir no bloco copiável — o mock do Claude Design mostra uma variante local por `npx`, que está errada (seção 4.4).

```jsonc
{
  "mcpServers": {
    "visao-de-produto": {
      "type": "http",
      "url": "https://<ref>.supabase.co/functions/v1/mcp/mcp",
      "headers": {
        "Authorization": "Bearer mcp_9d21…"
      }
    }
  }
}
```

**Por que remoto e não local:** um servidor por `npx` rodando na máquina de quem usa precisaria de credencial de acesso ao banco naquela máquina. O servidor remoto mantém a credencial no servidor e entrega ao cliente apenas um token de leitura revogável, com escopo somente-leitura (regra 5.1.2).

A CLI (`npx visao init`) escreve esse bloco automaticamente em cada cliente de agente que encontrar — Claude Code, Claude Desktop e Cursor (épico 8.7). O bloco na tela existe para o caso manual.

---

## 13. Direção visual

**Referências:** Linear (densidade e tipografia), painel do Vercel (calma, hairlines), Activity do PostHog (a estrutura da tabela de eventos — o que funciona lá é a leitura em linha, não o cromo em volta).

| | |
|---|---|
| Tipografia | Inter (interface) e JetBrains Mono (nomes de evento, chaves, JSON) |
| Cor primária | **índigo `#6e7cf7`** no escuro, **`#4a56cf`** no claro — fixada na v1.1 a partir das telas geradas. Não é mais livre |
| Cor semântica | verde = evento com ocorrências no período; cinza = evento sem nenhuma ocorrência; vermelho = erro e revogação. **Reservadas para significado, nunca para decoração** |
| Densidade | tabela densa, altura de linha compacta. A tela de Atividade é feita para varrer, não para contemplar |
| Bordas | hairline de 1px, cantos suaves. Sem sombra pesada |
| Modo escuro | obrigatório, e é o padrão |

### 13.1 — Navegação: menu lateral estilo App Store Connect

Menu lateral persistente, com:

- **Grupos** com título em negrito escuro, caixa normal — nunca em maiúsculas decorativas.
- **Itens** indentados sob o grupo, **sem marcador nem bolinha**.
- **Hairline** separando os grupos.
- **Um item ativo por vez**, marcado na cor primária: texto na cor de destaque e pílula clara da mesma cor ao fundo.
- **Rodapé** com o usuário e a ação de sair.
- Cantos arredondados suaves, espaçamento generoso.

Estrutura:

```
Projetos                     (grupo)
  Agenda Psi
  Swim
  ...
─────────────────────────────
<Projeto ativo>              (grupo)
  Atividade
  Uso
  Painel
  Pessoas
  Catálogo
  Configurações
─────────────────────────────
Conta                        (grupo)
  Credenciais MCP
─────────────────────────────
[rodapé] alexandre@dablab.com.br · Sair
```

### 13.2 — Tokens de cor (fixados na v1.1)

Extraídos das telas geradas. **Use exatamente estes valores** — são o que foi aprovado visualmente.

| Token | Escuro (padrão) | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0b0c0e` | `#ffffff` | fundo da página |
| `--panel` | `#101115` | `#fbfbfc` | menu lateral, cartões, tabelas |
| `--elev` | `#15171b` | `#f3f4f6` | campo de formulário, hover de linha |
| `--line` | `#23262c` | `#e7e8ec` | hairline padrão |
| `--line2` | `#2f333a` | `#d6d8de` | borda de botão secundário, tracejado |
| `--text` | `#e9eaee` | `#17181c` | texto principal |
| `--dim` | `#9b9ea6` | `#63666e` | texto secundário |
| `--faint` | `#6a6d76` | `#8d9098` | rótulo, nome técnico do evento |
| `--code` | `#0e0f12` | `#f6f7f9` | fundo de bloco de código e JSON |
| `--pri` | `#6e7cf7` | `#4a56cf` | cor primária: item ativo, link, botão |
| `--priSoft` | `rgba(110,124,247,0.15)` | `rgba(79,91,213,0.09)` | pílula do item ativo no menu |
| `--ok` | `#3fb950` | `#1a7f37` | **semântica:** evento com ocorrências |
| `--off` | `#6a6d76` | `#8d9098` | **semântica:** evento sem ocorrência |
| `--err` | `#f0616d` | `#c9303d` | **semântica:** erro, revogação |
| `--errSoft` | `rgba(240,97,109,0.12)` | `rgba(201,48,61,0.07)` | fundo de alerta de erro |
| `--errLine` | `rgba(240,97,109,0.32)` | `rgba(201,48,61,0.28)` | borda de alerta de erro |

### 13.3 — Copy

Livre para o agente, respeitando o tom — direto, em português, sem entusiasmo de marketing. Mensagem de estado vazio nunca é decorativa: ela diz o que fazer em seguida.

Duas frases das telas geradas são **conteúdo final e devem ser preservadas**, porque declaram princípios do produto na interface:

- No detalhe do evento: *"Estes são todos os campos deste evento. Nada é capturado automaticamente."*
- No subtítulo da tela de Uso: *"Todos os eventos do catálogo, inclusive os que não ocorreram nenhuma vez no período."*

---

## 13.4 — Exportação (MVP, D11)

Autosserviço significa que a pessoa leva os dados dela embora sozinha, sem pedir. Dois formatos, ambos disponíveis em qualquer plano:

**CSV dos eventos** — respeita o filtro aplicado na tela.

| Item | Definição |
|---|---|
| Encoding | UTF-8 **com BOM** (para abrir no Excel sem quebrar acento) |
| Separador | `;` |
| Colunas, nesta ordem | `nome;descricao;distinct_id;tela;ocorrido_em;propriedades` |
| Granularidade | uma linha por evento |
| Data | ISO 8601 no fuso do projeto |
| Nome do arquivo | `<slug-do-projeto>-eventos-<AAAA-MM-DD>.csv` |

**JSON completo da conta** — para portabilidade sob LGPD: projetos, catálogo, pessoas, painéis e eventos. Gerado sob demanda, entregue por link assinado com validade de 24 h.

Acima de 100 mil linhas a exportação roda em background e o link chega por e-mail; abaixo disso, é download direto. O limite existe para não estourar o teto de 2 s de CPU da Edge Function.

---

## 14. Requisitos não-funcionais

| Requisito | Alvo |
|---|---|
| Latência da ingestão (p95) | < 300 ms do recebimento à resposta `202` |
| CPU da Edge Function de ingestão | < 500 ms por lote de 100 (limite da plataforma: 2 s) |
| Carga da tela de Atividade (p95) | < 1,5 s com 100 mil eventos no projeto |
| Resposta de tool do MCP (p95) | < 2 s |
| Comportamento offline do SDK | fila persistida, entrega garantida ao religar, sem duplicata |
| Volume esperado v1 | 3 projetos, < 500 eventos/dia, < 50 pessoas por projeto |
| Volume de dimensionamento | a arquitetura deve suportar 1M eventos/mês sem mudança estrutural |
| Acessibilidade | contraste AA, navegação por teclado na tabela de Atividade, área de toque mínima de 44px |
| Navegadores | duas últimas versões de Chrome, Safari, Firefox e Edge |
| SDK | Expo SDK 57 / React Native 0.86; Node 20+; navegadores acima |
| Idioma | interface em português do Brasil. Sem internacionalização na v1 |

---

## 15. Convenções de código e estrutura

**15.1 — Idioma.** Banco em **português**, `snake_case`: tabelas, colunas, enums, funções, triggers e políticas. Código, variáveis, funções e nomes de arquivo em **inglês**. A fronteira fica na camada de acesso a dados: os tipos que espelham o banco mantêm os nomes em português (`type Evento = { projeto_id: string; ocorrido_em: string }`).

**15.2 — Comentários obrigatórios.** Toda função, hook, rota de servidor, trigger e política leva comentário de cabeçalho **em português** dizendo o que faz, o que recebe, o que devolve e qual regra do spec implementa, com o número da seção. Lógica não óbvia leva comentário inline. O comentário descreve intenção e regra de negócio, nunca repete a sintaxe.

```ts
/**
 * Valida o lote recebido e grava os eventos aceitos.
 * Recebe o corpo do POST /ingest e o projeto resolvido pela chave (regra 11.5).
 * Devolve a contagem de aceitos, duplicados e a lista de rejeitados com motivo.
 * Deduplicação por id via ON CONFLICT DO NOTHING (regra 11.4).
 */
```

**15.3 — Organização.** Módulo por feature dentro de `apps/web/src/features/<feature>`, com componentes, hooks de dados e tipos juntos. Nada de pasta `utils` genérica.

**15.4 — Documentação viva.** Na raiz: `schema.sql` gerado do banco real a cada migration; `README.md` com setup local, variáveis de ambiente e como rodar migrations; `DOCUMENTACAO-TECNICA.md` (seção 16); `CLAUDE.md` com convenções, mapa da arquitetura, comandos (incluindo `typecheck`), as pegadinhas que não podem ser quebradas e a regra de manter os docs em dia. **`CLAUDE.md`, documentação técnica e README são atualizados no mesmo commit da mudança.**

**15.5 — Variáveis de ambiente**

| Variável | Pública? | Onde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | site |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | site |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta** | apenas Edge Functions e rotas de servidor. **Nunca no bundle do cliente** |
| `VISAO_API_KEY` | pública por natureza (regra 5.1.3) | app instrumentado |
| `VISAO_HOST` | pública | app instrumentado |

Reservadas para as próximas releases: `RESEND_API_KEY` (resumo semanal, F7), `STRIPE_SECRET_KEY` (F10).

---

## 16. Documento de documentação técnica (entregável)

Ao final da implementação, o agente de código gera `DOCUMENTACAO-TECNICA.md` na raiz, em português, descrevendo o sistema **como ele ficou**, não como foi planejado. Conteúdo mínimo, nesta ordem:

1. **Modelo de dados explicado** — cada tabela: para que serve, o que cada coluna significa em linguagem de negócio, e o que cada valor de enum quer dizer.
2. **Relacionamento entre as tabelas** — diagrama em texto e, para cada relação, uma frase de cardinalidade no vocabulário do negócio.
3. **Regras de negócio que vivem no banco** — todas as triggers, funções e políticas criadas, com nome exato, tabela, quando disparam e o que fazem.
4. **Mapa tela → tabelas** — para cada tela, quais tabelas lê, quais escreve, e por quais políticas passa.
5. **Lógica das principais funcionalidades por tela** — o que é validado, gravado e calculado, e onde (frontend, Edge Function ou banco).
6. **Divergências em relação a este spec** — o que ficou diferente e por quê.

Regra de manutenção: toda mudança em schema, trigger, política ou lógica de tela atualiza este documento no mesmo commit.

---

## 17. Privacidade, segurança e conformidade

### 17.1 — Que dados existem

A plataforma armazena exatamente o que o app envia: nome do evento, identificador do usuário no app do cliente, tela, descrição, propriedades declaradas e dois carimbos de tempo. Mais nada.

**Não são coletados, por decisão de produto (princípio 0.1):** endereço IP, geolocalização, CEP, cidade, fuso do dispositivo, user-agent, modelo de aparelho, operadora, identificador de publicidade.

Isso é uma diferença material em relação à ferramenta usada hoje. O evento atual do Agenda Psi no PostHog carrega IP, latitude, longitude, CEP e cidade de uma profissional de saúde junto do e-mail dela — dado que nunca foi escolhido, veio por padrão do SDK. Aqui, o padrão é o inverso.

### 17.2 — LGPD

- **Papel:** na v1, com apps próprios, a Dab Lab é **controladora**. No minuto em que a primeira conta de terceiro se cadastra — e o autosserviço torna isso possível sem aviso — ela passa a ser **operadora**. Como não haverá um momento em que alguém "aprova" o primeiro cliente externo, as obrigações de operadora precisam já estar cobertas antes de o cadastro público ser aberto: contrato de operação aceito no cadastro, atendimento a titular, prazo e mecanismo de exclusão. **Isto é uma consequência direta do princípio 0.6 e não pode ser resolvida depois.**
- **Exportação e exclusão são autosserviço** (regras 11.16 e 11.17), não pedido por e-mail. É o que torna a obrigação de portabilidade viável sem alguém do outro lado.
- **Base legal:** legítimo interesse para métrica de uso de produto, por não haver dado sensível nem identificação de terceiro além do identificador que o próprio app já usa.
- **Cuidado explícito:** `distinct_id` é frequentemente um e-mail, e portanto dado pessoal. A tela e as respostas do MCP tratam esse campo como identificador, não como algo a enriquecer.
- **Retenção:** 12 meses, aplicada por drop de partição (regra 11.8). Vale escrever isso no aviso de privacidade dos apps instrumentados.
- **Exclusão de titular:** exclusão de uma pessoa específica (`distinct_id`) pela tela de Pessoas, disponível ao dono da conta. Exclusão da conta inteira pela regra 11.17.
- **Propriedades são responsabilidade de quem instrumenta.** A plataforma não impede que alguém envie CPF dentro de `propriedades`. A skill de instrumentação recebe a diretriz explícita de nunca enviar dado sensível, e a documentação afirma isso.

### 17.3 — Segurança

- `SUPABASE_SERVICE_ROLE_KEY` existe **apenas** em Edge Functions e rotas de servidor. Nunca no bundle.
- Credenciais são armazenadas como hash SHA-256; o valor em claro aparece uma vez só.
- A tool `consulta` do MCP roda com papel de banco **somente leitura**, restrito a quatro tabelas, e rejeita qualquer coisa que não seja `select`. Restrição no parser **e** na permissão do papel — validação de string sozinha não é controle de acesso.
- RLS habilitada em todas as tabelas; `anon` não lê nada.
- **`get_advisors` (segurança e performance) roda após toda DDL.** Sem alerta crítico pendente é item do Definition of Done.

---

## 18. Métricas de sucesso e telemetria

A plataforma se instrumenta com ela mesma, num projeto chamado `plataforma`. É o dogfooding e é também o melhor teste de qualidade do SDK.

| Métrica | Alvo | Prazo |
|---|---|---|
| Apps da Dab Lab enviando eventos | 3 (Agenda Psi, Swim, um app da BBZ) | 60 dias após a v1 |
| Consultas pelo MCP vs. acessos ao site | MCP ≥ 2× o site | 60 dias |
| Eventos instrumentados pelo agente sem edição manual | ≥ 80% | 60 dias |
| Tempo do `init` ao primeiro evento visível | < 10 minutos | na v1 |

Eventos da própria plataforma: `plat_projeto_criado`, `plat_evento_recebido` (amostrado), `plat_mcp_consulta`, `plat_tela_aberta`, `plat_credencial_gerada`. Nenhum deles carrega conteúdo de evento de cliente — respeitando a seção 17.

---

## 19. Estratégia de teste

| O quê | Como |
|---|---|
| Regras da seção 11 | Teste automatizado, uma suíte por regra. São a lógica do produto |
| Políticas de RLS | Teste automatizado que tenta ler cada tabela como `anon` e espera falha |
| Triggers de catálogo e pessoas | Teste de integração no banco: inserir evento e verificar o efeito colateral |
| Deduplicação | Enviar o mesmo lote duas vezes e verificar contagem inalterada |
| Fila offline do SDK | Teste com rede simulada: desligar, capturar 30, religar, conferir 30 exatos |
| Partições e retenção | Inserir evento com data antiga, rodar a manutenção, verificar o drop |
| Tools do MCP | Teste de contrato: cada tool com entrada válida e inválida |
| Telas | Validação manual contra os critérios de aceite dos épicos 8.4 e 8.5 |
| Caso de borda de fuso | Evento à meia-noite em `America/Sao_Paulo` aparece no dia certo na tela |

---

## 20. Riscos e mitigação

| # | Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|---|
| R1 | **Ninguém usa, nem você.** O PostHog continua bom o suficiente e a plataforma vira projeto abandonado | Alto | Média | Critério de morte explícito: se após 30 dias com os 3 apps instrumentados o site e o MCP forem consultados menos que o PostHog era, encerrar. Está na seção 18 como métrica, não como esperança |
| R2 | Trigger `FOR EACH ROW` degrada a ingestão | Médio | Baixa na v1 | Volume de dezenas/dia torna o custo irrelevante. Gatilho de revisão declarado em 7.10: acima de 100 eventos/s sustentados, migrar para agregação em lote via `pg_cron` |
| R3 | **`@modelcontextprotocol/server` 2.0.0 está sob a tag `latest` mas o próprio time chamou de beta**, e a spec `2026-07-28` removeu sessões, `initialize` e resumabilidade de SSE — quebras grandes e recentes | Alto | Média | Fixar a versão exata no `package.json`. Testar contra Claude Code e Claude Desktop reais antes de considerar o épico 8.6 pronto. Manter o MCP isolado numa Edge Function própria, para que uma quebra não derrube a ingestão |
| R4 | Plano Free do Supabase tem **500 MB de banco** e pausa o projeto após 1 semana de inatividade | Alto | Alta | Ir para o plano Pro (US$ 25/mês, 8 GB) antes de apontar qualquer app de produção. Projeto pausado significa ingestão fora do ar e evento perdido além da fila do SDK |
| R5 | Chave de ingestão embutida em app de loja é extraída e usada para poluir o projeto | Baixo | Média | Escopo mínimo por desenho (regra 5.1.1 e 5.1.3): a chave só escreve, só no próprio projeto, e se troca em um clique. Rate limit por chave entra na v2 |
| R6 | Nome de evento diverge entre sessões do agente, como já ocorre hoje (`psi_*` vs `swim_geracao de treino`) | Médio | Alta se não mitigado | `prefixo_evento` no projeto + skill que lê o catálogo antes de propor nome (épico 8.7) + validação de formato que rejeita espaço (regra 11.1) |
| R7 | A plataforma cresce para funil, retenção e replay, e vira um PostHog pior | Alto | Média | Anti-escopo escrito na seção 1 e princípio 0.4. Todo pedido nessa direção vai para o roadmap, não para o MVP |
| R9 | **Confundir autosserviço com aquisição.** Construir checkout e login não gera consciência de que a plataforma existe; isso continua exigindo trabalho de distribuição — publicar o SDK, a skill e o plugin, e aparecer onde o público está | Médio | Média | Autosserviço **não é opcional nem posterior**: é a precondição do canal. O canal de aquisição é o agente, o npm e o GitHub, e nenhum deles tolera um produto que exige contato humano para ser experimentado — um agente não pode dizer "instrumento isso pra você, mas antes agende uma conversa". Além disso, produto que se testa sozinho gera demanda como subproduto (quem experimentou comenta, indica e deixa instalado num repo que outro dev abre), enquanto produto com porteiro não tem boca a boca porque não há nada a passar adiante. O risco residual, e só ele, é achar que ter Stripe substitui publicar o pacote e a skill. **Métrica que testa: contas criadas sem contato prévio** |
| R10 | **Tributação e nota fiscal consomem exatamente a "gestão" que o autosserviço quer eliminar.** Vender em BRL para PJ brasileira exige NFS-e por prefeitura e ISS | Alto se em BRL | Alta se em BRL | Decisão tomada: **cobrança em USD, global, via Stripe com Stripe Tax** (seção 25). Sem NFS-e, sem ISS municipal. O custo é fechar a porta para quem só paga em boleto ou Pix — aceitável, porque o público-alvo (dev construindo com IA) é o mais confortável com cartão internacional |
| R8 | Descoberta tardia de que o volume real exige ClickHouse | Médio | Baixa | Requisito não-funcional dimensiona 1M eventos/mês em Postgres particionado. Acima disso, o caminho é migração de armazenamento com o contrato de API intacto — é por isso que a seção 12.1 é o contrato estável, e não o esquema da tabela |

---

## 21. Assunções declaradas

**Revise esta seção antes de gerar código.** Cada item é uma decisão tomada sem consulta.

| # | Assunção | Por quê | Alternativa se discordar |
|---|---|---|---|
| 21.1 | A v1 tem **uma única conta com um único usuário**, mas a estrutura multi-conta e as políticas de isolamento existem desde a primeira migration (D8). O que fica para a v2 é convite de membros (F4) e Stripe (F10) | Autosserviço exige multi-tenancy; retrofitar `conta_id` numa tabela particionada depois é caro, escrevê-lo agora é uma coluna | Se quiser abrir o cadastro público já na v1, o que falta é Stripe, página de preço e o contrato de operação — cerca de dois épicos |
| 21.2 | **Flutter e Python usam a API REST direta na v1**, sem SDK nativo | O contrato da seção 12.1 é estável e simples; SDK nativo é manutenção contínua para um público que ainda não existe | Se algum app Flutter for instrumentado já, avisar e o SDK entra como épico 8.8 |
| 21.3 | Google é o **único** método de login. Sem e-mail e senha, sem magic link | Menos superfície, menos suporte, nenhuma senha para recuperar — e é o padrão que o público dev espera | Se algum cliente exigir e-mail e senha, o Supabase Auth já suporta; é configuração, não reescrita |
| 21.4 | Retenção de 12 meses | Cobre comparação ano contra ano e mantém o banco pequeno | Diga outro número e ajusto a regra 11.8 |
| 21.5 | Modo escuro é o padrão | Público é dev | Trivial de inverter |
| 21.6 | `paineis_itens` referencia evento por nome, não por FK | Permite montar tile antes do primeiro disparo | Se preferir integridade referencial, vira FK e o tile só existe depois do primeiro evento |
| 21.7 | Não há rate limit na ingestão na v1 | Chave própria, apps próprios, volume conhecido | Entra junto com abertura para terceiros |
| 21.8 | O SDK **não** envia nada automaticamente — nem instalação, nem abertura de app, nem tela | Princípio 0.1 levado a sério. Consequência: a plataforma não sabe quantas pessoas abriram o app, só quantas fizeram algo declarado | Se quiser saber quem abriu o app, isso é um evento declarado como qualquer outro (`app_aberto`) e a skill de instrumentação deve sugeri-lo por padrão. **Este é o item mais importante da seção** |
| 21.9 | Um único ambiente por projeto (sem separação dev/produção) | Simplicidade. Hoje o teste do dono se mistura ao uso real, e isso já é um problema observado | Se quiser separar, o caminho barato é criar dois projetos (`agenda-psi` e `agenda-psi-dev`) em vez de campo de ambiente |

---

## 22. Perguntas abertas

Diante de qualquer item desta seção, o agente de código **pergunta em vez de assumir**.

| # | Pergunta | Quem decide | Até quando |
|---|---|---|---|
| 22.1 | **Preço.** A estrutura está definida (11.15: grátis = 1 projeto e 1 mês; pago = ilimitado e 12 meses), mas o valor em USD não. Precisa sair antes de construir o checkout | Alexandre | Antes da v2 (F10). **Não bloqueia a v1** |
| 22.6 | Quem redige o contrato de operação e a política de privacidade aceitos no cadastro? Sem eles a conta de terceiro não pode ser aberta (seção 17.2) | Alexandre | Antes de abrir o cadastro público |
| 22.2 | **Domínio** do produto, e se o nome muda antes de uma eventual publicação. O nome de trabalho está definido: Visão de Produto, identificador curto `visao` | Alexandre | Antes de publicar o SDK no npm |
| 22.3 | Como a spec SDD declara suas features, para viabilizar a cobertura (F8)? Precisa de uma seção com identificador estável por feature | Alexandre | Antes de iniciar a v2 |
| 22.4 | O Agenda Psi e o Swim migram para a plataforma ou continuam no PostHog em paralelo? Migrar exige nova versão nas lojas | Alexandre | Antes do épico 8.3 |
| 22.5 | O evento `swim_geracao de treino` é renomeado (violando a regra 11.1) ou o histórico dele é abandonado? | Alexandre | Na migração |

---

## 23. Definition of Done

### Funcional
- [ ] Todos os critérios de aceite dos épicos 8.1 a 8.7 verificados um a um.
- [ ] Um app real da Dab Lab enviando eventos em produção há pelo menos 7 dias.
- [ ] A pergunta "o que aconteceu no app essa semana" respondida corretamente pelo Claude via MCP, sem o usuário citar nome de evento.

### Banco e código
- [ ] Banco inteiramente em português, `snake_case`, sem uma tabela ou coluna fora do padrão.
- [ ] Todas as funções, hooks, rotas, triggers e políticas comentadas em português, citando a seção do spec que implementam.
- [ ] `pnpm typecheck` e `pnpm lint` sem erro.
- [ ] Suíte de testes da seção 19 verde.

### Documentação
- [ ] `DOCUMENTACAO-TECNICA.md` gerado, com os seis itens da seção 16, conferido contra o sistema implementado.
- [ ] `CLAUDE.md` criado com convenções, arquitetura, comandos e pegadinhas.
- [ ] `README.md` com setup local, variáveis de ambiente e migrations.
- [ ] `schema.sql` gerado do banco real.

### Segurança e privacidade
- [ ] `get_advisors` (segurança **e** performance) rodado após a última DDL, sem alerta crítico pendente.
- [ ] Teste confirmando que `anon` não lê nenhuma tabela.
- [ ] Teste confirmando que a tool `consulta` rejeita `insert`, `update`, `delete` e `drop`.
- [ ] Nenhuma chave de serviço presente em bundle de cliente (verificado por busca no build).
- [ ] Verificado que nenhum evento gravado contém campo que o app não enviou (princípio 0.1).

### Não-funcional
- [ ] Ingestão de lote de 100 abaixo de 500 ms de CPU.
- [ ] Tela de Atividade abaixo de 1,5 s com 100 mil eventos semeados.
- [ ] SDK testado offline: 30 eventos capturados sem rede chegam exatamente 30 ao religar.

---

## 24. Próximos passos operacionais

1. **Revisar a seção 21**, com atenção especial à assunção 21.8 — ela determina se a plataforma consegue ou não responder "quantas pessoas abriram o app".
2. **Decidir o domínio** (pergunta 22.2). O nome de trabalho já está definido — Visão de Produto; falta só onde ele mora.
3. Criar o projeto no Supabase **já no plano Pro** (risco R4) e o repositório. Habilitar o provedor Google no Supabase Auth antes do épico 8.1.
4. Implementar na ordem dos épicos: banco primeiro (8.1), depois ingestão (8.2), SDK (8.3), telas (8.4 e 8.5), MCP (8.6) e CLI/skills (8.7).
5. Instrumentar a própria plataforma (seção 18) assim que o SDK existir.
6. Apontar o primeiro app da BBZ — aplicativo web, deploy imediato, sem loja.
7. Depois de 30 dias, avaliar o risco R1 contra as métricas da seção 18 e decidir se continua.

---

## 25. Roadmap: próximas releases

### v2 — abertura e cobertura

- **F10 — Cobrança autosserviço (a prioridade da v2).** Stripe Checkout para assinar, webhooks para sincronizar o estado do plano, e o Portal do Cliente da Stripe para trocar cartão, ver faturas e cancelar — tudo sem o dono da plataforma no meio (princípio 0.6). **Cobrança em USD, global, com Stripe Tax**: sem NFS-e por prefeitura, sem ISS municipal, que é exatamente a gestão que este produto quer evitar (risco R10). O gatilho é projetos e retenção, nunca volume de eventos (regra 11.15). A medição (`uso_mensal`) e o `stripe_cliente_id` já existem desde a v1, então isto é adição, não reescrita. Depende de 22.1 (preço) e 22.6 (contrato de operação).
- **Cadastro público.** Abrir o autocadastro para além do dono. Exige: contrato de operação e política de privacidade aceitos no cadastro, aplicação dos limites da regra 11.15, e rate limit por chave de ingestão. Tecnicamente já está pronto desde a v1 — o que falta é jurídico e comercial, não código.
- **F4 — Múltiplas pessoas por conta:** convites, papéis (`dono`, `membro`, `leitor`), permissão por projeto. A tabela `usuarios_conta` e o enum `papel_conta` já existem; a mudança é inserir linha, não alterar esquema.
- **F8 — Cobertura contra a spec.** A funcionalidade mais diferenciada da plataforma, e a razão pela qual ela não é apenas um PostHog menor. A plataforma lê a spec SDD do app, extrai as features entregues, cruza com o catálogo e responde: *"das 18 features desta spec, 9 estão instrumentadas, 6 tiveram uso nos últimos 30 dias, 3 estão instrumentadas e ninguém tocou, e 9 nunca foram instrumentadas."* Isso responde a pergunta que nenhuma ferramenta de analytics consegue responder — porque todas elas só conhecem o evento que chegou, e nenhuma sabe o que foi entregue. **Depende de 22.3.** Exige: seção de features com identificador estável na spec, tabela `features` ligada a `definicoes_evento`, tela de Cobertura e tool `cobertura` no MCP.
- **F5 — SDKs nativos** para Flutter e Python.
- **F9 — Resolução de identidade:** costurar `distinct_id` anônimo ao identificado quando o usuário loga, retroativamente.
- **F7 — Resumo semanal automático:** um parágrafo em prosa, entregue por e-mail toda segunda, gerado pelo mesmo motor que responde ao MCP. Formato-alvo: *"Agenda Psi, semana de 10 a 16/ago: 3 pessoas usaram o app. Sessão e pagamento seguem sendo o uso principal. Ninguém registrou despesa desde 11/ago. Das 18 features da spec, 6 estão instrumentadas e 4 tiveram uso."* No volume real dos apps da Dab Lab, este formato é mais útil que qualquer gráfico — e é o entregável que o painel não substitui.
- Rate limit por chave de ingestão (R5); exclusão de titular automatizada (seção 17.2).

### v3 — escala

- Migração de armazenamento para ClickHouse **se e somente se** o risco R8 se materializar, mantendo o contrato da seção 12.1 intacto.
- Pix e boleto via EBANX/Stripe, **se e somente se** aparecer demanda brasileira consistente que o cartão internacional não atende. Traz de volta a emissão de nota fiscal, então só com volume que justifique automatizá-la.
- Planos de time e faturamento anual.

---

## 26. Protocolo de mudanças incrementais

Depois da v1 no ar, evite que um ajuste pequeno vire reescrita:

1. **Commit de checkpoint** antes de qualquer mudança, para ter um `git diff` confiável.
2. **Não cole este spec inteiro de novo.** Cole só o trecho novo ou alterado, ou um spec adicional específico da feature.
3. Escreva a instrução **como diff**, deixando explícito que o projeto já existe e funciona.
4. **Delimite nominalmente o que não deve mudar.**
5. Peça a **lista de arquivos** que serão criados ou alterados **antes** do código, e aprove.
6. Revise o `git diff` contra o plano aprovado. Arquivo que passou do escopo é revertido, e o pedido é refeito mais específico.
7. Exija a atualização do `DOCUMENTACAO-TECNICA.md` **no mesmo commit**.

### Modelo de prompt para mudança incremental

```
O projeto Visão de Produto já existe, está implementado e funcionando. Leia o CLAUDE.md
e o DOCUMENTACAO-TECNICA.md antes de qualquer coisa.

MUDANÇA PEDIDA:
<descreva apenas o que muda>

NÃO DEVE MUDAR:
<liste nominalmente: esquema de X, tela Y, contrato do endpoint Z>

Antes de escrever código, me mostre:
1. a lista de arquivos que você vai criar ou alterar, com uma linha do porquê;
2. as migrations necessárias, se houver.

Aguarde minha aprovação. Depois de implementar, atualize
DOCUMENTACAO-TECNICA.md e CLAUDE.md no mesmo commit.
```

---

## Anexo — Fontes

Consultas realizadas em **16 de agosto de 2026**.

**Next.js**
- [Next.js 16.3](https://nextjs.org/blog/next-16-3) · [Next.js 16](https://nextjs.org/blog/next-16) · [npm: next](https://www.npmjs.com/package/next)

**Supabase**
- [Pricing e limites de plano](https://supabase.com/pricing)
- [Limites das Edge Functions](https://supabase.com/docs/guides/functions/limits)
- [Compute e disco](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Particionamento de tabelas](https://supabase.com/docs/guides/database/partitions)
- [pg_partman](https://supabase.com/docs/guides/database/extensions/pg_partman)
- [Otimização de query e índices BRIN](https://supabase.com/docs/guides/database/query-optimization)
- [JSON e dados não estruturados](https://supabase.com/docs/guides/database/json)
- [Deleção de dados](https://supabase.com/docs/guides/database/postgres/data-deletion)
- [Fim do suporte ao Postgres 14](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)

**Model Context Protocol**
- [Changelog da revisão 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Autorização (OAuth 2.1, RFC 9728, RFC 8707)](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [SDK TypeScript v2](https://ts.sdk.modelcontextprotocol.io/v2/) · [Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)

**Expo e SDK de referência**
- [Expo SDK 57](https://expo.dev/changelog/sdk-57)
- [PostHog React Native — parâmetros de fila e retry](https://posthog.com/docs/libraries/react-native)
