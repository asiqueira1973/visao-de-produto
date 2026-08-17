/**
 * Clientes do Supabase para o lado do servidor.
 *
 * O que faz: cria o cliente autenticado pela sessão do usuário (que respeita
 *            RLS) e, separadamente, o cliente de serviço (que a ignora).
 * Implementa: seções 6.1, 6.2 e 17.3.
 *
 * A separação é o ponto: quase tudo no site usa o cliente da sessão, e é a RLS
 * que garante que ninguém veja dado de outra conta. O cliente de serviço existe
 * só para as duas operações que a matriz 5.1 não dá ao papel `authenticated` —
 * apagar os eventos de um titular (seção 17.2) — e nunca chega ao navegador.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente ligado à sessão de quem está navegando.
 * Devolve um cliente cujo papel é `authenticated`, sujeito a todas as políticas
 * de RLS da seção 6.2.
 */
export async function clienteDaSessao() {
  const armazemDeCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return armazemDeCookies.getAll();
        },
        setAll(paraGravar) {
          try {
            for (const { name, value, options } of paraGravar) {
              armazemDeCookies.set(name, value, options);
            }
          } catch {
            // Server Component não pode gravar cookie; quem renova a sessão é
            // o middleware. Ignorar aqui é o comportamento recomendado.
          }
        },
      },
    },
  );
}

/**
 * Cliente de serviço, que ignora RLS por desenho.
 * Devolve um cliente com `service_role`.
 *
 * ATENÇÃO: quem usa este cliente precisa filtrar por `conta_id` na mão. Ele só
 * pode ser importado de rota de servidor — a chave nunca vai para o bundle
 * (seção 17.3).
 */
export function clienteDeServico() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
