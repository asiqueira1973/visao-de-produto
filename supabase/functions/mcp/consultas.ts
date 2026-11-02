/**
 * As consultas que as tools do MCP fazem, e a formatação das respostas.
 *
 * O que faz: busca no banco o que cada tool precisa, sempre limitado à conta do
 *            token, e devolve texto curto e autoexplicativo.
 * Implementa: seção 12.2 e o princípio 0.3 — o agente é usuário de primeira
 *             classe, e responder a ele mal é responder mal.
 *
 * Regra transversal da seção 12.2: toda resposta que cita evento cita a
 * descrição junto. O agente nunca precisa adivinhar o que `psi_atualizacao_preco`
 * significa. E por causa da seção 2.2, a resposta é econômica em token: um dump
 * de mil linhas é resposta ruim mesmo quando está tecnicamente correta.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Tabelas que a tool `consulta` pode tocar (seção 12.2). */
const TABELAS_PERMITIDAS = ["eventos", "definicoes_evento", "pessoas", "projetos"];

/** Um projeto resolvido dentro da conta do token. */
export interface ProjetoDoToken {
  id: string;
  nome: string;
  slug: string;
  fuso_exibicao: string;
  prefixo_evento: string | null;
}

/**
 * Encontra um projeto pelo slug, dentro da conta do token.
 * Recebe o cliente, a conta e o slug.
 * Devolve o projeto, ou nulo quando o slug não existe naquela conta.
 * É aqui que mora o isolamento do MCP: um token nunca alcança projeto de outra
 * conta, mesmo passando o slug certo.
 */
export async function acharProjeto(
  supabase: SupabaseClient,
  contaId: string,
  slug: string,
): Promise<ProjetoDoToken | null> {
  const { data } = await supabase
    .from("projetos")
    .select("id, nome, slug, fuso_exibicao, prefixo_evento")
    .eq("conta_id", contaId)
    .eq("slug", slug)
    .maybeSingle();

  return (data as ProjetoDoToken) ?? null;
}

/** Lista os projetos da conta, para as mensagens de erro serem úteis. */
export async function listarProjetos(
  supabase: SupabaseClient,
  contaId: string,
): Promise<ProjetoDoToken[]> {
  const { data } = await supabase
    .from("projetos")
    .select("id, nome, slug, fuso_exibicao, prefixo_evento")
    .eq("conta_id", contaId)
    .is("arquivado_em", null)
    .order("nome");

  return (data ?? []) as ProjetoDoToken[];
}

/** Escreve o horário no fuso do projeto (regra 11.7). */
export function noFuso(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Monta a resposta da tool `atividade_recente`.
 * Recebe o cliente, a conta e os parâmetros da tool.
 * Devolve texto pronto para o agente ler.
 * Sem `projeto`, varre todos os projetos da conta; sem `limite`, no máximo 50,
 * para não estourar contexto (critério do épico 8.6).
 */
export async function atividadeRecente(
  supabase: SupabaseClient,
  contaId: string,
  args: { projeto?: string; limite?: number; desde?: string; evento?: string; pessoa?: string },
): Promise<string> {
  const limite = Math.min(Math.max(args.limite ?? 50, 1), 200);
  const encontrado = args.projeto ? await acharProjeto(supabase, contaId, args.projeto) : null;
  const projetos = args.projeto
    ? (encontrado ? [encontrado] : [])
    : await listarProjetos(supabase, contaId);

  if (projetos.length === 0) {
    return args.projeto
      ? `Não há produto com o slug "${args.projeto}" nesta conta.`
      : "Esta conta ainda não tem produto nenhum.";
  }

  const linhas: string[] = [];
  for (const projeto of projetos) {
    const { data } = await supabase.rpc("fn_atividade", {
      p_projeto_id: projeto.id,
      p_desde: args.desde ?? null,
      p_evento: args.evento ?? null,
      p_pessoa: args.pessoa ?? null,
      p_limite: limite,
      p_offset: 0,
    });

    for (const evento of (data ?? []) as Array<Record<string, string>>) {
      linhas.push(
        [
          noFuso(evento.ocorrido_em!, projeto.fuso_exibicao),
          projetos.length > 1 ? `[${projeto.slug}]` : "",
          evento.descricao ?? evento.nome,
          `(${evento.nome})`,
          `· ${evento.distinct_id}`,
          evento.tela ? `· ${evento.tela}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }

  if (linhas.length === 0) {
    return "Nenhum evento no período e nos filtros pedidos.";
  }

  const recortadas = linhas.slice(0, limite);
  return [
    `${recortadas.length} evento(s), do mais recente para o mais antigo:`,
    ...recortadas,
  ].join("\n");
}

/**
 * Monta a resposta da tool `uso_por_evento`.
 * Devolve, por evento: descrição, total, usuários únicos e última ocorrência.
 * Inclui os eventos com zero (regra 11.12) — é a informação que a plataforma
 * existe para dar, e omiti-la aqui seria repetir o erro que ela corrige.
 */
export async function usoPorEvento(
  supabase: SupabaseClient,
  contaId: string,
  args: { projeto: string; janela?: string; evento?: string },
): Promise<string> {
  const projeto = await acharProjeto(supabase, contaId, args.projeto);
  if (!projeto) return `Não há produto com o slug "${args.projeto}" nesta conta.`;

  const janela = ["7d", "14d", "30d", "90d"].includes(args.janela ?? "") ? args.janela! : "30d";

  const { data } = await supabase.rpc("fn_uso_por_evento", {
    p_projeto_id: projeto.id,
    p_janela: janela,
  });

  let linhas = (data ?? []) as Array<{
    nome: string;
    descricao: string | null;
    total_no_periodo: number;
    usuarios_unicos: number;
    ultima_ocorrencia_em: string | null;
  }>;

  if (args.evento) linhas = linhas.filter((l) => l.nome === args.evento);

  if (linhas.length === 0) {
    return `O catálogo de ${projeto.nome} está vazio: nada foi instrumentado ainda.`;
  }

  const corpo = linhas.map((l) => {
    const ultima = l.ultima_ocorrencia_em
      ? noFuso(l.ultima_ocorrencia_em, projeto.fuso_exibicao)
      : "nunca ocorreu";
    return `${l.descricao ?? "sem descrição"} (${l.nome}): ${l.total_no_periodo} ocorrência(s), ${l.usuarios_unicos} pessoa(s), última ${ultima}`;
  });

  const zerados = linhas.filter((l) => Number(l.total_no_periodo) === 0).length;

  return [
    `${projeto.nome} — uso nos últimos ${janela.replace("d", " dias")}:`,
    ...corpo,
    zerados > 0
      ? `${zerados} evento(s) do catálogo não ocorreram nenhuma vez no período.`
      : "Todos os eventos do catálogo tiveram alguma ocorrência no período.",
  ].join("\n");
}

/**
 * Monta a resposta da tool `pessoa`.
 * Devolve o perfil e a linha do tempo daquela pessoa, com a descrição de cada
 * evento.
 */
export async function perfilDaPessoa(
  supabase: SupabaseClient,
  contaId: string,
  args: { projeto: string; distinct_id: string; limite?: number },
): Promise<string> {
  const projeto = await acharProjeto(supabase, contaId, args.projeto);
  if (!projeto) return `Não há produto com o slug "${args.projeto}" nesta conta.`;

  const limite = Math.min(Math.max(args.limite ?? 50, 1), 200);

  const [{ data: pessoas }, { data: eventos }] = await Promise.all([
    supabase.rpc("fn_pessoas", { p_projeto_id: projeto.id }),
    supabase.rpc("fn_atividade", {
      p_projeto_id: projeto.id,
      p_pessoa: args.distinct_id,
      p_limite: limite,
      p_offset: 0,
    }),
  ]);

  const perfil = ((pessoas ?? []) as Array<Record<string, string>>).find(
    (p) => p.distinct_id === args.distinct_id,
  );

  if (!perfil) {
    return `Ninguém com o identificador "${args.distinct_id}" apareceu em ${projeto.nome}.`;
  }

  const linhaDoTempo = ((eventos ?? []) as Array<Record<string, string>>).map(
    (e) =>
      `${noFuso(e.ocorrido_em!, projeto.fuso_exibicao)} ${e.descricao ?? e.nome} (${e.nome})${e.tela ? ` · ${e.tela}` : ""}`,
  );

  return [
    `${args.distinct_id} em ${projeto.nome}: ${perfil.total_eventos} eventos, primeiro em ${noFuso(perfil.primeiro_visto_em!, projeto.fuso_exibicao)}, último em ${noFuso(perfil.ultimo_visto_em!, projeto.fuso_exibicao)}.`,
    ...linhaDoTempo,
  ].join("\n");
}

/**
 * Monta a resposta da tool `catalogo`.
 * Devolve todos os eventos do projeto com descrição, telas, total e datas, mais
 * o `prefixo_evento` — que é o que a skill de instrumentação lê antes de propor
 * um nome novo (regra 11.1 e épico 8.7).
 */
export async function catalogoDoProjeto(
  supabase: SupabaseClient,
  contaId: string,
  args: { projeto: string },
): Promise<string> {
  const projeto = await acharProjeto(supabase, contaId, args.projeto);
  if (!projeto) return `Não há produto com o slug "${args.projeto}" nesta conta.`;

  const { data } = await supabase.rpc("fn_catalogo", { p_projeto_id: projeto.id });
  const linhas = (data ?? []) as Array<{
    nome: string;
    descricao: string | null;
    telas: string[];
    total_ocorrencias: number;
    primeira_ocorrencia_em: string | null;
    ultima_ocorrencia_em: string | null;
  }>;

  const cabecalho = `${projeto.nome} (${projeto.slug}) — prefixo de evento: ${projeto.prefixo_evento ?? "nenhum"}`;

  if (linhas.length === 0) {
    return `${cabecalho}\nO catálogo está vazio: nenhum evento foi instrumentado ainda.`;
  }

  return [
    cabecalho,
    `${linhas.length} evento(s) no catálogo:`,
    ...linhas.map((l) => {
      const telas = l.telas.length > 0 ? ` · telas: ${l.telas.join(", ")}` : "";
      const ultima = l.ultima_ocorrencia_em
        ? noFuso(l.ultima_ocorrencia_em, projeto.fuso_exibicao)
        : "nunca";
      return `${l.nome}: ${l.descricao ?? "SEM DESCRIÇÃO"} · ${l.total_ocorrencias} no total · última ${ultima}${telas}`;
    }),
  ].join("\n");
}

/**
 * Valida o SQL da tool `consulta` antes de mandar para o banco.
 * Recebe o SQL escrito pelo agente.
 * Devolve o motivo da recusa, ou nulo quando o SQL passa.
 *
 * Esta é a primeira das duas barreiras da seção 17.3. A segunda é a permissão
 * do papel `visao_mcp_leitor`, dono da função que executa — validação de string
 * sozinha não é controle de acesso.
 */
export function recusarSqlInvalido(sql: string): string | null {
  const limpo = sql.trim().replace(/;+\s*$/, "");

  if (limpo.length === 0) return "A consulta está vazia.";
  if (limpo.includes(";")) return "A consulta precisa ser uma única instrução, sem ponto e vírgula.";

  const minusculo = limpo.toLowerCase();

  if (!/^(select|with)\b/.test(minusculo)) {
    return "Só é permitido `select`. O token de leitura nunca escreve.";
  }

  const proibidas = [
    "insert", "update", "delete", "drop", "alter", "create", "truncate",
    "grant", "revoke", "copy", "call", "vacuum",
  ];
  for (const palavra of proibidas) {
    if (new RegExp(`\\b${palavra}\\b`).test(minusculo)) {
      return `A consulta usa \`${palavra}\`, que não é permitido: o MCP é somente leitura.`;
    }
  }

  // Toda tabela citada depois de `from` ou `join` precisa estar na lista.
  const citadas = [...minusculo.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/g)].map(
    (m) => m[1]!.replace(/^public\./, ""),
  );
  const invasora = citadas.find((t) => !TABELAS_PERMITIDAS.includes(t));
  if (invasora) {
    return `A tabela \`${invasora}\` não está disponível. Use apenas: ${TABELAS_PERMITIDAS.join(", ")}.`;
  }

  return null;
}

/**
 * Executa a tool `consulta`.
 * Devolve o resultado em JSON, no máximo 500 linhas.
 * Quem executa de fato é `fn_consulta_leitura`, que roda com o papel restrito e
 * filtra pela conta do token.
 */
export async function consultaLivre(
  supabase: SupabaseClient,
  contaId: string,
  args: { sql: string },
): Promise<string> {
  const recusa = recusarSqlInvalido(args.sql);
  if (recusa) return recusa;

  const { data, error } = await supabase.rpc("fn_consulta_leitura", {
    p_sql: args.sql.trim().replace(/;+\s*$/, ""),
    p_conta_id: contaId,
  });

  if (error) return `A consulta falhou: ${error.message}`;

  const linhas = (data ?? []) as unknown[];
  if (linhas.length === 0) return "A consulta não devolveu nenhuma linha.";

  return `${linhas.length} linha(s):\n${JSON.stringify(linhas, null, 2)}`;
}
