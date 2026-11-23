"use server";

/**
 * Autorização da CLI.
 *
 * O que faz: cria o projeto e as duas credenciais que a CLI precisa, com a
 *            sessão do dono, e devolve o pacote que volta para o terminal.
 * Implementa: épico 8.7 e a matriz da seção 5.1 — criar projeto é ação de
 *             sessão do dono, e nunca de credencial de máquina.
 *
 * Nenhuma credencial de dono sai daqui. O que vai para a CLI é a chave de
 * ingestão (que só escreve, num projeto só) e o token de leitura (que só lê).
 */

import { randomBytes, createHash } from "node:crypto";
import { clienteDaSessao } from "@/lib/supabase/server";
import { criarProjetoComSlugLivre } from "@/features/projetos/acoes";
import { urlDoMcp } from "@/features/oauth/servidor";

/** O que a CLI recebe de volta. */
export interface PacoteDaCli {
  slug: string;
  nome: string;
  chave_de_ingestao: string;
  token_de_leitura: string;
  url_do_mcp: string;
}

/** Sorteia uma credencial nova, no formato da seção 6.3. */
function sortear(prefixo: "ing_" | "mcp_") {
  const valor = prefixo + randomBytes(32).toString("base64url");
  return {
    valor,
    valorHash: createHash("sha256").update(valor).digest("hex"),
    prefixo8: valor.slice(0, 8),
  };
}

/**
 * Cria projeto e credenciais para a CLI.
 * Recebe o nome e o slug pedidos pelo terminal.
 * Devolve o pacote para a CLI, ou o motivo da recusa.
 */
export async function autorizarInstalacao(
  nome: string,
  slugPedido: string,
): Promise<{ pacote?: PacoteDaCli; erro?: string }> {
  const supabase = await clienteDaSessao();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre de novo e repita o comando." };

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const { projeto, erro: erroProjeto } = await criarProjetoComSlugLivre(
    supabase,
    vinculo.conta_id,
    nome,
    slugPedido,
  );

  if (erroProjeto || !projeto) {
    return { erro: erroProjeto ?? "Não consegui criar o produto." };
  }

  const chave = sortear("ing_");
  const { error: erroChave } = await supabase.from("credenciais").insert({
    conta_id: vinculo.conta_id,
    tipo: "ingestao",
    projeto_id: projeto.id,
    nome: `${projeto.nome} — criada pela CLI`,
    prefixo: chave.prefixo8,
    valor_hash: chave.valorHash,
  });

  if (erroChave) return { erro: erroChave.message };

  const token = sortear("mcp_");
  const { error: erroToken } = await supabase.from("credenciais").insert({
    conta_id: vinculo.conta_id,
    tipo: "leitura",
    projeto_id: null,
    nome: "Criado pela CLI",
    prefixo: token.prefixo8,
    valor_hash: token.valorHash,
  });

  if (erroToken) return { erro: erroToken.message };

  return {
    pacote: {
      slug: projeto.slug,
      nome: projeto.nome,
      chave_de_ingestao: chave.valor,
      token_de_leitura: token.valor,
      url_do_mcp: urlDoMcp(),
    },
  };
}
