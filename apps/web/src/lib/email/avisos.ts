/**
 * Os avisos que a plataforma manda, cada um uma vez só.
 *
 * O que faz: registra que o aviso vai sair, manda, e desfaz o registro se o
 *            envio falhar.
 * Recebe:    a conta, o destinatário e os números que o texto cita.
 * Devolve:   `true` quando saiu agora, `false` quando já tinha saído antes ou
 *            quando o envio falhou. **Nunca lança.**
 * Implementa: a tabela `avisos_enviados` da migration 20260820030000.
 *
 * A ORDEM DAS DUAS ESCRITAS IMPORTA, e não é a intuitiva:
 *
 * Primeiro **reserva** a vaga na tabela, depois manda. A chave única
 * (conta, tipo, referência) faz a reserva falhar se alguém já reservou — e é
 * isso que garante que duas execuções simultâneas do job diário não escrevam
 * duas vezes para a mesma pessoa. Mandar primeiro e registrar depois abriria
 * exatamente essa janela.
 *
 * Se o envio falhar, a reserva é **apagada**, para o job de amanhã tentar de
 * novo. Sem isso, uma indisponibilidade de dez minutos do Bird viraria um aviso
 * perdido para sempre — e no caso do cancelamento, dado perdido junto.
 */

import { clienteDeServico } from "@/lib/supabase/server";
import { enviarEmail } from "./bird";
import { boasVindas, contaCancelada, pagamentoFalhou, pertoDoTeto } from "./mensagens";
import type { Mensagem } from "./mensagens";

type TipoDeAviso = "boas_vindas" | "cancelamento" | "teto" | "pagamento";

/**
 * Reserva, manda e desfaz em caso de erro.
 * Recebe a conta, o tipo, a referência, o destino e a mensagem pronta.
 * Devolve se saiu agora.
 */
async function mandarUmaVez(
  contaId: string,
  tipo: TipoDeAviso,
  referencia: string,
  para: string,
  mensagem: Mensagem,
): Promise<boolean> {
  const servico = clienteDeServico();

  // A reserva: se já existe, `select()` volta vazio e ninguém manda de novo.
  const { data: reservado, error: erroDaReserva } = await servico
    .from("avisos_enviados")
    .insert({ conta_id: contaId, tipo, referencia })
    .select("id")
    .maybeSingle();

  if (erroDaReserva || !reservado) return false;

  const r = await enviarEmail({
    para,
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
  });

  if (!r.ok) {
    // Devolve a vaga, para amanhã tentar de novo.
    await servico.from("avisos_enviados").delete().eq("id", reservado.id);
    console.error(`aviso ${tipo}/${referencia} não saiu para a conta ${contaId}: ${r.erro}`);
    return false;
  }

  return true;
}

/**
 * Boas-vindas, na primeira entrada.
 * Recebe a conta, o e-mail e o nome de quem entrou.
 * Devolve se saiu agora. A referência é fixa: existe uma só por conta.
 */
export async function avisarBoasVindas(d: {
  contaId: string;
  email: string;
  nome?: string | null;
}): Promise<boolean> {
  // O texto trata a pessoa pelo primeiro nome; o nome inteiro soa a formulário.
  const primeiro = d.nome?.trim().split(/\s+/)[0] ?? null;
  return mandarUmaVez(d.contaId, "boas_vindas", "unica", d.email, boasVindas({ nome: primeiro }));
}

/**
 * Conta cancelada, faltam N dias.
 * Recebe a conta, o destino, os dias restantes e o que existe na conta.
 * Devolve se saiu agora. A referência é o marco — 'imediato', '7' ou '1'.
 */
export async function avisarCancelamento(d: {
  contaId: string;
  email: string;
  marco: "imediato" | "7" | "1";
  dias: number;
  projetos: number;
  eventos: number;
}): Promise<boolean> {
  return mandarUmaVez(
    d.contaId,
    "cancelamento",
    d.marco,
    d.email,
    contaCancelada({ dias: d.dias, projetos: d.projetos, eventos: d.eventos }),
  );
}

/**
 * Passou de 80% do teto de eventos do mês.
 * Recebe a conta, o destino e os números do consumo.
 * Devolve se saiu agora. A referência é a competência: um aviso por mês.
 */
export async function avisarTeto(d: {
  contaId: string;
  email: string;
  competencia: string;
  usados: number;
  teto: number;
  percentual: number;
}): Promise<boolean> {
  return mandarUmaVez(
    d.contaId,
    "teto",
    d.competencia,
    d.email,
    pertoDoTeto({ usados: d.usados, teto: d.teto, percentual: d.percentual }),
  );
}

/**
 * Pagamento recusado.
 * Recebe a conta, o destino e a data da tentativa.
 * Devolve se saiu agora.
 *
 * Ainda não tem chamador: entra quando a cobrança for ligada em produção, no
 * webhook do Stripe. Fica aqui porque o texto e o transporte já estão provados,
 * e escrever isso no meio do webhook depois seria a pior hora para descobrir
 * que o envio não funciona.
 */
export async function avisarPagamentoFalhou(d: {
  contaId: string;
  email: string;
  faturaId: string;
  tentativaEm: string;
}): Promise<boolean> {
  return mandarUmaVez(
    d.contaId,
    "pagamento",
    // A referência é a fatura: o Stripe tenta a mesma cobrança mais de uma vez,
    // e a segunda recusa da mesma fatura não pode virar um segundo e-mail.
    d.faturaId,
    d.email,
    pagamentoFalhou({ tentativaEm: d.tentativaEm }),
  );
}

/**
 * Esquece os avisos de cancelamento de uma conta.
 * Recebe a conta.
 * Devolve nada, e nunca lança.
 *
 * Chamado quando a pessoa desfaz o cancelamento. Sem isso, quem cancela,
 * se arrepende e cancela de novo meses depois não receberia aviso nenhum na
 * segunda vez — a reserva da primeira ainda estaria lá, e o e-mail que existe
 * justamente para evitar perda de dado seria o único a faltar.
 */
export async function esquecerAvisosDeCancelamento(contaId: string): Promise<void> {
  try {
    await clienteDeServico()
      .from("avisos_enviados")
      .delete()
      .eq("conta_id", contaId)
      .eq("tipo", "cancelamento");
  } catch {
    // Reativar a conta é o que importa.
  }
}
