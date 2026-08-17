/**
 * Cliente do Supabase para o navegador.
 *
 * O que faz: cria o cliente que os componentes de cliente usam para iniciar o
 *            login com Google e para as edições feitas na tela.
 * Implementa: seção 6.1. Usa apenas a chave pública; a de serviço nunca entra
 *             no bundle (seção 17.3).
 */

import { createBrowserClient } from "@supabase/ssr";

/** Devolve o cliente do navegador, sujeito à RLS como `authenticated`. */
export function clienteDoNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
