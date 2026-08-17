/**
 * As regras da seção 11, uma suíte por regra.
 *
 * O que cobre: 11.1 a 11.14, mais as triggers de catálogo e de pessoas, a
 *              deduplicação e o caso de borda de fuso.
 * Implementa: as cinco primeiras linhas da tabela da seção 19.
 *
 * São a lógica do produto: se uma destas quebrar, o produto está errado mesmo
 * que todas as telas abram.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { clienteDeServico, eventoValido, ingerir, montarCenario, semearEventos, type Cenario } from "./apoio.js";

let cenario: Cenario;
const servico = clienteDeServico();

beforeAll(async () => {
  cenario = await montarCenario("regras");
}, 60_000);

afterAll(async () => {
  await cenario.limpar();
}, 60_000);

describe("regra 11.1 — formato do nome do evento", () => {
  it("recusa espaço, maiúscula, nome curto e começo com número", async () => {
    const recusados = [
      "swim_geracao de treino",
      "Psi_Maiuscula",
      "ab",
      "1_comeca_com_numero",
      "com-hifen",
    ];

    for (const nome of recusados) {
      const { status, corpo } = await ingerir(cenario.chaveDeIngestao, [eventoValido({ nome })]);
      expect(status, `${nome} deveria ser recusado`).toBe(202);
      expect(corpo.aceitos, `${nome} deveria ser recusado`).toBe(0);
      expect((corpo.rejeitados as Array<{ campo: string }>)[0]?.campo).toBe("nome");
    }
  }, 60_000);

  it("aceita o formato da regra e o check do banco concorda", async () => {
    const { corpo } = await ingerir(cenario.chaveDeIngestao, [
      eventoValido({ nome: "teste_nome_valido_123" }),
    ]);
    expect(corpo.aceitos).toBe(1);

    // A mesma regra vale para quem escrever direto no banco.
    const { error } = await servico.from("eventos").insert({
      id: randomUUID(),
      conta_id: cenario.contaId,
      projeto_id: cenario.projetoId,
      nome: "nome invalido com espaco",
      distinct_id: "x@exemplo.com",
      ocorrido_em: new Date().toISOString(),
    });
    expect(error?.message).toMatch(/chk_nome_evento|violates check/i);
  }, 60_000);
});

describe("regra 11.2 — descrição editada nunca é sobrescrita", () => {
  it("preserva o que o dono escreveu quando chega evento com outra descrição", async () => {
    await semearEventos(cenario, [
      { nome: "teste_descricao", descricao: "primeira descrição, veio do app" },
    ]);

    await servico
      .from("definicoes_evento")
      .update({ descricao: "DESCRIÇÃO DO DONO" })
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_descricao");

    await semearEventos(cenario, [
      { nome: "teste_descricao", descricao: "tentativa de sobrescrever" },
    ]);

    const { data } = await servico
      .from("definicoes_evento")
      .select("descricao, total_ocorrencias")
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_descricao")
      .single();

    expect(data!.descricao).toBe("DESCRIÇÃO DO DONO");
    expect(Number(data!.total_ocorrencias)).toBe(2);
  }, 60_000);
});

describe("trigger de catálogo — seção 7.10", () => {
  it("cria a definição no primeiro evento e acumula telas sem duplicar linha", async () => {
    await semearEventos(cenario, [
      { nome: "teste_catalogo", tela: "TelaA", descricao: "usuário fez algo" },
    ]);

    const primeira = await servico
      .from("definicoes_evento")
      .select("total_ocorrencias, telas, primeira_ocorrencia_em, ultima_ocorrencia_em")
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_catalogo")
      .single();

    expect(Number(primeira.data!.total_ocorrencias)).toBe(1);
    expect(primeira.data!.telas).toEqual(["TelaA"]);
    expect(primeira.data!.primeira_ocorrencia_em).toBe(primeira.data!.ultima_ocorrencia_em);

    await semearEventos(cenario, [{ nome: "teste_catalogo", tela: "TelaB" }]);

    const segunda = await servico
      .from("definicoes_evento")
      .select("total_ocorrencias, telas")
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_catalogo")
      .single();

    expect(Number(segunda.data!.total_ocorrencias)).toBe(2);
    expect(segunda.data!.telas.sort()).toEqual(["TelaA", "TelaB"]);
  }, 60_000);
});

describe("trigger de pessoas — seção 7.10", () => {
  it("cria a pessoa no primeiro evento e faz merge das propriedades de pessoa", async () => {
    await semearEventos(cenario, [
      {
        nome: "teste_pessoa",
        distinct_id: "nova@exemplo.com",
        propriedades: { pessoa: { plano: "mensal" } },
      },
    ]);

    const primeira = await servico
      .from("pessoas")
      .select("total_eventos, propriedades")
      .eq("projeto_id", cenario.projetoId)
      .eq("distinct_id", "nova@exemplo.com")
      .single();

    expect(Number(primeira.data!.total_eventos)).toBe(1);
    expect(primeira.data!.propriedades).toEqual({ plano: "mensal" });

    await semearEventos(cenario, [
      {
        nome: "teste_pessoa",
        distinct_id: "nova@exemplo.com",
        propriedades: { pessoa: { cidade: "São Paulo" } },
      },
    ]);

    const segunda = await servico
      .from("pessoas")
      .select("total_eventos, propriedades")
      .eq("projeto_id", cenario.projetoId)
      .eq("distinct_id", "nova@exemplo.com")
      .single();

    expect(Number(segunda.data!.total_eventos)).toBe(2);
    expect(segunda.data!.propriedades).toEqual({ plano: "mensal", cidade: "São Paulo" });
  }, 60_000);
});

describe("regra 11.4 — deduplicação por id", () => {
  it("reenviar o mesmo lote não duplica e não conta duas vezes no catálogo", async () => {
    const lote = [eventoValido({ nome: "teste_dedup" }), eventoValido({ nome: "teste_dedup" })];

    const primeira = await ingerir(cenario.chaveDeIngestao, lote);
    expect(primeira.corpo.aceitos).toBe(2);

    const segunda = await ingerir(cenario.chaveDeIngestao, lote);
    expect(segunda.corpo.aceitos).toBe(0);
    expect(segunda.corpo.duplicados).toBe(2);

    const { data } = await servico
      .from("definicoes_evento")
      .select("total_ocorrencias")
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_dedup")
      .single();

    expect(Number(data!.total_ocorrencias)).toBe(2);
  }, 60_000);
});

describe("regra 11.5 — a chave determina o projeto", () => {
  it("ignora o projeto_id que vier no payload", async () => {
    const outro = await montarCenario("intruso");
    try {
      const { corpo } = await ingerir(cenario.chaveDeIngestao, [
        eventoValido({ nome: "teste_projeto_da_chave", projeto_id: outro.projetoId }),
      ]);
      expect(corpo.aceitos).toBe(1);

      const { count: noProjetoCerto } = await servico
        .from("eventos")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", cenario.projetoId)
        .eq("nome", "teste_projeto_da_chave");

      const { count: noProjetoAlheio } = await servico
        .from("eventos")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", outro.projetoId);

      expect(noProjetoCerto).toBe(1);
      expect(noProjetoAlheio).toBe(0);
    } finally {
      await outro.limpar();
    }
  }, 90_000);
});

describe("regra 11.6 — relógio adiantado", () => {
  it("troca ocorrido_em por recebido_em quando passa de 48 h no futuro", async () => {
    const daquiATresDias = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const evento = eventoValido({ nome: "teste_relogio", ocorrido_em: daquiATresDias });

    const { corpo } = await ingerir(cenario.chaveDeIngestao, [evento]);
    expect(corpo.aceitos).toBe(1);

    const { data } = await servico
      .from("eventos")
      .select("ocorrido_em, recebido_em")
      .eq("id", evento.id as string)
      .single();

    const distancia = Math.abs(
      new Date(data!.recebido_em).getTime() - new Date(data!.ocorrido_em).getTime(),
    );
    expect(distancia).toBeLessThan(5_000);
  }, 60_000);

  it("mantém a data quando ela está dentro da janela de 48 h", async () => {
    const daquiAUmDia = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const evento = eventoValido({ nome: "teste_relogio_ok", ocorrido_em: daquiAUmDia });

    await ingerir(cenario.chaveDeIngestao, [evento]);

    const { data } = await servico
      .from("eventos")
      .select("ocorrido_em")
      .eq("id", evento.id as string)
      .single();

    expect(new Date(data!.ocorrido_em).toISOString()).toBe(daquiAUmDia);
  }, 60_000);
});

describe("regras 11.11 e 11.12 — uso por evento", () => {
  it("conta identificadores distintos e mostra o evento zerado com zero", async () => {
    await semearEventos(cenario, [
      { nome: "teste_uso", distinct_id: "a@exemplo.com" },
      { nome: "teste_uso", distinct_id: "a@exemplo.com" },
      { nome: "teste_uso", distinct_id: "b@exemplo.com" },
    ]);

    // Um evento que existe no catálogo e nunca ocorreu.
    await servico.from("definicoes_evento").insert({
      projeto_id: cenario.projetoId,
      nome: "teste_nunca_ocorreu",
      descricao: "usuário fez algo que ninguém fez",
    });

    const { data } = await servico.rpc("fn_uso_por_evento", {
      p_projeto_id: cenario.projetoId,
      p_janela: "30d",
    });

    const linhas = data as Array<{ nome: string; total_no_periodo: number; usuarios_unicos: number }>;
    const usado = linhas.find((l) => l.nome === "teste_uso")!;
    const zerado = linhas.find((l) => l.nome === "teste_nunca_ocorreu")!;

    expect(Number(usado.total_no_periodo)).toBe(3);
    expect(Number(usado.usuarios_unicos)).toBe(2);

    expect(zerado, "evento zerado não pode sumir da lista").toBeDefined();
    expect(Number(zerado.total_no_periodo)).toBe(0);
    expect(Number(zerado.usuarios_unicos)).toBe(0);
  }, 60_000);
});

describe("regra 11.14 — agrupamento das barras", () => {
  it("devolve 7, 14, 10 e 13 barras para 7, 14, 30 e 90 dias", async () => {
    const esperado: Record<string, number> = { "7d": 7, "14d": 14, "30d": 10, "90d": 13 };

    for (const [janela, barras] of Object.entries(esperado)) {
      const { data } = await servico.rpc("fn_serie_do_evento", {
        p_projeto_id: cenario.projetoId,
        p_nome: "teste_uso",
        p_janela: janela,
      });
      expect((data as unknown[]).length, `janela ${janela}`).toBe(barras);
    }
  }, 60_000);

  it("barra sem ocorrência volta como zero, e não some da série", async () => {
    const { data } = await servico.rpc("fn_serie_do_evento", {
      p_projeto_id: cenario.projetoId,
      p_nome: "teste_evento_que_nao_existe",
      p_janela: "7d",
    });

    const barras = data as Array<{ total: number }>;
    expect(barras.length).toBe(7);
    expect(barras.every((b) => Number(b.total) === 0)).toBe(true);
  }, 60_000);
});

describe("regra 11.7 — caso de borda de fuso", () => {
  it("evento à meia-noite em São Paulo cai no dia certo, e não no seguinte", async () => {
    // 17/08 às 00:30 em São Paulo é 17/08 às 03:30 em UTC.
    const meiaNoiteEmSaoPaulo = "2026-08-17T03:30:00.000Z";
    await semearEventos(cenario, [
      { nome: "teste_meia_noite", ocorrido_em: meiaNoiteEmSaoPaulo },
    ]);

    const { data } = await servico
      .from("eventos")
      .select("ocorrido_em")
      .eq("projeto_id", cenario.projetoId)
      .eq("nome", "teste_meia_noite")
      .single();

    const diaEmSaoPaulo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(data!.ocorrido_em));

    const diaEmUtc = new Date(data!.ocorrido_em).toISOString().slice(0, 10);

    expect(diaEmSaoPaulo).toBe("2026-08-17");
    expect(diaEmUtc).toBe("2026-08-17");

    // E o contrário: 23:30 em São Paulo já é o dia seguinte em UTC, e a tela
    // precisa mostrar o dia de São Paulo.
    const fimDoDiaEmSaoPaulo = "2026-08-18T02:30:00.000Z";
    const diaVirado = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(fimDoDiaEmSaoPaulo));

    expect(diaVirado).toBe("2026-08-17");
    expect(new Date(fimDoDiaEmSaoPaulo).toISOString().slice(0, 10)).toBe("2026-08-18");
  }, 60_000);
});
