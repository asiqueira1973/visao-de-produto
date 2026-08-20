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
import { avisarBoasVindas } from "@/lib/email/avisos";

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

  const { data: sessao, error } = await supabase.auth.exchangeCodeForSession(codigo);

  if (error) {
    return NextResponse.redirect(new URL("/login?erro=callback", url.origin));
  }

  // As boas-vindas saem daqui, e não da trigger que cria a conta, porque a
  // trigger roda dentro do banco e mandar e-mail de lá obrigaria a guardar a
  // chave do Bird ao lado do dado dos clientes.
  //
  // É esperado que este bloco rode em toda entrada, não só na primeira: quem
  // decide se o e-mail sai é a chave única de `avisos_enviados`, uma linha por
  // conta. Repetir a chamada é barato e é o que torna o envio à prova de
  // primeira sessão interrompida no meio.
  //
  // Falhar aqui nunca pode impedir alguém de entrar — por isso o try/catch
  // engole tudo e o redirecionamento acontece de qualquer jeito.
  try {
    const usuario = sessao?.user;
    if (usuario?.email) {
      const { data: vinculo } = await supabase
        .from("usuarios_conta")
        .select("conta_id")
        .maybeSingle();

      if (vinculo?.conta_id) {
        await avisarBoasVindas({
          contaId: vinculo.conta_id as string,
          email: usuario.email,
          nome: (usuario.user_metadata?.full_name as string | undefined) ?? null,
        });
      }
    }
  } catch {
    // Entrar é mais importante do que ser cumprimentado.
  }

  return NextResponse.redirect(new URL(destino, url.origin));
}
