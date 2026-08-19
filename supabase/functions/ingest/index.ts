/**
 * Endpoint de ingestão — POST /functions/v1/ingest
 *
 * O que faz: recebe um lote de até 100 eventos autenticado por chave de
 *            projeto, valida cada evento, e grava os aceitos numa única
 *            instrução SQL.
 * Recebe:    header `x-api-key` com a chave de ingestão e um corpo JSON no
 *            formato da seção 12.1 do spec.
 * Devolve:   202 com { aceitos, duplicados, rejeitados[] }; 400 quando o lote
 *            passa de 100 ou o corpo não é utilizável; 401 quando a chave está
 *            ausente, é desconhecida ou foi revogada.
 * Implementa: épico 8.2 e seção 12.1; regras 11.1, 11.4, 11.5 e 11.6.
 *
 * Princípio 0.1: o servidor não acrescenta nada. Nem IP, nem user-agent, nem
 * geolocalização, nem hora do servidor no lugar da hora do dispositivo. O que
 * vai para a tabela é o que o app enviou, mais o `recebido_em` do banco.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

/** Lote máximo por request (seção 12.1). */
const LOTE_MAXIMO = 100;

/** Janela da regra 11.6: acima disso, o relógio do dispositivo está errado. */
const FUTURO_MAXIMO_MS = 48 * 60 * 60 * 1000;

/** Formato de nome de evento da regra 11.1. Espaço é inválido de propósito. */
const NOME_VALIDO = /^[a-z][a-z0-9_]{2,63}$/;

/** UUID em qualquer versão. O SDK gera v4 (épico 8.3). */
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A chave de ingestão vive em bundle de front-end e em app de loja
 * (regra 5.1.3), então o endpoint precisa aceitar chamada de navegador.
 */
const CABECALHOS_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "x-api-key, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

/** Um evento como ele chega no corpo do request (seção 12.1). */
interface EventoRecebido {
  id?: unknown;
  nome?: unknown;
  distinct_id?: unknown;
  ocorrido_em?: unknown;
  tela?: unknown;
  descricao?: unknown;
  propriedades?: unknown;
}

/** Um evento pronto para gravar, já validado e com a regra 11.6 aplicada. */
interface EventoValidado {
  id: string;
  nome: string;
  distinct_id: string;
  tela: string | null;
  descricao: string | null;
  propriedades: Record<string, unknown>;
  ocorrido_em: string;
}

/** Motivo pelo qual um evento do lote não entrou (seção 12.1). */
interface EventoRejeitado {
  id: string | null;
  campo: string;
  motivo: string;
}

/** Monta a resposta JSON com os cabeçalhos de CORS. */
function responder(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...CABECALHOS_CORS },
  });
}

/**
 * Calcula o SHA-256 do valor da chave em hexadecimal.
 * O banco guarda só o hash (seção 6.3); o valor em claro nunca é armazenado.
 */
async function hashDaChave(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Valida um evento do lote e aplica a regra 11.6.
 * Recebe o evento cru e o instante de recebimento.
 * Devolve o evento pronto para gravar, ou o motivo da rejeição — nunca os dois.
 * Um evento inválido não derruba o lote: ele entra em `rejeitados` (seção 12.1).
 */
function validarEvento(
  bruto: EventoRecebido,
  recebidoEm: Date,
): { evento: EventoValidado } | { rejeicao: EventoRejeitado } {
  const id = typeof bruto.id === "string" ? bruto.id : null;

  if (!id || !UUID_VALIDO.test(id)) {
    return {
      rejeicao: {
        id,
        campo: "id",
        // A mensagem mostra o formato porque quem erra este campo costuma mandar
        // um número ou um texto qualquer, e "precisa ser um UUID" sozinho não
        // diz que cara tem um UUID.
        motivo:
          "é obrigatório e precisa ser um UUID, no formato 3f9a1c2e-7b45-4d81-9e63-0a5f8c2d1b47, gerado novo a cada evento",
      },
    };
  }

  if (typeof bruto.nome !== "string" || !NOME_VALIDO.test(bruto.nome)) {
    return {
      rejeicao: {
        id,
        campo: "nome",
        motivo:
          "precisa ter de 3 a 64 caracteres, começar com letra minúscula e usar só letras, números e underscore",
      },
    };
  }

  if (typeof bruto.distinct_id !== "string" || bruto.distinct_id.trim() === "") {
    return { rejeicao: { id, campo: "distinct_id", motivo: "é obrigatório" } };
  }

  if (typeof bruto.ocorrido_em !== "string") {
    return {
      rejeicao: { id, campo: "ocorrido_em", motivo: "é obrigatório, em ISO 8601" },
    };
  }

  const ocorridoEm = new Date(bruto.ocorrido_em);
  if (Number.isNaN(ocorridoEm.getTime())) {
    return {
      rejeicao: { id, campo: "ocorrido_em", motivo: "não é uma data ISO 8601 válida" },
    };
  }

  if (bruto.tela !== undefined && bruto.tela !== null && typeof bruto.tela !== "string") {
    return { rejeicao: { id, campo: "tela", motivo: "precisa ser texto" } };
  }

  if (
    bruto.descricao !== undefined && bruto.descricao !== null &&
    typeof bruto.descricao !== "string"
  ) {
    return { rejeicao: { id, campo: "descricao", motivo: "precisa ser texto" } };
  }

  if (
    bruto.propriedades !== undefined && bruto.propriedades !== null &&
    (typeof bruto.propriedades !== "object" || Array.isArray(bruto.propriedades))
  ) {
    return {
      rejeicao: { id, campo: "propriedades", motivo: "precisa ser um objeto JSON" },
    };
  }

  // Regra 11.6: relógio de dispositivo adiantado não pode criar partição futura
  // nem sujar o gráfico. O evento é aceito, com a hora do recebimento no lugar.
  const estaLongeDemaisNoFuturo =
    ocorridoEm.getTime() > recebidoEm.getTime() + FUTURO_MAXIMO_MS;

  return {
    evento: {
      id,
      nome: bruto.nome,
      distinct_id: bruto.distinct_id,
      tela: typeof bruto.tela === "string" ? bruto.tela : null,
      descricao: typeof bruto.descricao === "string" ? bruto.descricao : null,
      propriedades: (bruto.propriedades ?? {}) as Record<string, unknown>,
      ocorrido_em: estaLongeDemaisNoFuturo
        ? recebidoEm.toISOString()
        : ocorridoEm.toISOString(),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CABECALHOS_CORS });
  }

  if (req.method !== "POST") {
    return responder(405, {
      codigo: "metodo_nao_permitido",
      mensagem: "Use POST para enviar eventos.",
    });
  }

  // Chave ausente é 401, nunca 403 (critério de aceite do épico 8.2).
  const chave = req.headers.get("x-api-key");
  if (!chave) {
    return responder(401, { codigo: "credencial_invalida" });
  }

  let corpo: { eventos?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return responder(400, {
      codigo: "corpo_invalido",
      mensagem: "O corpo do request não é um JSON válido.",
    });
  }

  if (!corpo || !Array.isArray(corpo.eventos)) {
    return responder(400, {
      codigo: "corpo_invalido",
      mensagem: 'O corpo precisa ter a chave "eventos" com uma lista.',
    });
  }

  const recebidos = corpo.eventos as EventoRecebido[];
  if (recebidos.length > LOTE_MAXIMO) {
    return responder(400, {
      codigo: "lote_excedido",
      mensagem:
        `O lote traz ${recebidos.length} eventos e o máximo é ${LOTE_MAXIMO}. Divida em lotes menores.`,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Regra 11.5: é a chave que determina o projeto. Um `projeto_id` que venha no
  // payload é simplesmente ignorado — nem é lido.
  //
  // A mesma chamada também contabiliza a taxa e confere os dois limites da
  // conta: o de eventos por minuto, que existe para parar laço mal escrito em
  // tempo real, e o teto mensal, que pega abuso sustentado. Uma ida ao banco.
  const { data: autorizacao, error: erroCredencial } = await supabase.rpc(
    "fn_autoriza_ingestao",
    { p_valor_hash: await hashDaChave(chave), p_quantidade: recebidos.length },
  );

  if (erroCredencial) {
    console.error("falha ao autorizar a ingestão", erroCredencial);
    return responder(500, { codigo: "erro_interno" });
  }

  if (!autorizacao || autorizacao.length === 0) {
    return responder(401, { codigo: "credencial_invalida" });
  }

  const { conta_id, projeto_id, permitido, motivo, esperar_seg } = autorizacao[0];

  if (!permitido) {
    // 429, e não 403: do outro lado há um programa, e este é o código que um
    // programa sabe interpretar e repetir depois. O `retry-after` diz quando.
    const cabecalhos = esperar_seg
      ? { ...CABECALHOS_CORS, "retry-after": String(esperar_seg) }
      : CABECALHOS_CORS;

    return new Response(
      JSON.stringify({
        codigo: String(motivo).split(":")[0],
        mensagem: String(motivo).split(": ").slice(1).join(": "),
      }),
      { status: 429, headers: { "content-type": "application/json", ...cabecalhos } },
    );
  }

  const recebidoEm = new Date();
  const aceitaveis: EventoValidado[] = [];
  const rejeitados: EventoRejeitado[] = [];
  // Ids repetidos dentro do mesmo lote contam como duplicados, e não como erro:
  // é o mesmo caso da regra 11.4, só que antes de chegar ao banco.
  const idsVistos = new Set<string>();
  let duplicadosNoLote = 0;

  for (const bruto of recebidos) {
    const resultado = validarEvento(bruto ?? {}, recebidoEm);

    if ("rejeicao" in resultado) {
      rejeitados.push(resultado.rejeicao);
      continue;
    }

    if (idsVistos.has(resultado.evento.id)) {
      duplicadosNoLote += 1;
      continue;
    }

    idsVistos.add(resultado.evento.id);
    aceitaveis.push(resultado.evento);
  }

  let aceitos = 0;
  if (aceitaveis.length > 0) {
    const { data, error } = await supabase.rpc("fn_ingere_eventos", {
      p_conta_id: conta_id,
      p_projeto_id: projeto_id,
      p_eventos: aceitaveis,
    });

    if (error) {
      console.error("falha ao gravar o lote", error);
      return responder(500, { codigo: "erro_interno" });
    }

    aceitos = data ?? 0;
  }

  // O que foi enviado e não gravou nem foi rejeitado já existia no banco.
  const duplicados = aceitaveis.length - aceitos + duplicadosNoLote;

  return responder(202, { aceitos, duplicados, rejeitados });
});
