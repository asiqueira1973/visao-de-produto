"use server";

/**
 * Ações da tela de administração.
 *
 * O que faz: concede e remove cortesia.
 * Implementa: EPICO-COBRANCA.md, decisões C5 e C7.
 *
 * A verificação de admin **não acontece aqui**. Ela acontece dentro da função
 * do banco, que é o único lugar onde vale: uma checagem no código do site seria
 * contornável por quem chamasse a API diretamente.
 */

import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";

/**
 * Concede ou remove a cortesia de uma conta.
 * Recebe a conta e se é para conceder.
 * Devolve o erro, quando houver.
 */
export async function definirCortesia(
  contaId: string,
  conceder: boolean,
): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { error } = await supabase.rpc("fn_admin_define_cortesia", {
    p_conta_id: contaId,
    p_conceder: conceder,
  });

  if (error) {
    // A mensagem do banco já é explicativa (`nao_autorizado:`, `conta_inexistente:`).
    return { erro: error.message };
  }

  revalidatePath("/admin");
  return {};
}
