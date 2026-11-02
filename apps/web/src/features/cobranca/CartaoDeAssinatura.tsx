"use client";

/**
 * O cartão de assinatura da tela de Perfil.
 *
 * O que faz: mostra em que plano a conta está, o que ele inclui, e o botão que
 *            leva ao pagamento ou ao portal da Stripe.
 * Recebe:    o estado da conta e se os dados da nota já foram preenchidos.
 * Devolve:   o cartão.
 * Implementa: EPICO-COBRANCA.md, seção 8.
 *
 * O estado que mais importa aqui é o de espera: quem volta do pagamento cai
 * numa tela que ainda diz "gratuito", porque quem muda o plano é o webhook e
 * ele leva alguns segundos. Sem dizer isso, a pessoa acha que pagou à toa.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { abrirPortalDaStripe, criarSessaoDeCheckout } from "./acoes";

export interface EstadoDaAssinatura {
  /**
   * Se este ambiente tem a Stripe configurada. Quando falso, a tela mostra o
   * plano e o preço, mas não oferece um botão que não levaria a lugar nenhum:
   * botão que falha é pior do que botão ausente.
   */
  cobrancaLigada: boolean;
  plano: "gratuito" | "pago";
  cortesia: boolean;
  assinaturaStatus: "nenhuma" | "ativa" | "atrasada" | "cancelada";
  periodoFim: string | null;
  temDadosDeCobranca: boolean;
  /** `?assinatura=` da volta do checkout. */
  retorno?: string;
}

const CAIXA: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "var(--panel)",
  padding: "16px 18px",
};

const BOTAO_PRIMARIO: React.CSSProperties = {
  height: 34,
  padding: "0 16px",
  borderRadius: 7,
  border: "1px solid var(--pri)",
  background: "var(--pri)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const BOTAO_NEUTRO: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 7,
  border: "1px solid var(--line2)",
  background: "var(--elev)",
  color: "var(--text)",
  fontSize: 12.5,
  cursor: "pointer",
};

export function CartaoDeAssinatura({ estado }: { estado: EstadoDaAssinatura }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function irParaOPagamento() {
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

  function irParaOPortal() {
    setErro(null);
    iniciarTransicao(async () => {
      const { url, erro: falha } = await abrirPortalDaStripe();
      if (falha || !url) {
        setErro(falha ?? "Não consegui abrir o portal.");
        return;
      }
      window.location.href = url;
    });
  }

  // --- Cortesia: nem pagamento, nem portal, nem cobrança ------------------
  if (estado.cortesia) {
    return (
      <div style={CAIXA}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Plano pago, por cortesia</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7 }}>
          Esta conta tem produtos ilimitados e 12 meses de janela de consulta, sem cobrança e sem
          cadastro na Stripe. Não há nada a pagar nem a gerenciar.
        </div>
      </div>
    );
  }

  const emEspera = estado.retorno === "processando" && estado.plano === "gratuito";

  // Ambiente sem cobrança: diz o que existe e o que ainda não, sem prometer
  // botão nenhum.
  if (!estado.cobrancaLigada && estado.plano === "gratuito") {
    return (
      <div style={CAIXA}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Plano gratuito</div>
            <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.65 }}>
              1 produto e 1 mês de janela de consulta.
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            border: "1px solid var(--line2)",
            borderRadius: 9,
            background: "var(--elev)",
            padding: "11px 13px",
            fontSize: 12.5,
            color: "var(--dim)",
            lineHeight: 1.65,
          }}
        >
          <strong style={{ color: "var(--text)" }}>O plano pago ainda não está disponível.</strong>{" "}
          Ele vai custar R$ 50 por mês e dar produtos ilimitados com 12 meses de janela. Quando
          abrir, o botão aparece aqui — e nada muda para quem já está usando o gratuito.
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
          As regras de cobrança já estão escritas em{" "}
          <Link href="/conta/termos">Termos e privacidade</Link>.
        </div>
      </div>
    );
  }

  return (
    <div style={CAIXA}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {estado.plano === "pago" ? "Plano pago" : "Plano gratuito"}
          </div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.65 }}>
            {estado.plano === "pago"
              ? "Produtos ilimitados e 12 meses de janela de consulta."
              : "1 produto e 1 mês de janela de consulta."}
          </div>
        </div>

        {estado.plano === "gratuito" && !emEspera && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>R$ 50</div>
            <div style={{ fontSize: 11.5, color: "var(--faint)" }}>por mês</div>
          </div>
        )}
      </div>

      {/* Voltou do pagamento e o webhook ainda não chegou. */}
      {emEspera && (
        <div
          style={{
            marginTop: 14,
            border: "1px solid var(--pri)",
            borderRadius: 9,
            background: "var(--priSoft)",
            padding: "11px 13px",
            fontSize: 12.5,
            color: "var(--dim)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--pri)" }}>Estamos confirmando o pagamento.</strong> A
          Stripe avisa em alguns segundos e o plano muda sozinho — não é preciso pagar de novo.{" "}
          <button
            onClick={() => router.refresh()}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "var(--pri)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Atualizar
          </button>
        </div>
      )}

      {estado.retorno === "cancelada" && estado.plano === "gratuito" && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--dim)" }}>
          Você saiu do pagamento sem concluir. Nada foi cobrado.
        </div>
      )}

      {/* Pagamento atrasado: avisa sem alarmar, porque nada foi perdido ainda. */}
      {estado.assinaturaStatus === "atrasada" && (
        <div
          style={{
            marginTop: 14,
            border: "1px solid var(--errLine)",
            borderRadius: 9,
            background: "var(--errSoft)",
            padding: "11px 13px",
            fontSize: 12.5,
            color: "var(--dim)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--err)" }}>A última cobrança não passou.</strong> A Stripe
          vai tentar de novo nos próximos dias. Enquanto isso nada muda por aqui — se quiser
          adiantar, troque o cartão no portal.
        </div>
      )}

      {estado.assinaturaStatus === "cancelada" && estado.periodoFim && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
          Assinatura cancelada. O plano pago vale até{" "}
          <strong style={{ color: "var(--text)" }}>
            {new Date(estado.periodoFim).toLocaleDateString("pt-BR")}
          </strong>
          , e depois disso a conta volta para o gratuito —{" "}
          <strong style={{ color: "var(--text)" }}>sem apagar nada</strong>.
        </div>
      )}

      {erro && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--err)" }}>{erro}</div>}

      <div style={{ marginTop: 15, display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        {estado.plano === "gratuito" && !emEspera && (
          estado.temDadosDeCobranca ? (
            <button onClick={irParaOPagamento} disabled={pendente} style={BOTAO_PRIMARIO}>
              {pendente ? "Abrindo…" : "Assinar"}
            </button>
          ) : (
            <Link href="/conta/assinar" style={{ ...BOTAO_PRIMARIO, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Assinar
            </Link>
          )
        )}

        {estado.plano === "pago" && (
          <button onClick={irParaOPortal} disabled={pendente} style={BOTAO_NEUTRO}>
            {pendente ? "Abrindo…" : "Gerenciar assinatura"}
          </button>
        )}

        {estado.temDadosDeCobranca && (
          <Link href="/conta/assinar" style={{ fontSize: 12, color: "var(--dim)" }}>
            Dados da nota fiscal
          </Link>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
        Cobrança em real, sem IOF, com nota fiscal emitida pela Dab Lab. Cancelar é no portal da
        Stripe, vale até o fim do período pago, e <strong>não apaga nada</strong> —{" "}
        <Link href="/conta/termos">os termos explicam</Link>.
      </div>
    </div>
  );
}
