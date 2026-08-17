/**
 * Registro dinâmico de cliente (RFC 7591).
 *
 * O que faz: aceita um cliente de agente se apresentando e devolve um
 *            `client_id`.
 * Recebe:    JSON com `redirect_uris` e, opcionalmente, `client_name`.
 * Devolve:   o `client_id` criado.
 * Implementa: épico 8.8.
 *
 * São clientes públicos, sem segredo: um app de desktop não tem onde guardar
 * um. O que protege o fluxo é o PKCE e a lista exata de redirecionamentos.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clienteDeServico } from "@/lib/supabase/server";
import { erroOauth, jsonOauth, motivoDeRecusaDaUri, sortear } from "@/features/oauth/servidor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let corpo: { redirect_uris?: unknown; client_name?: unknown };

  try {
    corpo = await request.json();
  } catch {
    return erroOauth("invalid_client_metadata", "O corpo precisa ser um JSON válido.");
  }

  const uris = Array.isArray(corpo.redirect_uris) ? corpo.redirect_uris : [];
  if (uris.length === 0) {
    return erroOauth("invalid_redirect_uri", "Informe ao menos um redirect_uri.");
  }

  for (const uri of uris) {
    if (typeof uri !== "string") {
      return erroOauth("invalid_redirect_uri", "Cada redirect_uri precisa ser texto.");
    }
    const recusa = motivoDeRecusaDaUri(uri);
    if (recusa) return erroOauth("invalid_redirect_uri", recusa);
  }

  const nome =
    typeof corpo.client_name === "string" && corpo.client_name.trim()
      ? corpo.client_name.trim().slice(0, 120)
      : "Cliente de agente";

  const clientId = `cli_${sortear(24)}`;
  const servico = clienteDeServico();

  const { error } = await servico.from("clientes_oauth").insert({
    client_id: clientId,
    nome,
    redirect_uris: uris,
  });

  if (error) {
    console.error("falha ao registrar cliente OAuth", error);
    return erroOauth("server_error", "Não consegui registrar o cliente.", 500);
  }

  return jsonOauth(
    {
      client_id: clientId,
      client_name: nome,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    201,
  );
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204, headers: { "access-control-allow-origin": "*" } });
}
