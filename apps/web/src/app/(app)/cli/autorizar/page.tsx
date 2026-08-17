/**
 * Tela de autorização da CLI.
 *
 * O que faz: mostra o que o `npx visao init` vai criar e, com um clique do
 *            dono, cria e devolve as credenciais para o terminal.
 * Recebe:    nome, slug, porta e estado, tudo vindo da CLI pela URL.
 * Implementa: épico 8.7 e princípio 0.6 — a instalação inteira acontece sem
 *             ninguém do outro lado.
 */

import { ConfirmacaoDaCli } from "@/features/cli/ConfirmacaoDaCli";

export const dynamic = "force-dynamic";

export default async function Autorizar({
  searchParams,
}: {
  searchParams: Promise<{ nome?: string; slug?: string; porta?: string; estado?: string }>;
}) {
  const { nome, slug, porta, estado } = await searchParams;

  const portaValida = /^\d{2,5}$/.test(porta ?? "");
  const dadosCompletos = Boolean(nome && slug && estado) && portaValida;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 560 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Autorizar instalação
        </div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
          O comando <code style={{ fontFamily: "var(--fonte-mono), monospace" }}>npx visao init</code>{" "}
          está esperando no seu terminal.
        </div>

        {!dadosCompletos ? (
          <div
            style={{
              marginTop: 22,
              border: "1px solid var(--errLine)",
              background: "var(--errSoft)",
              borderRadius: 11,
              padding: 18,
              fontSize: 12.5,
              color: "var(--err)",
              lineHeight: 1.55,
            }}
          >
            Esta página só funciona quando aberta pelo comando. Rode{" "}
            <code>npx visao init</code> no repositório do seu app.
          </div>
        ) : (
          <ConfirmacaoDaCli
            nome={nome!}
            slug={slug!}
            porta={Number(porta)}
            estado={estado!}
          />
        )}
      </div>
    </div>
  );
}
