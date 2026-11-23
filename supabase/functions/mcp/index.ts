/**
 * Servidor MCP — POST /functions/v1/mcp/mcp
 *                (ou POST /mcp, pelo endereço curto do proxy)
 *
 * O que faz: expõe as cinco tools de leitura da seção 12.2 por Streamable HTTP,
 *            autenticado por token de leitura no header Authorization.
 * Recebe:    requisições JSON-RPC do cliente de agente (Claude Code, Claude
 *            Desktop, Cursor).
 * Devolve:   as respostas do protocolo MCP.
 * Implementa: épico 8.6, seções 12.2 e 12.3, regra 5.1.2 e princípio 0.3.
 *
 * O servidor é REMOTO de propósito (seção 12.3): um servidor local por `npx`
 * precisaria de credencial de banco na máquina de quem usa. Aqui a credencial
 * fica no servidor e o cliente recebe apenas um token de leitura revogável.
 *
 * A versão do SDK é fixada exata por causa do risco R3: a 2.0.0 está sob a tag
 * `latest`, mas o próprio time chamou a linha de beta, e a revisão 2026-07-28
 * mexeu em sessões e em `initialize`.
 */

import { McpServer, createMcpHandler } from "npm:@modelcontextprotocol/server@2.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@4.2.0";
import {
  atividadeRecente,
  catalogoDoProjeto,
  consultaLivre,
  perfilDaPessoa,
  usoPorEvento,
} from "./consultas.ts";

/** Identidade anunciada no handshake do protocolo. */
const IDENTIDADE = { name: "visao-de-produto", version: "0.1.0" };

/**
 * O site, que faz o papel de servidor de autorização OAuth (épico 8.8).
 * É para lá que o cliente de agente vai se registrar e pedir autorização
 * quando não tiver token — é o que faz o Claude Desktop instalar sozinho.
 */
const SERVIDOR_DE_AUTORIZACAO =
  Deno.env.get("VISAO_SITE") ?? "https://visao-de-produto.vercel.app";

/**
 * A origem pública desta função.
 *
 * Nem `req.url` nem o header `host` servem aqui: dentro do runtime a requisição
 * chega como `http://edge-runtime.supabase.com`, que é o nome interno.
 *
 * E `SUPABASE_URL` sozinha também não serve mais: quando o projeto ganha
 * domínio próprio, o Supabase **não troca** essa variável — ela continua
 * devolvendo o endereço `.supabase.co`. Um documento de OAuth que anuncia um
 * host diferente do que o cliente usou faz a conexão ser recusada, e o conector
 * do Claude Desktop para de funcionar sem dizer por quê.
 *
 * Por isso existe `VISAO_ORIGEM_PUBLICA`: quando definida, ela manda. A queda
 * para `SUPABASE_URL` mantém o ambiente que ainda não tem domínio próprio
 * funcionando sem configuração nenhuma.
 */
function origemPublica(): string {
  const declarada = Deno.env.get("VISAO_ORIGEM_PUBLICA");
  if (declarada) return declarada.replace(/\/+$/, "");
  return (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
}

/**
 * Diz se o cliente chegou pelo endereço curto, `api.visaodeproduto.com.br/mcp`.
 *
 * O proxy da Vercel (`proxy-api/vercel.json`) repassa `/mcp` para esta função
 * acrescentando `?endereco=curto`. É o único jeito de a função saber por qual
 * porta o cliente entrou: o caminho que chega aqui é sempre o longo.
 */
function chegouPeloCurto(req: Request): boolean {
  return new URL(req.url).searchParams.get("endereco") === "curto";
}

/**
 * Endereço deste recurso protegido, como o cliente o conhece.
 *
 * Os dois endereços valem ao mesmo tempo, e cada cliente recebe de volta o que
 * usou: a spec do MCP manda o cliente conferir que o `resource` anunciado é o
 * endereço em que ele se conectou. Anunciar o curto para quem entrou pelo longo
 * derrubaria as conexões que já existem.
 */
function urlDoRecurso(req: Request): string {
  if (chegouPeloCurto(req)) return `${origemPublica()}/mcp`;
  return `${origemPublica()}/functions/v1/mcp/mcp`;
}

/** Endereço do documento que descreve este recurso (RFC 9728). */
function urlDoMetadata(req: Request): string {
  if (chegouPeloCurto(req)) return `${origemPublica()}/.well-known/oauth-protected-resource/mcp`;
  return `${origemPublica()}/functions/v1/mcp/.well-known/oauth-protected-resource`;
}

/** Calcula o SHA-256 do token, que é o que o banco guarda (seção 6.3). */
async function hashDoToken(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Envolve o texto no formato de resultado de tool do MCP. */
function texto(conteudo: string) {
  return { content: [{ type: "text" as const, text: conteudo }] };
}

/**
 * Monta o servidor com as cinco tools, já amarrado a uma conta.
 * Recebe o cliente do banco e a conta dona do token.
 * Devolve o servidor MCP daquela requisição.
 *
 * Toda tool recebe a conta por fechamento, e nunca por parâmetro: assim não
 * existe jeito de o agente pedir dado de outra conta.
 */
function criarServidor(supabase: ReturnType<typeof createClient>, contaId: string): McpServer {
  const servidor = new McpServer(IDENTIDADE);

  servidor.registerTool(
    "atividade_recente",
    {
      title: "Atividade recente",
      description:
        "Os últimos eventos recebidos, do mais recente para o mais antigo, com a descrição de cada um. Sem o parâmetro `projeto`, varre todos os produtos da conta.",
      inputSchema: z.object({
        projeto: z.string().optional().describe("slug do produto, ex. agenda-psi"),
        limite: z.number().int().min(1).max(200).optional().describe("padrão 50, máximo 200"),
        desde: z.string().optional().describe("data ISO 8601: só eventos a partir dela"),
        evento: z.string().optional().describe("nome exato do evento"),
        pessoa: z.string().optional().describe("distinct_id de uma pessoa"),
      }),
    },
    async (args) => texto(await atividadeRecente(supabase, contaId, args)),
  );

  servidor.registerTool(
    "uso_por_evento",
    {
      title: "Uso por evento",
      description:
        "Quanto cada evento do catálogo ocorreu no período, com quantas pessoas distintas e quando foi a última vez. Inclui os eventos que não ocorreram nenhuma vez.",
      inputSchema: z.object({
        projeto: z.string().describe("slug do produto"),
        janela: z.enum(["7d", "14d", "30d", "90d"]).optional().describe("padrão 30d"),
        evento: z.string().optional().describe("para olhar um evento só"),
      }),
    },
    async (args) => texto(await usoPorEvento(supabase, contaId, args)),
  );

  servidor.registerTool(
    "pessoa",
    {
      title: "Perfil de uma pessoa",
      description:
        "O perfil e a linha do tempo de um identificador dentro de um produto, com a descrição de cada evento.",
      inputSchema: z.object({
        projeto: z.string().describe("slug do produto"),
        distinct_id: z.string().describe("identificador da pessoa no app"),
        limite: z.number().int().min(1).max(200).optional().describe("padrão 50"),
      }),
    },
    async (args) => texto(await perfilDaPessoa(supabase, contaId, args)),
  );

  servidor.registerTool(
    "catalogo",
    {
      title: "Catálogo de eventos",
      description:
        "Todos os eventos que o produto já registrou, com descrição, telas, total acumulado e datas, mais o prefixo de nome adotado pelo produto. É o que se lê antes de propor um evento novo.",
      inputSchema: z.object({
        projeto: z.string().describe("slug do produto"),
      }),
    },
    async (args) => texto(await catalogoDoProjeto(supabase, contaId, args)),
  );

  servidor.registerTool(
    "consulta",
    {
      title: "Consulta SQL somente leitura",
      description:
        "Um `select` sobre eventos, definicoes_evento, pessoas e projetos, limitado a 500 linhas. Só leitura: qualquer outra instrução é recusada.",
      inputSchema: z.object({
        sql: z.string().describe("uma única instrução select"),
      }),
    },
    async (args) => texto(await consultaLivre(supabase, contaId, args)),
  );

  return servidor;
}

Deno.serve(async (req: Request) => {
  const cabecalhosCors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
    "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
    // O cliente precisa LER o www-authenticate para descobrir o servidor de
    // autorização; sem expor, o navegador esconde o cabeçalho dele.
    "access-control-expose-headers": "www-authenticate",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecalhosCors });
  }

  // RFC 9728: quem chega sem token descobre por aqui qual servidor de
  // autorização usar. Precisa responder sem autenticação nenhuma.
  if (new URL(req.url).pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return new Response(
      JSON.stringify({
        resource: urlDoRecurso(req),
        authorization_servers: [SERVIDOR_DE_AUTORIZACAO],
        bearer_methods_supported: ["header"],
        scopes_supported: ["leitura"],
        resource_documentation: `${SERVIDOR_DE_AUTORIZACAO}/conta/credenciais`,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...cabecalhosCors },
      },
    );
  }

  // Regra 5.1.2: todo request precisa de token de leitura válido.
  const autorizacao = req.headers.get("authorization") ?? "";
  const token = autorizacao.startsWith("Bearer ") ? autorizacao.slice(7).trim() : "";

  if (!token) {
    return new Response(JSON.stringify({ codigo: "credencial_invalida" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${urlDoMetadata(req)}"`,
        ...cabecalhosCors,
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: credencial, error } = await supabase.rpc("fn_valida_token_leitura", {
    p_valor_hash: await hashDoToken(token),
  });

  if (error) {
    console.error("falha ao validar o token de leitura", error);
    return new Response(JSON.stringify({ codigo: "erro_interno" }), {
      status: 500,
      headers: { "content-type": "application/json", ...cabecalhosCors },
    });
  }

  if (!credencial || credencial.length === 0) {
    return new Response(JSON.stringify({ codigo: "credencial_invalida" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${urlDoMetadata(req)}"`,
        ...cabecalhosCors,
      },
    });
  }

  const contaId = credencial[0].conta_id as string;

  // Medição do princípio 0.6: quem conta a consulta é o próprio servidor
  // (seção 7.9.2). Falhar aqui não pode derrubar a resposta ao agente.
  supabase.rpc("fn_registra_consulta_mcp", { p_conta_id: contaId }).then(
    () => {},
    (falha: unknown) => console.error("não consegui contabilizar a consulta", falha),
  );

  // O servidor é criado por requisição, sem sessão: é o modelo que a revisão
  // 2026-07-28 favorece e o único que faz sentido em função sem estado.
  const handler = createMcpHandler(() => criarServidor(supabase, contaId));
  const resposta = await handler.fetch(req);

  const cabecalhos = new Headers(resposta.headers);
  for (const [chave, valor] of Object.entries(cabecalhosCors)) {
    cabecalhos.set(chave, valor);
  }

  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });
});
