/**
 * O que cada evento da Stripe faz no banco.
 *
 * O que faz: aplica o efeito de um evento de assinatura sobre a conta, uma vez
 *            só, e devolve o que aconteceu.
 * Recebe:    o evento já verificado e o cliente de serviço do Supabase.
 * Devolve:   uma descrição curta do efeito, para o log e para a auditoria.
 * Implementa: EPICO-COBRANCA.md, seção 3.2.
 *
 * A regra que governa este arquivo: **a volta do navegador não muda plano
 * nenhum.** Quem muda é o webhook. Redirect é o navegador falando; webhook é a
 * Stripe falando, e só um dos dois é confiável.
 *
 * A idempotência não mora aqui: mora na chave primária de `eventos_stripe`, que
 * é o `event.id` da própria Stripe. Este arquivo só é chamado quando o insert
 * daquela linha disse que o evento é inédito.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANOS } from "./stripe";

/** O que a assinatura da Stripe vira no nosso enum. */
function traduzirStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "ativa";
    case "past_due":
    case "unpaid":
      return "atrasada";
    case "canceled":
    case "incomplete_expired":
      return "cancelada";
    default:
      // `incomplete` e `paused`: a assinatura existe mas não está valendo.
      return "nenhuma";
  }
}

/** Sobe a conta para o plano pago, com os limites da decisão C4. */
async function promover(
  supabase: SupabaseClient,
  contaId: string,
  campos: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("contas")
    .update({
      plano: "pago",
      retencao_meses: PLANOS.pago.retencaoMeses,
      limite_projetos: PLANOS.pago.projetos,
      ...campos,
    })
    .eq("id", contaId);
}

/**
 * Acha a conta de uma assinatura.
 * Tenta primeiro pelo id da assinatura, que é o vínculo mais direto, e cai para
 * o id de cliente — necessário no primeiro evento, quando a assinatura ainda
 * não foi gravada de nosso lado.
 */
async function acharConta(
  supabase: SupabaseClient,
  assinaturaId: string | null,
  clienteId: string | null,
): Promise<string | null> {
  if (assinaturaId) {
    const { data } = await supabase
      .from("contas")
      .select("id")
      .eq("assinatura_id", assinaturaId)
      .maybeSingle();
    if (data) return data.id as string;
  }

  if (clienteId) {
    const { data } = await supabase
      .from("contas")
      .select("id")
      .eq("stripe_cliente_id", clienteId)
      .maybeSingle();
    if (data) return data.id as string;
  }

  return null;
}

/**
 * Aplica o evento.
 * Devolve a conta afetada e uma frase do que foi feito; conta nula significa
 * "evento que não é sobre nenhuma conta nossa", e isso não é erro.
 */
export async function aplicarEvento(
  supabase: SupabaseClient,
  evento: Stripe.Event,
): Promise<{ contaId: string | null; efeito: string }> {
  switch (evento.type) {
    // O pagamento entrou. É AQUI que a conta vira paga, e não na volta do
    // navegador: a sessão de checkout carrega o id da conta em
    // `client_reference_id`, posto por nós ao criar a sessão.
    case "checkout.session.completed": {
      const sessao = evento.data.object as Stripe.Checkout.Session;
      const contaId = sessao.client_reference_id;
      if (!contaId) return { contaId: null, efeito: "sessão sem conta de referência" };

      await promover(supabase, contaId, {
        stripe_cliente_id: typeof sessao.customer === "string" ? sessao.customer : null,
        assinatura_id: typeof sessao.subscription === "string" ? sessao.subscription : null,
        assinatura_status: "ativa",
      });

      return { contaId, efeito: "conta promovida ao plano pago" };
    }

    // Renovação, mudança de cartão, cancelamento agendado, retomada. Espelha o
    // estado e a data de fim do período — nada é rebaixado aqui.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const assinatura = evento.data.object as Stripe.Subscription;
      const clienteId =
        typeof assinatura.customer === "string" ? assinatura.customer : null;

      const contaId = await acharConta(supabase, assinatura.id, clienteId);
      if (!contaId) return { contaId: null, efeito: "assinatura sem conta conhecida" };

      const status =
        evento.type === "customer.subscription.deleted"
          ? "cancelada"
          : traduzirStatus(assinatura.status);

      // `current_period_end` é quando o período já pago acaba. É esta data que
      // o job de rebaixamento espera vencer antes de mexer em qualquer coisa.
      const item = assinatura.items?.data?.[0];
      const fim = item?.current_period_end ?? null;

      await supabase
        .from("contas")
        .update({
          assinatura_id: assinatura.id,
          assinatura_status: status,
          periodo_fim: fim ? new Date(fim * 1000).toISOString() : null,
          stripe_cliente_id: clienteId,
        })
        .eq("id", contaId);

      return { contaId, efeito: `assinatura agora está ${status}` };
    }

    // A cobrança falhou. A Stripe cuida das retentativas; do nosso lado só
    // marcamos, porque quem rebaixa é o job, depois do período vencer.
    case "invoice.payment_failed": {
      const fatura = evento.data.object as Stripe.Invoice;
      const clienteId = typeof fatura.customer === "string" ? fatura.customer : null;

      const contaId = await acharConta(supabase, null, clienteId);
      if (!contaId) return { contaId: null, efeito: "fatura sem conta conhecida" };

      await supabase
        .from("contas")
        .update({ assinatura_status: "atrasada" })
        .eq("id", contaId);

      return { contaId, efeito: "pagamento falhou; assinatura marcada como atrasada" };
    }

    // Pagamento voltou depois de uma falha.
    case "invoice.paid": {
      const fatura = evento.data.object as Stripe.Invoice;
      const clienteId = typeof fatura.customer === "string" ? fatura.customer : null;

      const contaId = await acharConta(supabase, null, clienteId);
      if (!contaId) return { contaId: null, efeito: "fatura sem conta conhecida" };

      await promover(supabase, contaId, { assinatura_status: "ativa" });
      return { contaId, efeito: "pagamento confirmado; assinatura ativa" };
    }

    default:
      return { contaId: null, efeito: `evento ignorado: ${evento.type}` };
  }
}
