/**
 * Tela de Login.
 *
 * O que faz: mostra o único caminho de entrada do produto — o botão do Google.
 * Implementa: seção 6.1 e assunção 21.3. Não há senha, e portanto não há
 *             recuperação de senha.
 *
 * O enquadramento, a largura de 352px e a tipografia vêm das telas geradas, que
 * prevalecem em layout (regra de precedência 4.4). O que muda em relação ao
 * mock são os dois campos, substituídos por um botão — porque o spec prevalece
 * em comportamento.
 */

import { BotaoGoogle } from "@/features/auth/BotaoGoogle";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; erro?: string }>;
}) {
  const { de, erro } = await searchParams;
  const destino = de && de.startsWith("/") ? de : "/projetos";

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: 352 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "var(--pri)",
              display: "block",
            }}
          />
          <span
            style={{
              fontFamily: "var(--fonte-mono), monospace",
              fontSize: 12,
              color: "var(--dim)",
            }}
          >
            visao-de-produto
          </span>
        </div>

        <div style={{ marginTop: 22, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Entrar
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.5 }}>
          Painel de uso dos aplicativos.
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 13 }}>
          {erro === "callback" && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--errSoft)",
                border: "1px solid var(--errLine)",
                fontSize: 12.5,
                color: "var(--err)",
                lineHeight: 1.45,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--err)",
                  marginTop: 5,
                  flex: "none",
                }}
              />
              <span>O Google não confirmou a entrada. Tente de novo.</span>
            </div>
          )}

          <BotaoGoogle destino={destino} />

          <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
            Entrar cria sua conta na primeira vez. Não há senha para lembrar.
          </div>
        </div>
      </div>
    </div>
  );
}
