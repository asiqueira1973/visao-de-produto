"use client";

/**
 * Edição do nome da conta.
 *
 * O que faz: mostra o nome atual num campo e salva a alteração.
 * Recebe:    o nome atual.
 * Devolve:   a linha editável do cartão de informações do Perfil.
 * Implementa: a política `contas_dono_total` — o dono edita a própria conta.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renomearConta } from "./acoes";

export function NomeDaConta({ nomeAtual }: { nomeAtual: string }) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeAtual);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const mudou = nome.trim() !== nomeAtual;

  function salvar() {
    setMensagem(null);
    iniciarTransicao(async () => {
      const { erro } = await renomearConta(nome);
      if (erro) {
        setMensagem({ texto: erro, erro: true });
        return;
      }
      setMensagem({ texto: "Salvo.", erro: false });
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome da conta"
          style={{
            flex: 1,
            minWidth: 0,
            height: 32,
            padding: "0 10px",
            borderRadius: 7,
            border: "1px solid var(--line)",
            background: "var(--elev)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={salvar}
          disabled={pendente || !mudou}
          style={{
            flex: "none",
            height: 32,
            padding: "0 12px",
            borderRadius: 7,
            border: "1px solid var(--line2)",
            background: "var(--elev)",
            fontSize: 12.5,
            color: mudou ? "var(--text)" : "var(--faint)",
            cursor: mudou ? "pointer" : "default",
          }}
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {mensagem && (
        <div
          style={{
            marginTop: 7,
            fontSize: 11.5,
            color: mensagem.erro ? "var(--err)" : "var(--ok)",
          }}
        >
          {mensagem.texto}
        </div>
      )}
    </div>
  );
}
