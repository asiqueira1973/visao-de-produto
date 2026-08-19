# Visão de Produto

Plataforma de product analytics deliberadamente pequena. Os aplicativos enviam os eventos que
importam por uma API REST, e a resposta fica disponível de duas formas equivalentes: um site
com painéis e um servidor MCP pelo qual o Claude responde as mesmas perguntas em linguagem
natural.

Três coisas a distinguem: **nada é capturado automaticamente** — sem IP, sem geolocalização,
sem pageview implícito; **todo evento carrega uma descrição em português**, tratada como campo
de primeira classe; e **o evento que não ocorreu aparece**, com zero explícito, porque essa é
frequentemente a informação mais útil.

| | |
|---|---|
| Documento-fonte | [`spec.md`](spec.md) — é ele que decide, sempre |
| Como o sistema ficou | [`DOCUMENTACAO-TECNICA.md`](DOCUMENTACAO-TECNICA.md) |
| Como trabalhar aqui | [`CLAUDE.md`](CLAUDE.md) |
| Cobrança (desenhado, não implementado) | [`EPICO-COBRANCA.md`](EPICO-COBRANCA.md) |
| Retrato do banco | [`schema.sql`](schema.sql), gerado do banco real |

---

## Como rodar na sua máquina

Precisa de **Node 22+** e **pnpm**. Não precisa de Docker, nem de Postgres local, nem da CLI
do Supabase instalada globalmente — o banco é na nuvem e a CLI é dependência do repositório.

```bash
git clone git@github.com:asiqueira1973/visao-de-produto.git
cd visao-de-produto
pnpm install
cp .env.example .env    # e preencha, conforme a seção abaixo
pnpm dev                # http://localhost:3000
```

---

## Variáveis de ambiente

Todas vivem no `.env` da raiz, que está no `.gitignore` e **nunca** vai para o git. O
[`.env.example`](.env.example) lista todas, com o caminho de onde tirar cada valor.

| Variável | O que é | Onde encontrar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endereço do projeto | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreta.** Só em rota de servidor e Edge Function | idem |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal, para a CLI publicar função e definir segredo | supabase.com/dashboard/account/tokens |
| `VISAO_API_KEY` | Chave de ingestão de um app instrumentado | tela de Configurações do projeto |
| `VISAO_HOST` | Base da ingestão | mesma coisa que `NEXT_PUBLIC_SUPABASE_URL` |

`NEXT_PUBLIC_SITE_URL` existe só nos ambientes publicados, e diz qual é o endereço público
daquele deploy. Localmente ela fica vazia e o código cai para `http://localhost:3000`.

**A regra dura:** nenhuma chave, token, senha ou string de conexão real entra em arquivo
versionado. Nem em README, nem em comentário, nem em mensagem de commit.

---

## Dois ambientes

| | Projeto Supabase | Papel |
|---|---|---|
| **dev** | `Visao de Produto — Dev` (`ntdjmdqiqjpnufrekorp`) | Onde tudo é escrito e verificado primeiro. É onde a suíte de testes roda |
| **prod** | `Visao de Produto` (`glohvqzopiffdghwppor`) | Dados reais. Só recebe o que já passou por dev |

O `.env` aponta para **dev**. Os dois ficam guardados lado a lado, fora do git, em `.env.dev`
e `.env.producao` — trocar de ambiente é copiar um por cima do `.env` e reiniciar.

No git, `dev` é a branch de trabalho e `main` é produção. Na Vercel, cada uma tem as suas
variáveis: um deploy de preview nunca fala com o banco de produção.

Para saber com qual ambiente um deploy está falando, sem entrar nele:

```bash
curl https://<endereco-do-deploy>/api/saude
```

---

## Migrations

O SQL versionado fica em [`supabase/migrations/`](supabase/migrations), em ordem cronológica.
São a **fonte de verdade do esquema** — o banco é o resultado delas, nunca o contrário.

A ordem, sem exceção:

1. Escreva o arquivo `.sql`.
2. Aplique em **dev** e verifique o efeito de verdade.
3. Rode os advisors de segurança e de performance.
4. Só então aplique **o mesmo arquivo** em prod.
5. Commit do `.sql` junto da mudança de código que depende dele.

Migrations são aplicadas pelo MCP do Supabase (`apply_migration`), que registra cada uma na
tabela de controle. **SQL solto em produção não existe**: se um ajuste foi necessário para uma
migration passar, ele vira linha da migration.

Para regenerar o retrato do banco depois de uma mudança:

```bash
./scripts/gerar-schema.sh                    # produção
./scripts/gerar-schema.sh ntdjmdqiqjpnufrekorp   # dev
```

---

## Comandos

```bash
pnpm dev          # site em desenvolvimento
pnpm typecheck    # TypeScript em todos os pacotes
pnpm lint
pnpm test         # Vitest: regras de negócio, RLS, partições, MCP, SDK e CLI
pnpm build
```

Os testes de integração rodam **contra o banco de dev de verdade**, não contra um dublê: é a
única forma de provar que RLS, trigger, partição e Edge Function se comportam como o spec diz.
Cada arquivo cria a própria conta descartável e apaga tudo no fim.

---

## Estrutura

```
apps/web                     Next.js 16 (App Router) — o site
packages/sdk-js              @dablab/visao — SDK web / React Native / Node
packages/cli                 npx visao init
supabase/migrations          SQL versionado
supabase/functions/ingest    Edge Function de ingestão
supabase/functions/mcp       Edge Function do servidor MCP
skills/                      skills de instrumentação e de leitura
tests/                       suíte da seção 19
scripts/                     utilitários de manutenção
```

Convenção de idioma: **banco em português**, `snake_case`; **código em inglês**. A fronteira
fica na camada de acesso a dados — os tipos que espelham o banco mantêm os nomes em português.
Todo comentário é em português, e todo cabeçalho de função diz o que ela faz, o que recebe, o
que devolve e qual regra do spec implementa.

---

## Instrumentar um aplicativo

Pelo SDK:

```ts
import { init, identify, track } from "@dablab/visao";

init({ key: process.env.VISAO_API_KEY, projeto: "meu-app" });
identify("pessoa@exemplo.com");

track("app_algo_aconteceu", {
  descricao: "usuário fez a coisa que você quer medir",
  tela: "NomeDaTela",
  props: { valor: 250 },
});
```

Ou direto pela API, sem instalar nada — o contrato estável é o REST:

```bash
curl -X POST "$VISAO_HOST/functions/v1/ingest" \
  -H "content-type: application/json" \
  -H "x-api-key: $VISAO_API_KEY" \
  -d '{"eventos":[{"id":"<uuid>","nome":"app_algo_aconteceu","distinct_id":"pessoa@exemplo.com","ocorrido_em":"2026-08-17T12:00:00Z","descricao":"usuário fez a coisa que você quer medir"}]}'
```

Até 100 eventos por chamada. O `id` é seu e é a proteção contra duplicata: reenviar o mesmo
evento nunca conta duas vezes.

---

## Ligar o Claude

Duas portas, e você só precisa de uma. Pelo aplicativo, é adicionar um conector personalizado
apontando para o servidor MCP e deixar os campos de OAuth em branco. Por arquivo, é gerar um
token de leitura na tela de Credenciais MCP e colar o bloco de configuração no cliente.

O passo a passo de cada caminho está na própria plataforma, em **Conta → Credenciais MCP**, e
o guia completo em **Conta → Como usar**.

O acesso do Claude é **somente leitura**, restrito a quatro tabelas, garantido pela permissão
do papel no banco e não apenas por validação de texto.
