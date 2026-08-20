/**
 * Quem pagou no período, com os dados do tomador prontos para a nota.
 *
 * O que faz: lista as faturas pagas na Stripe e casa cada uma com os dados de
 *            cobrança guardados no banco.
 * Recebe:    o mês em `AAAA-MM` (padrão: o mês corrente).
 * Devolve:   um bloco por cliente, no formato do formulário da Contabilizei.
 *
 * Rodar:
 *   node --experimental-strip-types --env-file=.env.producao \
 *     scripts/notas-a-emitir.ts 2026-08
 *
 * POR QUE ISTO EXISTE: cobrar em real, como PJ brasileira prestando serviço,
 * obriga a emitir NFS-e, e a Stripe não emite — nota de serviço é municipal.
 * A decisão registrada no EPICO-COBRANCA.md é emitir **à mão** na primeira
 * versão. Este script não emite nada: ele só evita que a parte chata seja
 * garimpar dado em dois sistemas.
 *
 * NÃO HÁ CONTROLE DE "JÁ EMITI". De propósito: com um punhado de clientes, a
 * própria Contabilizei é o registro do que saiu, e uma tabela de controle aqui
 * seria esteira para uma fábrica que ainda não abriu. Quando doer, vira tabela.
 */

const chave = process.env.STRIPE_SECRET_KEY ?? "";
const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const servico = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!chave || !urlSupabase || !servico) {
  console.error(
    "Faltam variáveis. Rode com --env-file=.env.producao (ou .env.dev para conferir).",
  );
  process.exit(1);
}

const mes = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 7);
const [ano, mm] = mes.split("-").map(Number);
const inicio = Math.floor(Date.UTC(ano, mm - 1, 1) / 1000);
const fim = Math.floor(Date.UTC(ano, mm, 1) / 1000);

console.log(`Faturas pagas em ${mes}`);
console.log(chave.startsWith("sk_live_") ? "modo: PRODUÇÃO\n" : "modo: teste\n");

/** Uma chamada de leitura à Stripe. */
async function stripe(caminho: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.stripe.com/v1${caminho}`, {
    headers: { authorization: `Bearer ${chave}` },
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`${caminho}: ${JSON.stringify(json.error)}`);
  return json;
}

/** Uma leitura no banco, com a chave de serviço. */
async function banco(recurso: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${urlSupabase}/rest/v1/${recurso}`, {
    headers: { apikey: servico, authorization: `Bearer ${servico}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${recurso}: ${r.status} ${await r.text()}`);
  return (await r.json()) as Record<string, unknown>[];
}

interface Fatura {
  id: string;
  customer: string | null;
  amount_paid: number;
  status: string;
  created: number;
  number: string | null;
}

const faturas = (
  (await stripe(`/invoices?created[gte]=${inicio}&created[lt]=${fim}&status=paid&limit=100`))
    .data as Fatura[]
).filter((f) => f.amount_paid > 0);

if (faturas.length === 0) {
  console.log("Nenhuma fatura paga neste mês. Nada a emitir.");
  process.exit(0);
}

// Uma leitura só do banco, e depois casamento em memória.
const contas = await banco("contas?select=id,nome,stripe_cliente_id&stripe_cliente_id=not.is.null");
const tomadores = await banco("dados_de_cobranca?select=*");

const porCliente = new Map(contas.map((c) => [c.stripe_cliente_id as string, c]));
const porConta = new Map(tomadores.map((t) => [t.conta_id as string, t]));

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let total = 0;
let semDados = 0;

for (const f of faturas) {
  total += f.amount_paid;
  const conta = f.customer ? porCliente.get(f.customer) : undefined;
  const t = conta ? porConta.get(conta.id as string) : undefined;

  console.log("─".repeat(72));
  console.log(`fatura      ${f.number ?? f.id}`);
  console.log(`valor       ${reais(f.amount_paid)}`);
  console.log(`pago em     ${new Date(f.created * 1000).toLocaleDateString("pt-BR")}`);
  console.log(`conta       ${conta ? `${conta.nome} · ${conta.id}` : "NÃO ACHEI a conta"}`);

  if (!t) {
    semDados++;
    console.log("tomador     SEM DADOS DE COBRANÇA — não dá para emitir a nota.");
    console.log("            A pessoa pagou sem preencher o formulário, ou pagou por");
    console.log("            um caminho que não passa por ele. Peça os dados por e-mail.");
    continue;
  }

  const pj = t.tipo === "juridica";
  console.log(`tomador     ${pj ? "Pessoa jurídica" : "Pessoa física"}`);
  console.log(`  ${pj ? "CNPJ" : "CPF"}      ${t.documento}`);
  console.log(`  ${pj ? "Razão social" : "Nome"}  ${t.nome}`);
  if (t.email_nota) console.log(`  E-mail    ${t.email_nota}`);

  if (pj) {
    console.log(`  CEP       ${t.cep ?? "—"}`);
    console.log(`  Endereço  ${t.logradouro ?? "—"}, ${t.numero ?? "s/n"}${t.complemento ? ` — ${t.complemento}` : ""}`);
    console.log(`  Bairro    ${t.bairro ?? "—"}`);
    console.log(`  Município ${t.municipio ?? "—"} / ${t.uf ?? "—"}`);
  }
}

console.log("─".repeat(72));
console.log(`${faturas.length} fatura(s) · ${reais(total)} no mês`);
if (semDados > 0) console.log(`${semDados} sem dados de cobrança — resolva antes de emitir.`);
console.log();
console.log("Descrição do serviço, para colar igual em todas:");
console.log('  "Assinatura mensal da plataforma Visão de Produto — product analytics"');
