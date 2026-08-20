/**
 * Prepara o Stripe de produção: produto, preço e webhook.
 *
 * O que faz: confere a conta, cria o que falta e devolve o `STRIPE_PRICE_ID` e o
 *            `STRIPE_WEBHOOK_SECRET` prontos para virarem variáveis na Vercel.
 * Recebe:    a chave secreta de produção (`sk_live_…`) no argumento ou em
 *            `STRIPE_SECRET_KEY`. Com `--ensaio`, aceita a de teste e não escreve.
 * Devolve:   um relatório, e grava os valores em `.env.producao`.
 *
 * Rodar de verdade:
 *   node --experimental-strip-types scripts/ligar-cobranca-em-producao.ts sk_live_...
 * Conferir sem criar nada:
 *   node --experimental-strip-types --env-file=.env scripts/ligar-cobranca-em-producao.ts --ensaio
 *
 * FALA COM A API REST DIRETO, SEM O SDK. O pacote `stripe` é dependência de
 * `apps/web`, e o pnpm isola o node_modules de cada workspace — um script na
 * raiz não enxerga. Ficar com `fetch` é mais simples do que arrastar a
 * dependência para cá só por causa disto.
 *
 * É IDEMPOTENTE DE PROPÓSITO. Rodar duas vezes não cria produto, preço nem
 * webhook duplicado: cada passo procura antes de criar, casando por nome, por
 * valor e por URL. Não é zelo abstrato — em modo de teste já nasceram dois
 * produtos iguais porque duas pessoas criaram ao mesmo tempo, e produto
 * duplicado em produção é cliente assinando o preço errado.
 *
 * NÃO IMPRIME SEGREDO. O que vai para a tela é sempre mascarado; os valores
 * inteiros só entram no `.env.producao`, que está no .gitignore.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const NOME_DO_PRODUTO = "Visão de Produto — Plano pago";
const VALOR_EM_CENTAVOS = 5000; // R$ 50,00
const MOEDA = "brl";
const URL_DO_WEBHOOK = "https://app.visaodeproduto.com.br/api/cobranca/webhook";

/** Exatamente os eventos que `aplicarEvento` sabe tratar, e nenhum a mais. */
const EVENTOS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

const argumentos = process.argv.slice(2);
const ensaio = argumentos.includes("--ensaio");
const chave = argumentos.find((a) => a.startsWith("sk_")) ?? process.env.STRIPE_SECRET_KEY ?? "";

// O ensaio confere a lógica contra o modo de teste antes de tocar em produção:
// faz todas as buscas, não cria nada e não grava nada.
if (!chave.startsWith("sk_live_") && !(ensaio && chave.startsWith("sk_test_"))) {
  console.error(
    chave.startsWith("sk_test_")
      ? "Essa é a chave de TESTE. Use --ensaio para conferir, ou passe a sk_live_ para valer."
      : "Passe a chave secreta de produção (sk_live_…) como primeiro argumento.",
  );
  process.exit(1);
}

if (ensaio) console.log("ENSAIO — nada será criado nem gravado.\n");

/** Uma chamada à API da Stripe, em formulário, como ela espera. */
async function stripe(
  caminho: string,
  campos?: Record<string, string | string[]>,
): Promise<Record<string, unknown>> {
  const corpo = new URLSearchParams();
  for (const [nome, valor] of Object.entries(campos ?? {})) {
    if (Array.isArray(valor)) valor.forEach((v, i) => corpo.append(`${nome}[${i}]`, v));
    else corpo.append(nome, valor);
  }

  const resposta = await fetch(`https://api.stripe.com/v1${caminho}`, {
    method: campos ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${chave}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: campos ? corpo : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const json = (await resposta.json()) as Record<string, unknown>;
  if (!resposta.ok) {
    const erro = json.error as { message?: string } | undefined;
    throw new Error(`${caminho} devolveu ${resposta.status}: ${erro?.message ?? "?"}`);
  }
  return json;
}

function mascarar(valor: string): string {
  return `${valor.slice(0, 12)}…${valor.slice(-4)}`;
}

interface Item { id: string; [k: string]: unknown }

// ---------------------------------------------------------------- 1. a conta
const conta = await stripe("/account");
console.log("conta      ", conta.id, `· ${conta.country} · ${conta.default_currency}`);

if (!conta.charges_enabled) {
  console.error("A conta não está habilitada a cobrar. Termine a ativação no painel antes.");
  process.exit(1);
}
if (conta.default_currency !== MOEDA) {
  console.error(`A conta liquida em ${conta.default_currency}, e o preço está em ${MOEDA}.`);
  process.exit(1);
}
console.log("            cobra e recebe: ok");

// -------------------------------------------------------------- 2. o produto
const produtos = (await stripe("/products?active=true&limit=100")).data as Item[];
let produto = produtos.find((p) => p.name === NOME_DO_PRODUTO);

if (produto) {
  console.log("produto     já existia:", produto.id);
} else if (ensaio) {
  console.log("produto     CRIARIA:", NOME_DO_PRODUTO);
} else {
  produto = (await stripe("/products", {
    name: NOME_DO_PRODUTO,
    description:
      "Projetos ilimitados, 12 meses de histórico, painel e conector do Claude. " +
      "Sem cobrança por volume de eventos.",
  })) as unknown as Item;
  console.log("produto     criado:", produto.id);
}

// ---------------------------------------------------------------- 3. o preço
const precos = produto
  ? ((await stripe(`/prices?product=${produto.id}&active=true&limit=100`)).data as Item[])
  : [];

let preco = precos.find(
  (p) =>
    p.unit_amount === VALOR_EM_CENTAVOS &&
    p.currency === MOEDA &&
    (p.recurring as { interval?: string } | null)?.interval === "month",
);

if (preco) {
  console.log("preço       já existia:", preco.id);
} else if (ensaio || !produto) {
  console.log("preço       CRIARIA: R$ 50,00/mês em brl");
} else {
  preco = (await stripe("/prices", {
    product: produto.id,
    unit_amount: String(VALOR_EM_CENTAVOS),
    currency: MOEDA,
    "recurring[interval]": "month",
  })) as unknown as Item;
  console.log("preço       criado:", preco.id);
}
console.log(`            R$ ${(VALOR_EM_CENTAVOS / 100).toFixed(2)}/mês`);

// -------------------------------------------------------------- 4. o webhook
const pontas = (await stripe("/webhook_endpoints?limit=100")).data as Item[];
let ponta = pontas.find((w) => w.url === URL_DO_WEBHOOK);
let segredoDoWebhook: string | null = null;

if (ponta) {
  console.log("webhook     já existia:", ponta.id);

  const atuais = (ponta.enabled_events as string[]) ?? [];
  const faltando = EVENTOS.filter((e) => !atuais.includes(e));

  if (faltando.length > 0 && ensaio) {
    console.log("            CORRIGIRIA os eventos:", faltando.join(", "));
  } else if (faltando.length > 0) {
    await stripe(`/webhook_endpoints/${ponta.id}`, { enabled_events: EVENTOS });
    console.log("            eventos corrigidos:", faltando.join(", "));
  } else {
    console.log("            os seis eventos já estão lá");
  }

  // O segredo de assinatura só é revelado na criação. Por isso este script
  // avisa em vez de seguir em silêncio com um valor que não tem.
  console.log("            ATENÇÃO: o segredo de assinatura não é mostrado de novo.");
  console.log("            Se ele não estiver no .env.producao, apague a ponta no");
  console.log("            painel da Stripe e rode este script outra vez.");
} else if (ensaio) {
  console.log("webhook     CRIARIA:", URL_DO_WEBHOOK);
  console.log("            com", EVENTOS.length, "eventos");
} else {
  const criada = await stripe("/webhook_endpoints", {
    url: URL_DO_WEBHOOK,
    enabled_events: EVENTOS,
    description: "Visão de Produto — produção",
  });
  ponta = criada as unknown as Item;
  segredoDoWebhook = (criada.secret as string) ?? null;
  console.log("webhook     criado:", ponta.id);
  console.log("            eventos:", EVENTOS.length);
}

// --------------------------------------------------- 5. grava o .env.producao
if (ensaio) {
  console.log("\nEnsaio terminado. Nada foi criado, nada foi gravado.");
  process.exit(0);
}

const caminho = ".env.producao";
const atual = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";

function definir(texto: string, nome: string, valor: string): string {
  const linha = `${nome}=${valor}`;
  const re = new RegExp(`^${nome}=.*$`, "m");
  return re.test(texto) ? texto.replace(re, linha) : `${texto.trimEnd()}\n${linha}\n`;
}

let novo = atual;
novo = definir(novo, "STRIPE_SECRET_KEY", chave);
novo = definir(novo, "STRIPE_PRICE_ID", preco!.id);
if (segredoDoWebhook) novo = definir(novo, "STRIPE_WEBHOOK_SECRET", segredoDoWebhook);

writeFileSync(caminho, novo);

console.log();
console.log("gravado em .env.producao (fora do git):");
console.log("  STRIPE_SECRET_KEY     ", mascarar(chave));
console.log("  STRIPE_PRICE_ID       ", preco!.id);
console.log(
  "  STRIPE_WEBHOOK_SECRET ",
  segredoDoWebhook ? mascarar(segredoDoWebhook) : "não mudou (a ponta já existia)",
);
console.log();
console.log("Falta empurrar os três para a Vercel, no ambiente Production.");
