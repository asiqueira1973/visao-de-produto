"use client";

/**
 * O formulário da nota mais o passo do pagamento.
 *
 * O que faz: mostra o formulário do tomador e, depois de salvo, o botão que
 *            abre a Stripe.
 * Recebe:    os dados já guardados, quando houver, e se a conta já é paga.
 * Devolve:   o miolo da tela `/conta/assinar`.
 * Implementa: EPICO-COBRANCA.md, seção 3.1.
 *
 * Existe para separar o que é de cliente do que é de servidor: a página busca
 * os dados, este componente cuida do estado da interação.
 */

import { useState, useTransition } from "react";
import { criarSessaoDeCheckout, type DadosDoTomador } from "./acoes";
import { FormularioDoTomador } from "./FormularioDoTomador";

export function PainelDeAssinatura({
  inicial,
  jaEhPago,
}: {
  inicial: Partial<DadosDoTomador> | null;
  jaEhPago: boolean;
}) {
  const [salvo, setSalvo] = useState(Boolean(inicial));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function pagar() {
    setErro(null);
    iniciarTransicao(async () => {
      const { url, erro: falha } = await criarSessaoDeCheckout();
      if (falha || !url) {
        setErro(falha ?? "Não consegui abrir o pagamento.");
        return;
      }
      window.location.href = url;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FormularioDoTomador inicial={inicial} aoSalvar={() => setSalvo(true)} />

      {salvo && !jaEhPago && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6, marginBottom: 12 }}>
            Dados guardados. O próximo passo acontece na Stripe.
          </div>
          {erro && (
            <div style={{ fontSize: 12.5, color: "var(--err)", marginBottom: 10 }}>{erro}</div>
          )}
          <button
            onClick={pagar}
            disabled={pendente}
            style={{
              height: 36,
              padding: "0 18px",
              borderRadius: 8,
              border: "1px solid var(--pri)",
              background: "var(--pri)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {pendente ? "Abrindo a Stripe…" : "Ir para o pagamento — R$ 50/mês"}
          </button>
        </div>
      )}

      {salvo && jaEhPago && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 12.5, color: "var(--dim)" }}>
          Esta conta já é paga. Os dados acima passam a valer nas próximas notas.
        </div>
      )}
    </div>
  );
}
