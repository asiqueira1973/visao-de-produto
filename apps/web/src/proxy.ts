/**
 * Proxy de sessão (o antigo middleware; no Next 16 o arquivo se chama proxy).
 *
 * O que faz: renova o cookie de sessão a cada navegação e manda quem não está
 *            logado para o login.
 * Recebe:    o request da navegação.
 * Devolve:   a resposta, possivelmente com os cookies renovados ou com um
 *            redirecionamento.
 * Implementa: seção 6.1 — sessão de 30 dias com refresh automático — e o
 *             critério do épico 8.4: sem sessão, qualquer rota vai para o login.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rotas que existem justamente para quem ainda não entrou. */
const ROTAS_PUBLICAS = ["/login", "/auth/callback", "/auth/erro"];

export default async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(paraGravar) {
          for (const { name, value } of paraGravar) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of paraGravar) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser valida o token com o servidor de auth. getSession leria o cookie
  // sem verificar, o que não serve para decidir acesso.
  const { data: { user } } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const ehPublica = ROTAS_PUBLICAS.some((rota) => caminho.startsWith(rota));

  if (!user && !ehPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    // Guarda para onde a pessoa queria ir, e leva ela até lá depois do login.
    destino.searchParams.set("de", caminho);
    return NextResponse.redirect(destino);
  }

  if (user && caminho === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/projetos";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  // Tudo, menos os assets estáticos do próprio Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
