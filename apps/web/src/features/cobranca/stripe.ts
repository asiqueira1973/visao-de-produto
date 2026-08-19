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
 * O cliente da Stripe, criado na primeira vez que alguém precisa dele.
 *
 * **Por que preguiçoso, e não no topo do arquivo.** O SDK da Stripe estoura no
 * construtor quando não recebe chave. Criado no carregamento do módulo, ele
 * estourava durante o `next build`, que abre cada rota para coletar
 * configuração — e o build não tem segredo de runtime. Resultado: todo deploy
 * da branch falhava, e o build local passava, porque o `.env` daqui tem a
 * chave. Build local com segredo presente esconde justamente este erro.
 *
 * A versão da API é fixada de propósito: sem isso, a Stripe promove a conta
 * para uma versão nova e o formato dos objetos muda debaixo do código.
 */
let cliente: Stripe | null = null;

export function stripe(): Stripe {
  if (!cliente) {
    const chave = process.env.STRIPE_SECRET_KEY;
    if (!chave) {
      throw new Error(
        "STRIPE_SECRET_KEY não está definida. Use cobrancaConfigurada() antes de chamar a Stripe.",
      );
    }
    cliente = new Stripe(chave, {
      apiVersion: "2025-10-29.clover",
      appInfo: { name: "Visao de Produto", version: "0.1.0" },
    });
  }
  return cliente;
}

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
