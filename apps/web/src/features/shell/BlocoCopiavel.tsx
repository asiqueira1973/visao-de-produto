"use client";

/**
 * Bloco de código com botão de copiar.
 *
 * O que faz: mostra um trecho em fonte monoespaçada e copia para a área de
 *            transferência, com o aviso "Copiado" da tela mockada.
 * Recebe:    o texto a exibir e, opcionalmente, o rótulo do cabeçalho.
 * Devolve:   o bloco usado no estado vazio, na tela de Configurações e nas
 *            Credenciais MCP.
 * Implementa: o padrão visual dos blocos copiáveis das telas geradas.
 */

import { useState } from "react";

export function BlocoCopiavel({
  texto,
  rotulo,
  quebrarLinha = false,
}: {
  texto: string;
  rotulo?: string;
  quebrarLinha?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1300);
    } catch {
      // Navegador sem permissão de área de transferência: o texto continua
      // visível na tela para seleção manual.
    }
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
        }}
      >
        <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{rotulo ?? "Comando"}</span>
        <button
          onClick={copiar}
          style={{
            background: "none",
            border: "1px solid var(--line2)",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 11,
            color: copiado ? "var(--pri)" : "var(--dim)",
            cursor: "pointer",
          }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 13,
          background: "var(--code)",
          fontFamily: "var(--fonte-mono), monospace",
          fontSize: 12,
          lineHeight: 1.75,
          color: "var(--dim)",
          overflowX: "auto",
          whiteSpace: quebrarLinha ? "pre-wrap" : "pre",
          wordBreak: quebrarLinha ? "break-all" : "normal",
        }}
      >
        {texto}
      </pre>
    </div>
  );
}
