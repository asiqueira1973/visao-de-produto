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

### Máquina nova — o roteiro completo

O dono trabalha em mais de um computador e **não usa terminal**. Quando ele disser que
está numa máquina nova, faça tudo você, nesta ordem, sem pedir que ele rode nada:

1. `git clone git@github.com:asiqueira1973/visao-de-produto.git` (ou por HTTPS, se a chave
   SSH não estiver lá). **A branch de trabalho é `dev`, não `main`.**
2. `pnpm install`. Se o `pnpm` não existir na máquina, instale com `npm i -g pnpm`.
3. Monte os `.env`. **Eles não estão no git, e é assim que tem que ser** — então esta é a
   única parte em que você precisa dele. Peça os valores **um a um**, dizendo exatamente
   onde clicar, e não peça os três de uma vez:

| Variável | Onde ele acha |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → projeto **Visao de Produto — Dev** → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | mesma tela, chave `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | mesma tela, chave `service_role` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens — pode gerar um novo, não precisa ser o mesmo |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → **Secret key de TESTE** (`sk_test_…`) |
| `STRIPE_PRICE_ID` | Stripe → Product catalog → "Visão de Produto — Plano pago" → o preço de R$ 50/mês |
| `STRIPE_WEBHOOK_SECRET` | **não precisa pedir**: gere um valor local qualquer começando com `whsec_`. Só precisa ser o mesmo que a suíte usa para assinar |
| `VISAO_API_KEY` | deixe vazia; só serve para instrumentar um app |
| `VISAO_HOST` | mesmo valor de `NEXT_PUBLIC_SUPABASE_URL` |

4. Copie o `.env` resultante para `.env.dev`, para o arranjo de dois ambientes continuar
   valendo. O `.env.producao` só é necessário se ele for mexer em produção naquela máquina.
5. Faça login na Vercel (`./node_modules/.bin/vercel login`) **só se** for mexer em deploy.
6. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test` antes de tocar em qualquer coisa: se os
   três passarem, o ambiente está montado de verdade.

O banco é o mesmo, na nuvem — não há nada para restaurar. **Não rode migration nova sem
antes conferir o estado do banco remoto** (`list_migrations` do MCP do Supabase).

### Segredos — regra dura

Nenhuma chave, token, senha ou string de conexão real entra em arquivo versionado. Elas
vivem só no `.env` local, que está no `.gitignore`. Antes de todo push, verifique que nada
vazou para código, README, comentário, arquivo de exemplo ou mensagem de commit. Se ele
colar uma chave no chat, use e não escreva em lugar nenhum além do `.env`.

---

## 0.1 Dois ambientes — dev e produção

Existem **dois projetos Supabase**, e eles não se misturam:

| | Projeto Supabase | Endereço | Para que serve |
|---|---|---|---|
| **dev** | `Visao de Produto — Dev`, ref `ntdjmdqiqjpnufrekorp` | site `dev.visaodeproduto.com.br`, API no `.supabase.co` | Onde tudo é escrito e verificado primeiro. É onde a suíte da seção 19 roda |
| **prod** | `Visao de Produto`, ref `glohvqzopiffdghwppor` | site `app.visaodeproduto.com.br`, API `api.visaodeproduto.com.br` | Os dados reais do dono. Só recebe o que já passou por dev |

**Os endereços de produção são os próprios, e isso não é enfeite.** A chave de ingestão e o
host que a CLI escreve no `.env` de um app ficam lá por anos: se apontassem para o Supabase,
trocar de hospedagem obrigaria todo mundo que instrumentou a fazer release de app. O
`api.visaodeproduto.com.br` faz essa troca virar um registro de DNS.

**E essa aposta já se pagou.** Em 26/10/2026 o add-on de Custom Domain do Supabase — 10
dólares por mês — foi desligado, e o endereço continuou existindo: hoje ele é servido por um
**proxy na Vercel**, em [`proxy-api/`](proxy-api/), que repassa qualquer caminho para
`glohvqzopiffdghwppor.supabase.co`. Nenhum app precisou de versão nova. O Agenda Psi, que tem
o endereço compilado no binário e está nas duas lojas, não percebeu.

Três coisas desse dia que vale saber:

- **A Vercel não emite o certificado sozinha** depois que o DNS passa a apontar para ela. O
  domínio ficou minutos com DNS certo e TLS falhando. Foi preciso pedir a emissão pela API
  (`POST /v3/certs`). Depois de repontar DNS para a Vercel, **confira o TLS antes de
  considerar pronto**.
- **A proteção de deploy da Vercel vem ligada** e devolve uma tela de login no lugar da API.
  Se a ingestão parar sem erro que explique, é o primeiro lugar a olhar.
- **O login não precisou de nada**, porque o cliente OAuth do Google já tinha o callback do
  `.supabase.co` cadastrado ao lado do do domínio próprio. Quando o domínio saiu, o Supabase
  passou a gerar o `redirect_uri` padrão e o Google já o aceitava. O projeto no Google Cloud é
  o de número **471747576521** — não é o `DabLab`, e achar isso custou tempo.

A virada de endereço está em [`scripts/virar-para-o-dominio.sh`](scripts/virar-para-o-dominio.sh),
e **a ordem dos passos dele importa**: a função do MCP precisa saber o endereço novo ANTES de
o site mudar, senão quem se conectar recebe um documento de OAuth apontando para o lugar
errado e a conexão é recusada sem mensagem que explique.

O `.env` local aponta para **dev**. Os dois arquivos completos ficam lado a lado na
máquina, fora do git: `.env.dev` e `.env.producao`. Trocar de ambiente é copiar um por
cima do `.env` e reiniciar o servidor.

### Regra de migration — não tem exceção

1. Escreva o `.sql` em `supabase/migrations/`.
2. Aplique em **dev**, rode `get_advisors` (segurança e performance) e verifique o efeito
   de verdade — com dados, não por leitura.
3. Commit do `.sql` junto da mudança de código que depende dele, na branch `dev`.
4. **Produção recebe a migration quando a feature chega em `main`**, e não antes. Enquanto
   uma feature está pela metade, os dois bancos ficam diferentes de propósito: é para isso
   que existem dois. Aplicar em prod cedo enche o banco de produção de tabela órfã.
5. Ao aplicar em prod, rode os advisors lá também e regenere o `schema.sql`.

O `schema.sql` retrata **produção**. Se ele não mostra uma tabela que existe no dev, isso não
é erro: é uma feature ainda em construção.

**Nunca** rode SQL solto em produção. Se um ajuste precisou ser feito à mão para uma
migration passar, ele vira linha da migration — foi assim que a 0007 ganhou o
`grant visao_mcp_leitor to postgres` e o vai-e-volta do `create on schema public`.

### Conferir se os dois estão iguais

```sql
select 'tabelas' o, count(*)::text v from information_schema.tables where table_schema='public'
union all select 'funcoes', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'politicas', count(*)::text from pg_policies where schemaname='public'
union all select 'triggers', count(*)::text from pg_trigger where not tgisinternal
union all select 'jobs_cron', string_agg(jobname, ',' order by jobname) from cron.job
union all select 'particoes_sem_rls', coalesce(string_agg(c.relname,','),'nenhuma') from pg_inherits i join pg_class c on c.oid=i.inhrelid where i.inhparent='public.eventos'::regclass and not c.relrowsecurity
union all select 'migrations', count(*)::text from supabase_migrations.schema_migrations;
```

Rode nos dois refs e compare. Diferença aqui é drift, e drift é o que este arranjo existe
para não deixar acontecer.

### Edge Function também tem ambiente

Publicar em dev **não** publica em prod. Ao mexer em `supabase/functions/`, publique nos
dois, a partir do arquivo do repositório, e compare o `ezbr_sha256` das duas respostas: se
os hashes divergirem, alguém publicou algo que não está no git.

Existe um `SUPABASE_ACCESS_TOKEN` no `.env`, então dá para publicar função e definir
segredo pela CLI, sem painel:

```bash
./node_modules/.bin/supabase secrets set --project-ref <ref> NOME=valor
```

`VISAO_SITE` já está definido nos dois projetos, cada um apontando para o próprio site.
Sem isso, conectar o Claude ao MCP de dev mandaria a pessoa autorizar em **produção** e
devolveria um token que não serve lá — foi assim que nasceu.

**Divergência aceita, com data para acabar:** a função `mcp` publicada em produção tem os
comentários abreviados em relação ao arquivo do repositório. O código executável é idêntico
— conferido linha a linha. O dono decidiu não republicar só por causa de comentário. Isso se
resolve sozinho na fase C, quando `VISAO_ORIGEM_PUBLICA` obrigar a publicar de novo a partir
do arquivo. Até lá, **não** trate o `ezbr_sha256` diferente dessa função como sinal de
problema.

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

## 8.1 Telas de conteúdo — o texto é parte do produto

O grupo **Conta** tem cinco telas: Perfil, Credenciais MCP, Sobre o produto, Como usar e
Termos e privacidade. As três últimas são texto, e texto aqui **descreve o que existe**:

- **Sobre o produto** e **Como usar** derivam das seções 1, 2, 9.1 e 12.1. Se um contrato de
  API mudar, o trecho de código dessas telas muda junto — ele vem do mesmo componente
  (`TrechosDeInstalacao`) usado nas Configurações, de propósito.
- **Termos e privacidade** derivam da seção 17 e das regras 11.15, 11.17 e 11.18. Se um prazo
  ou uma retenção mudar no banco, **este texto muda no mesmo commit**. Política que descreve
  outro produto é pior do que política nenhuma. O texto **não passou por revisão jurídica**
  (pergunta 22.6, ainda aberta).
- **Perfil** é a única porta para cancelar a conta (regra 11.17). Cancelar é `update` em
  `contas.cancelada_em`, nunca `delete`: quem apaga é o job, 30 dias depois. Enquanto
  `cancelada_em` não for nulo, o layout do app mostra a faixa de aviso em todas as telas.

## 9. Pendências que dependem do dono

- **Google OAuth**: criar o OAuth Client no Google Cloud Console e colar Client ID e Secret
  no painel do Supabase (Authentication → Providers → Google). Bloqueia o épico 8.4.
- **Senha do banco**: necessária para `supabase db dump` gerar o `schema.sql` do banco real.
- **Login na Vercel**: uma vez pelo navegador. Depois disso o agente configura domínios,
  ambientes e variáveis por linha de comando, sem pedir cliques no painel.

## 10. Backlog conhecido

**Manutenção de partições — consertada em 20/08/2026, e vale saber por quê.** O job
`manutencao_particoes` **nunca rodou com sucesso**: `fn_manutencao_particoes()` era uma
função chamando `partman.run_maintenance_proc()`, que faz `COMMIT` — ilegal dentro de
função. As partições cobriam até 12/10/2026 e, depois disso, todo INSERT em `eventos`
falharia sem aviso prévio.

Virar procedure não basta: **procedure com `SECURITY DEFINER` ou com cláusula `SET`
também não pode dar `COMMIT`**, e a primeira tentativa de conserto falhou com o mesmo
erro. `pr_manutencao_particoes()` não tem nenhum dos dois, e por isso qualifica todo nome
pelo esquema — o `function_search_path_mutable` que o advisor reporta nela é aceito de
propósito, com essa mitigação.

Provado nos dois bancos com execução real do cron, e no dev subindo o `premake` para 9:
criou duas partições novas, já com RLS ligada.



**E-mail transacional (Bird) — domínio verificado, código não escrito.** O dono criou a
conta no Bird, adicionou o domínio `visaodeproduto.com.br` e gerou uma API key em
19/08/2026. Os três registros de DNS foram criados no registro.br no mesmo dia e
conferidos direto nos servidores autoritativos da zona (`b.sec.dns.br` e `c.sec.dns.br`).
**O painel do Bird marcou Sending e Return path como Verified em 19/08/2026.**

`Tracking` fica em *Pending* e `Receiving` em *Not configured* para sempre — é a decisão
registrada abaixo, não pendência. Desligar as chaves Open e Click na seção Tracking do
Bird tira o aviso amarelo do painel, se incomodar.

Os registros:

| Nome | Tipo | Valor |
|---|---|---|
| `bird-726-0826._domainkey` | TXT | chave DKIM RSA de 2048 bits, 294 bytes, decodifica |
| `send` | CNAME | `us1.bounce.bird.com.` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc-agg@dmarc.bird.com;` |

**O envio existe e foi provado.** `apps/web/src/lib/email/bird.ts` é o transporte e
`mensagens.ts` traz os quatro textos. Em 19/08/2026 os quatro foram enviados de verdade
para uma caixa do Gmail e a API do Bird reportou `delivered` nos quatro.

Rodar o teste de novo:

```
node --experimental-strip-types --env-file=.env \
  scripts/enviar-emails-de-teste.ts alguem@exemplo.com
```

**Quatro detalhes da API do Bird que custaram tempo e não estão na primeira página da
documentação:**

- **O host é regional e sai da própria chave.** `bk_us1_…` fala com
  `https://us1.platform.bird.com`. O `api.bird.com` dos exemplos de Channels devolve 404 em
  tudo — inclusive sem chave nenhuma, o que faz parecer erro de credencial quando é
  endereço errado.
- **A autenticação é `Bearer`**, não `AccessKey`. `AccessKey` é da API de Channels, que é
  outro produto dentro do mesmo painel.
- **`to` é lista de strings**; só `from` é objeto.
- **Sucesso é 202**, com id `em_…`. O status vira `delivered` em `GET /v1/email/messages`.

**Três dos quatro estão ligados** (20/08/2026):

| E-mail | Gatilho | Onde |
|---|---|---|
| Boas-vindas | entrada pelo Google | `app/auth/callback/route.ts` |
| Cancelamento, 30 dias | a própria tela de cancelar | `features/perfil/acoes.ts` |
| Cancelamento, 7 e 1 dia | job diário, 12:00 UTC | `api/avisos/diario` |
| Perto do teto | job diário, 12:00 UTC | `api/avisos/diario` |
| Pagamento recusado | **sem chamador** | entra com a cobrança |

O envio é idempotente pela chave única `(conta, tipo, referência)` de
`avisos_enviados`: o job pode rodar duas vezes no mesmo dia sem escrever duas vezes para
ninguém. A ordem das escritas é reservar-depois-mandar, e a reserva é apagada se o envio
falhar — mandar primeiro abriria janela para duplicidade, e não desfazer perderia o aviso
para sempre. Reativar a conta esquece os avisos daquele cancelamento, senão a segunda vez
ficaria muda.

Provado ponta a ponta no dev em 20/08/2026: uma conta cancelada há 23 dias fez o job
mandar o lembrete de 7 dias, a segunda execução devolveu zero, e o cenário de 9 eventos
para um teto de 10 fez sair o aviso de 90%.

**DUAS ARMADILHAS QUE ESTE ÉPICO DEIXOU, e valem para qualquer função nova:**

- **Função nova nasce aberta ao `anon`, e fechar exige DOIS revokes.** Existem duas
  concessões independentes, e cada uma sozinha basta para deixar a porta aberta:
  o PostgreSQL concede EXECUTE a `PUBLIC` em toda função nova, **e** o Supabase mantém um
  `ALTER DEFAULT PRIVILEGES` que concede EXECUTE a `anon`, `authenticated` e
  `service_role` em toda função nova do schema `public` (veja `pg_default_acl`).

  Revogar só de `public` deixa a concessão explícita de pé; revogar só de
  `anon, authenticated` deixa a herança de pé. **O fecho é revogar dos três:**

  ```sql
  revoke all on function public.fn_x(...) from public;
  revoke all on function public.fn_x(...) from anon, authenticated;
  ```

  Isso custou duas tentativas erradas em 20/08/2026, com funções que devolvem o **e-mail**
  do dono de cada conta expostas à chave anônima — a que vai no bundle do navegador. Nas
  duas vezes quem pegou foi um POST de verdade, não a leitura do código.

  **Confira sempre por consulta, nunca por leitura:**

  ```sql
  select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  ```

  Hoje essa consulta devolve só `fn_valida_nome_evento`, que é validação pura de string e
  não toca em dado nenhum.
- **O aviso de teto conta ao vivo, e não por `uso_mensal`.** Aquela tabela é escrita uma
  vez por dia; o teto existe para conter loop, e loop enche o teto em horas. Usar a foto
  de ontem faria a pessoa ser bloqueada antes de ser avisada — falharia exatamente no
  único caso em que o aviso serve.

Duas armadilhas que custaram tempo e vão se repetir em qualquer outro domínio:

- **O botão "Copy for AI" do Bird copia os três registros juntos.** Colado no campo do
  DKIM, ele produz um registro com dois `p=` e com `.` e `_` dentro da chave — inválido, e
  o painel só diz "Pending", sem explicar. Conferir sempre decodificando a base64, não
  olhando a tela.
- **A chave DKIM passa de 255 caracteres**, o limite de um pedaço de TXT. O registro.br
  parte sozinho em duas strings entre aspas e o DNS junta na leitura. Isso é o certo; não
  é para "consertar".

Não existe registro SPF, e é deliberado: o SPF é verificado no envelope de retorno, que
passa a ser `send.visaodeproduto.com.br` — o CNAME leva ao SPF do próprio Bird. O TXT da
raiz continua vazio de propósito.

**Dois blocos do painel do Bird ficam de fora, e não por esquecimento:**

- **Rastreamento de abertura e clique (`links`).** O produto se sustenta em "nada é
  capturado que não foi declarado". Rastrear leitura de e-mail em silêncio seria a primeira
  coisa a desmentir isso. Se um dia entrar, tem que ser declarado na política de privacidade.
- **Os três MX de recebimento.** A plataforma não precisa receber e-mail, e mexer no MX do
  domínio raiz sem necessidade é abrir porta para quebrar entrega depois.

**Os quatro e-mails a escrever, em ordem de valor:**

1. **Conta encerrada, faltam N dias** — a janela de 30 dias da regra 11.17 só protege quem
   lembra que pediu. É o único que evita perda de dado.
2. **Pagamento falhou** — sem aviso, a pessoa perde o plano sem entender por quê.
3. **Perto do teto de eventos** — `fn_uso_do_teto` já existe e devolve a fração usada.
4. **Boas-vindas** — o de menor valor: serve para ter um canal, não para resolver problema.

Os três primeiros só passam a existir quando houver usuários e cobrança ligada.



**Épico de cobrança (F10) — desenhado, não implementado.** O desenho completo está em
[`EPICO-COBRANCA.md`](EPICO-COBRANCA.md), decidido com o dono em 17/08/2026. Em resumo:
**R$ 50/mês em real**, um preço para todos os projetos, retenção como gatilho, volume de
evento **não** é preço, rebaixar não apaga nada, e admin lê agregado sem tocar em política de
RLS existente.

A moeda mudou de USD para BRL depois de descobrir que a conta Stripe do dono é brasileira e
liquida em real. A consequência assumida é **emitir NFS-e**, e a recomendação registrada é
emitir **à mão na primeira versão** — automatizar nota fiscal é épico próprio e não se paga
antes de dezenas de clientes por mês. Os dados do tomador, esses sim, são guardados desde o
primeiro cliente: é a parte que dói fazer depois.

A pergunta 22.6 (contrato revisado por advogado) segue aberta. O dono decidiu seguir sem
advogado por ora e autorizou a redação do texto de Termos, que já fala de cobrança.

**Resolvido no épico 8.8:** as duas portas de entrada do MCP existem — arquivo de
configuração para quem usa terminal (e a CLI escreve sozinha), e OAuth para quem só tem o
app do Claude Desktop.

**~~A palavra "tile" na tela de Painel~~ — resolvido.** A tela diz "Adicionar gráfico" e
"Gráficos fixados do catálogo"; não sobrou nenhum "tile" visível ao usuário. O nome do
componente `GradeDeTiles` e o da tabela `paineis_itens` continuam como estão, porque são
código, não interface.

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
