/**
 * O cliente da Stripe e as constantes do plano.
 *
 * O que faz: instancia o SDK oficial com a chave secreta e reúne num lugar só
 *            o preço, os limites de cada plano e o que a interface mostra.
 * Recebe:    nada; lê as variáveis de ambiente.
 * Devolve:   o cliente e as constantes.
 * Implementa: EPICO-COBRANCA.md, decisões C2, C3 e C4 — um preço para todos os
 *             projetos, R$ 50/mês em real, e a retenção como gatilho.
 *
 * A chave secreta só pode ser lida em rota de servidor e em Server Action. Este
 * arquivo NUNCA pode ser importado por componente de cliente: se for, a chave
 * vai para o bundle do navegador.
 */

import Stripe from "stripe";

/**
 * Cliente da Stripe.
 * A versão da API é fixada de propósito: sem isso, a Stripe promove a conta
 * para uma versão nova e o formato dos objetos muda debaixo do código.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-10-29.clover",
  appInfo: { name: "Visao de Produto", version: "0.1.0" },
});

/** O preço recorrente de R$ 50/mês, criado no catálogo da Stripe. */
export const PRECO_MENSAL = process.env.STRIPE_PRICE_ID ?? "";

/** O que cada plano dá. Os números aqui e no banco precisam concordar. */
export const PLANOS = {
  gratuito: { projetos: 1, retencaoMeses: 1 },
  pago: { projetos: null, retencaoMeses: 12 },
} as const;

/** Preço em centavos, para a tela não repetir o número em lugar nenhum. */
export const PRECO_EM_CENTAVOS = 5_000;

/** O preço escrito do jeito que aparece para quem lê. */
export function precoFormatado(): string {
  return (PRECO_EM_CENTAVOS / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Diz se a plataforma está com a cobrança configurada neste ambiente. */
export function cobrancaConfigurada(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && PRECO_MENSAL);
}
