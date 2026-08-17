/**
 * Volta do Google.
 *
 * O que faz: troca o código do OAuth pela sessão e grava o cookie httpOnly.
 * Recebe:    `code` do Google e `de`, o caminho para onde a pessoa queria ir.
 * Devolve:   redirecionamento para o destino, ou para o login com aviso de erro.
 * Implementa: seção 6.1. A conta é criada sozinha na primeira entrada, pela
 *             trigger `trg_usuario_criado_cria_conta` (seção 5.2) — não há nada
 *             para aprovar aqui (princípio 0.6).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  const de = url.searchParams.get("de");
  const destino = de && de.startsWith("/") ? de : "/projetos";

  if (!codigo) {
    return NextResponse.redirect(new URL("/login?erro=callback", url.origin));
  }

  const armazemDeCookies = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return armazemDeCookies.getAll();
        },
        setAll(paraGravar) {
          for (const { name, value, options } of paraGravar) {
            armazemDeCookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(codigo);

  if (error) {
    return NextResponse.redirect(new URL("/login?erro=callback", url.origin));
  }

  return NextResponse.redirect(new URL(destino, url.origin));
}
