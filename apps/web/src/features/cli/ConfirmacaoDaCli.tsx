"use client";

/**
 * Botão de confirmação da instalação pela CLI.
 *
 * O que faz: cria projeto e credenciais e devolve o pacote para o terminal,
 *            redirecionando o navegador para a porta que a CLI está escutando.
 * Recebe:    o nome e o slug pedidos, e a porta e o estado sorteados pela CLI.
 * Devolve:   o cartão de confirmação da tela de autorização.
 * Implementa: épico 8.7.
 *
 * O `estado` volta junto na URL: é o que prova para a CLI que a resposta é da
 * chamada dela, e não de outra aba qualquer.
 */

import { useState, useTransition } from "react";
import { autorizarInstalacao } from "@/app/(app)/cli/autorizar/acoes";

export function ConfirmacaoDaCli({
  nome,
  slug,
  porta,
  estado,
}: {
  nome: string;
  slug: string;
  porta: number;
  estado: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  function autorizar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { pacote, erro: falha } = await autorizarInstalacao(nome, slug);

      if (falha || !pacote) {
        setErro(falha ?? "Não consegui criar o projeto.");
        return;
      }

      setPronto(true);
      // As credenciais voltam para a CLI pela porta local que ela abriu. É o
      // mesmo desenho de qualquer login de linha de comando: o segredo nunca
      // passa por servidor de terceiro.
      const dados = btoa(JSON.stringify(pacote))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      window.location.href = `http://127.0.0.1:${porta}/?dados=${dados}&estado=${encodeURIComponent(estado)}`;
    });
  }

  return (
    <div
      style={{
        marginTop: 22,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
        padding: 18,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>O que vai acontecer</div>
      <ul
        style={{
          margin: "10px 0 0",
          paddingLeft: 18,
          fontSize: 12.5,
          color: "var(--dim)",
          lineHeight: 1.7,
        }}
      >
        <li>
          Criar o projeto <strong style={{ color: "var(--text)" }}>{nome}</strong> com o slug{" "}
          <code style={{ fontFamily: "var(--fonte-mono), monospace" }}>{slug}</code>
        </li>
        <li>Gerar uma chave de ingestão para ele, que só escreve neste projeto</li>
        <li>Gerar um token de leitura para o Claude consultar seus projetos</li>
        <li>Devolver os dois para o terminal, que grava o .env e configura o MCP</li>
      </ul>

      {erro && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>
      )}

      <button
        onClick={autorizar}
        disabled={pendente || pronto}
        style={{
          marginTop: 16,
          height: 36,
          padding: "0 14px",
          borderRadius: 8,
          border: "none",
          background: "var(--pri)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: pendente || pronto ? "default" : "pointer",
        }}
      >
        {pronto ? "Pronto, volte ao terminal" : pendente ? "Criando…" : "Autorizar e criar projeto"}
      </button>

      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 }}>
        As credenciais aparecem uma única vez e vão direto para o seu terminal. Nada delas fica
        guardado aqui — o banco só tem o hash.
      </div>
    </div>
  );
}
