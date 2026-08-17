"use client";

/**
 * Cartão da chave de ingestão.
 *
 * O que faz: mostra a chave ativa pelo prefixo, gera outra e revoga.
 * Recebe:    o projeto e as chaves de ingestão dele.
 * Devolve:   o cartão da tela de Configurações.
 * Implementa: seção 6.3 e regras 5.1.1 e 5.1.3.
 *
 * O valor completo aparece uma única vez, logo depois de gerar. Depois disso o
 * banco só tem o hash — não existe "mostrar de novo", e a tela diz isso.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarChaveDeIngestao, revogarCredencial } from "@/features/credenciais/acoes";
import { horarioRelativo } from "@/lib/formato";
import type { Credencial } from "@/lib/data/tipos";

export function ChaveDeIngestao({
  projetoId,
  slug,
  chaves,
}: {
  projetoId: string;
  slug: string;
  chaves: Credencial[];
}) {
  const router = useRouter();
  const [valorNovo, setValorNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const ativas = chaves.filter((c) => !c.revogada_em);
  const ativa = ativas[0];

  function gerar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { valor, erro: falha } = await gerarChaveDeIngestao(
        projetoId,
        `Chave de ${slug}`,
      );
      if (falha) {
        setErro(falha);
        return;
      }
      setValorNovo(valor ?? null);
      router.refresh();
    });
  }

  function revogar(id: string) {
    setErro(null);
    iniciarTransicao(async () => {
      const { erro: falha } = await revogarCredencial(id, `/p/${slug}/configuracoes`);
      if (falha) setErro(falha);
      router.refresh();
    });
  }

  async function copiar() {
    if (!valorNovo) return;
    try {
      await navigator.clipboard.writeText(valorNovo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1300);
    } catch {
      // sem permissão de área de transferência
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Chave de ingestão (API key)</div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
            É a API key deste projeto: vai no header{" "}
            <code style={{ fontFamily: "var(--fonte-mono), monospace" }}>x-api-key</code> e na
            variável{" "}
            <code style={{ fontFamily: "var(--fonte-mono), monospace" }}>VISAO_API_KEY</code>. Ela
            só escreve, e só neste projeto. O valor completo não fica armazenado.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button
            onClick={gerar}
            disabled={pendente}
            style={{
              height: 29,
              padding: "0 11px",
              borderRadius: 7,
              border: "1px solid var(--line2)",
              background: "var(--elev)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {pendente ? "Gerando…" : "Gerar nova"}
          </button>
          {ativa && (
            <button
              onClick={() => revogar(ativa.id)}
              disabled={pendente}
              style={{
                height: 29,
                padding: "0 11px",
                borderRadius: 7,
                border: "1px solid var(--errLine)",
                background: "var(--errSoft)",
                color: "var(--err)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Revogar
            </button>
          )}
        </div>
      </div>

      {erro && <div style={{ marginTop: 10, fontSize: 12, color: "var(--err)" }}>{erro}</div>}

      {ativa ? (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            border: "1px solid var(--line)",
            borderRadius: 9,
            padding: "10px 12px",
            background: "var(--code)",
          }}
        >
          <span style={{ fontFamily: "var(--fonte-mono), monospace", fontSize: 12.5 }}>
            {ativa.prefixo}…
          </span>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            {ativa.ultimo_uso_em
              ? `último uso ${horarioRelativo(ativa.ultimo_uso_em)}`
              : "nunca usada"}
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--dim)" }}>
          Este projeto não tem chave ativa. Gere uma para o app conseguir enviar eventos.
        </div>
      )}

      {valorNovo && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--pri)",
            borderRadius: 10,
            background: "var(--priSoft)",
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pri)" }}>
            Copie agora. Esta chave não será mostrada de novo.
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--code)",
              padding: "10px 12px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--fonte-mono), monospace",
                fontSize: 12.5,
                wordBreak: "break-all",
              }}
            >
              {valorNovo}
            </span>
            <button
              onClick={copiar}
              style={{
                flex: "none",
                background: "none",
                border: "1px solid var(--line2)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 11,
                color: copiado ? "var(--pri)" : "var(--dim)",
                cursor: "pointer",
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <button
            onClick={() => setValorNovo(null)}
            style={{
              marginTop: 10,
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 11.5,
              color: "var(--faint)",
              cursor: "pointer",
            }}
          >
            Já copiei, ocultar
          </button>
        </div>
      )}

      {chaves.some((c) => c.revogada_em) && (
        <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--faint)" }}>
          {chaves.filter((c) => c.revogada_em).length} chave(s) revogada(s) continuam no
          histórico — é o que preserva o rastro de qual chave escreveu o quê.
        </div>
      )}
    </div>
  );
}
