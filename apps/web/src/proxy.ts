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

/**
 * Rotas que existem justamente para quem ainda não entrou.
 *
 * As três primeiras são o login. As de OAuth entram porque um cliente de agente
 * precisa se registrar e trocar o código SEM sessão de navegador — quem exige
 * sessão é só a tela de consentimento, `/oauth/autorizar`, que fica de fora
 * desta lista de propósito (épico 8.8).
 */
const ROTAS_PUBLICAS = [
  "/login",
  "/auth/callback",
  "/auth/erro",
  "/.well-known/",
  "/oauth/registrar",
  "/oauth/token",
  // Diz para qual ambiente este deploy aponta. Pública de propósito: é o que
  // permite conferir um deploy sem entrar nele.
  "/api/saude",
  // Ninguém deveria precisar criar conta para ler as regras que vai aceitar ao
  // criar a conta. A mesma página existe em /conta/termos, dentro do app.
  "/termos",
  // Quem chama é a Stripe, que não tem sessão de navegador. Quem autentica o
  // request é a assinatura criptográfica, conferida dentro da própria rota.
  "/api/cobranca/webhook",
  // Quem chama é o agendador da Vercel, que também não tem sessão. Quem
  // autentica é o CRON_SECRET, conferido dentro da rota.
  "/api/cobranca/reconciliar",
  "/api/avisos/diario",
];

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
    const destino = new URL("/login", request.url);
    // Guarda para onde a pessoa queria ir — COM a query string. Sem ela, quem
    // cai no login vindo de /oauth/autorizar volta sem client_id nem
    // code_challenge, e a autorização morre dizendo "pedido incompleto".
    destino.searchParams.set("de", `${caminho}${request.nextUrl.search}`);
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
