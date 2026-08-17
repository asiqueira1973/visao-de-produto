"use client";

/**
 * Seletor de período.
 *
 * O que faz: troca a janela de 7, 14, 30 ou 90 dias, guardando a escolha na URL.
 * Recebe:    a janela ativa.
 * Devolve:   as quatro pílulas usadas na tela de Uso e no Painel.
 * Implementa: as janelas do enum `janela_periodo` (seção 7.2) e o visual de
 *             pílula das telas geradas.
 */

import { useRouter, useSearchParams } from "next/navigation";

const JANELAS = ["7d", "14d", "30d", "90d"] as const;

export function SeletorDePeriodo({ janelaAtual }: { janelaAtual: string }) {
  const router = useRouter();
  const parametros = useSearchParams();

  function trocar(janela: string) {
    const novos = new URLSearchParams(parametros.toString());
    novos.set("janela", janela);
    router.push(`?${novos.toString()}`);
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {JANELAS.map((janela) => {
        const ativa = janela === janelaAtual;
        return (
          <button
            key={janela}
            onClick={() => trocar(janela)}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              border: `1px solid ${ativa ? "var(--pri)" : "var(--line)"}`,
              background: ativa ? "var(--priSoft)" : "var(--elev)",
              color: ativa ? "var(--pri)" : "var(--dim)",
            }}
          >
            {janela.replace("d", " dias")}
          </button>
        );
      })}
    </div>
  );
}
