"use client";

/**
 * Lista e geração de tokens de leitura do MCP.
 *
 * O que faz: mostra os tokens com prefixo, criação e último uso; gera um novo,
 *            exibindo o valor uma única vez; e revoga.
 * Recebe:    os tokens da conta e a URL do servidor MCP.
 * Devolve:   a tela de Credenciais MCP.
 * Implementa: épico 8.5, seções 6.3 e 12.3, e a regra 5.1.2 — o token de
 *             leitura nunca escreve.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarTokenDeLeitura, revogarCredencial } from "./acoes";
import { BlocoCopiavel } from "@/features/shell/BlocoCopiavel";
import { dataCurta, horarioRelativo } from "@/lib/formato";
import type { Credencial } from "@/lib/data/tipos";

const GRADE = "1fr 132px 116px 132px 88px";

export function TokensDeLeitura({
  tokens,
  urlDoMcp,
}: {
  tokens: Credencial[];
  urlDoMcp: string;
}) {
  const router = useRouter();
  const [valorNovo, setValorNovo] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  // O bloco que a pessoa cola no cliente de agente (seção 12.3). O token vai
  // como `mcp_…` porque o valor real só existe no momento da geração.
  const configuracao = JSON.stringify(
    {
      mcpServers: {
        "visao-de-produto": {
          type: "http",
          url: urlDoMcp,
          headers: { Authorization: `Bearer ${valorNovo ?? "mcp_…"}` },
        },
      },
    },
    null,
    2,
  );

  function gerar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { valor, erro: falha } = await gerarTokenDeLeitura(nome);
      if (falha) {
        setErro(falha);
        return;
      }
      setValorNovo(valor ?? null);
      setNome("");
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
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Credenciais MCP
          </div>
          <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
            Tokens de leitura usados pelo Claude para consultar os projetos desta conta. Eles
            nunca escrevem nada.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Claude Code do notebook"
            aria-label="Nome do token"
            style={{
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--elev)",
              fontSize: 12.5,
              outline: "none",
            }}
          />
          <button
            onClick={gerar}
            disabled={pendente}
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
            {pendente ? "Gerando…" : "Gerar token"}
          </button>
        </div>
      </div>

      {erro && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>}

      {valorNovo && (
        <div
          style={{
            marginTop: 18,
            border: "1px solid var(--pri)",
            borderRadius: 10,
            background: "var(--priSoft)",
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pri)" }}>
            Copie agora. Este token não será mostrado de novo.
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

      <div
        style={{
          marginTop: 18,
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--panel)",
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
          }}
        >
          <div>Nome</div>
          <div>Prefixo</div>
          <div style={{ textAlign: "right" }}>Criado</div>
          <div style={{ textAlign: "right" }}>Último uso</div>
          <div />
        </div>

        {tokens.map((token) => {
          const revogado = Boolean(token.revogada_em);
          return (
            <div
              key={token.id}
              style={{
                display: "grid",
                gridTemplateColumns: GRADE,
                gap: 12,
                padding: "11px 16px",
                borderBottom: "1px solid var(--line)",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flex: "none",
                    background: revogado ? "var(--err)" : "var(--ok)",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: revogado ? "var(--faint)" : "var(--text)",
                    textDecoration: revogado ? "line-through" : "none",
                  }}
                >
                  {token.nome}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 12,
                  color: "var(--dim)",
                }}
              >
                {token.prefixo}…
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "var(--dim)" }}>
                {dataCurta(token.criada_em, "America/Sao_Paulo")}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  color: revogado ? "var(--err)" : "var(--dim)",
                }}
              >
                {revogado
                  ? `revogado ${horarioRelativo(token.revogada_em!)}`
                  : token.ultimo_uso_em
                    ? horarioRelativo(token.ultimo_uso_em)
                    : "nunca usado"}
              </div>
              <div style={{ textAlign: "right" }}>
                {!revogado && (
                  <button
                    onClick={() =>
                      iniciarTransicao(async () => {
                        await revogarCredencial(token.id, "/conta/credenciais");
                        router.refresh();
                      })
                    }
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: 11.5,
                      cursor: "pointer",
                      color: "var(--err)",
                    }}
                  >
                    Revogar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {tokens.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
            Nenhum token ainda. Gere um para o Claude conseguir ler seus projetos.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--panel)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px 12px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Configuração do servidor MCP</div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
            Cole no arquivo de configuração do cliente. O servidor é remoto: a credencial do
            banco fica no servidor, e o cliente só recebe um token de leitura revogável.
          </div>
        </div>
        <BlocoCopiavel texto={configuracao} rotulo="claude_desktop_config.json" quebrarLinha />
      </div>
    </>
  );
}
