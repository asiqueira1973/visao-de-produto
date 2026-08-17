"use client";

/**
 * As duas formas de conectar o Claude a esta conta.
 *
 * O que faz: explica, em passos, o caminho pelo app (OAuth) e o caminho pelo
 *            arquivo de configuração, e mostra onde o arquivo fica em cada
 *            sistema.
 * Recebe:    a URL do servidor MCP e, quando houver, o token recém-gerado.
 * Devolve:   o cartão de instruções da tela de Credenciais MCP.
 * Implementa: épico 8.8 e a decisão do dono de ter as duas portas — uma para
 *             quem usa terminal e sabe editar JSON, outra para quem só tem o app.
 *
 * A tela existia mostrando um bloco de JSON sem dizer o que fazer com ele.
 * Bloco de configuração sem instrução não é autosserviço (princípio 0.6).
 */

import { useState } from "react";
import { BlocoCopiavel } from "@/features/shell/BlocoCopiavel";

/** Onde cada sistema guarda a configuração do Claude Desktop. */
const CAMINHOS = [
  { sistema: "macOS", caminho: "~/Library/Application Support/Claude/claude_desktop_config.json" },
  { sistema: "Windows", caminho: "%APPDATA%\\Claude\\claude_desktop_config.json" },
  { sistema: "Linux", caminho: "~/.config/Claude/claude_desktop_config.json" },
];

const estiloDaAba = (ativa: boolean): React.CSSProperties => ({
  height: 28,
  padding: "0 12px",
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 12.5,
  border: `1px solid ${ativa ? "var(--pri)" : "var(--line)"}`,
  background: ativa ? "var(--priSoft)" : "var(--elev)",
  color: ativa ? "var(--pri)" : "var(--dim)",
});

const estiloDoPasso: React.CSSProperties = {
  lineHeight: 1.75,
  marginBottom: 2,
};

export function ComoConectar({
  urlDoMcp,
  tokenRecemGerado,
}: {
  urlDoMcp: string;
  tokenRecemGerado?: string | null;
}) {
  const [aba, setAba] = useState<"app" | "arquivo">("app");

  const configuracao = JSON.stringify(
    {
      mcpServers: {
        "visao-de-produto": {
          type: "http",
          url: urlDoMcp,
          headers: { Authorization: `Bearer ${tokenRecemGerado ?? "mcp_…"}` },
        },
      },
    },
    null,
    2,
  );

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
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Como conectar o Claude</div>
      <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
        Dois caminhos, e você só precisa de um. Pelo aplicativo é mais simples e não envolve
        token nenhum; por arquivo serve para o Claude Code e para quem prefere versionar a
        configuração.
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <button onClick={() => setAba("app")} style={estiloDaAba(aba === "app")}>
          Pelo aplicativo
        </button>
        <button onClick={() => setAba("arquivo")} style={estiloDaAba(aba === "arquivo")}>
          Por arquivo de configuração
        </button>
      </div>

      {aba === "app" ? (
        <div style={{ marginTop: 14 }}>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              color: "var(--dim)",
            }}
          >
            <li style={estiloDoPasso}>
              No Claude, abra <strong style={{ color: "var(--text)" }}>Configurações →
              Conectores</strong> e escolha <strong style={{ color: "var(--text)" }}>Adicionar
              conector personalizado</strong>.
            </li>
            <li style={estiloDoPasso}>
              Dê um nome (por exemplo, <em>Visão de Produto</em>) e cole o endereço abaixo no
              campo de URL.
            </li>
            <li style={estiloDoPasso}>
              Deixe os campos de OAuth <strong style={{ color: "var(--text)" }}>em branco</strong>{" "}
              — o servidor se apresenta sozinho.
            </li>
            <li style={estiloDoPasso}>
              O Claude vai abrir esta plataforma pedindo autorização. Clique em{" "}
              <strong style={{ color: "var(--text)" }}>Autorizar</strong> e pronto.
            </li>
          </ol>

          <div style={{ marginTop: 12 }}>
            <BlocoCopiavel texto={urlDoMcp} rotulo="Endereço do servidor MCP" quebrarLinha />
          </div>

          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 }}>
            A conexão aparece na lista acima com o nome do aplicativo, e você revoga quando
            quiser. Não é preciso gerar token à mão neste caminho.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--dim)" }}>
            <li style={estiloDoPasso}>
              Gere um token acima e copie o valor —{" "}
              <strong style={{ color: "var(--text)" }}>ele aparece uma única vez</strong>.
            </li>
            <li style={estiloDoPasso}>
              Abra o arquivo de configuração do seu cliente, no caminho do seu sistema:
              <div
                style={{
                  marginTop: 6,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {CAMINHOS.map((c) => (
                  <div
                    key={c.sistema}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "7px 10px",
                      borderBottom: "1px solid var(--line)",
                      background: "var(--code)",
                    }}
                  >
                    <span style={{ width: 62, flex: "none", fontSize: 11.5, color: "var(--faint)" }}>
                      {c.sistema}
                    </span>
                    <code
                      style={{
                        fontFamily: "var(--fonte-mono), monospace",
                        fontSize: 11.5,
                        wordBreak: "break-all",
                      }}
                    >
                      {c.caminho}
                    </code>
                  </div>
                ))}
              </div>
            </li>
            <li style={{ ...estiloDoPasso, marginTop: 8 }}>
              Cole o bloco abaixo dentro dele, trocando o token pelo que você copiou. Se o
              arquivo já tiver um <code>mcpServers</code>, acrescente só a entrada de dentro.
            </li>
            <li style={estiloDoPasso}>
              <strong style={{ color: "var(--text)" }}>Feche e abra o Claude</strong> — ele lê a
              configuração só na inicialização.
            </li>
          </ol>

          <div style={{ marginTop: 12 }}>
            <BlocoCopiavel texto={configuracao} rotulo="claude_desktop_config.json" quebrarLinha />
          </div>

          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55 }}>
            No Claude Code, o mesmo bloco vale no <code>~/.claude.json</code>. E se você rodar{" "}
            <code>npx visao init</code> no repositório do app, a CLI escreve isso sozinha em
            todos os clientes que encontrar.
          </div>
        </div>
      )}
    </div>
  );
}
