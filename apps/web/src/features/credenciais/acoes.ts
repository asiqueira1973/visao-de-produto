"use server";

/**
 * Ações de credencial e de projeto.
 *
 * O que faz: gera e revoga chaves de ingestão e tokens de leitura, e salva as
 *            configurações do projeto.
 * Implementa: seções 5.1, 6.3 e 7.8.
 *
 * Regra de ouro da seção 6.3: o banco guarda apenas o hash SHA-256 e os 8
 * primeiros caracteres. O valor completo é devolvido uma única vez, aqui, para
 * a tela mostrar — e nunca mais.
 */

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";
import { registrar } from "@/lib/instrumentacao";

/** O que uma geração devolve: ou o valor em claro, ou o motivo da recusa. */
export interface ResultadoDaGeracao {
  valor?: string;
  erro?: string;
}

/**
 * Sorteia uma credencial nova.
 * Recebe o prefixo legível (`ing_` ou `mcp_`).
 * Devolve o valor em claro, o hash que vai para o banco e os 8 primeiros
 * caracteres para exibição.
 */
function sortearCredencial(prefixo: "ing_" | "mcp_") {
  // 32 bytes aleatórios em base64url, como manda a seção 6.3.
  const valor = prefixo + randomBytes(32).toString("base64url");
  const valorHash = createHash("sha256").update(valor).digest("hex");
  return { valor, valorHash, prefixo8: valor.slice(0, 8) };
}

/**
 * Gera uma chave de ingestão para o projeto.
 * Recebe o id do projeto e um nome para a chave.
 * Devolve o valor em claro, que a tela mostra uma única vez.
 * A chave só escreve, e só naquele projeto (regras 5.1.1 e 5.1.3).
 */
export async function gerarChaveDeIngestao(
  projetoId: string,
  nome: string,
): Promise<ResultadoDaGeracao> {
  const supabase = await clienteDaSessao();

  // A conta sai do projeto, e a RLS garante que o projeto é de quem pediu.
  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, conta_id, slug")
    .eq("id", projetoId)
    .maybeSingle();

  if (!projeto) return { erro: "Projeto não encontrado." };

  const { valor, valorHash, prefixo8 } = sortearCredencial("ing_");

  const { error } = await supabase.from("credenciais").insert({
    conta_id: projeto.conta_id,
    tipo: "ingestao",
    projeto_id: projeto.id,
    nome: nome.trim() || "Chave de ingestão",
    prefixo: prefixo8,
    valor_hash: valorHash,
  });

  if (error) return { erro: error.message };

  registrar("visao_chave_de_ingestao_gerada", projeto.conta_id as string, "Configuracoes");

  revalidatePath(`/p/${projeto.slug}/configuracoes`);
  return { valor };
}

/**
 * Gera um token de leitura para o MCP.
 * Recebe o nome do token ("Claude Code do notebook").
 * Devolve o valor em claro, mostrado uma única vez.
 * O token de leitura vale para todos os projetos da conta e nunca escreve
 * (regra 5.1.2), por isso `projeto_id` fica nulo.
 */
export async function gerarTokenDeLeitura(nome: string): Promise<ResultadoDaGeracao> {
  const supabase = await clienteDaSessao();

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Conta não encontrada." };

  const { valor, valorHash, prefixo8 } = sortearCredencial("mcp_");

  const { error } = await supabase.from("credenciais").insert({
    conta_id: vinculo.conta_id,
    tipo: "leitura",
    projeto_id: null,
    nome: nome.trim() || "Token de leitura",
    prefixo: prefixo8,
    valor_hash: valorHash,
  });

  if (error) return { erro: error.message };

  revalidatePath("/conta/credenciais");
  registrar("visao_token_mcp_gerado", vinculo.conta_id as string, "CredenciaisMcp");

  return { valor };
}

/**
 * Revoga uma credencial.
 * Recebe o id da credencial e o caminho a revalidar.
 * Devolve o erro, quando houver.
 * Revogação é soft delete: preserva o rastro de qual chave escreveu o quê, e
 * credencial revogada nunca é reativada (seção 7.8).
 */
export async function revogarCredencial(
  credencialId: string,
  caminho: string,
): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { error } = await supabase
    .from("credenciais")
    .update({ revogada_em: new Date().toISOString() })
    .eq("id", credencialId)
    .is("revogada_em", null);

  if (error) return { erro: error.message };

  revalidatePath(caminho);
  return {};
}

/**
 * Salva as configurações do projeto.
 * Recebe o id e os campos editáveis da tela.
 * Devolve o erro, quando houver.
 */
export async function salvarProjeto(
  projetoId: string,
  campos: { nome: string; slug: string; prefixo_evento: string; fuso_exibicao: string },
): Promise<{ erro?: string; slug?: string }> {
  const supabase = await clienteDaSessao();

  const slug = campos.slug.trim();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { erro: "O slug só aceita letras minúsculas, números e hífen." };
  }

  const { error } = await supabase
    .from("projetos")
    .update({
      nome: campos.nome.trim(),
      slug,
      // Prefixo vazio significa "este projeto não adota prefixo" (seção 7.3).
      prefixo_evento: campos.prefixo_evento.trim() || null,
      fuso_exibicao: campos.fuso_exibicao,
    })
    .eq("id", projetoId);

  if (error) return { erro: error.message };

  revalidatePath(`/p/${slug}/configuracoes`);
  return { slug };
}

/**
 * Salva a descrição de um evento no catálogo.
 * Recebe o projeto, o nome do evento e a descrição escrita pelo dono.
 * Devolve o erro, quando houver.
 * Uma vez preenchida aqui, a trigger nunca mais sobrescreve (regra 11.2).
 */
export async function salvarDescricaoDoEvento(
  projetoId: string,
  nomeDoEvento: string,
  descricao: string,
): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { error } = await supabase
    .from("definicoes_evento")
    .update({ descricao: descricao.trim() || null })
    .eq("projeto_id", projetoId)
    .eq("nome", nomeDoEvento);

  if (error) return { erro: error.message };
  return {};
}
