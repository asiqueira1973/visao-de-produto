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
 * Cria o projeto tentando o slug pedido e, se ele já existir, o próximo livre.
 * Recebe o cliente, a conta, o nome e o slug pedido.
 * Devolve o projeto criado, ou o erro.
 *
 * A tentativa é o próprio insert, e não uma consulta antes: o slug é único no
 * produto inteiro (seção 7.3), então a colisão pode vir de projeto de outra
 * conta, que a RLS esconde de qualquer select feito aqui. Só o banco sabe.
 */
async function criarProjetoComSlugLivre(
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

    // 23505 é violação de unicidade: o slug já é de alguém. Qualquer outro
    // erro é problema de verdade e não melhora tentando de novo.
    if (error?.code !== "23505") return { erro: error?.message ?? "Não consegui criar o projeto." };
  }

  return { erro: "Não achei um slug livre para este nome. Escolha outro nome de projeto." };
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
    return { erro: erroProjeto ?? "Não consegui criar o projeto." };
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
      url_do_mcp: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mcp/mcp`,
    },
  };
}
