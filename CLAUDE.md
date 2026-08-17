# CLAUDE.md — Visão de Produto

Instruções para qualquer sessão de agente neste repositório. Leia antes de mexer em
qualquer coisa. O `spec.md` é a fonte única de verdade; este arquivo diz como trabalhar
nele sem quebrar o que já está de pé.

---

## 0. Rotina de git — obrigatória, toda sessão

O dono trabalha em **dois computadores** (desktop e laptop). Manter os dois em sincronia é
responsabilidade do agente, não dele. Ele não usa terminal: quem roda comando é você.

**No início de toda sessão, antes de qualquer outra coisa:**

1. `git pull` e diga em uma linha o que veio (ou "nada novo").
2. Se houver conflito, resolva você e explique o que mudou.
3. Se houver trabalho não commitado da sessão anterior, avise antes de mexer.

**Ao fim de cada épico, e sempre que ele disser que vai parar:**

1. Atualize `CLAUDE.md` e `DOCUMENTACAO-TECNICA.md` com o que mudou.
2. `git add -A`, commit com mensagem descritiva **em português**, `git push`.
3. Confirme em uma linha que está tudo sincronizado.

Commit de trabalho pela metade é aceito, com prefixo `wip:`. O que não pode é ele trocar
de máquina com coisa não enviada.

**Se ele disser que está numa máquina nova:** clone o repositório, `pnpm install`, e monte
o `.env` a partir do `.env.example`, pedindo os valores que faltarem um a um e dizendo
onde ele acha cada um. O banco é o mesmo (Supabase na nuvem); só o ambiente local precisa
ser remontado. **Não rode migration nova sem antes checar o estado do banco remoto**
(`list_migrations` do MCP do Supabase).

### Segredos — regra dura

Nenhuma chave, token, senha ou string de conexão real entra em arquivo versionado. Elas
vivem só no `.env` local, que está no `.gitignore`. Antes de todo push, verifique que nada
vazou para código, README, comentário, arquivo de exemplo ou mensagem de commit. Se ele
colar uma chave no chat, use e não escreva em lugar nenhum além do `.env`.

---

## 1. Precedência (seção 4.4 do spec, e é absoluta)

- **As telas** (`visao de produto-telas claude design/`) prevalecem em layout, espaçamento,
  hierarquia, paleta, tipografia, densidade e estados de UI.
- **O `spec.md`** prevalece em comportamento, conteúdo, contrato de API, nome de função,
  assinatura de SDK, texto de snippet, modelo de dados e regra de negócio.

Divergência do segundo grupo: siga o spec e **registre em `DOCUMENTACAO-TECNICA.md`**.
Não decida sozinho qual ganha — a regra já está dada.

## 2. Convenções que não se negociam

- **Banco em português**, `snake_case`, com os nomes exatos das seções 7 e 7.10 do spec.
- **Código, variáveis e nomes de arquivo em inglês.** A fronteira de idioma fica na camada
  de acesso a dados: os tipos que espelham o banco mantêm os nomes em português
  (`type Evento = { projeto_id: string; ocorrido_em: string }`).
- **Toda** função, hook, rota, trigger e política leva comentário de cabeçalho **em
  português** dizendo o que faz, o que recebe, o que devolve e qual regra do spec
  implementa, com o número da seção. Lógica não óbvia leva comentário inline.
- Use os **tokens de cor da seção 13.2** literalmente. Não escolha cor nenhuma.
- Siga literalmente as tabelas das seções **11** (regras de negócio) e **5.1** (credenciais).
  Não invente valor, limite, formato nem permissão.
- **RLS com predicado de propriedade real em todas as tabelas. Nunca `using (true)`.**
- Rode `get_advisors` (segurança **e** performance) após toda DDL e reporte o resultado.

## 3. Princípios de desempate (seção 0 do spec)

1. **0.1 — nada entra que não foi declarado.** Sem autocapture, sem geo, sem IP, sem
   user-agent, sem pageview implícito.
2. **0.2 — todo evento carrega o que significa.** Descrição em português é campo de
   primeira classe, não propriedade solta.
3. **0.3 — o agente é usuário de primeira classe.** O que a tela responde, o MCP responde.
4. **0.4 — simplicidade antes de complexidade prematura.**
5. **0.5 — zero decisão no onboarding.**
6. **0.6 — autosserviço do cadastro ao cancelamento.** Nenhum caminho pode exigir
   intervenção do dono da plataforma.

## 4. Fora de escopo (seção 25 — roadmap)

Não implemente: Stripe e cobrança (F10), convite de membros (F4), cobertura contra a spec
(F8), SDKs Flutter e Python (F5), resolução de identidade (F9), resumo semanal (F7).

**Multi-tenancy NÃO está fora de escopo.** `contas`, `usuarios_conta`, `uso_mensal`, a
coluna `conta_id` e as políticas com predicado de propriedade são v1 (D8 e D10). A
exportação de dados (D11) também. Se algo parecer precisar de item do roadmap, pergunte.

---

## 5. Arquitetura

```
apps/web                     Next.js 16 (App Router) — o site
packages/sdk-js              @dablab/visao — SDK web / React Native / Node
packages/cli                 npx visao init
supabase/migrations          SQL versionado, aplicado pelo MCP do Supabase
supabase/functions/ingest    Edge Function de ingestão
supabase/functions/mcp       Edge Function do servidor MCP
skills/                      skills de instrumentação e de leitura
tests/                       suíte da seção 19
```

**Projeto Supabase:** `Visao de Produto`, ref `glohvqzopiffdghwppor`, região `sa-east-1`,
Postgres 17, plano Pro (risco R4).

## 6. Comandos

```bash
pnpm install        # instala tudo no monorepo
pnpm typecheck      # TypeScript em todos os pacotes
pnpm lint
pnpm test           # Vitest
pnpm dev            # site em desenvolvimento
```

A CLI do Supabase é devDependency do repo: use `./node_modules/.bin/supabase`, nunca
instale global. Migrations são aplicadas pelo **MCP do Supabase** (`apply_migration`), e o
arquivo `.sql` correspondente **sempre** é salvo em `supabase/migrations/` no mesmo commit.

## 7. Pegadinhas que não podem ser quebradas

1. **As partições de `eventos` são tabelas de verdade.** RLS no pai não protege
   `select * from eventos_p20260817`. Toda partição precisa de RLS habilitada e de revoke
   para `anon` e `authenticated` — quem faz isso é `fn_protege_particoes_eventos()`, e o
   job diário `manutencao_particoes` chama ela depois de criar partição nova. Se você criar
   partição à mão, chame a função depois.
2. **A descrição do catálogo nunca é sobrescrita** (regra 11.2). A trigger só preenche
   `definicoes_evento.descricao` quando está nula.
3. **A chave de ingestão determina o projeto** (regra 11.5). `projeto_id` que venha no
   payload é ignorado.
4. **Deduplicação é por `id` do cliente** (regra 11.4), via `on conflict do nothing` sobre
   a PK `(ocorrido_em, id)`.
5. **`service_role` ignora RLS.** Toda rota de servidor que usa service_role precisa filtrar
   por `conta_id` na mão.
6. **`SUPABASE_SERVICE_ROLE_KEY` nunca entra no bundle do cliente.**
7. **Nome de evento válido:** `^[a-z][a-z0-9_]{2,63}$`. Espaço é inválido — validado no SDK,
   na Edge Function e por check constraint no banco.
8. **Série temporal é sempre barra com rótulo** (regra 11.10). Nunca linha, em nenhum volume.
9. **Evento com zero ocorrências sempre aparece** nas telas de uso (regra 11.12).
10. **O banco opera em UTC.** A conversão para `projetos.fuso_exibicao` é na apresentação
    (regra 11.7), nunca no banco.
11. **A Edge Function `ingest` roda com `verify_jwt` desligado.** Quem autentica é ela
    mesma, pela chave no header `x-api-key`. Se alguém redeployar com `verify_jwt: true`,
    a ingestão para de funcionar para todos os apps.
12. **Evento inválido não derruba o lote.** Ele volta em `rejeitados` com `id`, `campo` e
    `motivo`, e os outros 99 entram.

## 8. Decisões tomadas com o dono nesta v1

| Item | Decisão |
|---|---|
| 21.8 | O SDK não envia nada automaticamente. A skill de instrumentação **sugere `app_aberto`** como evento declarado por padrão |
| 22.2 | Nome e identificador curto mantidos: `@dablab/visao`, `npx visao init`, `VISAO_*` |
| 22.4 | Quais apps vão instrumentar ainda não foi decidido. Agenda Psi e Swim eram exemplos |
| 22.5 | Segue aberta; só importa quando um app for escolhido |
| 22.1 / 22.6 | Preço e contrato de operação ficam fora da v1, por decisão do próprio spec |

## 9. Pendências que dependem do dono

- **Google OAuth**: criar o OAuth Client no Google Cloud Console e colar Client ID e Secret
  no painel do Supabase (Authentication → Providers → Google). Bloqueia o épico 8.4.
- **Senha do banco**: necessária para `supabase db dump` gerar o `schema.sql` do banco real.
- **Vercel**: o deploy do site pede login pelo navegador uma vez.

## 10. Backlog conhecido

**Resolvido no épico 8.8:** as duas portas de entrada do MCP existem — arquivo de
configuração para quem usa terminal (e a CLI escreve sozinha), e OAuth para quem só tem o
app do Claude Desktop.

**A palavra "tile" na tela de Painel não comunica.** O termo vem do mock e do spec
(regra 11.9, seção 7.7), mas para quem chega não diz nada — "Adicionar tile", "Tiles
fixados do catálogo". A seção 13.3 deixa a copy livre, então dá para trocar por algo como
"gráfico fixado" ou "cartão" sem violar nada; o nome da tabela `paineis_itens` continua
como está. **Pendente de decisão do dono.**

**O Painel poderia ter filtro.** Hoje só existe o seletor de período, que vale para o
painel inteiro. Filtrar por pessoa ou por tela dentro do painel é possível — as funções de
série já recebem projeto e evento, e aceitariam mais um parâmetro —, mas muda o significado
dos números de cada cartão e precisa de desenho antes de código. **Pendente de decisão.**

**A tela do Google mostra `glohvqzopiffdghwppor.supabase.co` em vez de "Visão de Produto".**
O nome do app, o e-mail de suporte e o contato do desenvolvedor já estão preenchidos na
Branding do Google Auth Platform, e mesmo assim o Google exibe o domínio. A causa restante
é o app estar não verificado usando o domínio compartilhado do Supabase: o que aparece é o
host do `redirect_uri`. **O conserto definitivo é domínio próprio de autenticação no
Supabase** (add-on pago), que troca o `redirect_uri` para o domínio da Dab Lab. Não afeta o
funcionamento do login — é só o rótulo na tela de consentimento. Decisão do dono: fica no
backlog.
