"use client";

/**
 * Zona de perigo do Perfil: cancelar a conta e desfazer o cancelamento.
 *
 * O que faz: explica exatamente o que será apagado, exige que a pessoa digite
 *            uma palavra para confirmar, cancela — e, quando a conta já está
 *            cancelada, mostra quantos dias faltam e o botão de reativar.
 * Recebe:    a data de cancelamento (nula quando a conta está ativa) e a
 *            contagem do que existe na conta hoje.
 * Devolve:   o último cartão da tela de Perfil.
 * Implementa: regra 11.17 — 30 dias, reversível pelo próprio usuário, com a
 *             exportação funcionando o tempo todo.
 *
 * A confirmação digitada existe porque o botão é irreversível depois de 30 dias
 * e não há ninguém do outro lado para desfazer (princípio 0.6).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarConta, reativarConta } from "./acoes";
import { DIAS_DE_GRACA } from "./dias";

/** A palavra que destrava o botão. */
const CONFIRMACAO = "APAGAR";

export function ZonaDePerigo({
  canceladaEm,
  diasRestantes,
  projetos,
  eventos,
}: {
  canceladaEm: string | null;
  /** Quantos dias faltam para o expurgo. Calculado no servidor, de propósito. */
  diasRestantes: number;
  projetos: number;
  eventos: number;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const cancelada = Boolean(canceladaEm);

  function cancelar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { erro: falha } = await cancelarConta();
      if (falha) {
        setErro(falha);
        return;
      }
      setTexto("");
      router.refresh();
    });
  }

  function reativar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { erro: falha } = await reativarConta();
      if (falha) {
        setErro(falha);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      style={{
        border: `1px solid ${cancelada ? "var(--err)" : "var(--errLine)"}`,
        borderRadius: 12,
        background: cancelada ? "var(--errSoft)" : "var(--panel)",
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--err)" }}>
        {cancelada ? "Esta conta está marcada para exclusão" : "Zona de perigo"}
      </div>

      {cancelada ? (
        <>
          <div
            style={{
              marginTop: 7,
              fontSize: 12.5,
              color: "var(--dim)",
              lineHeight: 1.7,
            }}
          >
            O cancelamento foi pedido em{" "}
            <strong style={{ color: "var(--text)" }}>
              {new Date(canceladaEm!).toLocaleDateString("pt-BR")}
            </strong>
            . Faltam{" "}
            <strong style={{ color: "var(--err)" }}>
              {diasRestantes} {diasRestantes === 1 ? "dia" : "dias"}
            </strong>{" "}
            para tudo ser apagado em definitivo. Até lá nada foi perdido: os dados continuam aqui, a
            exportação continua funcionando e você pode desfazer com um clique.
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={reativar}
              disabled={pendente}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 7,
                border: "1px solid var(--pri)",
                background: "var(--priSoft)",
                color: "var(--pri)",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {pendente ? "Reativando…" : "Manter minha conta"}
            </button>
            <a
              href="/conta/exportar"
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 7,
                border: "1px solid var(--line2)",
                background: "var(--elev)",
                color: "var(--text)",
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Exportar tudo antes
            </a>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              marginTop: 7,
              fontSize: 12.5,
              color: "var(--dim)",
              lineHeight: 1.7,
            }}
          >
            Apagar a conta remove{" "}
            <strong style={{ color: "var(--text)" }}>
              {projetos} {projetos === 1 ? "produto" : "produtos"}
            </strong>
            ,{" "}
            <strong style={{ color: "var(--text)" }}>
              {eventos.toLocaleString("pt-BR")}{" "}
              {eventos === 1 ? "evento" : "eventos"}
            </strong>{" "}
            e tudo que veio junto: catálogo, pessoas, painéis, chaves de ingestão e tokens de
            leitura. Os aplicativos que ainda estiverem mandando evento passam a receber erro de
            credencial.
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 12.5,
              color: "var(--dim)",
              lineHeight: 1.7,
            }}
          >
            Nada é apagado na hora. Os dados ficam por{" "}
            <strong style={{ color: "var(--text)" }}>{DIAS_DE_GRACA} dias</strong>, período em que
            você pode exportar e voltar atrás sozinho. Depois disso, a exclusão é definitiva e não
            existe recuperação — nem por nós.{" "}
            <a href="/conta/exportar">Exporte seus dados</a> antes, se ainda não exportou.
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>
                Para confirmar, digite {CONFIRMACAO}
              </span>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                aria-label={`Digite ${CONFIRMACAO} para confirmar`}
                placeholder={CONFIRMACAO}
                style={{
                  height: 32,
                  width: 168,
                  padding: "0 10px",
                  borderRadius: 7,
                  border: "1px solid var(--line)",
                  background: "var(--elev)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </label>
            <button
              onClick={cancelar}
              disabled={pendente || texto.trim().toUpperCase() !== CONFIRMACAO}
              style={{
                marginTop: 17,
                height: 32,
                padding: "0 14px",
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 500,
                border: "1px solid",
                borderColor:
                  texto.trim().toUpperCase() === CONFIRMACAO ? "var(--err)" : "var(--line)",
                background:
                  texto.trim().toUpperCase() === CONFIRMACAO ? "var(--errSoft)" : "var(--elev)",
                color: texto.trim().toUpperCase() === CONFIRMACAO ? "var(--err)" : "var(--faint)",
                cursor: texto.trim().toUpperCase() === CONFIRMACAO ? "pointer" : "default",
              }}
            >
              {pendente ? "Apagando…" : "Apagar minha conta"}
            </button>
          </div>
        </>
      )}

      {erro && <div style={{ marginTop: 10, fontSize: 12, color: "var(--err)" }}>{erro}</div>}
    </div>
  );
}
