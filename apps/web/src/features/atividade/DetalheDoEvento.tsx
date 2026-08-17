"use client";

/**
 * Detalhe do evento.
 *
 * O que faz: abre a gaveta de 420px com todos os campos daquele evento e as
 *            propriedades que o app declarou.
 * Recebe:    o evento, o fuso do projeto e os dois retornos de interação.
 * Devolve:   a gaveta sobre a lista de Atividade.
 * Implementa: épico 8.4 e a seção 13.3.
 *
 * A tela não exibe nenhum campo que o app não enviou — é o princípio 0.1 na
 * interface, e a frase do rodapé é conteúdo final do spec (seção 13.3).
 */

import { useEffect, useState } from "react";
import { dataHoraCompleta } from "@/lib/formato";
import type { EventoDaAtividade } from "@/lib/data/tipos";

export function DetalheDoEvento({
  evento,
  fuso,
  aoFechar,
  aoFiltrarPorPessoa,
}: {
  evento: EventoDaAtividade;
  fuso: string;
  aoFechar: () => void;
  aoFiltrarPorPessoa: (pessoa: string) => void;
}) {
  const [copiado, setCopiado] = useState(false);

  // Esc fecha: a tela de Atividade é feita para varrer com o teclado (seção 14).
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const propriedades = evento.propriedades ?? {};
  const temPropriedades = Object.keys(propriedades).length > 0;
  const json = JSON.stringify(propriedades, null, 2);

  // Só entram campos que existem de fato. Campo nulo simplesmente não aparece.
  const campos: Array<{ chave: string; valor: string; mono?: boolean }> = [
    { chave: "Evento", valor: evento.nome, mono: true },
    ...(evento.descricao ? [{ chave: "Descrição", valor: evento.descricao }] : []),
    { chave: "Pessoa", valor: evento.distinct_id, mono: true },
    ...(evento.tela ? [{ chave: "Tela", valor: evento.tela }] : []),
    { chave: "Horário do dispositivo", valor: dataHoraCompleta(evento.ocorrido_em, fuso) },
    { chave: "Horário de recebimento", valor: dataHoraCompleta(evento.recebido_em, fuso) },
  ];

  async function copiarPropriedades() {
    try {
      await navigator.clipboard.writeText(json);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1300);
    } catch {
      // sem permissão de área de transferência
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
      <div
        onClick={aoFechar}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.34)" }}
      />
      <div
        role="dialog"
        aria-label="Detalhe do evento"
        style={{
          position: "relative",
          width: 420,
          height: "100%",
          background: "var(--panel)",
          borderLeft: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-24px 0 60px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            flex: "none",
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>
              {evento.descricao ?? evento.nome}
            </div>
            <div
              style={{
                fontFamily: "var(--fonte-mono), monospace",
                fontSize: 12,
                color: "var(--faint)",
                marginTop: 4,
              }}
            >
              {evento.nome}
            </div>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            style={{
              flex: "none",
              background: "none",
              border: "none",
              fontSize: 16,
              color: "var(--faint)",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 20px 20px" }}>
          {campos.map((campo) => (
            <div
              key={campo.chave}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 14,
                padding: "11px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span style={{ flex: "none", fontSize: 12, color: "var(--faint)" }}>
                {campo.chave}
              </span>
              <span
                style={{
                  fontSize: campo.mono ? 12.5 : 13,
                  textAlign: "right",
                  fontFamily: campo.mono ? "var(--fonte-mono), monospace" : "inherit",
                  color: "var(--text)",
                  lineHeight: 1.45,
                }}
              >
                {campo.valor}
              </span>
            </div>
          ))}

          {temPropriedades && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--faint)" }}>
                  Propriedades declaradas pelo app
                </span>
                <button
                  onClick={copiarPropriedades}
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
                  {copiado ? "Copiado" : "Copiar valor"}
                </button>
              </div>
              <pre
                style={{
                  margin: "9px 0 0",
                  padding: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 9,
                  background: "var(--code)",
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 12,
                  lineHeight: 1.7,
                  overflowX: "auto",
                }}
              >
                {json}
              </pre>
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 }}>
            Estes são todos os campos deste evento. Nada é capturado automaticamente.
          </div>

          <button
            onClick={() => aoFiltrarPorPessoa(evento.distinct_id)}
            style={{
              marginTop: 16,
              width: "100%",
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--line2)",
              background: "var(--elev)",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Filtrar Atividade por {evento.distinct_id}
          </button>
        </div>
      </div>
    </div>
  );
}
