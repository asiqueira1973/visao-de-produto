/**
 * Contrato das cinco tools do MCP, e o caso de borda da meia-noite.
 *
 * O que cobre: autenticação pela regra 5.1.2, o handshake do protocolo, o
 *              contrato de cada tool da seção 12.2, o isolamento entre contas e
 *              a conversão de fuso da regra 11.7.
 * Implementa: as linhas "Contrato de cada tool do MCP" e "Caso de borda de
 *             meia-noite" da seção 19.
 *
 * Roda contra o servidor MCP publicado, não contra um dublê: o que precisa ser
 * provado aqui é o comportamento da Edge Function com o banco atrás dela.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chamarMcp,
  clienteDeServico,
  montarCenario,
  semearEventos,
  textoDaTool,
  URL_DO_PROJETO,
  type Cenario,
} from "./apoio.js";

/** As cinco tools da seção 12.2, e nada além delas. */
const TOOLS_ESPERADAS = ["atividade_recente", "uso_por_evento", "pessoa", "catalogo", "consulta"];

let dono: Cenario;
let vizinho: Cenario;

/** Chama uma tool já autenticada como o dono, e devolve o texto da resposta. */
async function tool(nome: string, argumentos: Record<string, unknown> = {}): Promise<string> {
  const r = await chamarMcp(dono.tokenDeLeitura, "tools/call", {
    name: nome,
    arguments: argumentos,
  });
  expect(r.status, `${nome} respondeu ${r.status}`).toBe(200);
  return textoDaTool(r.corpo);
}

beforeAll(async () => {
  dono = await montarCenario("mcp-dono");
  vizinho = await montarCenario("mcp-vizinho");

  await semearEventos(dono, [
    {
      nome: "teste_pagamento_registrado",
      descricao: "usuário registrou um pagamento",
      tela: "Pagamentos",
      distinct_id: "ana@exemplo.com",
    },
    {
      nome: "teste_pagamento_registrado",
      descricao: "usuário registrou um pagamento",
      tela: "Pagamentos",
      distinct_id: "bruno@exemplo.com",
    },
    {
      nome: "teste_relatorio_exportado",
      descricao: "usuário exportou o relatório",
      tela: "Ajustes",
      distinct_id: "ana@exemplo.com",
    },
  ]);

  // Um evento no catálogo que NUNCA ocorreu: é o que a regra 11.12 exige que
  // apareça, e o motivo de a plataforma existir.
  await clienteDeServico().from("definicoes_evento").insert({
    projeto_id: dono.projetoId,
    nome: "teste_nunca_disparado",
    descricao: "usuário fez algo que ainda ninguém fez",
  });

  await semearEventos(vizinho, [
    { nome: "teste_do_vizinho", descricao: "não pode vazar", distinct_id: "vizinho@exemplo.com" },
  ]);
}, 90_000);

afterAll(async () => {
  await dono?.limpar();
  await vizinho?.limpar();
});

describe("regra 5.1.2 — só entra com token de leitura válido", () => {
  it("sem token, responde 401 e diz onde se autorizar", async () => {
    const r = await chamarMcp(null, "tools/list");
    expect(r.status).toBe(401);

    // RFC 9728: é este cabeçalho que faz o cliente de agente descobrir o
    // servidor de autorização sozinho (épico 8.8).
    const autentique = r.cabecalhos.get("www-authenticate") ?? "";
    expect(autentique).toContain("Bearer");
    expect(autentique).toContain("resource_metadata=");
  }, 30_000);

  it("com token inventado, responde 401", async () => {
    const r = await chamarMcp("mcp_token_que_nunca_existiu", "tools/list");
    expect(r.status).toBe(401);
  }, 30_000);

  it("com token revogado, para de responder na hora", async () => {
    const descartavel = await montarCenario("mcp-revogado");
    try {
      const antes = await chamarMcp(descartavel.tokenDeLeitura, "tools/list");
      expect(antes.status, "o token deveria valer antes de ser revogado").toBe(200);

      await clienteDeServico()
        .from("credenciais")
        .update({ revogada_em: new Date().toISOString() })
        .eq("conta_id", descartavel.contaId)
        .eq("tipo", "leitura");

      const depois = await chamarMcp(descartavel.tokenDeLeitura, "tools/list");
      expect(depois.status, "token revogado continuou funcionando").toBe(401);
    } finally {
      await descartavel.limpar();
    }
  }, 90_000);

  it("o documento de descoberta responde sem autenticação nenhuma", async () => {
    const r = await fetch(`${URL_DO_PROJETO}/functions/v1/mcp/.well-known/oauth-protected-resource`);
    expect(r.status).toBe(200);

    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo.resource).toBe(`${URL_DO_PROJETO}/functions/v1/mcp/mcp`);
    expect(Array.isArray(corpo.authorization_servers)).toBe(true);
    // O servidor de autorização precisa ser o do MESMO ambiente. Anunciar o de
    // produção a partir do dev manda a pessoa autorizar no lugar errado.
    expect((corpo.authorization_servers as string[])[0]).toMatch(/^https:\/\//);
  }, 30_000);
});

describe("handshake e inventário", () => {
  it("responde ao initialize com a própria identidade", async () => {
    const r = await chamarMcp(dono.tokenDeLeitura, "initialize", {
      protocolVersion: "2026-07-28",
      capabilities: {},
      clientInfo: { name: "suite-de-testes", version: "0.1.0" },
    });
    expect(r.status).toBe(200);

    const resultado = r.corpo?.result as { serverInfo?: { name?: string } } | undefined;
    expect(resultado?.serverInfo?.name).toBe("visao-de-produto");
  }, 30_000);

  it("expõe exatamente as cinco tools da seção 12.2", async () => {
    const r = await chamarMcp(dono.tokenDeLeitura, "tools/list");
    expect(r.status).toBe(200);

    const resultado = r.corpo?.result as { tools?: Array<{ name: string }> } | undefined;
    const nomes = (resultado?.tools ?? []).map((t) => t.name).sort();

    expect(nomes).toEqual([...TOOLS_ESPERADAS].sort());
  }, 30_000);
});

describe("seção 12.2 — toda resposta que cita evento cita a descrição", () => {
  it("catalogo traz descrição e o prefixo do projeto", async () => {
    const texto = await tool("catalogo", { projeto: dono.slug });

    expect(texto).toContain("teste_pagamento_registrado");
    expect(texto).toContain("usuário registrou um pagamento");
    // A skill de instrumentação lê o prefixo daqui antes de propor nome novo.
    expect(texto).toContain("teste_");
  }, 45_000);

  it("atividade_recente nunca devolve nome técnico sozinho", async () => {
    const texto = await tool("atividade_recente", { projeto: dono.slug, limite: 10 });

    expect(texto).toContain("usuário registrou um pagamento");
    expect(texto).toContain("teste_pagamento_registrado");
    expect(texto).toContain("ana@exemplo.com");
  }, 45_000);

  it("pessoa devolve o perfil e a linha do tempo daquele identificador", async () => {
    const texto = await tool("pessoa", { projeto: dono.slug, distinct_id: "ana@exemplo.com" });

    expect(texto).toContain("ana@exemplo.com");
    expect(texto).toContain("usuário exportou o relatório");
    // Bruno é de outra linha do tempo e não pode aparecer nesta.
    expect(texto).not.toContain("bruno@exemplo.com");
  }, 45_000);
});

describe("regra 11.12 — o evento que não ocorreu aparece", () => {
  it("uso_por_evento lista o zerado, com zero explícito", async () => {
    const texto = await tool("uso_por_evento", { projeto: dono.slug, janela: "30d" });

    expect(texto).toContain("teste_nunca_disparado");
    expect(texto).toContain("0 ocorrência(s)");
    expect(texto).toContain("nunca ocorreu");
    // E diz quantos são, para o agente não precisar contar.
    expect(texto).toMatch(/não ocorreram nenhuma vez no período/);
  }, 45_000);

  it("conta as pessoas distintas, e não os eventos", async () => {
    const texto = await tool("uso_por_evento", {
      projeto: dono.slug,
      janela: "30d",
      evento: "teste_pagamento_registrado",
    });

    // Dois eventos, duas pessoas (regra 11.11).
    expect(texto).toContain("2 ocorrência(s), 2 pessoa(s)");
  }, 45_000);
});

describe("seção 17.3 — a tool consulta é somente leitura", () => {
  /**
   * Cada linha traz o SQL e o pedaço da recusa que precisa aparecer. A recusa
   * muda conforme a barreira que pegou: começar com algo que não é `select` é
   * recusado pelo formato, e a palavra proibida no meio é recusada pela lista.
   */
  const proibidas = [
    ["insert into eventos values (1)", "insert", "só é permitido `select`"],
    ["update eventos set nome = 'x'", "update", "só é permitido `select`"],
    ["delete from eventos", "delete", "só é permitido `select`"],
    ["drop table eventos", "drop", "só é permitido `select`"],
    ["select 1; select 2", "duas instruções", "única instrução"],
    // Começa com `with`, então passa pela primeira barreira. Quem recusa é a
    // lista de palavras — e é este caso que prova que ela não é decorativa.
    ["with x as (select 1) delete from eventos", "delete escondido depois de with", "`delete`"],
  ] as const;

  for (const [sql, o_que, esperado] of proibidas) {
    it(`recusa ${o_que}`, async () => {
      const texto = await tool("consulta", { sql });
      expect(texto.toLowerCase()).toContain(esperado.toLowerCase());
      // O que importa de verdade: nada foi lido nem escrito.
      expect(texto).not.toContain("linha(s):");
    }, 45_000);
  }

  it("recusa tabela fora das quatro permitidas", async () => {
    const texto = await tool("consulta", { sql: "select * from credenciais" });
    expect(texto).toContain("credenciais");
    expect(texto).toContain("não está disponível");
  }, 45_000);

  it("aceita um select das tabelas permitidas", async () => {
    const texto = await tool("consulta", {
      sql: `select nome, distinct_id from eventos where projeto_id = '${dono.projetoId}'`,
    });
    expect(texto).toContain("linha(s):");
    expect(texto).toContain("teste_pagamento_registrado");
  }, 45_000);
});

describe("isolamento entre contas", () => {
  it("o token do dono não alcança o projeto do vizinho, mesmo com o slug certo", async () => {
    const texto = await tool("catalogo", { projeto: vizinho.slug });

    expect(texto).toContain("Não há projeto com o slug");
    expect(texto).not.toContain("não pode vazar");
  }, 45_000);

  it("a consulta livre também não atravessa a fronteira", async () => {
    const texto = await tool("consulta", {
      sql: `select nome from eventos where projeto_id = '${vizinho.projetoId}'`,
    });

    // O papel do MCP filtra por conta na própria política de RLS, então a
    // consulta é válida e simplesmente não encontra nada.
    expect(texto).not.toContain("teste_do_vizinho");
  }, 45_000);
});

describe("regra 11.7 — a virada do dia é no fuso do projeto", () => {
  it("evento das 23h30 em São Paulo aparece no dia de São Paulo, não no do UTC", async () => {
    // 02:30 UTC de um dia = 23:30 do dia ANTERIOR em America/Sao_Paulo.
    // Se a conversão não acontecesse, o agente veria o evento no dia errado.
    const emUtc = "2026-08-11T02:30:00.000Z";
    const diaEsperado = "10/08";
    const horaEsperada = "23:30";

    await semearEventos(dono, [
      {
        nome: "teste_virada_do_dia",
        descricao: "evento que acontece perto da meia-noite",
        distinct_id: "ana@exemplo.com",
        ocorrido_em: emUtc,
      },
    ]);

    const texto = await tool("atividade_recente", {
      projeto: dono.slug,
      evento: "teste_virada_do_dia",
      limite: 5,
    });

    expect(texto).toContain(`${diaEsperado}, ${horaEsperada}`);
    expect(texto).not.toContain("11/08");
  }, 60_000);
});
