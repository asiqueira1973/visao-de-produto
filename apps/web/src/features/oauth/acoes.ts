"use server";

/**
 * A aprovação do dono, no fluxo OAuth.
 *
 * O que faz: cria o código de autorização amarrado à conta de quem está logado.
 * Implementa: épico 8.8.
 *
 * Só a sessão do dono chega aqui: é ela que decide de qual conta o token vai
 * falar. Nenhum parâmetro da URL escolhe conta.
 */

import { clienteDaSessao, clienteDeServico } from "@/lib/supabase/server";
import { acharCliente, hashHex, redirecionamentoPermitido, sortear, VALIDADE_DO_CODIGO_MS } from "./servidor";

/**
 * Aprova a conexão e devolve o endereço de volta, já com o código.
 * Recebe os parâmetros do pedido OAuth.
 * Devolve a URL para onde o navegador deve ir, ou o motivo da recusa.
 */
export async function aprovarConexao(pedido: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  estado: string;
}): Promise<{ destino?: string; erro?: string }> {
  const supabase = await clienteDaSessao();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre de novo e repita a conexão." };

  const cliente = await acharCliente(pedido.clientId);
  if (!cliente) return { erro: "Aplicativo desconhecido." };
  if (!redirecionamentoPermitido(cliente, pedido.redirectUri)) {
    return { erro: "Endereço de retorno não autorizado." };
  }

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const codigo = sortear(32);
  const servico = clienteDeServico();

  const { error } = await servico.from("codigos_oauth").insert({
    codigo_hash: hashHex(codigo),
    client_id: pedido.clientId,
    conta_id: vinculo.conta_id,
    usuario_id: user.id,
    code_challenge: pedido.codeChallenge,
    redirect_uri: pedido.redirectUri,
    expira_em: new Date(Date.now() + VALIDADE_DO_CODIGO_MS).toISOString(),
  });

  if (error) return { erro: error.message };

  const destino = new URL(pedido.redirectUri);
  destino.searchParams.set("code", codigo);
  if (pedido.estado) destino.searchParams.set("state", pedido.estado);

  return { destino: destino.toString() };
}
