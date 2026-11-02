"use client";

/**
 * A tabela de contas da tela de administração.
 *
 * O que faz: lista as contas com plano, assinatura e a medição do mês, e
 *            permite conceder ou remover cortesia.
 * Recebe:    as contas já lidas pela página.
 * Devolve:   a tabela.
 * Implementa: EPICO-COBRANCA.md, seção 7.
 *
 * O que esta tela NÃO mostra, de propósito: nenhum evento, nenhuma propriedade,
 * nenhum `distinct_id`, nenhum catálogo. Para saber se uma conta está viva
 * basta a medição; ler os dados dela não acrescenta nada e destrói a confiança
 * que o produto vende.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirCortesia } from "./acoes";
import type { ContaAdministrada } from "./consultas";

const GRADE = "1.6fr 90px 110px 70px 90px 80px 96px";

/** A cor e o texto de cada estado de assinatura. */
function estadoDaAssinatura(c: ContaAdministrada): { texto: string; cor: string } {
  if (c.cortesia) return { texto: "cortesia", cor: "var(--pri)" };
  if (c.cancelada_em) return { texto: "encerrando", cor: "var(--err)" };
  switch (c.assinatura_status) {
    case "ativa":
      return { texto: "ativa", cor: "var(--ok)" };
    case "atrasada":
      return { texto: "atrasada", cor: "var(--err)" };
    case "cancelada":
      return { texto: "cancelada", cor: "var(--dim)" };
    default:
      return { texto: "—", cor: "var(--faint)" };
  }
}

export function TabelaDeContas({ contas }: { contas: ContaAdministrada[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function alternarCortesia(conta: ContaAdministrada) {
    setErro(null);
    setMexendo(conta.conta_id);
    iniciarTransicao(async () => {
      const { erro: falha } = await definirCortesia(conta.conta_id, !conta.cortesia);
      setMexendo(null);
      if (falha) {
        setErro(falha);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {erro && <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>}

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--panel)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRADE,
            gap: 12,
            padding: "9px 16px",
            borderBottom: "1px solid var(--line)",
            fontSize: 11,
            color: "var(--faint)",
          }}
        >
          <div>Conta</div>
          <div>Plano</div>
          <div>Assinatura</div>
          <div style={{ textAlign: "right" }}>Produtos</div>
          <div style={{ textAlign: "right" }}>Eventos/mês</div>
          <div style={{ textAlign: "right" }}>MCP/mês</div>
          <div />
        </div>

        {contas.map((c) => {
          const estado = estadoDaAssinatura(c);
          return (
            <div
              key={c.conta_id}
              style={{
                display: "grid",
                gridTemplateColumns: GRADE,
                gap: 12,
                padding: "11px 16px",
                borderBottom: "1px solid var(--line)",
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.nome}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--faint)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.email_do_dono ?? "sem dono vinculado"}
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: c.plano === "pago" ? "var(--text)" : "var(--dim)" }}>
                {c.plano}
              </div>

              <div style={{ fontSize: 12, color: estado.cor }}>{estado.texto}</div>

              <div style={{ textAlign: "right", fontSize: 12.5 }}>{c.projetos}</div>
              <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--dim)" }}>
                {Number(c.eventos_no_mes).toLocaleString("pt-BR")}
              </div>
              <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--dim)" }}>
                {c.consultas_no_mes}
              </div>

              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => alternarCortesia(c)}
                  disabled={pendente && mexendo === c.conta_id}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11.5,
                    cursor: "pointer",
                    color: c.cortesia ? "var(--err)" : "var(--pri)",
                  }}
                >
                  {pendente && mexendo === c.conta_id
                    ? "…"
                    : c.cortesia
                      ? "Tirar cortesia"
                      : "Dar cortesia"}
                </button>
              </div>
            </div>
          );
        })}

        {contas.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: "var(--dim)" }}>
            Nenhuma conta ainda.
          </div>
        )}
      </div>
    </>
  );
}
