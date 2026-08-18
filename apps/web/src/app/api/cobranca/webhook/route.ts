/**
 * Webhook da Stripe — POST /api/cobranca/webhook
 *
 * O que faz: recebe os eventos de assinatura da Stripe, confere a assinatura
 *            criptográfica, registra o evento e aplica o efeito uma única vez.
 * Recebe:    o corpo cru do request e o cabeçalho `stripe-signature`.
 * Devolve:   200 quando o evento foi tratado ou já era conhecido; 400 quando a
 *            assinatura não confere; 500 quando o efeito falhou, para a Stripe
 *            reenviar.
 * Implementa: EPICO-COBRANCA.md, seção 3.2.
 *
 * Três coisas aqui não são negociáveis:
 *
 * 1. **A assinatura é conferida antes de o corpo ser lido como JSON.** Webhook
 *    sem verificação é um endpoint onde qualquer um se declara cliente pago.
 * 2. **O corpo precisa chegar cru.** Qualquer reserialização muda um byte e a
 *    assinatura deixa de bater — por isso `req.text()`, e nunca `req.json()`.
 * 3. **A idempotência é do banco.** O `insert` em `eventos_stripe` usa o
 *    `event.id` da própria Stripe como chave primária: evento repetido bate na
 *    chave e o efeito não roda de novo.
 *
 * A rota é pública (está na lista do proxy) porque quem chama é a Stripe, que
 * não tem sessão de navegador. Quem autentica é a assinatura.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/features/cobranca/stripe";
import { aplicarEvento } from "@/features/cobranca/webhook";

export const dynamic = "force-dynamic";

/** Cliente de serviço: o webhook não tem sessão e precisa escrever em `contas`. */
function clienteDeServico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo) {
    console.error("STRIPE_WEBHOOK_SECRET não está definido; recusando o evento");
    return NextResponse.json({ codigo: "webhook_nao_configurado" }, { status: 500 });
  }

  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) {
    return NextResponse.json({ codigo: "assinatura_ausente" }, { status: 400 });
  }

  // Cru, byte a byte, do jeito que a Stripe assinou.
  const corpo = await req.text();

  let evento;
  try {
    evento = stripe.webhooks.constructEvent(corpo, assinatura, segredo);
  } catch (falha) {
    // Não logamos o corpo: ele pode trazer dado de cliente, e um corpo que não
    // passou na verificação não é confiável de nenhuma forma.
    console.error("assinatura do webhook não confere:", (falha as Error).message);
    return NextResponse.json({ codigo: "assinatura_invalida" }, { status: 400 });
  }

  const supabase = clienteDeServico();

  // A porta da idempotência. Se a linha já existe, este evento já chegou antes.
  const { data: registrado, error: erroRegistro } = await supabase
    .from("eventos_stripe")
    .insert({ id: evento.id, tipo: evento.type, carga: evento.data.object })
    .select("id")
    .maybeSingle();

  if (erroRegistro) {
    // 23505 é violação de chave primária: já vimos este evento.
    if (erroRegistro.code === "23505") {
      const { data: anterior } = await supabase
        .from("eventos_stripe")
        .select("processado_em")
        .eq("id", evento.id)
        .maybeSingle();

      // Já aplicado: nada a fazer, e a Stripe não precisa reenviar.
      if (anterior?.processado_em) {
        return NextResponse.json({ recebido: true, repetido: true });
      }
      // Chegou antes mas o efeito não foi aplicado — segue para tentar de novo.
    } else {
      console.error("não consegui registrar o evento", erroRegistro);
      return NextResponse.json({ codigo: "erro_interno" }, { status: 500 });
    }
  }

  void registrado;

  try {
    const { contaId, efeito } = await aplicarEvento(supabase, evento);

    await supabase
      .from("eventos_stripe")
      .update({ conta_id: contaId, processado_em: new Date().toISOString() })
      .eq("id", evento.id);

    console.log(`stripe ${evento.type} (${evento.id}): ${efeito}`);
    return NextResponse.json({ recebido: true });
  } catch (falha) {
    // `processado_em` fica nulo de propósito: assim o reenvio da Stripe passa
    // pela porta de cima e tenta aplicar de novo.
    console.error(`falha ao aplicar ${evento.type} (${evento.id})`, falha);
    return NextResponse.json({ codigo: "erro_ao_aplicar" }, { status: 500 });
  }
}
