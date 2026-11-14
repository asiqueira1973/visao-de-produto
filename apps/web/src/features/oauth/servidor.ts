/**
 * O servidor de autorização OAuth 2.1 do MCP.
 *
 * O que faz: guarda as regras compartilhadas pelas quatro rotas do fluxo —
 *            metadata, registro de cliente, autorização e troca de código.
 * Implementa: épico 8.8, decidido com o dono e fora do spec v1.
 *
 * Por que existe: a janela "Add custom connector" do Claude só fala OAuth. Sem
 * isto, instalar o MCP exige editar JSON à mão, e o princípio 0.6 diz que
 * nenhum caminho do produto pode depender disso.
 *
 * O que o fluxo devolve no fim é um token de leitura comum — mesma tabela,
 * mesmo hash, mesma revogação pela tela, mesma regra 5.1.2. O OAuth é só a
 * forma de entregar, não um poder novo.
 */

import { createHash, randomBytes } from "node:crypto";
import { clienteDeServico } from "@/lib/supabase/server";
import { ESQUEMAS_PERIGOSOS } from "./esquemas";

/** Quanto tempo um código de autorização vive. Curto de propósito. */
export const VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000;

/** O escopo único do produto: ler. O MCP nunca escreve (regra 5.1.2). */
export const ESCOPO = "leitura";

/** Calcula o SHA-256 em hexadecimal, como o resto do produto faz. */
export function hashHex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

/** Calcula o desafio S256 do PKCE a partir do verificador. */
export function desafioS256(verificador: string): string {
  return createHash("sha256").update(verificador).digest("base64url");
}

/** Sorteia um valor opaco, para código de autorização e client_id. */
export function sortear(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** O endereço público do site, que é o emissor deste servidor de autorização. */
export function emissor(): string {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL;
  if (configurado) return configurado.replace(/\/+$/, "");
  // Na Vercel a variável do sistema já traz o domínio do deploy.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

/** O recurso protegido: o endpoint do servidor MCP. */
export function recursoProtegido(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mcp/mcp`;
}

/** Um cliente registrado. */
export interface ClienteOauth {
  client_id: string;
  nome: string;
  redirect_uris: string[];
}

/**
 * Busca um cliente pelo `client_id`.
 * Recebe o identificador.
 * Devolve o cliente, ou nulo quando não existe.
 */
export async function acharCliente(clientId: string): Promise<ClienteOauth | null> {
  const servico = clienteDeServico();
  const { data } = await servico
    .from("clientes_oauth")
    .select("client_id, nome, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  return (data as ClienteOauth) ?? null;
}

/**
 * Diz se um redirecionamento é aceitável para aquele cliente.
 * Recebe o cliente e a URI pedida.
 * Devolve verdadeiro quando a URI está na lista registrada.
 *
 * A comparação é exata, e não por prefixo: é o que impede alguém de registrar
 * `http://localhost:1/` e depois redirecionar para outro lugar.
 */
export function redirecionamentoPermitido(cliente: ClienteOauth, uri: string): boolean {
  return cliente.redirect_uris.includes(uri);
}

/**
 * Recusa uma URI de redirecionamento perigosa no momento do registro.
 * Recebe a URI.
 * Devolve o motivo, ou nulo quando ela serve.
 *
 * Cliente de desktop redireciona para `http://localhost` ou para um esquema
 * próprio; qualquer `http://` fora de localhost seria segredo viajando em
 * texto puro.
 */
export function motivoDeRecusaDaUri(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `"${uri}" não é uma URL válida.`;
  }

  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return null;
  }
  // Esquema próprio de aplicativo, como claude://. Esquemas que executam código
  // ou carregam conteúdo no navegador (javascript:, data: etc.) nunca são aceitos.
  if (!["http:", "https:"].includes(url.protocol) && !ESQUEMAS_PERIGOSOS.includes(url.protocol)) {
    return null;
  }

  return `"${uri}" precisa ser https, localhost ou um esquema de aplicativo.`;
}

/** Resposta de erro no formato que o OAuth 2.1 espera. */
export function erroOauth(
  codigo: string,
  descricao: string,
  status = 400,
): Response {
  return new Response(JSON.stringify({ error: codigo, error_description: descricao }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

/** Resposta de sucesso em JSON, com os cabeçalhos que o fluxo exige. */
export function jsonOauth(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}
