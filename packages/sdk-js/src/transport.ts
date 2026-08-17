/**
 * Envio dos lotes para o endpoint de ingestão.
 *
 * O que faz: manda um lote com `x-api-key`, com tempo limite e com as três
 *            tentativas espaçadas de 3 s.
 * Implementa: a tabela de parâmetros do épico 8.3 e o contrato da seção 12.1.
 */

import type { EventoNaFila, ParametrosDaFila, RespostaDaIngestao } from "./types.js";

/** O que aconteceu com o lote, do ponto de vista de quem chamou. */
export type ResultadoDoEnvio =
  /** Chegou. O lote sai da fila. */
  | { tipo: "entregue"; resposta: RespostaDaIngestao }
  /** Rede falhou nas três tentativas. O lote volta para a fila. */
  | { tipo: "falha_temporaria"; motivo: string }
  /** O servidor recusou por algo que reenviar não conserta. O lote é descartado. */
  | { tipo: "recusado"; status: number; motivo: string };

/** Espera o intervalo fixo entre tentativas. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envia um lote de eventos.
 * Recebe o host, a chave de ingestão, os eventos e os parâmetros de retry.
 * Devolve o resultado do envio, que decide se o lote volta para a fila.
 *
 * Retry só faz sentido para falha de rede e erro de servidor. Chave inválida
 * (401) ou payload recusado (400) não melhoram na terceira tentativa: nesses
 * casos o lote é descartado com erro no console, para não entupir a fila de
 * eventos que nunca vão entrar.
 */
export async function enviarLote(
  host: string,
  chave: string,
  eventos: EventoNaFila[],
  parametros: ParametrosDaFila,
): Promise<ResultadoDoEnvio> {
  const url = `${host.replace(/\/+$/, "")}/functions/v1/ingest`;
  let ultimoMotivo = "sem resposta";

  for (let tentativa = 1; tentativa <= parametros.retries; tentativa++) {
    const abortar = new AbortController();
    const relogio = setTimeout(() => abortar.abort(), parametros.requestTimeout);

    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": chave,
        },
        body: JSON.stringify({ eventos }),
        signal: abortar.signal,
      });

      if (resposta.ok) {
        const corpo = (await resposta.json()) as RespostaDaIngestao;
        return { tipo: "entregue", resposta: corpo };
      }

      // 4xx que não é 429: reenviar não conserta.
      if (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429) {
        const corpo = await resposta.text();
        return {
          tipo: "recusado",
          status: resposta.status,
          motivo: corpo || `o servidor respondeu ${resposta.status}`,
        };
      }

      ultimoMotivo = `o servidor respondeu ${resposta.status}`;
    } catch (erro) {
      ultimoMotivo = erro instanceof Error ? erro.message : String(erro);
    } finally {
      clearTimeout(relogio);
    }

    // Intervalo fixo de 3 s, e não exponencial: o volume desta plataforma não
    // justifica backoff, e o intervalo fixo é o que o épico 8.3 especifica.
    if (tentativa < parametros.retries) {
      await esperar(parametros.retryDelay);
    }
  }

  return { tipo: "falha_temporaria", motivo: ultimoMotivo };
}
