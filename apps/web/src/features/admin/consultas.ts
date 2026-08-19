/**
 * As leituras da tela de administração.
 *
 * O que faz: chama as funções de agregado do banco e devolve tipadas.
 * Recebe:    o cliente da sessão.
 * Devolve:   as contas e a auditoria.
 * Implementa: EPICO-COBRANCA.md, seção 7.
 *
 * Tudo aqui passa por função que confere o admin **dentro do banco**. Não há
 * verificação só no código do site: se alguém chamar a função por fora, a
 * resposta é a mesma exceção.
 */

import type { clienteDaSessao } from "@/lib/supabase/server";

/** Uma conta, do ponto de vista de quem administra a plataforma. */
export interface ContaAdministrada {
  conta_id: string;
  nome: string;
  email_do_dono: string | null;
  plano: "gratuito" | "pago";
  cortesia: boolean;
  assinatura_status: "nenhuma" | "ativa" | "atrasada" | "cancelada";
  periodo_fim: string | null;
  criada_em: string;
  cancelada_em: string | null;
  projetos: number;
  eventos_no_mes: number;
  pessoas_no_mes: number;
  consultas_no_mes: number;
  tem_dados_de_nota: boolean;
}

/** Uma linha da auditoria. */
export interface AcaoDeAdmin {
  feito_em: string;
  email_admin: string | null;
  acao: string;
  conta_alvo: string | null;
  nome_alvo: string | null;
  detalhe: Record<string, unknown>;
}

type Cliente = Awaited<ReturnType<typeof clienteDaSessao>>;

/** Diz se quem está logado administra a plataforma. */
export async function ehAdmin(supabase: Cliente): Promise<boolean> {
  const { data } = await supabase.rpc("fn_eh_admin");
  return data === true;
}

/** As contas, com a medição do mês corrente. */
export async function contasAdministradas(supabase: Cliente): Promise<ContaAdministrada[]> {
  const { data } = await supabase.rpc("fn_admin_contas");
  return (data ?? []) as ContaAdministrada[];
}

/** As ações de admin mais recentes. */
export async function auditoria(supabase: Cliente, limite = 30): Promise<AcaoDeAdmin[]> {
  const { data } = await supabase.rpc("fn_admin_auditoria", { p_limite: limite });
  return (data ?? []) as AcaoDeAdmin[];
}
