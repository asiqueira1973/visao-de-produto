/**
 * Tela pública de Termos e privacidade.
 *
 * O que faz: serve o mesmo texto de `/conta/termos` para quem ainda não entrou.
 * Lê:        nada.
 * Devolve:   a página `/termos`, sem menu lateral e sem exigir sessão.
 * Implementa: seção 17 do spec e o princípio 0.6 — ninguém deveria precisar
 *             criar conta para ler as regras que vai aceitar ao criar a conta.
 *
 * É para cá que a tela de Login aponta.
 */

import Link from "next/link";
import { TextoDosTermos } from "@/features/termos/TextoDosTermos";

export const metadata = {
  title: "Termos e privacidade — Visão de Produto",
};

export default function TermosPublicos() {
  return (
    <div style={{ minHeight: "100vh", overflowY: "auto" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "34px 24px 72px" }}>
        <Link
          href="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 26,
            textDecoration: "none",
          }}
        >
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
        </Link>

        <TextoDosTermos />
      </div>
    </div>
  );
}
