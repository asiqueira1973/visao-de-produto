/**
 * Tela de Atividade.
 *
 * O que faz: mostra o stream de eventos do projeto, do mais recente para o mais
 *            antigo, com filtros que compõem e rolagem infinita.
 * Lê:        `projetos`, e `fn_atividade` e `fn_opcoes_de_filtro`, que passam
 *            por `eventos` e `definicoes_evento` sob as políticas de leitura da
 *            seção 6.2.
 * Implementa: épico 8.4 e o inventário da seção 10.
 */

import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { ListaDeAtividade } from "@/features/atividade/ListaDeAtividade";
import { EstadoVazio } from "@/features/atividade/EstadoVazio";
import type { EventoDaAtividade } from "@/lib/data/tipos";

export const dynamic = "force-dynamic";

/** Página da rolagem infinita (critério do épico 8.4). */
export const TAMANHO_DA_PAGINA = 50;

export default async function Atividade({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ evento?: string; pessoa?: string; periodo?: string }>;
}) {
  const { slug } = await params;
  const filtros = await searchParams;
  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, nome, slug, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) notFound();

  // O seletor de período traduz para uma data de corte; "todos" não filtra.
  const dias = filtros.periodo ? Number(filtros.periodo) : 7;
  const desde =
    Number.isFinite(dias) && dias > 0
      // Componente de servidor com `force-dynamic`: isto roda uma vez por
      // requisição, no servidor, e nunca é hidratado — não há o que divergir
      // entre servidor e navegador. A regra de pureza não distingue os dois.
      // eslint-disable-next-line react-hooks/purity
      ? new Date(Date.now() - dias * 86_400_000).toISOString()
      : null;

  const [{ data: eventos }, { data: opcoes }, { count: totalNoProjeto }] = await Promise.all([
    supabase.rpc("fn_atividade", {
      p_projeto_id: projeto.id,
      p_desde: desde,
      p_evento: filtros.evento ?? null,
      p_pessoa: filtros.pessoa ?? null,
      p_limite: TAMANHO_DA_PAGINA,
      p_offset: 0,
    }),
    supabase.rpc("fn_opcoes_de_filtro", { p_projeto_id: projeto.id }),
    supabase
      .from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("projeto_id", projeto.id),
  ]);

  // Projeto que nunca recebeu evento nenhum: o estado vazio é o onboarding, e
  // não uma ilustração (critério do épico 8.4).
  if ((totalNoProjeto ?? 0) === 0) {
    return <EstadoVazio projetoId={projeto.id} slug={projeto.slug} />;
  }

  const listaDeEventos = (eventos ?? []) as EventoDaAtividade[];
  const nomesDeEvento = (opcoes ?? [])
    .filter((o: { tipo: string }) => o.tipo === "evento")
    .map((o: { valor: string }) => o.valor);
  const pessoas = (opcoes ?? [])
    .filter((o: { tipo: string }) => o.tipo === "pessoa")
    .map((o: { valor: string }) => o.valor);

  return (
    <ListaDeAtividade
      projetoId={projeto.id}
      slug={projeto.slug}
      fuso={projeto.fuso_exibicao}
      eventosIniciais={listaDeEventos}
      nomesDeEvento={nomesDeEvento}
      pessoas={pessoas}
      filtros={{
        evento: filtros.evento ?? "",
        pessoa: filtros.pessoa ?? "",
        periodo: filtros.periodo ?? "7",
      }}
    />
  );
}
