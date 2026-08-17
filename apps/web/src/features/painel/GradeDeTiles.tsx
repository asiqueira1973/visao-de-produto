"use client";

/**
 * A grade de tiles do Painel.
 *
 * O que faz: desenha cada tile com o número absoluto do período e as barras da
 *            série, e permite fixar e remover eventos.
 * Recebe:    o projeto, a janela, os tiles já com as séries, e os nomes de
 *            evento do catálogo para o seletor.
 * Devolve:   a grade do Painel.
 * Implementa: épico 8.5; regras 11.9, 11.10 e 11.14.
 */

import { useState, useTransition } from "react";
import { dataCurta } from "@/lib/formato";
import { adicionarTile, removerTile } from "./acoes";

/** Uma barra da série, já agrupada pela regra 11.14. */
export interface BarraDaSerie {
  inicio: string;
  fim: string;
  total: number;
  usuariosUnicos: number;
}

/** Um tile pronto para desenhar. */
export interface TileDoPainel {
  id: string;
  nomeEvento: string;
  titulo: string;
  tipoVisualizacao: "serie_temporal" | "total_periodo" | "usuarios_unicos";
  nuncaRecebido: boolean;
  barras: BarraDaSerie[];
}

/** Altura máxima da barra, em pixels, copiada das telas geradas. */
const ALTURA_MAXIMA = 46;

export function GradeDeTiles({
  projetoId,
  slug,
  fuso,
  janela,
  tiles,
  eventosDoCatalogo,
}: {
  projetoId: string;
  slug: string;
  fuso: string;
  janela: string;
  tiles: TileDoPainel[];
  eventosDoCatalogo: string[];
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function fixar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { erro: falha } = await adicionarTile(projetoId, slug, nomeNovo);
      if (falha) {
        setErro(falha);
        return;
      }
      setNomeNovo("");
      setAdicionando(false);
    });
  }

  return (
    <>
      {erro && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>
      )}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(288px, 1fr))",
          gap: 14,
        }}
      >
        {tiles.map((tile) => {
          const total = tile.barras.reduce((soma, b) => soma + b.total, 0);
          const unicosNoPico = Math.max(0, ...tile.barras.map((b) => b.usuariosUnicos));
          const maior = Math.max(1, ...tile.barras.map((b) => b.total));
          const primeira = tile.barras[0];
          const ultima = tile.barras[tile.barras.length - 1];

          const numeroPrincipal =
            tile.tipoVisualizacao === "usuarios_unicos" ? unicosNoPico : total;
          const unidade =
            tile.tipoVisualizacao === "usuarios_unicos"
              ? `pessoas no pico em ${janela.replace("d", " dias")}`
              : `ocorrências em ${janela.replace("d", " dias")}`;

          return (
            <div
              key={tile.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: "14px 16px 12px",
                display: "flex",
                flexDirection: "column",
                minHeight: 196,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>
                    {tile.titulo}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--fonte-mono), monospace",
                      fontSize: 11,
                      color: "var(--faint)",
                      marginTop: 3,
                    }}
                  >
                    {tile.nomeEvento}
                  </div>
                </div>
                <button
                  onClick={() =>
                    iniciarTransicao(async () => {
                      await removerTile(tile.id, slug);
                    })
                  }
                  aria-label={`Remover ${tile.nomeEvento} do painel`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--faint)",
                    fontSize: 15,
                    cursor: "pointer",
                    padding: "0 3px",
                    lineHeight: 1,
                    flex: "none",
                  }}
                >
                  ×
                </button>
              </div>

              {tile.nuncaRecebido ? (
                // Regra 11.9: o aviso substitui o gráfico vazio, e diz o que fazer.
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 12,
                    border: "1px dashed var(--line2)",
                    borderRadius: 9,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--dim)" }}>
                    Este evento nunca foi recebido
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
                    Confira se a chamada existe no app e se o nome está escrito exatamente assim.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    marginTop: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                    <span
                      style={{
                        fontFamily: "var(--fonte-mono), monospace",
                        fontSize: 24,
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {numeroPrincipal}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{unidade}</span>
                  </div>

                  {/* Sempre barras, com rótulo de valor sobre cada uma (regra 11.10). */}
                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 5,
                      height: 68,
                    }}
                  >
                    {tile.barras.map((barra) => (
                      <div
                        key={barra.inicio}
                        title={`${barra.total} em ${dataCurta(barra.inicio, fuso)}`}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--fonte-mono), monospace",
                            fontSize: 9.5,
                            color: barra.total === 0 ? "var(--faint)" : "var(--dim)",
                          }}
                        >
                          {barra.total}
                        </span>
                        <span
                          style={{
                            width: "100%",
                            borderRadius: "3px 3px 0 0",
                            background: barra.total === 0 ? "var(--line2)" : "var(--ok)",
                            height:
                              barra.total === 0
                                ? 2
                                : Math.max(6, Math.round((barra.total / maior) * ALTURA_MAXIMA)),
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* O rótulo mostra o começo e o fim da janela, não de cada barra. */}
                  <div
                    style={{
                      marginTop: 7,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                      color: "var(--faint)",
                    }}
                  >
                    <span>{primeira ? dataCurta(primeira.inicio, fuso) : ""}</span>
                    <span>{ultima ? dataCurta(ultima.fim, fuso) : ""}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {adicionando ? (
          <div
            style={{
              border: "1px solid var(--pri)",
              borderRadius: 12,
              background: "var(--panel)",
              minHeight: 196,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--dim)" }}>
              Escolha um evento do catálogo ou digite um que ainda não chegou.
            </div>
            <input
              list="eventos-do-catalogo"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="psi_novo_pagamento"
              aria-label="Nome do evento"
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 7,
                border: "1px solid var(--line)",
                background: "var(--elev)",
                fontSize: 13,
                fontFamily: "var(--fonte-mono), monospace",
                outline: "none",
              }}
            />
            <datalist id="eventos-do-catalogo">
              {eventosDoCatalogo.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={fixar}
                disabled={pendente}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 7,
                  border: "none",
                  background: "var(--pri)",
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {pendente ? "Fixando…" : "Fixar"}
              </button>
              <button
                onClick={() => {
                  setAdicionando(false);
                  setErro(null);
                }}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 7,
                  border: "1px solid var(--line2)",
                  background: "var(--elev)",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdicionando(true)}
            style={{
              border: "1px dashed var(--line2)",
              borderRadius: 12,
              background: "none",
              minHeight: 196,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              color: "var(--dim)",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 12.5 }}>Adicionar tile</span>
            <span style={{ fontSize: 11, color: "var(--faint)" }}>
              do catálogo ou digitando um evento
            </span>
          </button>
        )}
      </div>
    </>
  );
}
