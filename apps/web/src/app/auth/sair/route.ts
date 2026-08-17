/**
 * Sair.
 * O que faz: encerra a sessão e volta para o login.
 * Implementa: seção 6.1 — logout explícito no rodapé do menu lateral.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clienteDaSessao } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await clienteDaSessao();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
