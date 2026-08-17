# Documentação técnica — Visão de Produto

Descreve o sistema **como ele ficou**, não como foi planejado. Segue os seis itens da seção
16 do `spec.md`. Toda mudança em esquema, trigger, política ou lógica de tela atualiza este
documento **no mesmo commit**.

| | |
|---|---|
| Banco | Supabase Postgres 17.6, projeto `Visao de Produto`, ref `glohvqzopiffdghwppor`, região `sa-east-1`, plano Pro |
| Estado | Épico 8.1 concluído e verificado. Épicos 8.2 a 8.7 pendentes |
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

Pendente: será preenchido nos épicos 8.4 e 8.5.

---

## 5. Lógica das principais funcionalidades por tela

Pendente: será preenchido nos épicos 8.4 e 8.5.

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

- `authenticated_security_definer_function_executable` (WARN, 3): `fn_contas_do_usuario`,
  `fn_projetos_do_usuario` e `fn_paineis_do_usuario` continuam executáveis por
  `authenticated` porque as políticas de RLS são avaliadas com o papel de quem consulta —
  sem `EXECUTE`, o dono não leria o próprio dado. Elas devolvem apenas ids da própria conta
  de quem chama.
- `rls_enabled_no_policy` (INFO, 13 partições): é exatamente o desenho. Partição com RLS
  ligada e sem política nega tudo; o acesso legítimo passa pela tabela pai.
- `auth_leaked_password_protection` (WARN): não se aplica. Não existe senha no produto — o
  único método de login é Google (assunção 21.3).
- `unused_index` (INFO): banco recém-criado, nenhum índice foi usado ainda.
