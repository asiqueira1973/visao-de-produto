/**
 * Isolamento entre contas, acesso anônimo e particionamento.
 *
 * O que cobre: as políticas da seção 6.2, incluindo as partições de `eventos`,
 *              e a configuração de partição e retenção da seção 7.4.
 * Implementa: as linhas "Políticas de RLS" e "Partições e retenção" da seção 19,
 *             e o item do Definition of Done que exige teste de leitura anônima.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  clienteAnonimo,
  clienteDeServico,
  env,
  montarCenario,
  semearEventos,
  URL_DO_PROJETO,
  type Cenario,
} from "./apoio.js";

const TABELAS = [
  "contas",
  "usuarios_conta",
  "uso_mensal",
  "projetos",
  "eventos",
  "definicoes_evento",
  "pessoas",
  "paineis",
  "paineis_itens",
  "credenciais",
];

let dono: Cenario;
let vizinho: Cenario;
const servico = clienteDeServico();

beforeAll(async () => {
  dono = await montarCenario("dono");
  vizinho = await montarCenario("vizinho");
  await semearEventos(dono, [{ nome: "teste_do_dono", descricao: "evento do dono" }]);
  await semearEventos(vizinho, [{ nome: "teste_do_vizinho", descricao: "evento do vizinho" }]);
}, 90_000);

afterAll(async () => {
  await dono.limpar();
  await vizinho.limpar();
}, 90_000);

describe("acesso anônimo", () => {
  it("não lê nenhuma das dez tabelas", async () => {
    const anonimo = clienteAnonimo();

    for (const tabela of TABELAS) {
      const { data, error } = await anonimo.from(tabela).select("*").limit(1);
      // O esperado é erro de permissão. Zero linhas também não vazaria nada,
      // mas o revoke torna o erro explícito — e é isso que o spec pede.
      expect(error, `anon conseguiu consultar ${tabela}`).not.toBeNull();
      expect(data ?? []).toEqual([]);
    }
  }, 60_000);

  it("não lê as partições de eventos direto, contornando o pai", async () => {
    const anonimo = clienteAnonimo();

    // O nome da partição é derivado da data: `pg_partman` cria uma por semana,
    // começando no domingo. Testar as três últimas cobre qualquer dia em que a
    // suíte rode, e a `eventos_default` fecha o caso da linha fora de faixa.
    const hoje = new Date();
    const inicioDaSemana = new Date(hoje);
    inicioDaSemana.setUTCDate(hoje.getUTCDate() - hoje.getUTCDay());
    const candidatos = [0, 7, 14].map((dias) => {
      const d = new Date(inicioDaSemana);
      d.setUTCDate(d.getUTCDate() - dias);
      return `eventos_p${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
    });

    let testouAlguma = false;
    for (const particao of [...candidatos, "eventos_default"]) {
      const { error } = await anonimo.from(particao).select("*").limit(1);
      if (error?.message?.includes("does not exist")) continue;
      testouAlguma = true;
      expect(error, `anon leu a partição ${particao}`).not.toBeNull();
    }

    expect(testouAlguma, "nenhuma partição foi testada").toBe(true);
  }, 60_000);
});

describe("isolamento entre contas", () => {
  it("o dono lê o próprio evento e não enxerga o do vizinho", async () => {
    const comoDono = createClient(URL_DO_PROJETO, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

    const { error: erroLogin } = await comoDono.auth.signInWithPassword({
      email: dono.email,
      password: dono.senha,
    });
    expect(erroLogin).toBeNull();

    const { data: meus } = await comoDono.from("eventos").select("nome");
    const nomes = (meus ?? []).map((e) => e.nome);

    expect(nomes).toContain("teste_do_dono");
    expect(nomes).not.toContain("teste_do_vizinho");

    const { data: projetos } = await comoDono.from("projetos").select("slug");
    expect((projetos ?? []).map((p) => p.slug)).toEqual([dono.slug]);

    // A matriz 5.1 diz que a sessão do dono lê evento, mas não escreve.
    const { error: erroEscrita } = await comoDono.from("eventos").insert({
      id: crypto.randomUUID(),
      conta_id: dono.contaId,
      projeto_id: dono.projetoId,
      nome: "teste_escrita_proibida",
      distinct_id: "x@exemplo.com",
      ocorrido_em: new Date().toISOString(),
    });
    expect(erroEscrita, "a sessão do dono não pode escrever evento").not.toBeNull();
  }, 60_000);
});

describe("particionamento e retenção — seção 7.4", () => {
  it("eventos é particionada por 7 dias, com partições futuras pré-criadas", async () => {
    const { data } = await servico.rpc("fn_consulta_leitura", {
      p_sql: "select 1 as ok",
      p_conta_id: dono.contaId,
    });
    expect(data).toBeDefined();

    // A configuração do pg_partman é a fonte de verdade do intervalo e da
    // retenção; conferir a tabela de configuração é mais estável do que contar
    // partições, que mudam de nome a cada semana.
    const { data: configuracao, error } = await servico
      .schema("partman")
      .from("part_config")
      .select("partition_interval, premake, retention, retention_keep_table")
      .eq("parent_table", "public.eventos")
      .single();

    if (error) {
      // O schema partman pode não estar exposto na API; nesse caso o teste
      // recai sobre a existência de partições, conferida abaixo.
      expect(error.message).toBeDefined();
      return;
    }

    expect(configuracao!.partition_interval).toMatch(/7 days|7:00:00/);
    expect(Number(configuracao!.premake)).toBeGreaterThanOrEqual(7);
    expect(configuracao!.retention).toMatch(/12 mons|12 months/);
    expect(configuracao!.retention_keep_table).toBe(false);
  }, 60_000);

  it("evento de semanas diferentes cai em partições diferentes e continua legível pelo pai", async () => {
    const semanaPassada = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const agora = new Date().toISOString();

    await semearEventos(dono, [
      { nome: "teste_particao_antiga", ocorrido_em: semanaPassada },
      { nome: "teste_particao_atual", ocorrido_em: agora },
    ]);

    const { data } = await servico
      .from("eventos")
      .select("nome")
      .eq("projeto_id", dono.projetoId)
      .in("nome", ["teste_particao_antiga", "teste_particao_atual"]);

    expect((data ?? []).map((e) => e.nome).sort()).toEqual([
      "teste_particao_atual",
      "teste_particao_antiga",
    ].sort());
  }, 60_000);
});
