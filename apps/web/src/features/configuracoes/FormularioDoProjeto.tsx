"use client";

/**
 * Formulário de configurações do projeto.
 *
 * O que faz: edita nome, slug, prefixo de evento e fuso de exibição.
 * Recebe:    o projeto atual.
 * Devolve:   o cartão de edição da tela de Configurações.
 * Implementa: seção 7.3 — o prefixo vazio significa "este projeto não adota
 *             prefixo", e o fuso vale para as telas e para o MCP (regra 11.7).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarProjeto } from "@/features/credenciais/acoes";

/** Fusos oferecidos. A lista é curta de propósito: sem internacionalização na v1. */
const FUSOS = [
  { valor: "America/Sao_Paulo", rotulo: "America/Sao_Paulo (UTC−3)" },
  { valor: "America/Manaus", rotulo: "America/Manaus (UTC−4)" },
  { valor: "America/Belem", rotulo: "America/Belem (UTC−3)" },
  { valor: "UTC", rotulo: "UTC" },
];

const estiloDeCampo: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 7,
  border: "1px solid var(--line)",
  background: "var(--elev)",
  fontSize: 13,
  outline: "none",
};

const estiloDeRotulo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "var(--dim)",
};

export function FormularioDoProjeto({
  projeto,
}: {
  projeto: {
    id: string;
    nome: string;
    slug: string;
    prefixo_evento: string | null;
    fuso_exibicao: string;
  };
}) {
  const router = useRouter();
  const [campos, setCampos] = useState({
    nome: projeto.nome,
    slug: projeto.slug,
    prefixo_evento: projeto.prefixo_evento ?? "",
    fuso_exibicao: projeto.fuso_exibicao,
  });
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function salvar() {
    setMensagem(null);
    iniciarTransicao(async () => {
      const { erro, slug } = await salvarProjeto(projeto.id, campos);
      if (erro) {
        setMensagem({ texto: erro, erro: true });
        return;
      }
      setMensagem({ texto: "Salvo.", erro: false });
      // O slug está na URL: se mudou, a navegação precisa acompanhar.
      if (slug && slug !== projeto.slug) router.replace(`/p/${slug}/configuracoes`);
      else router.refresh();
    });
  }

  return (
    <div
      style={{
        marginTop: 22,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
        padding: "18px 18px 6px",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label style={estiloDeRotulo}>
          Nome
          <input
            value={campos.nome}
            onChange={(e) => setCampos({ ...campos, nome: e.target.value })}
            style={estiloDeCampo}
          />
        </label>

        <label style={estiloDeRotulo}>
          Slug
          <input
            value={campos.slug}
            onChange={(e) => setCampos({ ...campos, slug: e.target.value })}
            style={{ ...estiloDeCampo, fontFamily: "var(--fonte-mono), monospace" }}
          />
        </label>

        <label style={estiloDeRotulo}>
          Prefixo de evento
          <input
            value={campos.prefixo_evento}
            placeholder="psi_"
            onChange={(e) => setCampos({ ...campos, prefixo_evento: e.target.value })}
            style={{ ...estiloDeCampo, fontFamily: "var(--fonte-mono), monospace" }}
          />
        </label>

        <label style={estiloDeRotulo}>
          Fuso de exibição
          <select
            value={campos.fuso_exibicao}
            onChange={(e) => setCampos({ ...campos, fuso_exibicao: e.target.value })}
            style={{ ...estiloDeCampo, padding: "0 8px" }}
          >
            {FUSOS.map((fuso) => (
              <option key={fuso.valor} value={fuso.valor}>
                {fuso.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 0",
          borderTop: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: mensagem?.erro ? "var(--err)" : "var(--dim)",
          }}
        >
          {mensagem?.texto ?? ""}
        </span>
        <button
          onClick={salvar}
          disabled={pendente}
          style={{
            height: 30,
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
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
