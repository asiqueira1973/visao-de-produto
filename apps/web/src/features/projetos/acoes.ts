"use server";

/**
 * Ações da tela de Projetos.
 *
 * O que faz: cria projeto e arquiva projeto.
 * Implementa: o inventário da seção 10 — a tela de Projetos escreve em
 *             `projetos` — e a seção 7.3, onde arquivar é soft delete.
 *
 * Criar projeto é ação de sessão do dono (matriz 5.1). Nem a chave de ingestão
 * nem o token de leitura conseguem: evento nunca cria projeto, porque é a
 * chave que determina o projeto (regra 11.5), e a chave nasce depois dele.
 */

import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";
import { registrar } from "@/lib/instrumentacao";

/** Transforma o nome digitado em slug, no formato que o banco exige. */
export async function paraSlug(nome: string): Promise<string> {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "projeto"
  );
}

/**
 * Cria o projeto, tentando o slug pedido e o próximo livre quando ele colide.
 * Recebe o cliente da sessão, a conta, o nome e o slug pedido.
 * Devolve o projeto criado ou o motivo da recusa.
 *
 * A tentativa é o próprio insert, e não uma consulta antes: o slug é único no
 * produto inteiro (seção 7.3), então a colisão pode vir de projeto de outra
 * conta, que a RLS esconde de qualquer select feito aqui.
 */
export async function criarProjetoComSlugLivre(
  supabase: Awaited<ReturnType<typeof clienteDaSessao>>,
  contaId: string,
  nome: string,
  slugPedido: string,
): Promise<{ projeto?: { id: string; nome: string; slug: string }; erro?: string }> {
  for (let tentativa = 1; tentativa <= 20; tentativa++) {
    const slug = tentativa === 1 ? slugPedido : `${slugPedido}-${tentativa}`;

    const { data, error } = await supabase
      .from("projetos")
      .insert({
        conta_id: contaId,
        nome: nome.trim() || slug,
        slug,
        // A convenção de nome nasce do slug e passa a valer para todas as
        // instrumentações seguintes (fluxo 9.1, caminho de exceção).
        prefixo_evento: `${slug.replace(/-/g, "_").slice(0, 20)}_`,
      })
      .select("id, nome, slug")
      .single();

    if (!error && data) return { projeto: data };

    // O limite do plano (regra 11.15) é imposto por trigger no banco, e a
    // mensagem dele já explica o que fazer. Repassamos sem o prefixo técnico —
    // quem lê a tela não precisa saber o nome da exceção.
    if (error?.message?.includes("limite_de_projetos")) {
      return { erro: error.message.replace(/^.*limite_de_projetos:\s*/, "") };
    }

    // 23505 é violação de unicidade: o slug já é de alguém. Qualquer outro erro
    // é problema de verdade e não melhora tentando de novo.
    if (error?.code !== "23505") {
      return { erro: error?.message ?? "Não consegui criar o projeto." };
    }
  }

  return { erro: "Não achei um slug livre para este nome. Escolha outro nome." };
}

/**
 * Cria um projeto pela tela.
 * Recebe o nome digitado.
 * Devolve o slug criado, para a tela levar a pessoa até as Configurações dele —
 * que é onde a chave de ingestão é gerada (seção 10).
 */
export async function criarProjeto(nome: string): Promise<{ slug?: string; erro?: string }> {
  const supabase = await clienteDaSessao();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre de novo." };

  if (!nome.trim()) return { erro: "Dê um nome ao projeto." };

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("conta_id")
    .maybeSingle();

  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  const { projeto, erro } = await criarProjetoComSlugLivre(
    supabase,
    vinculo.conta_id,
    nome,
    await paraSlug(nome),
  );

  if (erro || !projeto) return { erro: erro ?? "Não consegui criar o projeto." };

  registrar("visao_projeto_criado", vinculo.conta_id as string, "Projetos");

  revalidatePath("/projetos");
  return { slug: projeto.slug };
}

/**
 * Arquiva um projeto.
 * Recebe o id do projeto.
 * Devolve o erro, quando houver.
 * Arquivar é soft delete (seção 7.3): o projeto some das listas e **os eventos
 * continuam lá**. Não existe apagar projeto pela tela.
 */
export async function arquivarProjeto(projetoId: string): Promise<{ erro?: string }> {
  const supabase = await clienteDaSessao();

  const { error } = await supabase
    .from("projetos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", projetoId)
    .is("arquivado_em", null);

  if (error) return { erro: error.message };

  revalidatePath("/projetos");
  return {};
}
