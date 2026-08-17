/**
 * API pública do `@dablab/visao`.
 *
 * O que faz: expõe as quatro funções do épico 8.3 sobre uma instância única,
 *            para que o app configure uma vez e chame `track` de qualquer
 *            lugar sem carregar um objeto pela mão.
 * Implementa: as assinaturas definitivas do épico 8.3.
 *
 * Uso:
 *   init({ key: process.env.VISAO_API_KEY, projeto: "agenda-psi" });
 *   identify("carla@exemplo.com");
 *   track("psi_novo_pagamento", {
 *     descricao: "usuário registrou um pagamento de um paciente",
 *     tela: "PagamentosView",
 *     props: { valor: 250, forma: "pix" },
 *   });
 */

import { Cliente } from "./client.js";
import type { InitOptions, TrackOptions } from "./types.js";

export { Cliente, PARAMETROS_PADRAO } from "./client.js";
export { MemoryStorage } from "./storage.js";
export type {
  EventoNaFila,
  InitOptions,
  ParametrosDaFila,
  RespostaDaIngestao,
  StorageAdapter,
  TrackOptions,
} from "./types.js";

/** A instância configurada por `init`. */
let cliente: Cliente | null = null;

/**
 * Configura o SDK uma vez, na inicialização do app.
 * Recebe a chave de ingestão, o slug do projeto e, opcionalmente, o host e o
 * storage da fila.
 * Devolve a instância, para quem preferir carregá-la explicitamente.
 * Chamar duas vezes substitui a configuração anterior.
 */
export function init(opcoes: InitOptions): Cliente {
  cliente = new Cliente(opcoes);
  return cliente;
}

/**
 * Enfileira um evento e devolve imediatamente, sem `await`.
 * Recebe o nome do evento e, no nível de cima, `descricao` e `tela`; as
 * propriedades livres do app ficam em `props`.
 * Devolve nada — o envio acontece em lote, em segundo plano.
 */
export function track(nome: string, opcoes?: TrackOptions): void {
  if (!cliente) {
    console.error(`[visao] track("${nome}") ignorado — chame init() antes.`);
    return;
  }
  cliente.track(nome, opcoes);
}

/**
 * Passa a associar os eventos seguintes àquele identificador.
 * Recebe o `distinct_id` do app e, opcionalmente, propriedades da pessoa.
 */
export function identify(
  distinctId: string,
  propriedades?: Record<string, unknown>,
): void {
  if (!cliente) {
    console.error("[visao] identify() ignorado — chame init() antes.");
    return;
  }
  cliente.identify(distinctId, propriedades);
}

/**
 * Força o envio da fila.
 * Devolve uma promessa que resolve quando a fila esvazia ou o retry se esgota.
 * Útil antes de fechar o app ou ao final de um processo de backend.
 */
export async function flush(): Promise<void> {
  if (!cliente) return;
  await cliente.flush();
}
