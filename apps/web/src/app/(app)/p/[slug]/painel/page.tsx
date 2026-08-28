/**
 * Tela de Painel.
 *
 * O que faz: mostra os gráficos fixados, cada um com o número absoluto do
 *            período e a série em barras.
 * Lê:        `paineis`, `paineis_itens`, `definicoes_evento` e `fn_serie_do_evento`.
 * Escreve:   `paineis` e `paineis_itens`, pelas políticas de propriedade.
 * Implementa: épico 8.5; regras 11.9, 11.10 e 11.14.
 *
 * Regra 11.10, sem exceção: série temporal é sempre barra com rótulo de valor,
 * em qualquer volume. Nunca linha, nunca curva suavizada — curva interpolada
 * sobre um ou dois eventos comunica tendência onde só existe ruído.
 */

import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { SeletorDePeriodo } from "@/features/uso/SeletorDePeriodo";
import { BotaoDeAtualizar } from "@/features/shell/BotaoDeAtualizar";
import { GradeDeTiles, type TileDoPainel } from "@/features/painel/GradeDeTiles";

export const dynamic = "force-dynamic";

export default async function Painel({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ janela?: string }>;
}) {
  const { slug } = await params;
  const { janela } = await searchParams;
  const janelaAtual = ["7d", "14d", "30d", "90d"].includes(janela ?? "") ? janela! : "30d";

  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, nome, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) notFound();

  const { data: painel } = await supabase
    .from("paineis")
    .select("id")
    .eq("projeto_id", projeto.id)
    .order("criado_em")
    .limit(1)
    .maybeSingle();

  const { data: itens } = painel
    ? await supabase
        .from("paineis_itens")
        .select("id, nome_evento, titulo, tipo_visualizacao, posicao")
        .eq("painel_id", painel.id)
        .order("posicao")
    : { data: [] };

  const { data: catalogo } = await supabase.rpc("fn_catalogo", { p_projeto_id: projeto.id });
  const definicoes = (catalogo ?? []) as Array<{ nome: string; descricao: string | null }>;

  // Cada gráfico puxa a própria série, já agrupada pela regra 11.14.
  const tiles: TileDoPainel[] = await Promise.all(
    (itens ?? []).map(async (item) => {
      const { data: serie } = await supabase.rpc("fn_serie_do_evento", {
        p_projeto_id: projeto.id,
        p_nome: item.nome_evento,
        p_janela: janelaAtual,
      });

      const barras = (serie ?? []) as Array<{
        inicio: string;
        fim: string;
        total: number;
        usuarios_unicos: number;
      }>;

      const definicao = definicoes.find((d) => d.nome === item.nome_evento);

      return {
        id: item.id,
        nomeEvento: item.nome_evento,
        // Título nulo significa "use a descrição do catálogo" (seção 7.7).
        titulo: item.titulo ?? definicao?.descricao ?? item.nome_evento,
        tipoVisualizacao: item.tipo_visualizacao,
        // Regra 11.9: evento que nunca chegou não vira gráfico vazio, e sim aviso.
        nuncaRecebido: !definicao,
        barras: barras.map((b) => ({
          inicio: b.inicio,
          fim: b.fim,
          total: Number(b.total),
          usuariosUnicos: Number(b.usuarios_unicos),
        })),
      };
    }),
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Painel</div>
            <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
              Gráficos fixados do catálogo. O período vale para o painel inteiro.
            </div>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
            <SeletorDePeriodo janelaAtual={janelaAtual} />
            <BotaoDeAtualizar />
          </div>
        </div>

        <GradeDeTiles
          projetoId={projeto.id}
          slug={slug}
          fuso={projeto.fuso_exibicao}
          janela={janelaAtual}
          tiles={tiles}
          eventosDoCatalogo={definicoes.map((d) => d.nome)}
        />
      </div>
    </div>
  );
}
