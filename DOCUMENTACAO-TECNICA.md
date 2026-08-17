# Documentação técnica — Visão de Produto

Descreve o sistema **como ele ficou**, não como foi planejado. Segue os seis itens da seção
16 do `spec.md`. Toda mudança em esquema, trigger, política ou lógica de tela atualiza este
documento **no mesmo commit**.

| | |
|---|---|
| Banco | Supabase Postgres 17.6, projeto `Visao de Produto`, ref `glohvqzopiffdghwppor`, região `sa-east-1`, plano Pro |
| Estado | Épicos 8.1 a 8.7 concluídos e verificados. Épico 8.8 (OAuth do MCP), fora do spec e decidido com o dono, concluído |
| Última atualização | 17 de agosto de 2026 |

---

## 1. Modelo de dados explicado

Dez tabelas, todas em português e `snake_case`. Timestamps são `timestamptz` e o banco
opera em UTC; a conversão de fuso acontece na apresentação (regra 11.7).

### Enums

| Enum | Valores | O que significa |
|---|---|---|
| `plano_conta` | `gratuito`, `pago` | Governa retenção e limite de projetos (regra 11.15) |
| `papel_conta` | `dono`, `membro`, `leitor` | Papel da pessoa na conta. A v1 só usa `dono`; os outros dois existem para os convites da v2 |
| `tipo_credencial` | `ingestao`, `leitura` | `ingestao` só escreve; `leitura` só lê |
| `tipo_visualizacao` | `serie_temporal`, `total_periodo`, `usuarios_unicos` | Como um tile do painel desenha o dado |
| `janela_periodo` | `7d`, `14d`, `30d`, `90d` | Janelas aceitas nas telas e no MCP |

### `contas` — a raiz do isolamento

Uma conta é o que separa os dados de uma pessoa dos de outra. Nasce sozinha no primeiro
login com Google, sem ninguém aprovar nada.

| Coluna | O que significa no negócio |
|---|---|
| `nome` | Nome da conta, preenchido com o nome do perfil do Google; editável |
| `plano` | `gratuito` ou `pago` |
| `retencao_meses` | Por quantos meses os eventos ficam **visíveis** para esta conta: 1 no gratuito, 12 no pago |
| `limite_projetos` | Quantos projetos a conta pode ter. **Nulo significa sem limite** (plano pago) |
| `stripe_cliente_id` | Reservado para a cobrança da v2. Criado agora para não exigir migration na tabela raiz depois |
| `criada_em` | Quando a conta nasceu |
| `cancelada_em` | Nulo = ativa. Preenchido, a conta está cancelada e some em 30 dias (regra 11.17) |

### `usuarios_conta` — quem é dono do quê

Liga o usuário do Supabase Auth à conta. Na v1 há sempre exatamente uma linha por conta.
Índice único em `usuario_id`: uma pessoa pertence a uma conta só.

### `uso_mensal` — a medição

Uma linha por conta e por mês. Existe para que a cobrança da v2 tenha o que faturar: não dá
para cobrar por um mês que nunca foi contado.

| Coluna | O que significa |
|---|---|
| `competencia` | Primeiro dia do mês de referência |
| `eventos_recebidos` | Quantos eventos chegaram no mês |
| `projetos_ativos` | Quantos projetos tiveram ao menos um evento |
| `pessoas_distintas` | Quantos `distinct_id` diferentes apareceram |
| `consultas_mcp` | Quantas vezes o agente consultou a plataforma. **Incrementada pelo próprio servidor MCP**, não pelo job |

### `projetos` — um por aplicativo

| Coluna | O que significa |
|---|---|
| `nome` / `slug` | "Agenda Psi" e `agenda-psi`. O slug vai na URL e na CLI, e é validado por `^[a-z0-9-]+$` |
| `descricao` | Conveniência; nulo quando ninguém escreveu |
| `prefixo_evento` | Convenção de nome do projeto, ex. `psi_`. A skill de instrumentação lê isto antes de propor nome |
| `fuso_exibicao` | Fuso usado nas telas e nas respostas do MCP. Padrão `America/Sao_Paulo` |
| `arquivado_em` | Nulo = ativo. Arquivar tira das listas e **preserva os eventos** |

### `eventos` — o que os apps declararam

Só existe aqui o que o app enviou de propósito. Nada é capturado automaticamente.

| Coluna | O que significa |
|---|---|
| `id` | UUID v4 **gerado no cliente**. É a chave de deduplicação — é o que torna o retry do SDK seguro |
| `conta_id` | Dono do evento. Desnormalizado de propósito, para a RLS filtrar sem join |
| `projeto_id` | Qual aplicativo |
| `nome` | `psi_novo_pagamento`. Formato validado pela regra 11.1 |
| `distinct_id` | Quem fez, no vocabulário do app do cliente. Frequentemente é um e-mail, e portanto dado pessoal |
| `tela` | Onde aconteceu. Nulo em evento de backend |
| `descricao` | O que o evento significa, em português. É o registro do que valia naquele momento |
| `propriedades` | Tudo o mais que o app declarou. A chave `pessoa`, se existir, alimenta `pessoas.propriedades` |
| `ocorrido_em` | Quando aconteceu **no dispositivo**. É a coluna de partição |
| `recebido_em` | Quando chegou no servidor. A diferença entre os dois revela fila offline |

Chave primária composta `(ocorrido_em, id)`, obrigatória porque a coluna de partição precisa
estar em todo índice único.

### `definicoes_evento` — o catálogo

Se popula sozinho e é editável. Um evento que parou de disparar **continua listado** — é
justamente essa a informação útil.

| Coluna | O que significa |
|---|---|
| `descricao` | A fonte de verdade editável. Uma vez preenchida, nunca é sobrescrita (regra 11.2) |
| `telas` | Todas as telas onde aquele evento já foi visto |
| `total_ocorrencias` | Contador acumulado, mantido por trigger |
| `primeira_ocorrencia_em` / `ultima_ocorrencia_em` | Quando apareceu pela primeira e pela última vez |

### `pessoas` — quem apareceu

`total_eventos`, `primeiro_visto_em` e `ultimo_visto_em` são mantidos por trigger.
`propriedades` é o merge do que o app declarou como sendo de pessoa. **Não há noção de
sessão** e a plataforma não infere uma (regra 11.11).

### `paineis` e `paineis_itens`

Um painel tem tiles. O tile referencia o evento **por nome**, não por FK: dá para fixar um
tile de evento que ainda não disparou nenhuma vez, o que acontece toda vez que uma feature
acaba de subir. `titulo` nulo significa "use a descrição do catálogo".

### `credenciais`

| Coluna | O que significa |
|---|---|
| `tipo` | `ingestao` (só escreve, num projeto só) ou `leitura` (só lê, em todos os projetos da conta) |
| `projeto_id` | Obrigatório em `ingestao`, **nulo** em `leitura`. Garantido pelo check `chk_credencial_projeto` |
| `prefixo` | Os 8 primeiros caracteres, para exibir na tela |
| `valor_hash` | SHA-256 do valor completo. **O valor em claro aparece uma única vez** |
| `ultimo_uso_em` | Atualizado no máximo 1× por minuto, para não transformar cada ingestão numa escrita extra |
| `revogada_em` | Nulo = ativa. Revogada nunca é reativada; gera-se outra |

---

## 2. Relacionamento entre as tabelas

```
contas ──┬──< usuarios_conta        (v1: sempre um)
         ├──< uso_mensal
         ├──< credenciais
         ├──< eventos               (conta_id desnormalizado)
         └──< projetos
                    │
                    ├──< eventos            (particionada por ocorrido_em)
                    ├──< definicoes_evento
                    ├──< pessoas
                    ├──< credenciais        (só as de ingestão)
                    └──< paineis ──< paineis_itens
```

- Uma **conta** tem muitos **projetos**; um projeto pertence a exatamente uma conta.
- Uma **conta** tem, na v1, exatamente um **usuário**; a tabela suporta vários desde já.
- Um **projeto** tem muitos **eventos**; todo evento pertence a exatamente um projeto — não
  existe evento sem projeto (regra 11.3).
- Um **projeto** tem um **catálogo**: cada nome de evento aparece uma vez só ali.
- Um **projeto** tem muitas **pessoas**; cada `distinct_id` aparece uma vez por projeto.
- Um **painel** tem muitos **tiles**; apagar o painel apaga os tiles junto.
- Uma **credencial de ingestão** pertence a um projeto; uma **de leitura** não pertence a
  nenhum, e vale para todos os projetos da conta.

Todas as FKs para `contas` e `projetos` são `on delete cascade`: é o que faz o expurgo de
conta cancelada (regra 11.17) apagar tudo em um comando.

---

## 3. Regras de negócio que vivem no banco

### Funções e triggers

| Nome | Tabela / quando | O que faz |
|---|---|---|
| `fn_valida_nome_evento(text)` | check `chk_nome_evento` em `eventos` e `chk_definicao_nome` em `definicoes_evento` | Valida `^[a-z][a-z0-9_]{2,63}$` (regra 11.1). Espaço é rejeitado |
| `fn_atualiza_definicao_evento()` | `trg_eventos_definicao`, AFTER INSERT FOR EACH ROW em `eventos` | Mantém o catálogo: cria a definição, incrementa `total_ocorrencias`, ajusta primeira e última ocorrência com `least`/`greatest` (evento pode chegar fora de ordem), acrescenta a tela ao array, e preenche a descrição **só quando está nula** (regra 11.2) |
| `fn_atualiza_pessoa()` | `trg_eventos_pessoa`, AFTER INSERT FOR EACH ROW em `eventos` | Mantém `pessoas`: cria, incrementa `total_eventos`, ajusta primeiro e último visto, e faz merge de `propriedades->'pessoa'` |
| `fn_cria_conta_no_cadastro()` | `trg_usuario_criado_cria_conta`, AFTER INSERT em `auth.users` | Cria a conta no plano gratuito com o nome do perfil do Google e vincula o usuário como `dono` (seção 5.2, princípio 0.6) |
| `fn_agrega_uso_mensal()` | job `agrega_uso_mensal`, diário 04:00 UTC | Recalcula `uso_mensal` do mês corrente por conta. Não toca em `consultas_mcp` |
| `fn_expurga_contas_canceladas()` | job `expurga_contas_canceladas`, diário 04:30 UTC | Apaga em cascata as contas com `cancelada_em` há mais de 30 dias (regra 11.17) |
| `fn_poda_cron_historico()` | job `poda_cron_historico`, domingos 05:00 UTC | Apaga `cron.job_run_details` com mais de 30 dias |
| `fn_protege_particoes_eventos()` | chamada pelo job de manutenção | Habilita RLS e revoga `anon`/`authenticated` em cada partição de `eventos` |
| `fn_manutencao_particoes()` | job `manutencao_particoes`, diário 03:00 UTC | Roda `partman.run_maintenance_proc()` e protege as partições criadas |
| `fn_contas_do_usuario()` | usada pelas políticas | Devolve os ids de conta do usuário autenticado. `SECURITY DEFINER` para não haver recursão de RLS |
| `fn_projetos_do_usuario()` | usada pelas políticas | Devolve os projetos das contas do usuário |
| `fn_paineis_do_usuario()` | usada pela política de `paineis_itens` | Devolve os painéis dos projetos do usuário |
| `fn_consulta_leitura(text, uuid)` | tool `consulta` do MCP | Executa o SELECT do agente **com o papel `visao_mcp_leitor`**, filtrado pela conta do token e limitado a 500 linhas |
| `fn_valida_token_leitura(text)` | Edge Function `mcp` | Encontra o token de leitura ativo pelo hash e devolve a conta. Zero linhas = 401. Marca `ultimo_uso_em` no máximo 1× por minuto |
| `fn_registra_consulta_mcp(uuid)` | Edge Function `mcp` | Soma 1 em `uso_mensal.consultas_mcp` do mês corrente |
| `fn_valida_chave_ingestao(text)` | Edge Function `ingest` | Encontra a credencial de ingestão ativa pelo hash e devolve conta e projeto. Zero linhas = 401. Marca `ultimo_uso_em` no máximo 1× por minuto |
| `fn_ingere_eventos(uuid, uuid, jsonb)` | Edge Function `ingest` | Grava o lote inteiro em **uma** instrução INSERT multi-row com `on conflict do nothing`, e devolve quantos entraram de fato |

### Particionamento e retenção

`eventos` é particionada por range em `ocorrido_em`, intervalo de **7 dias**, mantida pelo
`pg_partman` 5.3. Existem 7 partições futuras pré-criadas, partições cobrindo os 28 dias
anteriores, e uma partição `default` para o que chegar fora dessas faixas. A retenção
física é de **12 meses** com `retention_keep_table = false` — a exclusão é `DROP` de
partição, instantâneo, sem bloat e sem `VACUUM FULL`. A janela **visível** por conta é
`contas.retencao_meses` e é aplicada na consulta (regras 11.8 e 11.18).

### Políticas de RLS

RLS habilitada em **todas** as dez tabelas e em **todas** as partições de `eventos`.
Nenhuma política usa `using (true)`.

| Tabela | Política | Papel | Comandos | Predicado |
|---|---|---|---|---|
| `contas` | `contas_dono_total` | `authenticated` | select, update (privilégio) | `id in (fn_contas_do_usuario())` |
| `usuarios_conta` | `usuarios_conta_dono_leitura` | `authenticated` | select | `conta_id in (fn_contas_do_usuario())` |
| `uso_mensal` | `uso_mensal_dono_leitura` | `authenticated` | select | `conta_id in (fn_contas_do_usuario())` |
| `projetos` | `projetos_dono_total` | `authenticated` | all | `conta_id in (fn_contas_do_usuario())` |
| `eventos` | `eventos_dono_leitura` | `authenticated` | select | `conta_id in (fn_contas_do_usuario())` |
| `definicoes_evento` | `definicoes_dono_total` | `authenticated` | select, insert, update (privilégio) | `projeto_id in (fn_projetos_do_usuario())` |
| `pessoas` | `pessoas_dono_leitura` | `authenticated` | select | `projeto_id in (fn_projetos_do_usuario())` |
| `paineis` | `paineis_dono_total` | `authenticated` | all | `projeto_id in (fn_projetos_do_usuario())` |
| `paineis_itens` | `paineis_itens_dono_total` | `authenticated` | all | `painel_id in (fn_paineis_do_usuario())` |
| `credenciais` | `credenciais_dono_total` | `authenticated` | all | `conta_id in (fn_contas_do_usuario())` |
| `projetos` | `projetos_mcp_leitura` | `visao_mcp_leitor` | select | `conta_id = current_setting('visao.conta_id')` |
| `eventos` | `eventos_mcp_leitura` | `visao_mcp_leitor` | select | idem |
| `definicoes_evento` | `definicoes_mcp_leitura` | `visao_mcp_leitor` | select | `projeto_id in (select id from projetos)` |
| `pessoas` | `pessoas_mcp_leitura` | `visao_mcp_leitor` | select | idem |

**A separação entre política e privilégio é proposital.** A matriz da seção 5.1 diz que a
sessão do dono lê eventos mas não escreve; isso é garantido pelo `GRANT` (só `select` em
`eventos` e `pessoas`; sem `delete` em `definicoes_evento`), enquanto a política cuida de
*quais linhas*. Assim o nome de política do spec é preservado sem abrir comando que a
matriz não autoriza.

`anon` teve **todos** os privilégios revogados nas dez tabelas: acesso anônimo falha por
permissão, não devolve zero linhas.

---

## 4. Mapa tela → tabelas

| Tela | Lê | Escreve | Por quais políticas passa |
|---|---|---|---|
| **Login** | — | — | nenhuma. É a única rota pública, junto com o callback do Google |
| **Projetos** | `projetos`, `eventos` (via `fn_resumo_projetos`) | `projetos` (criar e arquivar) | `projetos_dono_total`, `eventos_dono_leitura` |
| **[Projeto] Atividade** | `projetos`, `eventos`, `definicoes_evento`, `pessoas` (via `fn_atividade` e `fn_opcoes_de_filtro`) | — | `projetos_dono_total`, `eventos_dono_leitura`, `definicoes_dono_total`, `pessoas_dono_leitura` |
| **[Projeto] Detalhe do evento** | nada de novo: o evento já veio na lista | — | — |
| **[Projeto] Atividade, estado vazio** | `credenciais` (só `prefixo`) | — | `credenciais_dono_total` |
| **[Projeto] Uso** | `definicoes_evento`, `eventos` (via `fn_uso_por_evento`) | — (exporta em CSV) | `definicoes_dono_total`, `eventos_dono_leitura` |
| **[Projeto] Painel** | `paineis`, `paineis_itens`, `definicoes_evento`, `eventos` (via `fn_serie_do_evento`) | `paineis`, `paineis_itens` | `paineis_dono_total`, `paineis_itens_dono_total` |
| **[Projeto] Pessoas** | `pessoas` (via `fn_pessoas`), `eventos` (via `fn_atividade`) | — | `pessoas_dono_leitura`, `eventos_dono_leitura` |
| **[Projeto] Catálogo** | `definicoes_evento` (via `fn_catalogo`) | `definicoes_evento.descricao` | `definicoes_dono_total` |
| **[Projeto] Configurações** | `projetos`, `credenciais` | `projetos`, `credenciais` | `projetos_dono_total`, `credenciais_dono_total` |
| **Credenciais MCP** | `credenciais` | `credenciais` | `credenciais_dono_total` |
| **Exportação CSV / JSON** | tudo que é da conta | — | todas as políticas de leitura |
| **Menu lateral** | `projetos` | — | `projetos_dono_total` |

As funções `fn_resumo_projetos`, `fn_atividade` e `fn_opcoes_de_filtro` são SECURITY
INVOKER: rodam com o papel de quem chamou, então as políticas acima continuam valendo
dentro delas. Nenhuma tela usa `service_role`.

---

## 5. Lógica das principais funcionalidades

### 5.1 — Endpoint de ingestão (`POST /functions/v1/ingest`)

Não é tela, mas é onde vive a maior parte da validação do produto. Publicado como Edge
Function com `verify_jwt` **desligado**: quem autentica é a própria função, pela chave de
projeto no header `x-api-key` (regra 5.1.3 — a chave é pública por natureza, vai embutida
em app de loja e em bundle de front-end).

Ordem exata do que acontece:

1. `OPTIONS` responde o preflight de CORS. O endpoint precisa ser chamável de navegador.
2. Sem header `x-api-key` → **401** `credencial_invalida`. Nunca 403.
3. Corpo que não é JSON, ou sem a lista `eventos` → **400** `corpo_invalido`.
4. Mais de 100 eventos → **400** `lote_excedido`. O tamanho é conferido **antes** de
   consultar o banco, para que um lote absurdo não custe uma consulta.
5. A chave é convertida em SHA-256 e procurada por `fn_valida_chave_ingestao`. Sem
   resultado — chave desconhecida ou revogada — → **401** `credencial_invalida`. É a chave
   que determina conta e projeto; um `projeto_id` que venha no corpo nem chega a ser lido
   (regra 11.5).
6. Cada evento é validado sozinho. Inválido entra em `rejeitados` com `id`, `campo` e
   `motivo`, e **não derruba o lote**. São verificados: `id` (UUID obrigatório), `nome`
   (regra 11.1), `distinct_id` (obrigatório e não vazio), `ocorrido_em` (ISO 8601 válido),
   e os tipos de `tela`, `descricao` e `propriedades`.
7. Regra 11.6: `ocorrido_em` a mais de 48 h no futuro é substituído pelo instante de
   recebimento. O evento é aceito, e não rejeitado — relógio errado é problema do
   dispositivo, não do usuário.
8. Ids repetidos **dentro do mesmo lote** são contados como duplicados antes de ir ao
   banco, e não como erro.
9. Os aceitos vão em uma única chamada a `fn_ingere_eventos`, que faz um INSERT multi-row
   com `on conflict do nothing` (regra 11.4) e devolve quantos entraram.
10. Resposta **202** com `{ aceitos, duplicados, rejeitados }`. `duplicados` é o que foi
    enviado, não foi rejeitado e mesmo assim não gravou — ou seja, já existia.

**Onde cada validação mora:** formato de nome e forma do payload são validados na Edge
Function (para poder dizer *qual* evento e *por quê*) e de novo no banco, pelo check
`chk_nome_evento` (para que nada entre por outro caminho). A deduplicação mora só no banco,
na chave primária. A resolução do projeto mora só no banco, na função da credencial.

### 5.2 — SDK `@dablab/visao`

Quatro funções: `init`, `identify`, `track` e `flush`. Zero dependências de runtime e
nenhum módulo nativo — o pacote é só TypeScript compilado para ESM.

**O que acontece em cada `track`:** o nome é validado pela regra 11.1 no cliente (para o
erro aparecer no console de quem instrumentou, e não numa lista de rejeitados que ninguém
lê); o `id` UUID v4 e o `ocorrido_em` são carimbados naquele instante; o evento entra na
fila e a função devolve na hora, sem `await`. Quando a fila chega a `flushAt` (20), o envio
dispara sozinho; um cronômetro de `flushInterval` (10 s) cobre o resto.

**Fila:** persistida a cada `track` e a cada envio bem-sucedido. Ao passar de
`maxQueueSize` (1.000), os mais antigos saem. O envio quebra a fila em lotes de até
`maxBatchSize` (100). Falha de rede rende 3 tentativas espaçadas de 3 s e depois devolve o
lote à fila — nada se perde. Resposta 4xx que não é 429 descarta o lote com erro no
console: reenviar uma chave inválida não a torna válida.

**Onde a fila mora:** `localStorage` no navegador, memória no Node, e o que o app passar em
`init({ storage })` no React Native. O SDK não importa AsyncStorage porque importar
significaria depender de módulo nativo, o que o critério do épico 8.3 proíbe.

**O que o SDK não faz:** não envia absolutamente nada por conta própria. Sem evento de
instalação, de abertura de app ou de tela (assunção 21.8, confirmada com o dono). Para
saber quantas pessoas abriram o app, instrumenta-se `app_aberto` como qualquer outro
evento — e é isso que a skill de instrumentação sugere por padrão.

### 5.3 — Servidor MCP (`POST /functions/v1/mcp/mcp`)

Edge Function com `verify_jwt` desligado: quem autentica é ela, pelo token de leitura no
header `Authorization: Bearer mcp_…`. Sem token ou com token revogado, **401**.

Cada requisição monta um servidor MCP novo, sem sessão, com a conta do token **fechada por
closure**: nenhuma tool recebe conta por parâmetro, então não existe forma de o agente
pedir dado de outra conta. O slug de projeto é sempre resolvido dentro da conta do token —
é aí que mora o isolamento.

As cinco tools da seção 12.2 respondem em texto curto e legível, e **toda resposta que cita
evento cita a descrição junto** (princípio 0.2). `atividade_recente` sem limite devolve no
máximo 50 eventos, para não estourar o contexto do agente.

`consulta` passa por duas barreiras, como manda a seção 17.3: um validador que exige uma
única instrução começando em `select`, recusa palavras de escrita e recusa tabela fora das
quatro permitidas; e, depois dele, a função `fn_consulta_leitura`, cujo dono é o papel
`visao_mcp_leitor` — que não tem permissão de escrita nenhuma no banco. Validação de string
sozinha não é controle de acesso.

Cada chamada incrementa `uso_mensal.consultas_mcp` da conta, sem bloquear a resposta.

### 5.4 — CLI `npx visao init`

Reconhece o repositório sozinho — tipo de app pelas dependências, gerenciador pelo arquivo
de lock, nome pelo `package.json` — e faz **uma** pergunta: o nome do projeto (princípio 0.5).

A autorização acontece **no navegador**, e não por token colado: a CLI abre uma porta local,
manda o dono para `/cli/autorizar`, e o site cria o projeto com a sessão dele. O que volta
para o terminal são as duas credenciais que o produto já define — a chave de ingestão e o
token de leitura. Nenhuma credencial de dono fica em disco. O `estado` sorteado pela CLI
volta junto e é conferido, para a resposta não poder vir de outra aba.

Com as credenciais em mãos, a CLI instala o SDK, grava `VISAO_API_KEY` e `VISAO_HOST` no
`.env` (em Expo, com o prefixo `EXPO_PUBLIC_`, que é o único que chega ao app), garante o
`.env` no `.gitignore`, cria o arquivo de inicialização no lugar certo para o tipo de app,
e registra o servidor MCP em cada cliente de agente que encontrar — sempre guardando cópia
de segurança do arquivo antes de mexer.

### 5.5 — OAuth do MCP (épico 8.8, fora do spec v1)

A janela "Add custom connector" do Claude só fala OAuth: não tem campo para token. Sem
isto, instalar o MCP exigiria editar JSON à mão, o que arranha o princípio 0.6. As duas
portas passam a existir — arquivo de configuração para quem usa terminal, OAuth para quem
só tem o app.

**Quem é quem:** o servidor MCP (Supabase) é o *recurso protegido*; o site (Vercel) é o
*servidor de autorização*. O MCP responde 401 com
`WWW-Authenticate: Bearer resource_metadata="…"`, e esse documento (RFC 9728) aponta para o
site.

**O fluxo, em quatro passos:** o cliente se registra sozinho em `/oauth/registrar`
(RFC 7591, cliente público, sem segredo); manda a pessoa para `/oauth/autorizar`, que exige
sessão e mostra o que o token vai poder e não poder fazer; recebe um código que vive dez
minutos; e troca esse código em `/oauth/token` provando o PKCE com S256. Código já usado é
recusado, e o expurgo horário limpa o resto.

**O que o OAuth NÃO muda:** o token emitido é uma linha comum de `credenciais` do tipo
`leitura` — mesmo hash, mesmo nome na tela de Credenciais MCP, mesma revogação em um
clique, mesma regra 5.1.2 de nunca escrever. O OAuth é a forma de entregar o token, não um
poder novo.

**Duas armadilhas que custaram deploy:** dentro do runtime da Edge Function a requisição
chega como `http://edge-runtime.supabase.com`, então montar a URL a partir do request gera
um documento OAuth inválido — a origem vem de `SUPABASE_URL`. E `www-authenticate` precisou
entrar no `access-control-expose-headers`, senão o navegador esconde do cliente justamente
o cabeçalho que diz por onde começar.

### 5.6 — Telas

As telas de projeto (Atividade, Uso, Painel, Pessoas, Catálogo, Configurações) seguem o
inventário da seção 10 e o mapa da seção 4 acima. O grupo **Conta** tem cinco telas:

| Tela | Rota | O que faz | O que lê e escreve |
|---|---|---|---|
| Perfil | `/conta/perfil` | Quem está logado, dados da conta, medição do mês e a zona de perigo | Lê `usuarios_conta`, `contas`, `projetos`, `eventos` e `uso_mensal`; escreve `contas.nome` e `contas.cancelada_em` |
| Credenciais MCP | `/conta/credenciais` | Tokens de leitura e as duas formas de conectar o Claude | Lê e escreve `credenciais` |
| Sobre o produto | `/conta/sobre` | O que a plataforma faz, para quem, e um exemplo de consulta pelo Claude | Nada — conteúdo estático |
| Como usar | `/conta/como-usar` | Sete passos, do projeto vazio ao primeiro gráfico | Nada do banco; reaproveita `TrechosDeInstalacao` para o contrato de API não divergir entre telas |
| Termos e privacidade | `/conta/termos` | Termos de uso e política de privacidade | Nada — conteúdo estático |

O texto de **Termos e privacidade** foi redigido a partir do que está implementado: os prazos
citados são os das regras 11.15, 11.17 e 11.18, a lista de campos é a da seção 17.1 e os
subprocessadores são os três que existem de fato (Supabase, Vercel e Google). **Não passou por
revisão jurídica** — a pergunta 22.6 do spec continua aberta e precisa ser fechada antes de o
cadastro público ser aberto a terceiros.

O **cancelamento da conta** é escrita direta em `contas.cancelada_em` pela sessão, com a
política `contas_dono_total` limitando o alcance. Nada é apagado no ato: quem apaga é
`fn_expurga_contas_canceladas()`, 30 dias depois, em cascata. Reativar é a mesma escrita com
`null`.

---

## 6. Divergências em relação ao spec

Numeração estável — não renumere.

| # | Ponto | O que o spec/tela diz | O que foi feito | Por quê |
|---|---|---|---|---|
| 1 | Configuração do MCP | O mock mostra servidor local por `npx` e stdio | Servidor **remoto** por Streamable HTTP | Já resolvido pelo próprio spec na seção 4.4: servidor local exigiria credencial de banco na máquina de quem usa |
| 2 | Nomes de evento do mock | `psi_sessao_agendada`, `psi_prontuario_editado` etc. | Nenhum entra no produto | São dados falsos (seção 4.4) |
| 3 | Nome do pacote | Mock diz `@dablab/analytics` | `@dablab/visao` | Seção 4.4 |
| 4 | Tela de Login | Mock desenha e-mail e senha | Um botão "Entrar com Google", mesmo enquadramento e 352px | Seções 4.4 e 6.1. Não existe senha no produto |
| 5 | Configurações do projeto | Mock não tem exportação | Ganha a ação "Exportar dados" | Seção 13.4 (item D11) |
| 6 | Critério de aceite do 8.4 | "Login com e-mail e senha leva à lista de projetos" | Login com Google | O próprio spec se contradiz: 6.1 e 4.4 dizem que Google é o único método, e são mais específicos |
| 7 | Fluxo 9.1, passo 5 | "adiciona a chamada `capture()`" | `track()` | O spec chama a assinatura do 8.3 de "definitiva", e ela usa `track` |
| 8 | Tabela `configuracoes` | Citada na tabela de RLS (6.2) e no seed (7.11) | **Não foi criada** | A seção 7 e o `.dbml` não definem nenhuma coluna dela. O que ela guardaria — o usuário dono — passou a viver em `usuarios_conta` na v1.2. Criá-la seria inventar esquema |
| 9 | `contas.limite_projetos` | Seção 7.9 marca a coluna como `not null` e diz que "`null` significa sem limite" | Coluna **anulável**, default 1 | As duas frases se contradizem. Preservada a semântica descrita, que é a que a regra 11.15 usa |
| 10 | Proteção das partições | O spec só pede RLS "em todas as tabelas" | RLS **e** revoke de privilégios em cada partição de `eventos`, reaplicados a cada manutenção | Verificado na prática: partição é tabela própria no schema `public`, e portanto endpoint do PostgREST. Sem isso, `select * from eventos_p20260817` devolveria evento de qualquer conta a qualquer usuário autenticado |
| 11 | Propriedades de pessoa | 7.6 diz "merge das propriedades marcadas como de pessoa pelo SDK", sem definir como são marcadas | O SDK grava o que foi passado em `identify()` dentro de `propriedades.pessoa`, e a trigger faz merge dessa chave | O contrato da seção 12.1 não tem campo para propriedade de pessoa. Usar uma chave declarada dentro de `propriedades` mantém o princípio 0.1: o dado continua sendo o que o app enviou de propósito |
| 12 | `uso_mensal.consultas_mcp` | 7.10 diz que o job diário preenche as quatro dimensões | O job preenche três; `consultas_mcp` é incrementada pelo próprio servidor MCP a cada chamada | Não existe tabela de log de consulta no modelo, e criar uma para contar chamada seria complexidade prematura (princípio 0.4) |
| 13 | Corpo malformado na ingestão | A tabela da seção 12.1 põe "JSON malformado" na mesma linha do código `lote_excedido` | JSON malformado responde **400 `corpo_invalido`**; `lote_excedido` fica só para lote acima de 100 | Um único código para dois problemas diferentes faria o cliente ler "lote excedido" quando o que houve foi JSON quebrado. O critério de aceite do épico 8.2 só fixa o caso do lote de 101, que continua respondendo `lote_excedido` |

| 14 | Persistência da fila em React Native | A tabela do épico 8.3 diz "AsyncStorage (RN)", e o mesmo épico exige funcionar no Expo SDK 57 **sem módulo nativo** | O SDK não importa AsyncStorage; `init` aceita um `storage` opcional, e em RN o app passa o AsyncStorage ali. A CLI escreve essa linha sozinha ao detectar Expo | As duas exigências se chocam: AsyncStorage **é** módulo nativo. Recebê-lo do app mantém a persistência pedida e o pacote sem dependência nativa. Sem storage em RN, o SDK avisa no console que a fila é só de memória |
| 15 | `track` antes de `identify` | O spec não diz o que fazer | O evento **não é enviado**, com erro explicativo no console | A v1 não tem fluxo anônimo (F9 é v2) e o contrato exige `distinct_id`. Gerar um identificador anônimo seria a plataforma criando dado que o app não declarou, contra o princípio 0.1 |

| 16 | Chave no estado vazio da Atividade | O mock imprime a chave inteira (`ing_a3f8_9c21d4e77b0a5f36`) | Aparece só o **prefixo**, com o caminho para gerar outra | O valor completo é mostrado uma única vez, na criação (seção 6.3). O banco guarda apenas o hash, então a tela não teria como imprimir a chave nem se quisesse |
| 17 | Paginação da Atividade | "A lista pagina por rolagem infinita, 50 por página" | Rolagem infinita **mais** um botão "Carregar mais 50 eventos" | A rolagem continua carregando sozinha. O botão foi acrescentado porque rolagem infinita pura é inacessível por teclado (seção 14 exige navegação por teclado na tabela de Atividade) e porque dá um alvo de 44px |

| 18 | Exportação JSON da conta | A seção 13.4 fala em link assinado com validade de 24 h | O arquivo é servido direto no request | No volume da v1 o JSON sai em um request. Link assinado exigiria bucket, expiração e limpeza — peças que só se pagam acima das 100 mil linhas que a própria seção 13.4 usa como divisor (princípio 0.4) |

| 19 | Adaptador do MCP | A seção 4.1 lista `@modelcontextprotocol/server` **+ `/hono`** | Só `@modelcontextprotocol/server@2.0.0`, com `createMcpHandler` | O `/hono` é pacote separado (`@modelcontextprotocol/hono`) e serve para apps Hono. A Edge Function já fala Fetch nativo, e o handler do próprio SDK aceita `Request` e devolve `Response` — uma dependência a menos (princípio 0.4) |
| 20 | Descrição exibida na Atividade | A seção 7.4 diz que a coluna em `eventos` é "o registro do que valia no momento" e a 7.5 diz que o catálogo é "a fonte de verdade editável" | A exibição usa **a do catálogo primeiro**, com a do evento como reserva | A primeira versão fazia o contrário, e o dono editava a descrição sem ver efeito na Atividade — o que contradiz a promessa escrita na tela de Catálogo ("passa a aparecer em todas as telas"). Encontrado lendo a resposta do MCP, corrigido na migration 0015 |

| 21 | Autorização da CLI | O fluxo do épico 8.7 diz "pede o token do dono uma vez" | A CLI abre o navegador e o dono autoriza com um clique | Não existe tipo de credencial de dono no modelo (o enum tem `ingestao` e `leitura`, seção 7.2), e criar um terceiro tipo para viver em disco seria a pior das opções. Com o handshake pelo navegador, o token de dono nunca existe |

| 22 | Trecho de instalação nas telas | O mock e o critério do 8.4 mostram só o trecho do SDK | As telas mostram **duas abas**: "Com o SDK" e "Direto pela API", com o `curl` equivalente | O SDK é conveniência; o contrato estável é o REST da seção 12.1, e a assunção 21.2 já previa que quem não é JavaScript usa a API direta. Sem a segunda aba, quem usa Flutter, Python ou n8n não descobre que dá — e é o caminho mais simples para quem não quer instalar pacote |

| 23 | Onde a exportação fica | A seção 13.4 diz que o CSV "respeita o filtro aplicado na tela", sem dizer onde fica o botão | O botão está **na Atividade**, junto dos filtros, e leva o recorte da URL. A tela de Uso ganhou um CSV próprio, e as Configurações continuam com os dois links | Botão de exportar longe do filtro exportaria uma coisa enquanto a tela mostra outra. O CSV da tela de Uso é adição: é a lista que se leva para uma reunião, com o zero explícito dentro |

| 24 | Cor primária | A seção 13.2 fixa índigo `#6e7cf7` no escuro e `#4a56cf` no claro, com a instrução "use exatamente estes valores" | **Azul de sistema da Apple**: `#0a84ff` no escuro, `#007aff` no claro | Decisão do dono, que é quem aprovou a paleta original. Os demais tokens da 13.2 continuam intactos, e a troca foi feita só nas duas variáveis — nenhuma cor foi escolhida fora delas. O ícone acompanha |
| 25 | A palavra "tile" | O mock e as regras 11.9 e 7.7 usam "tile" | A interface diz **"gráfico"**: "Adicionar gráfico", "Gráficos fixados do catálogo" | A seção 13.3 deixa a copy livre, e "tile" não diz nada para quem chega. No banco e no código o nome continua `paineis_itens`, que é o vocabulário do spec |
| 26 | Tela de Credenciais MCP | A seção 12.3 pede o bloco de configuração copiável | O bloco continua, agora dentro de um cartão **"Como conectar o Claude"** com dois caminhos em passos: pelo aplicativo (OAuth) e por arquivo, com o caminho do arquivo em cada sistema | Bloco de JSON sem instrução não é autosserviço (princípio 0.6): a tela mostrava a configuração sem dizer o que fazer com ela, e quem não é do ramo não descobria |

| 27 | Telas do grupo Conta | A seção 10 inventaria só "Credenciais MCP" dentro de Conta | O grupo ganhou **Perfil**, **Sobre o produto**, **Como usar** e **Termos e privacidade** | Pedido do dono. Nenhuma delas inventa dado ou regra: "Sobre" e "Como usar" são a seção 1, a 2 e o fluxo 9.1 escritos em linguagem de usuário; "Termos" é a seção 17 na voz de quem lê; e "Perfil" só expõe `contas`, `usuarios_conta` e `uso_mensal`, que já existiam sem tela. O princípio 0.6 pedia isso: cancelar a conta era regra implementada (11.17) sem nenhum caminho na interface — funcionalidade que exigia alguém do outro lado |
| 28 | Cancelamento da conta | A regra 11.17 descreve o comportamento e o job de expurgo, mas não diz onde a pessoa pede | Zona de perigo no **Perfil**, com confirmação digitada (`APAGAR`), contagem do que será apagado, e faixa de aviso no topo de **todas** as telas enquanto a conta estiver marcada | Os 30 dias existem para a pessoa poder mudar de ideia, e mudar de ideia só é possível se ela lembrar que pediu — daí a faixa global. A confirmação digitada existe porque, depois dos 30 dias, não há ninguém que possa desfazer |

### Limitação declarada

**Deduplicação e relógio adiantado.** A deduplicação da regra 11.4 usa a chave primária
`(ocorrido_em, id)`. Quando a regra 11.6 substitui o `ocorrido_em` de um evento com relógio
mais de 48 h adiantado, o valor gravado passa a depender do momento do recebimento — então
um reenvio do mesmo evento pode gerar duas linhas. Vale apenas para dispositivo com relógio
muito errado. Corrigir exigiria índice único global em `id`, que o Postgres não permite em
tabela particionada sem incluir a coluna de partição.

---

## Anexo — Alertas do `get_advisors` e o que foi feito

Rodado após a última DDL do épico 8.1.

**Corrigidos**

- `anon_security_definer_function_executable` (WARN, 10 funções): todas as funções
  `SECURITY DEFINER` estavam expostas em `/rest/v1/rpc/`. `fn_expurga_contas_canceladas`
  apagaria contas sem ninguém autenticado. Privilégio revogado de `public`, `anon` e
  `authenticated`.
- `unindexed_foreign_keys` (INFO, 2): criados `idx_credenciais_projeto` e
  `idx_usuarios_conta_conta`.
- `auth_rls_initplan` (WARN, 2): as políticas do MCP passaram a usar
  `(select current_setting(...))`, avaliado uma vez por consulta em vez de uma vez por linha.

**Aceitos, com motivo**

- `authenticated_security_definer_function_executable` (WARN, 4): `fn_contas_do_usuario`,
  `fn_projetos_do_usuario`, `fn_paineis_do_usuario` e `fn_janela_visivel` continuam executáveis por
  `authenticated` porque as políticas de RLS são avaliadas com o papel de quem consulta —
  sem `EXECUTE`, o dono não leria o próprio dado. Elas devolvem apenas ids da própria conta
  de quem chama.
- `rls_enabled_no_policy` (INFO, 13 partições): é exatamente o desenho. Partição com RLS
  ligada e sem política nega tudo; o acesso legítimo passa pela tabela pai.
- `auth_leaked_password_protection` (WARN): não se aplica. Não existe senha no produto — o
  único método de login é Google (assunção 21.3).
- `unused_index` (INFO): banco recém-criado, nenhum índice foi usado ainda.
