/**
 * Troca do código de autorização por token.
 *
 * O que faz: confere o PKCE, queima o código e emite um token de leitura.
 * Recebe:    `grant_type`, `code`, `code_verifier`, `client_id` e
 *            `redirect_uri`, em formulário ou JSON.
 * Devolve:   `{ access_token, token_type, scope }`.
 * Implementa: épico 8.8.
 *
 * O token emitido é uma linha comum de `credenciais` do tipo `leitura`: some da
 * tela de Credenciais MCP quando revogado, e nunca escreve nada (regra 5.1.2).
 */

import { NextResponse, type NextRequest } from "next/server";
import { clienteDeServico } from "@/lib/supabase/server";
import { registrar } from "@/lib/instrumentacao";
import {
  acharCliente,
  desafioS256,
  erroOauth,
  ESCOPO,
  hashHex,
  jsonOauth,
  redirecionamentoPermitido,
  sortear,
} from "@/features/oauth/servidor";

export const dynamic = "force-dynamic";

/** Lê os campos tanto de formulário quanto de JSON. */
async function lerCampos(request: NextRequest): Promise<Record<string, string>> {
  const tipo = request.headers.get("content-type") ?? "";

  if (tipo.includes("application/json")) {
    const corpo = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(corpo).map(([chave, valor]) => [chave, String(valor ?? "")]),
    );
  }

  const formulario = await request.formData();
  return Object.fromEntries([...formulario.entries()].map(([c, v]) => [c, String(v)]));
}

export async function POST(request: NextRequest) {
  let campos: Record<string, string>;
  try {
    campos = await lerCampos(request);
  } catch {
    return erroOauth("invalid_request", "Não consegui ler os campos do pedido.");
  }

  if (campos.grant_type !== "authorization_code") {
    return erroOauth("unsupported_grant_type", "Só aceito authorization_code.");
  }

  const { code, code_verifier: verificador, client_id: clientId, redirect_uri: redirect } = campos;

  if (!code || !verificador || !clientId) {
    return erroOauth("invalid_request", "Faltam code, code_verifier ou client_id.");
  }

  const cliente = await acharCliente(clientId);
  if (!cliente) return erroOauth("invalid_client", "Cliente desconhecido.", 401);

  const servico = clienteDeServico();

  const { data: registro } = await servico
    .from("codigos_oauth")
    .select("id, client_id, conta_id, code_challenge, redirect_uri, expira_em, usado_em")
    .eq("codigo_hash", hashHex(code))
    .maybeSingle();

  if (!registro) return erroOauth("invalid_grant", "Código inválido.");
  if (registro.usado_em) return erroOauth("invalid_grant", "Este código já foi usado.");
  if (new Date(registro.expira_em) < new Date()) {
    return erroOauth("invalid_grant", "Código expirado. Peça a autorização de novo.");
  }
  if (registro.client_id !== clientId) {
    return erroOauth("invalid_grant", "Este código é de outro cliente.");
  }
  if (redirect && registro.redirect_uri !== redirect) {
    return erroOauth("invalid_grant", "O redirect_uri não bate com o da autorização.");
  }
  if (!redirecionamentoPermitido(cliente, registro.redirect_uri)) {
    return erroOauth("invalid_grant", "Redirecionamento não registrado.");
  }
  // O PKCE é o que impede outro app de trocar um código que interceptou.
  if (desafioS256(verificador) !== registro.code_challenge) {
    return erroOauth("invalid_grant", "O code_verifier não corresponde ao desafio.");
  }

  // Queima o código antes de emitir: se algo falhar depois, ele não serve mais.
  const { error: erroQueima } = await servico
    .from("codigos_oauth")
    .update({ usado_em: new Date().toISOString() })
    .eq("id", registro.id)
    .is("usado_em", null);

  if (erroQueima) {
    return erroOauth("server_error", "Não consegui concluir a autorização.", 500);
  }

  const token = `mcp_${sortear(32)}`;

  const { error: erroToken } = await servico.from("credenciais").insert({
    conta_id: registro.conta_id,
    tipo: "leitura",
    projeto_id: null,
    nome: cliente.nome,
    prefixo: token.slice(0, 8),
    valor_hash: hashHex(token),
  });

  if (erroToken) {
    console.error("falha ao emitir token OAuth", erroToken);
    return erroOauth("server_error", "Não consegui emitir o token.", 500);
  }

  // O momento em que o Claude passa a enxergar os dados de alguém — o evento
  // mais importante do produto depois do primeiro evento recebido.
  registrar("visao_claude_conectado", registro.conta_id as string, "AutorizacaoOauth", {
    cliente: cliente.nome,
  });

  // Sem `expires_in`: o token vale até ser revogado na tela, que é o modelo de
  // credencial que o produto já tem (seção 6.3). Sem prazo, sem refresh token.
  return jsonOauth({
    access_token: token,
    token_type: "Bearer",
    scope: ESCOPO,
  });
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: { "access-control-allow-origin": "*" } });
}
