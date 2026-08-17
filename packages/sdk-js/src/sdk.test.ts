/**
 * Testes do SDK — um por critério de aceite do épico 8.3.
 *
 * A rede é simulada: `fetch` é substituído por um duplo que registra o que foi
 * enviado e permite "desligar a rede" no meio do teste.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cliente, PARAMETROS_PADRAO } from "./client.js";
import { MemoryStorage } from "./storage.js";
import { gerarId, nomeDeEventoEhValido } from "./validation.js";
import type { EventoNaFila } from "./types.js";

/** Rede de mentira, com interruptor. */
function criarRede() {
  const recebidos: EventoNaFila[] = [];
  let ligada = true;
  let chamadas = 0;

  const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
    chamadas++;
    if (!ligada) {
      throw new TypeError("fetch failed");
    }
    const corpo = JSON.parse(String(init?.body)) as { eventos: EventoNaFila[] };
    recebidos.push(...corpo.eventos);
    return new Response(
      JSON.stringify({ aceitos: corpo.eventos.length, duplicados: 0, rejeitados: [] }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  });

  return {
    recebidos,
    get chamadas() {
      return chamadas;
    },
    desligar() {
      ligada = false;
    },
    religar() {
      ligada = true;
    },
    instalar() {
      vi.stubGlobal("fetch", fetchFalso);
    },
  };
}

/** Cliente de teste: sem envio automático por tempo, e retry instantâneo. */
function criarCliente(storage = new MemoryStorage(), extras = {}) {
  return new Cliente({
    key: "ing_chave_de_teste",
    projeto: "projeto-de-teste",
    host: "https://exemplo.invalido",
    storage,
    fila: { flushInterval: 0, retryDelay: 1, ...extras },
  });
}

let rede: ReturnType<typeof criarRede>;

beforeEach(() => {
  rede = criarRede();
  rede.instalar();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parâmetros da fila (tabela do épico 8.3)", () => {
  it("usa exatamente os defaults do spec", () => {
    expect(PARAMETROS_PADRAO).toEqual({
      flushAt: 20,
      flushInterval: 10_000,
      maxBatchSize: 100,
      maxQueueSize: 1_000,
      retries: 3,
      retryDelay: 3_000,
      requestTimeout: 10_000,
    });
  });
});

describe("track", () => {
  it("enfileira e devolve na hora, sem await", () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");

    const devolveu = cliente.track("psi_novo_pagamento", {
      descricao: "usuário registrou um pagamento de um paciente",
      tela: "PagamentosView",
      props: { valor: 250 },
    });

    expect(devolveu).toBeUndefined();
    expect(cliente.tamanhoDaFila).toBe(1);
  });

  it("carimba um id UUID v4 diferente em cada evento", async () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");
    cliente.track("psi_um");
    cliente.track("psi_dois");
    await cliente.flush();

    const [primeiro, segundo] = rede.recebidos;
    const formatoV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(primeiro!.id).toMatch(formatoV4);
    expect(segundo!.id).toMatch(formatoV4);
    expect(primeiro!.id).not.toBe(segundo!.id);
  });

  it("carimba ocorrido_em no momento do track, e não no do envio", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));

    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");
    cliente.track("psi_capturado_cedo");

    // Meia hora depois, o evento finalmente sai.
    vi.setSystemTime(new Date("2026-08-17T12:30:00.000Z"));
    vi.useRealTimers();
    await cliente.flush();

    expect(rede.recebidos[0]!.ocorrido_em).toBe("2026-08-17T12:00:00.000Z");
  });

  it("recusa nome fora da regra 11.1 sem mandar nada", () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");

    cliente.track("swim_geracao de treino");
    cliente.track("Psi_Maiuscula");
    cliente.track("ab");

    expect(cliente.tamanhoDaFila).toBe(0);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("não envia nada antes de identify — a v1 não tem fluxo anônimo", () => {
    const cliente = criarCliente();
    cliente.track("psi_sem_identidade");

    expect(cliente.tamanhoDaFila).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("identify(distinct_id)"),
    );
  });

  it("envia sozinho ao chegar em flushAt", async () => {
    const cliente = criarCliente(new MemoryStorage(), { flushAt: 3 });
    cliente.identify("carla@exemplo.com");

    cliente.track("psi_um");
    cliente.track("psi_dois");
    expect(rede.recebidos).toHaveLength(0);

    cliente.track("psi_tres");
    await vi.waitFor(() => expect(rede.recebidos).toHaveLength(3));
  });
});

describe("identify", () => {
  it("associa os eventos seguintes àquele identificador", async () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");
    cliente.track("psi_um");
    cliente.identify("joao@exemplo.com");
    cliente.track("psi_dois");
    await cliente.flush();

    expect(rede.recebidos[0]!.distinct_id).toBe("carla@exemplo.com");
    expect(rede.recebidos[1]!.distinct_id).toBe("joao@exemplo.com");
  });

  it("manda as propriedades de pessoa em propriedades.pessoa", async () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com", { plano: "mensal" });
    cliente.track("psi_um", { props: { valor: 250 } });
    await cliente.flush();

    expect(rede.recebidos[0]!.propriedades).toEqual({
      valor: 250,
      pessoa: { plano: "mensal" },
    });
  });
});

describe("fila offline", () => {
  it("30 eventos capturados sem rede chegam exatamente 30 ao religar", async () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");

    rede.desligar();
    for (let i = 0; i < 30; i++) {
      cliente.track("psi_offline", { props: { indice: i } });
    }
    await cliente.flush();

    expect(rede.recebidos).toHaveLength(0);
    expect(cliente.tamanhoDaFila).toBe(30);

    rede.religar();
    await cliente.flush();

    expect(rede.recebidos).toHaveLength(30);
    expect(cliente.tamanhoDaFila).toBe(0);
    // Exatamente uma vez cada: nenhum id se repete.
    expect(new Set(rede.recebidos.map((e) => e.id)).size).toBe(30);
  });

  it("a fila sobrevive ao app fechar e reabrir", async () => {
    const storage = new MemoryStorage();
    const primeiroCiclo = criarCliente(storage);
    primeiroCiclo.identify("carla@exemplo.com");

    rede.desligar();
    for (let i = 0; i < 30; i++) primeiroCiclo.track("psi_antes_de_fechar");
    await primeiroCiclo.flush();
    expect(rede.recebidos).toHaveLength(0);

    // O app fecha e abre: cliente novo, mesmo storage.
    rede.religar();
    const segundoCiclo = criarCliente(storage);
    segundoCiclo.identify("carla@exemplo.com");
    await segundoCiclo.flush();

    expect(rede.recebidos).toHaveLength(30);
  });

  it("com 1.001 eventos descarta o mais antigo e mantém 1.000", () => {
    // flushAt alto de propósito: aqui o que está sob teste é o teto da fila, e
    // não o envio. Sem isso o track dispararia envios no meio da contagem.
    const cliente = criarCliente(new MemoryStorage(), { flushAt: 10_000 });
    cliente.identify("carla@exemplo.com");

    rede.desligar();
    for (let i = 0; i < 1001; i++) {
      cliente.track("psi_enche_a_fila", { props: { indice: i } });
    }

    expect(cliente.tamanhoDaFila).toBe(1000);
    // O que sobrou é o fim da fila: o evento 0 saiu, o 1000 ficou.
    expect(rede.recebidos).toHaveLength(0);
  });
});

describe("retry", () => {
  it("tenta 3 vezes antes de devolver o lote à fila", async () => {
    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");
    rede.desligar();
    cliente.track("psi_um");

    const antes = rede.chamadas;
    await cliente.flush();

    expect(rede.chamadas - antes).toBe(3);
    expect(cliente.tamanhoDaFila).toBe(1);
  });

  it("descarta o lote que o servidor recusou em definitivo, sem insistir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ codigo: "credencial_invalida" }), {
        status: 401,
      })),
    );

    const cliente = criarCliente();
    cliente.identify("carla@exemplo.com");
    cliente.track("psi_chave_errada");
    await cliente.flush();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(cliente.tamanhoDaFila).toBe(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("401"));
  });
});

describe("lotes", () => {
  it("quebra a fila em lotes de no máximo maxBatchSize", async () => {
    const cliente = criarCliente(new MemoryStorage(), { flushAt: 10_000 });
    cliente.identify("carla@exemplo.com");
    for (let i = 0; i < 250; i++) cliente.track("psi_lote");

    await cliente.flush();

    const chamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const tamanhos = chamadas.map(
      (c) => JSON.parse(String((c[1] as RequestInit).body)).eventos.length,
    );
    expect(tamanhos).toEqual([100, 100, 50]);
    expect(rede.recebidos).toHaveLength(250);
  });
});

describe("utilitários", () => {
  it("valida nome de evento pela regra 11.1", () => {
    expect(nomeDeEventoEhValido("psi_novo_pagamento")).toBe(true);
    expect(nomeDeEventoEhValido("app_aberto")).toBe(true);
    expect(nomeDeEventoEhValido("swim_geracao de treino")).toBe(false);
    expect(nomeDeEventoEhValido("Psi_Maiuscula")).toBe(false);
    expect(nomeDeEventoEhValido("ab")).toBe(false);
    expect(nomeDeEventoEhValido("1_comeca_com_numero")).toBe(false);
    expect(nomeDeEventoEhValido("a".repeat(65))).toBe(false);
  });

  it("gera ids únicos", () => {
    const ids = new Set(Array.from({ length: 500 }, () => gerarId()));
    expect(ids.size).toBe(500);
  });
});
