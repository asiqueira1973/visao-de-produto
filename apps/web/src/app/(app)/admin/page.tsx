/**
 * Tela de administração da plataforma.
 *
 * O que faz: lista todas as contas com plano, assinatura e medição do mês, e
 *            mostra a auditoria das ações de admin.
 * Lê:        `fn_admin_contas` e `fn_admin_auditoria`, que conferem o admin
 *            dentro do banco.
 * Devolve:   a página `/admin`, ou 404 para quem não é admin.
 * Implementa: EPICO-COBRANCA.md, seção 7; decisão C5.
 *
 * Quem não é admin recebe **404**, e não "acesso negado": um 403 confirma que
 * a página existe, e não há por que contar isso a quem não deveria estar aqui.
 *
 * A tela não mostra evento, propriedade nem identificador de ninguém. Para
 * saber se uma conta está viva basta a medição.
 */

import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { auditoria, contasAdministradas, ehAdmin } from "@/features/admin/consultas";
import { TabelaDeContas } from "@/features/admin/TabelaDeContas";
import { horarioRelativo } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** O que cada ação da auditoria quer dizer, em português de gente. */
const DESCRICAO_DA_ACAO: Record<string, string> = {
  consultou_contas: "abriu a lista de contas",
  consultou_conta: "abriu uma conta",
  concedeu_cortesia: "deu cortesia",
  removeu_cortesia: "tirou a cortesia",
  promoveu_admin: "promoveu a admin",
  revogou_admin: "revogou o admin",
};

export default async function Admin() {
  const supabase = await clienteDaSessao();

  if (!(await ehAdmin(supabase))) notFound();

  const [contas, acoes] = await Promise.all([
    contasAdministradas(supabase),
    auditoria(supabase, 30),
  ]);

  const pagas = contas.filter((c) => c.plano === "pago" && !c.cortesia).length;
  const cortesias = contas.filter((c) => c.cortesia).length;
  const atrasadas = contas.filter((c) => c.assinatura_status === "atrasada").length;
  const receita = pagas * 50;

  const resumo = [
    { rotulo: "Contas", valor: contas.length.toString() },
    { rotulo: "Pagantes", valor: pagas.toString() },
    { rotulo: "Cortesias", valor: cortesias.toString() },
    { rotulo: "Em atraso", valor: atrasadas.toString() },
    { rotulo: "Receita mensal", valor: `R$ ${receita.toLocaleString("pt-BR")}` },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px" }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Administração</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6, maxWidth: 640 }}>
          Todas as contas da plataforma, com plano, assinatura e o que consumiram neste mês.
          Nenhum evento, propriedade ou identificador de usuário aparece aqui — nem para você.
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
            gap: 10,
          }}
        >
          {resumo.map((r) => (
            <div
              key={r.rotulo}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: "13px 15px",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{r.rotulo}</div>
              <div style={{ marginTop: 5, fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>
                {r.valor}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 26, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Contas</div>
        <TabelaDeContas contas={contas} />

        <div style={{ marginTop: 30, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Auditoria
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            overflow: "hidden",
          }}
        >
          {acoes.map((a, i) => (
            <div
              key={`${a.feito_em}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr 110px",
                gap: 12,
                padding: "9px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                fontSize: 12,
                alignItems: "center",
              }}
            >
              <div style={{ color: "var(--dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.email_admin ?? "—"}
              </div>
              <div style={{ color: "var(--dim)" }}>
                {DESCRICAO_DA_ACAO[a.acao] ?? a.acao}
                {a.nome_alvo && <span style={{ color: "var(--text)" }}> · {a.nome_alvo}</span>}
              </div>
              <div style={{ textAlign: "right", color: "var(--faint)", fontSize: 11.5 }}>
                {horarioRelativo(a.feito_em)}
              </div>
            </div>
          ))}
          {acoes.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--dim)" }}>
              Nenhuma ação registrada ainda.
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.65 }}>
          A auditoria registra toda ação de admin, inclusive as suas. Auditoria com exceção para o
          dono não é auditoria.
        </div>
      </div>
    </div>
  );
}
