"use client";

/**
 * Criar e arquivar projeto, na tela de Projetos.
 *
 * O que faz: o botão "Criar projeto" com o campo de nome, e o "Arquivar" de
 *            cada linha da lista.
 * Implementa: as ações da tela de Projetos no inventário da seção 10.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arquivarProjeto, criarProjeto } from "./acoes";

/** Botão que abre o campo de nome e cria o projeto. */
export function BotaoCriarProjeto() {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function criar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { slug, erro: falha } = await criarProjeto(nome);
      if (falha || !slug) {
        setErro(falha ?? "Não consegui criar o projeto.");
        return;
      }
      // Vai direto para as Configurações: é lá que a chave de ingestão nasce,
      // e sem chave o projeto não recebe evento nenhum.
      router.push(`/p/${slug}/configuracoes`);
    });
  }

  if (!abrindo) {
    return (
      <button
        onClick={() => setAbrindo(true)}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid var(--line2)",
          background: "var(--elev)",
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        Criar projeto
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") criar();
            if (e.key === "Escape") setAbrindo(false);
          }}
          placeholder="Nome do aplicativo"
          aria-label="Nome do projeto"
          style={{
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--elev)",
            fontSize: 12.5,
            outline: "none",
            minWidth: 200,
          }}
        />
        <button
          onClick={criar}
          disabled={pendente}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: "none",
            background: "var(--pri)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {pendente ? "Criando…" : "Criar"}
        </button>
        <button
          onClick={() => {
            setAbrindo(false);
            setErro(null);
          }}
          style={{
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid var(--line2)",
            background: "var(--elev)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
      {erro && <span style={{ fontSize: 11.5, color: "var(--err)" }}>{erro}</span>}
    </div>
  );
}

/** O "Arquivar" de uma linha da lista, com confirmação em dois toques. */
export function BotaoArquivar({ projetoId, nome }: { projetoId: string; nome: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  function arquivar() {
    iniciarTransicao(async () => {
      await arquivarProjeto(projetoId);
      router.refresh();
    });
  }

  if (confirmando) {
    return (
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={arquivar}
          disabled={pendente}
          title={`Arquivar ${nome}. Os eventos continuam guardados.`}
          style={{
            background: "none",
            border: "1px solid var(--errLine)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11.5,
            color: "var(--err)",
            cursor: "pointer",
          }}
        >
          {pendente ? "Arquivando…" : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: 11.5,
            color: "var(--faint)",
            cursor: "pointer",
          }}
        >
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      style={{
        background: "none",
        border: "none",
        fontSize: 11.5,
        color: "var(--faint)",
        cursor: "pointer",
      }}
    >
      Arquivar
    </button>
  );
}
