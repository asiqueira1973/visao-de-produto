/**
 * Metadata do servidor de autorização.
 *
 * O que faz: anuncia os endereços do fluxo OAuth, para o cliente de agente
 *            descobrir tudo sozinho.
 * Recebe:    nada.
 * Devolve:   o JSON da RFC 8414.
 * Implementa: épico 8.8.
 *
 * É este documento que faz o Claude Desktop conseguir se registrar e autorizar
 * sem ninguém digitar nada além de clicar em "Autorizar".
 */

import { emissor, ESCOPO, jsonOauth } from "@/features/oauth/servidor";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = emissor();

  return jsonOauth({
    issuer: base,
    authorization_endpoint: `${base}/oauth/autorizar`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/registrar`,
    scopes_supported: [ESCOPO],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    // Só PKCE com S256: OAuth 2.1 não aceita `plain`, e cliente de desktop não
    // tem onde guardar segredo.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    service_documentation: `${base}/conta/credenciais`,
  });
}

export async function OPTIONS() {
  return jsonOauth({}, 204);
}
