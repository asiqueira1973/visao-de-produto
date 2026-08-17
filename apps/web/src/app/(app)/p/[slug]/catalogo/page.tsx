/**
 * Tela de Catálogo.
 *
 * O que faz: lista todos os eventos que o projeto já registrou e deixa o dono
 *            editar a descrição de cada um.
 * Lê:        `fn_catalogo`.
 * Escreve:   `definicoes_evento.descricao`, pela política `definicoes_dono_total`.
 * Implementa: épico 8.5, seção 7.5 e regra 11.2 — a descrição editada aqui vira
 *             a fonte de verdade e nunca é sobrescrita por evento novo.
 */

import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { LinhasDoCatalogo } from "@/features/catalogo/LinhasDoCatalogo";

export const dynamic = "force-dynamic";

/** Uma linha do retorno de `fn_catalogo`. */
export interface LinhaDoCatalogo {
  nome: string;
  descricao: string | null;
  telas: string[];
  total_ocorrencias: number;
  primeira_ocorrencia_em: string | null;
  ultima_ocorrencia_em: string | null;
}

export default async function Catalogo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, nome, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) notFound();

  const { data } = await supabase.rpc("fn_catalogo", { p_projeto_id: projeto.id });
  const linhas = (data ?? []) as LinhaDoCatalogo[];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px" }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Catálogo</div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)", maxWidth: 660 }}>
          Todos os eventos que este projeto já registrou. A descrição é editada aqui e passa a
          aparecer em todas as telas.
        </div>

        <LinhasDoCatalogo
          projetoId={projeto.id}
          fuso={projeto.fuso_exibicao}
          linhas={linhas}
        />
      </div>
    </div>
  );
}
