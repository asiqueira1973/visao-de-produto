"use server";

/**
 * Ações do Painel.
 *
 * O que faz: adiciona e remove tiles, criando o painel do projeto na primeira
 *            vez que alguém fixa alguma coisa.
 * Implementa: épico 8.5 e seção 7.7.
 *
 * O tile referencia o evento por NOME, e não por FK (assunção 21.6): dá para
 * fixar um evento que ainda não disparou nenhuma vez, que é o caso toda vez que
 * uma feature acaba de subir.
 */

import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";

/** Nome do painel criado sozinho na primeira fixação. */
const PAINEL_PADRAO = "Painel";

/**
 * Fixa um evento no painel do projeto.
 * Recebe o projeto, o slug (para revalidar) e o nome do evento.
 * Devolve o erro, quando houver.
 * Aceita nome de evento que ainda não existe no catálogo — é justamente o caso
 * de uso que a referência por nome permite (regra 11.9 cuida do aviso na tela).
 */
export async function adicionarTile(
  projetoId: string,
  slug: string,
  nomeEvento: string,
): Promise<{ erro?: string }> {
  const nome = nomeEvento.trim();
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(nome)) {
    return {
      erro: "Nome de evento inválido: use minúsculas, números e underscore, de 3 a 64 caracteres.",
    };
  }

  const supabase = await clienteDaSessao();

  // O painel nasce na primeira fixação, e não no cadastro do projeto: projeto
  // sem tile nenhum não precisa de linha em `paineis`.
  let { data: painel } = await supabase
    .from("paineis")
    .select("id")
    .eq("projeto_id", projetoId)
    .order("criado_em")
    .limit(1)
    .maybeSingle();

  if (!painel) {
    const { data: criado, error } = await supabase
      .from("paineis")
      .insert({ projeto_id: projetoId, nome: PAINEL_PADRAO })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    painel = criado;
  }

  const { count } = await supabase
    .from("paineis_itens")
    .select("id", { count: "exact", head: true })
    .eq("painel_id", painel.id);

  const { error } = await supabase.from("paineis_itens").insert({
    painel_id: painel.id,
    nome_evento: nome,
    posicao: count ?? 0,
  });

  if (error) return { erro: error.message };

  revalidatePath(`/p/${slug}/painel`);
  return {};
}

/**
 * Tira um tile do painel.
 * Recebe o id do item e o slug do projeto.
 * Devolve o erro, quando houver.
 */
export async function removerTile(itemId: string, slug: string): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();
  const { error } = await supabase.from("paineis_itens").delete().eq("id", itemId);
  if (error) return { erro: error.message };
  revalidatePath(`/p/${slug}/painel`);
  return {};
}
