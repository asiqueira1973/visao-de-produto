"use client";

/**
 * Link de exportação que carrega o filtro da tela.
 *
 * O que faz: monta a URL de exportação repetindo os parâmetros que já estão na
 *            barra de endereço, para o arquivo sair com o mesmo recorte que a
 *            pessoa está vendo.
 * Recebe:    o caminho da rota de exportação e o rótulo do link.
 * Devolve:   o link de baixar.
 * Implementa: seção 13.4 — "CSV dos eventos, respeita o filtro aplicado na
 *             tela". Sem isso o botão exportaria uma coisa e a tela mostraria
 *             outra.
 */

import { useSearchParams } from "next/navigation";

export function LinkDeExportacao({
  caminho,
  rotulo,
  parametros = [],
}: {
  caminho: string;
  rotulo: string;
  /** Quais parâmetros da URL atual repassar para a exportação. */
  parametros?: string[];
}) {
  const atuais = useSearchParams();

  const busca = new URLSearchParams();
  for (const nome of parametros) {
    const valor = atuais.get(nome);
    if (valor) busca.set(nome, valor);
  }

  const url = busca.toString() ? `${caminho}?${busca.toString()}` : caminho;

  return (
    <a
      href={url}
      style={{
        height: 30,
        padding: "0 11px",
        borderRadius: 7,
        border: "1px solid var(--line2)",
        background: "var(--elev)",
        fontSize: 12.5,
        color: "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {rotulo}
    </a>
  );
}
