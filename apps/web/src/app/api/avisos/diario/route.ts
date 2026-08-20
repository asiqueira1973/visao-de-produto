/**
 * Os avisos do dia — GET /api/avisos/diario
 *
 * O que faz: pergunta ao banco quem precisa ser avisado hoje e manda os e-mails.
 * Recebe:    o cabeçalho de autorização do agendador.
 * Devolve:   quantos avisos saíram, por tipo.
 * Implementa: os e-mails 1 e 3 do backlog de e-mail transacional do `CLAUDE.md`,
 *             usando `fn_avisos_de_cancelamento()` e `fn_avisos_de_teto()`.
 *
 * POR QUE O ENVIO MORA AQUI, E NÃO NO BANCO: o Postgres já dispara HTTP pelo
 * `pg_net` — é assim que a instrumentação da própria plataforma funciona. Mas
 * fazer o envio de e-mail por lá obrigaria a guardar a chave do Bird dentro do
 * banco, ao lado do dado dos clientes. A chave fica na Vercel, e o banco só
 * responde *quem* precisa ser avisado.
 *
 * QUEM DECIDE É O BANCO. As duas funções já excluem quem foi avisado, então
 * esta rota não tem regra de negócio nenhuma: ela lê a lista e manda. Rodar
 * duas vezes no mesmo dia não escreve duas vezes para ninguém — a garantia é a
 * chave única em `avisos_enviados`, não a esperteza deste arquivo.
 */

import { NextResponse } from "next/server";
import { clienteDeServico } from "@/lib/supabase/server";
import { avisarCancelamento, avisarTeto } from "@/lib/email/avisos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface LinhaDeCancelamento {
  conta_id: string;
  email: string;
  dias: number;
  projetos: number;
  eventos: number;
}

interface LinhaDeTeto {
  conta_id: string;
  email: string;
  usados: number;
  teto: number;
  percentual: number;
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = req.headers.get("authorization");

  if (!segredo || autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ codigo: "nao_autorizado" }, { status: 401 });
  }

  const servico = clienteDeServico();
  const competencia = new Date().toISOString().slice(0, 7);

  let cancelamentos = 0;
  let tetos = 0;
  const falhas: string[] = [];

  const { data: aCancelar, error: erroCancelamento } = await servico.rpc(
    "fn_avisos_de_cancelamento",
  );

  if (erroCancelamento) {
    falhas.push(`cancelamento: ${erroCancelamento.message}`);
  } else {
    for (const linha of (aCancelar ?? []) as LinhaDeCancelamento[]) {
      const saiu = await avisarCancelamento({
        contaId: linha.conta_id,
        email: linha.email,
        // A função só devolve 7 ou 1; o marco é o próprio número de dias.
        marco: String(linha.dias) as "7" | "1",
        dias: linha.dias,
        projetos: linha.projetos,
        eventos: Number(linha.eventos),
      });
      if (saiu) cancelamentos++;
    }
  }

  const { data: noTeto, error: erroTeto } = await servico.rpc("fn_avisos_de_teto");

  if (erroTeto) {
    falhas.push(`teto: ${erroTeto.message}`);
  } else {
    for (const linha of (noTeto ?? []) as LinhaDeTeto[]) {
      const saiu = await avisarTeto({
        contaId: linha.conta_id,
        email: linha.email,
        competencia,
        usados: Number(linha.usados),
        teto: linha.teto,
        percentual: linha.percentual,
      });
      if (saiu) tetos++;
    }
  }

  // Falha de consulta é erro de verdade: o job silencioso é o que faz um aviso
  // sumir sem ninguém saber. Falha de envio já foi registrada em `avisos`, que
  // devolve a vaga para amanhã.
  return NextResponse.json(
    { cancelamentos, tetos, falhas },
    { status: falhas.length > 0 ? 500 : 200 },
  );
}
