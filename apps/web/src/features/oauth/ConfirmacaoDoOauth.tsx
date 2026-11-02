"use client";

/**
 * O botão que aprova a conexão de um aplicativo.
 *
 * O que faz: lista o que o aplicativo vai poder fazer e, no clique, cria o
 *            código e devolve o navegador para ele.
 * Recebe:    os dados do pedido OAuth, já validados no servidor.
 * Devolve:   o cartão de consentimento.
 * Implementa: épico 8.8.
 *
 * O texto diz o que o token PODE e o que ele NÃO pode. Consentimento que não
 * explica o escopo não é consentimento.
 */

import { useState, useTransition } from "react";
import { aprovarConexao } from "./acoes";

export function ConfirmacaoDoOauth({
  nomeDoCliente,
  clientId,
  redirectUri,
  codeChallenge,
  estado,
}: {
  nomeDoCliente: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  estado: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  function aprovar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { destino, erro: falha } = await aprovarConexao({
        clientId,
        redirectUri,
        codeChallenge,
        estado,
      });

      if (falha || !destino) {
        setErro(falha ?? "Não consegui autorizar.");
        return;
      }

      setPronto(true);
      window.location.href = destino;
    });
  }

  const item: React.CSSProperties = { lineHeight: 1.7 };

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
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>O que {nomeDoCliente} vai poder fazer</div>
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--dim)" }}>
        <li style={item}>Ler os eventos, o catálogo e as pessoas de todos os seus produtos</li>
        <li style={item}>Rodar consultas de leitura sobre esses dados</li>
      </ul>

      <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 600 }}>O que ele não pode</div>
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--dim)" }}>
        <li style={item}>Gravar, alterar ou apagar qualquer coisa</li>
        <li style={item}>Criar produto, editar catálogo ou mexer em credenciais</li>
      </ul>

      {erro && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>}

      <button
        onClick={aprovar}
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
        {pronto ? "Conectado, voltando…" : pendente ? "Autorizando…" : "Autorizar"}
      </button>

      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 }}>
        A conexão vira um token na tela de Credenciais MCP, com o nome deste aplicativo. Você pode
        revogar quando quiser, e ele para de funcionar na hora.
      </div>
    </div>
  );
}
