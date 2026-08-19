/**
 * O webhook da Stripe: assinatura, idempotência e efeito.
 *
 * O que cobre: a rota `/api/cobranca/webhook` de ponta a ponta — recusa de
 *              assinatura inválida, promoção da conta ao plano pago, marcação
 *              de pagamento atrasado, e o mesmo evento chegando duas vezes.
 * Implementa: EPICO-COBRANCA.md seção 3.2, e a linha "cobrança" da seção 19.
 *
 * Não depende da Stripe estar acessível: os eventos são assinados aqui, com o
 * mesmo esquema que ela usa (`t=<época>,v1=<hmac sha256 de "época.corpo">`).
 * Isso testa exatamente o que interessa — que a rota só aceita o que está
 * assinado com o segredo certo, e que o efeito acontece uma vez só.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { clienteDeServico, env, montarCenario, type Cenario } from "./apoio.js";

const SITE = env.SITE_LOCAL ?? "http://localhost:3000";
const SEGREDO = env.STRIPE_WEBHOOK_SECRET!;
const ROTA = `${SITE}/api/cobranca/webhook`;

let conta: Cenario;

/** Assina o corpo do jeito que a Stripe assina. */
function assinar(corpo: string, segredo = SEGREDO, quando = Math.floor(Date.now() / 1000)) {
  const hmac = createHmac("sha256", segredo).update(`${quando}.${corpo}`).digest("hex");
  return `t=${quando},v1=${hmac}`;
}

/** Manda um evento para a rota, assinado (ou não, para testar a recusa). */
async function enviar(evento: Record<string, unknown>, opcoes: { segredo?: string } = {}) {
  const corpo = JSON.stringify(evento);
  const resposta = await fetch(ROTA, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": assinar(corpo, opcoes.segredo ?? SEGREDO),
    },
    body: corpo,
  });
  const resultado = (await resposta.json()) as Record<string, unknown>;
  return { status: resposta.status, corpo: resultado };
}

/** Lê o estado de cobrança da conta do cenário. */
async function estadoDaConta() {
  const { data } = await clienteDeServico()
    .from("contas")
    .select("plano, retencao_meses, limite_projetos, assinatura_id, assinatura_status, periodo_fim, stripe_cliente_id")
    .eq("id", conta.contaId)
    .single();
  return data!;
}

const CLIENTE_STRIPE = "cus_teste_da_suite";

beforeAll(async () => {
  // Esta suíte fala com o site rodando, e não só com o banco. Sem o servidor
  // no ar, os oito testes falham com "fetch failed" — mensagem que não diz o
  // que fazer e que já custou um susto de achar que a cobrança tinha quebrado.
  try {
    await fetch(`${SITE}/api/saude`, { signal: AbortSignal.timeout(4_000) });
  } catch {
    throw new Error(
      `O site não respondeu em ${SITE}. Esta suíte precisa dele no ar: rode \`pnpm dev\` ` +
        "antes, ou aponte SITE_LOCAL para um ambiente publicado.",
    );
  }

  conta = await montarCenario("webhook");
}, 60_000);

afterAll(async () => {
  await clienteDeServico().from("eventos_stripe").delete().eq("conta_id", conta.contaId);
  await conta?.limpar();
});

describe("a assinatura do webhook é o que autentica", () => {
  it("recusa evento assinado com o segredo errado", async () => {
    const r = await enviar(
      { id: `evt_${randomUUID()}`, type: "checkout.session.completed", data: { object: {} } },
      { segredo: "whsec_o_segredo_de_outra_pessoa" },
    );
    expect(r.status).toBe(400);
    expect(r.corpo.codigo as string).toBe("assinatura_invalida");
  }, 30_000);

  it("recusa evento sem cabeçalho de assinatura", async () => {
    const resposta = await fetch(ROTA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_sem_assinatura", type: "invoice.paid" }),
    });
    expect(resposta.status).toBe(400);
  }, 30_000);

  it("não deixa rastro no banco quando a assinatura não confere", async () => {
    const id = `evt_${randomUUID()}`;
    await enviar(
      { id, type: "checkout.session.completed", data: { object: {} } },
      { segredo: "whsec_errado" },
    );

    const { data } = await clienteDeServico()
      .from("eventos_stripe")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    expect(data, "evento não verificado foi registrado no banco").toBeNull();
  }, 30_000);
});

describe("checkout concluído promove a conta", () => {
  const idDoEvento = `evt_${randomUUID()}`;

  it("a conta começa gratuita, com um projeto e um mês", async () => {
    const antes = await estadoDaConta();
    expect(antes.plano).toBe("gratuito");
    expect(antes.retencao_meses).toBe(1);
    expect(antes.limite_projetos).toBe(1);
  }, 30_000);

  it("depois do evento, vira paga com projetos ilimitados e 12 meses", async () => {
    const r = await enviar({
      id: idDoEvento,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_teste",
          client_reference_id: conta.contaId,
          customer: CLIENTE_STRIPE,
          subscription: "sub_teste_da_suite",
        },
      },
    });
    expect(r.status).toBe(200);

    const depois = await estadoDaConta();
    expect(depois.plano).toBe("pago");
    expect(depois.retencao_meses).toBe(12);
    // Nulo em `limite_projetos` é a forma de dizer "sem limite" (seção 7.9).
    expect(depois.limite_projetos).toBeNull();
    expect(depois.assinatura_status).toBe("ativa");
    expect(depois.assinatura_id).toBe("sub_teste_da_suite");
    expect(depois.stripe_cliente_id).toBe(CLIENTE_STRIPE);
  }, 30_000);

  it("o mesmo evento de novo não faz nada, e responde 200", async () => {
    // Rebaixa à mão para provar que um reenvio NÃO reaplica o efeito.
    await clienteDeServico()
      .from("contas")
      .update({ plano: "gratuito", retencao_meses: 1, limite_projetos: 1 })
      .eq("id", conta.contaId);

    const r = await enviar({
      id: idDoEvento,
      type: "checkout.session.completed",
      data: {
        object: { client_reference_id: conta.contaId, customer: CLIENTE_STRIPE, subscription: "sub_teste_da_suite" },
      },
    });

    expect(r.status).toBe(200);
    expect(r.corpo.repetido as boolean, "o evento repetido não foi reconhecido").toBe(true);

    const depois = await estadoDaConta();
    expect(depois.plano, "o efeito foi aplicado duas vezes").toBe("gratuito");
  }, 30_000);
});

describe("os outros eventos de assinatura", () => {
  it("pagamento que falha marca a conta como atrasada, sem rebaixar", async () => {
    await clienteDeServico()
      .from("contas")
      .update({ plano: "pago", retencao_meses: 12, limite_projetos: null })
      .eq("id", conta.contaId);

    const r = await enviar({
      id: `evt_${randomUUID()}`,
      type: "invoice.payment_failed",
      data: { object: { customer: CLIENTE_STRIPE } },
    });
    expect(r.status).toBe(200);

    const depois = await estadoDaConta();
    expect(depois.assinatura_status).toBe("atrasada");
    // Decisão C6: atraso não rebaixa. Quem rebaixa é o job, e só depois do
    // período pago vencer.
    expect(depois.plano).toBe("pago");
    expect(depois.retencao_meses).toBe(12);
  }, 30_000);

  it("cancelar guarda a data de fim e NÃO rebaixa na hora", async () => {
    const fim = Math.floor(Date.now() / 1000) + 15 * 86_400;

    const r = await enviar({
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_teste_da_suite",
          customer: CLIENTE_STRIPE,
          status: "canceled",
          items: { data: [{ current_period_end: fim }] },
        },
      },
    });
    expect(r.status).toBe(200);

    const depois = await estadoDaConta();
    expect(depois.assinatura_status).toBe("cancelada");
    expect(depois.plano, "cancelar rebaixou na hora, e não devia").toBe("pago");
    expect(depois.periodo_fim).not.toBeNull();
    expect(new Date(depois.periodo_fim!).getTime()).toBeGreaterThan(Date.now());
  }, 30_000);

  it("evento que não é sobre assinatura é ignorado sem erro", async () => {
    const r = await enviar({
      id: `evt_${randomUUID()}`,
      type: "payment_intent.created",
      data: { object: { id: "pi_qualquer" } },
    });
    expect(r.status).toBe(200);
  }, 30_000);
});
