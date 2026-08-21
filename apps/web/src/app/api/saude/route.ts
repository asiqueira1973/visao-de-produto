/**
 * Rota de saúde — GET /api/saude
 *
 * O que faz: diz em qual ambiente este deploy está falando.
 * Recebe:    nada.
 * Devolve:   JSON com o ambiente da Vercel, o identificador do projeto Supabase
 *            que este deploy usa, o endereço do site e o commit publicado.
 * Implementa: a separação de ambientes do épico 8.9 — sem isto, saber se um
 *             deploy está apontando para dev ou para produção depende de
 *             confiar na configuração, e confiar não é verificar.
 *
 * Nada aqui é segredo: o identificador do projeto Supabase já viaja em todo
 * bundle do navegador, junto da chave `anon`. A `service_role` não é lida nem
 * mencionada — só se diz se ela está presente, nunca o valor.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Identifica o backend a partir da URL do Supabase.
 *
 * Devolve o `ref` do projeto quando o endereço é o do Supabase, e o próprio
 * host quando é domínio próprio — que passou a ser o caso em produção, e fazia
 * esta rota dizer "desconhecido" justamente no ambiente que mais importa.
 */
function identificaOBackend(url: string | undefined): string {
  if (!url) return "não configurado";
  const supabase = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (supabase) return supabase;
  try {
    return new URL(url).host;
  } catch {
    return "endereço inválido";
  }
}

export function GET() {
  return NextResponse.json({
    ambiente: process.env.VERCEL_ENV ?? "local",
    supabase: identificaOBackend(process.env.NEXT_PUBLIC_SUPABASE_URL),
    site: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // Só a presença. O valor nunca sai daqui.
    service_role_configurada: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    // Se a cobrança está ligada neste deploy, e em qual modo. Sem isto, a única
    // forma de saber se as variáveis da Stripe chegaram era entrar na tela de
    // assinatura com uma sessão — e conferir configuração pela interface é o
    // caminho mais lento para descobrir que ela não foi aplicada.
    cobranca: {
      ligada: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
      modo: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
        ? "producao"
        : process.env.STRIPE_SECRET_KEY
          ? "teste"
          : null,
      webhook_configurado: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    },
  });
}
