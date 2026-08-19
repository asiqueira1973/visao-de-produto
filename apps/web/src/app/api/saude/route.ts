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

/** Extrai o `ref` do projeto a partir da URL do Supabase. */
function refDoProjeto(url: string | undefined): string {
  return url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "desconhecido";
}

export function GET() {
  return NextResponse.json({
    ambiente: process.env.VERCEL_ENV ?? "local",
    supabase: refDoProjeto(process.env.NEXT_PUBLIC_SUPABASE_URL),
    site: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // Só a presença. O valor nunca sai daqui.
    service_role_configurada: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
