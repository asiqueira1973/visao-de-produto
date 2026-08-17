"use client";

/**
 * Botão "Entrar com Google".
 *
 * O que faz: inicia o fluxo OAuth do Supabase Auth e devolve o navegador para
 *            a rota de callback.
 * Recebe:    para onde levar depois do login.
 * Devolve:   o botão da tela de Login.
 * Implementa: seção 6.1 e a divergência 4 da seção 4.4 — o mock desenha e-mail
 *             e senha, mas não existe senha no produto. Este botão ocupa o
 *             lugar dos dois campos, no mesmo enquadramento de 352px.
 */

import { useState } from "react";
import { clienteDoNavegador } from "@/lib/supabase/client";

export function BotaoGoogle({ destino }: { destino: string }) {
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setEntrando(true);
    setErro(null);

    const supabase = clienteDoNavegador();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?de=${encodeURIComponent(destino)}`,
      },
    });

    if (error) {
      setEntrando(false);
      setErro("Não foi possível falar com o Google. Tente de novo.");
    }
  }

  return (
    <>
      {erro && (
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
          <span>{erro}</span>
        </div>
      )}

      <button
        onClick={entrar}
        disabled={entrando}
        style={{
          height: 36,
          borderRadius: 8,
          border: "none",
          background: "var(--pri)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: entrando ? "default" : "pointer",
          marginTop: 2,
          opacity: entrando ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {entrando ? "Abrindo o Google…" : "Entrar com Google"}
      </button>
    </>
  );
}
