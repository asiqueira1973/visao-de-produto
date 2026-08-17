"use client";

/**
 * As linhas editáveis do Catálogo.
 *
 * O que faz: mostra cada evento com a descrição num campo editável, marcando em
 *            tracejado o que ainda não foi descrito, e salva ao sair do campo.
 * Recebe:    o projeto, o fuso e as linhas do catálogo.
 * Devolve:   a tabela do Catálogo.
 * Implementa: épico 8.5 e regra 11.2.
 *
 * O contorno tracejado nos vazios vem das telas geradas: ele transforma "faltam
 * descrições" em algo que se vê de longe, sem precisar de contador.
 */

import { useState } from "react";
import { dataCurta, horarioRelativo } from "@/lib/formato";
import { salvarDescricaoDoEvento } from "@/features/credenciais/acoes";
import type { LinhaDoCatalogo } from "@/app/(app)/p/[slug]/catalogo/page";

const GRADE = "minmax(280px,1fr) 150px 72px 96px 96px";

export function LinhasDoCatalogo({
  projetoId,
  fuso,
  linhas,
}: {
  projetoId: string;
  fuso: string;
  linhas: LinhaDoCatalogo[];
}) {
  const [descricoes, setDescricoes] = useState<Record<string, string>>(
    Object.fromEntries(linhas.map((l) => [l.nome, l.descricao ?? ""])),
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const pendentes = Object.values(descricoes).filter((d) => !d.trim()).length;

  async function salvar(nome: string) {
    setSalvando(nome);
    setErro(null);
    const { erro: falha } = await salvarDescricaoDoEvento(
      projetoId,
      nome,
      descricoes[nome] ?? "",
    );
    if (falha) setErro(falha);
    setSalvando(null);
  }

  return (
    <>
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--pri)" }}>
        {pendentes === 0
          ? "Todos os eventos têm descrição."
          : `${pendentes} ${pendentes === 1 ? "evento sem descrição" : "eventos sem descrição"} — o contorno tracejado marca o que falta curar.`}
      </div>

      {erro && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--err)" }}>
          Não foi possível salvar: {erro}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--panel)",
          overflowX: "auto",
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
            minWidth: 760,
          }}
        >
          <div>Evento e descrição</div>
          <div>Telas</div>
          <div style={{ textAlign: "right" }}>Total</div>
          <div style={{ textAlign: "right" }}>Primeira</div>
          <div style={{ textAlign: "right" }}>Última</div>
        </div>

        {linhas.map((linha) => {
          const valor = descricoes[linha.nome] ?? "";
          const faltando = !valor.trim();
          return (
            <div
              key={linha.nome}
              style={{
                display: "grid",
                gridTemplateColumns: GRADE,
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid var(--line)",
                alignItems: "center",
                minWidth: 760,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <input
                  value={valor}
                  placeholder="Descreva o que este evento significa"
                  aria-label={`Descrição de ${linha.nome}`}
                  onChange={(e) =>
                    setDescricoes((atuais) => ({ ...atuais, [linha.nome]: e.target.value }))
                  }
                  onBlur={() => void salvar(linha.nome)}
                  style={{
                    width: "100%",
                    height: 30,
                    padding: "0 8px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    outline: "none",
                    borderRadius: 7,
                    background: "transparent",
                    border: `1px ${faltando ? "dashed var(--pri)" : "solid transparent"}`,
                    color: "var(--text)",
                    opacity: salvando === linha.nome ? 0.6 : 1,
                  }}
                />
                <div
                  style={{
                    fontFamily: "var(--fonte-mono), monospace",
                    fontSize: 11.5,
                    color: "var(--faint)",
                    marginTop: 3,
                    paddingLeft: 8,
                  }}
                >
                  {linha.nome}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.45 }}>
                {linha.telas.length > 0 ? linha.telas.join(", ") : "—"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 13,
                }}
              >
                {linha.total_ocorrencias}
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "var(--dim)" }}>
                {linha.primeira_ocorrencia_em
                  ? dataCurta(linha.primeira_ocorrencia_em, fuso)
                  : "—"}
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "var(--dim)" }}>
                {linha.ultima_ocorrencia_em
                  ? horarioRelativo(linha.ultima_ocorrencia_em)
                  : "nunca"}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
