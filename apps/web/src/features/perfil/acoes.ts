"use server";

/**
 * Ações da tela de Perfil.
 *
 * O que faz: renomeia a conta, cancela a conta e desfaz o cancelamento.
 * Implementa: regra 11.17 — cancelar preenche `cancelada_em`, os dados ficam
 *             30 dias, a exportação continua disponível e o próprio usuário
 *             desfaz; o expurgo definitivo é do job `expurga_contas`.
 *
 * Nenhum dos três passos exige intervenção do dono da plataforma (princípio
 * 0.6). Por isso não existe "fale com o suporte" em lugar nenhum daqui: a
 * política `contas_dono_total` já limita cada escrita à conta de quem pediu.
 */

import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";
import { registrar } from "@/lib/instrumentacao";
import { avisarCancelamento, esquecerAvisosDeCancelamento } from "@/lib/email/avisos";
import { DIAS_DE_GRACA } from "./dias";

/**
 * Renomeia a conta.
 * Recebe o novo nome.
 * Devolve o erro, quando houver.
 */
export async function renomearConta(nome: string): Promise<{ erro?: string }> {
  const limpo = nome.trim();
  if (!limpo) return { erro: "O nome da conta não pode ficar vazio." };
  if (limpo.length > 80) return { erro: "Use no máximo 80 caracteres." };

  const supabase = await clienteDaSessao();

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const { error } = await supabase
    .from("contas")
    .update({ nome: limpo })
    .eq("id", vinculo.conta_id);

  if (error) return { erro: error.message };

  revalidatePath("/conta/perfil");
  return {};
}

/**
 * Cancela a conta.
 * Recebe nada — a conta sai da sessão.
 * Devolve o erro, quando houver.
 *
 * É soft delete de propósito (regra 11.17): nada é apagado agora. O que muda é
 * o relógio — a partir daqui são 30 dias até `fn_expurga_contas_canceladas()`
 * levar tudo em cascata, e nesse intervalo a exportação continua funcionando.
 */
export async function cancelarConta(): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const { error } = await supabase
    .from("contas")
    .update({ cancelada_em: new Date().toISOString() })
    .eq("id", vinculo.conta_id)
    .is("cancelada_em", null);

  if (error) return { erro: error.message };

  registrar("visao_conta_cancelada", vinculo.conta_id as string, "Perfil");

  // O aviso sai agora, com os 30 dias cheios, e o job diário volta a lembrar
  // aos 7 e ao 1. Este é o único e-mail da plataforma que evita perda de dado:
  // a janela da regra 11.17 só protege quem lembra que pediu, e quem cancela
  // por engano costuma perceber depois de fechar a aba.
  //
  // Falhar aqui não pode impedir o cancelamento — quem pediu para sair sai.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const { count: projetos } = await supabase
        .from("projetos")
        .select("id", { count: "exact", head: true })
        .is("arquivado_em", null);

      const { count: eventos } = await supabase
        .from("eventos")
        .select("id", { count: "exact", head: true });

      await avisarCancelamento({
        contaId: vinculo.conta_id as string,
        email: user.email,
        marco: "imediato",
        dias: DIAS_DE_GRACA,
        projetos: projetos ?? 0,
        eventos: eventos ?? 0,
      });
    }
  } catch {
    // Cancelar é da pessoa; o e-mail é cortesia.
  }

  revalidatePath("/", "layout");
  return {};
}

/**
 * Desfaz o cancelamento.
 * Recebe nada.
 * Devolve o erro, quando houver.
 * Só tem efeito dentro dos 30 dias: depois disso a linha da conta não existe
 * mais, e nem esta sessão existiria.
 */
export async function reativarConta(): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const { error } = await supabase
    .from("contas")
    .update({ cancelada_em: null })
    .eq("id", vinculo.conta_id);

  if (error) return { erro: error.message };

  registrar("visao_conta_reativada", vinculo.conta_id as string, "Perfil");

  // Zera os avisos daquele cancelamento: se um dia ela cancelar de novo, o
  // e-mail que protege os 30 dias precisa sair outra vez.
  await esquecerAvisosDeCancelamento(vinculo.conta_id as string);

  revalidatePath("/", "layout");
  return {};
}
