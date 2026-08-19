/**
 * Reconciliação das assinaturas — GET /api/cobranca/reconciliar
 *
 * O que faz: relê no Stripe o estado de cada assinatura e corrige o que estiver
 *            divergente no banco.
 * Recebe:    o cabeçalho de autorização do agendador.
 * Devolve:   quantas contas foram conferidas e quantas foram corrigidas.
 * Implementa: EPICO-COBRANCA.md, seção 6 — o job da linha "reconcilia".
 *
 * POR QUE ESTE JOB EXISTE, e por que ele é o mais importante dos três:
 *
 * O banco guarda um ESPELHO do estado da assinatura. A verdade mora no Stripe.
 * Webhook chega fora de ordem, chega duplicado, e às vezes **não chega** — o
 * endpoint estava fora do ar, o deploy estava no meio, a rede falhou. Quando um
 * se perde, o espelho fica errado para sempre, e alguém que pagou continua no
 * plano gratuito sem entender por quê.
 *
 * Este job é a rede embaixo do trapézio: uma vez por dia ele ignora o espelho e
 * pergunta ao Stripe. É por isso que o webhook pode falhar sem virar incidente.
 *
 * Quem chama é o agendador da Vercel, com o segredo em `CRON_SECRET`. Sem ele,
 * a rota recusa: um endpoint que lê o estado de todas as contas não pode ficar
 * aberto.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, cobrancaConfigurada, PLANOS } from "@/features/cobranca/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** O mesmo mapeamento do webhook: o estado do Stripe vira o nosso enum. */
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
      return "nenhuma";
  }
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = req.headers.get("authorization");

  if (!segredo || autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ codigo: "nao_autorizado" }, { status: 401 });
  }

  if (!cobrancaConfigurada()) {
    return NextResponse.json({ codigo: "cobranca_nao_configurada" }, { status: 200 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Conta em cortesia não tem assinatura para conferir (decisão C7).
  const { data: contas, error } = await supabase
    .from("contas")
    .select("id, plano, assinatura_id, assinatura_status, periodo_fim, stripe_cliente_id")
    .eq("cortesia", false)
    .not("stripe_cliente_id", "is", null);

  if (error) {
    console.error("reconciliação: não consegui listar as contas", error);
    return NextResponse.json({ codigo: "erro_interno" }, { status: 500 });
  }

  let conferidas = 0;
  let corrigidas = 0;
  const divergencias: string[] = [];

  for (const conta of contas ?? []) {
    conferidas += 1;

    try {
      // Pergunta ao Stripe qual é a assinatura desta pessoa, ignorando o que o
      // banco acha que sabe. É o ponto inteiro do job.
      const lista = await stripe().subscriptions.list({
        customer: conta.stripe_cliente_id as string,
        status: "all",
        limit: 1,
      });

      const assinatura = lista.data[0];

      // Cliente sem assinatura nenhuma: se o banco acha que é pago, está errado.
      if (!assinatura) {
        if (conta.plano === "pago") {
          await supabase
            .from("contas")
            .update({
              assinatura_status: "nenhuma",
              assinatura_id: null,
              periodo_fim: null,
            })
            .eq("id", conta.id);
          corrigidas += 1;
          divergencias.push(`${conta.id}: banco dizia pago, Stripe não tem assinatura`);
        }
        continue;
      }

      const statusReal = traduzirStatus(assinatura.status);
      const item = assinatura.items?.data?.[0];
      const fimReal = item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null;

      const planoReal = statusReal === "ativa" ? "pago" : conta.plano;

      const mudou =
        conta.assinatura_status !== statusReal ||
        conta.assinatura_id !== assinatura.id ||
        (conta.periodo_fim ?? null) !== fimReal ||
        conta.plano !== planoReal;

      if (!mudou) continue;

      await supabase
        .from("contas")
        .update({
          assinatura_id: assinatura.id,
          assinatura_status: statusReal,
          periodo_fim: fimReal,
          // Só promove. Rebaixar é do job de rebaixamento, que espera o período
          // pago vencer (decisão C6) — reconciliação não tira nada de ninguém.
          ...(statusReal === "ativa" && conta.plano !== "pago"
            ? {
                plano: "pago",
                retencao_meses: PLANOS.pago.retencaoMeses,
                limite_projetos: PLANOS.pago.projetos,
              }
            : {}),
        })
        .eq("id", conta.id);

      corrigidas += 1;
      divergencias.push(
        `${conta.id}: banco dizia ${conta.assinatura_status}, Stripe diz ${statusReal}`,
      );
    } catch (falha) {
      console.error(`reconciliação: falhei na conta ${conta.id}`, falha);
      // Uma conta com problema não pode impedir as outras de serem conferidas.
    }
  }

  if (divergencias.length > 0) {
    console.log("reconciliação corrigiu:", divergencias.join(" | "));
  }

  return NextResponse.json({ conferidas, corrigidas, divergencias });
}
