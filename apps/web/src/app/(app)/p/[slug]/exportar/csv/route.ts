/**
 * Exportação dos eventos em CSV.
 *
 * O que faz: devolve os eventos do projeto como CSV, respeitando os filtros que
 *            estavam aplicados na tela.
 * Recebe:    o slug do projeto e, opcionalmente, `evento`, `pessoa` e `periodo`.
 * Devolve:   um arquivo CSV para download.
 * Implementa: seção 13.4 e regra 11.16 — toda conta exporta os próprios dados a
 *             qualquer momento, em qualquer plano, sem pedir nada a ninguém
 *             (princípio 0.6).
 *
 * Formato fixado pela seção 13.4: UTF-8 com BOM (para o Excel não quebrar
 * acento), separador `;`, e as colunas nesta ordem exata.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clienteDaSessao } from "@/lib/supabase/server";
import type { EventoDaAtividade } from "@/lib/data/tipos";

/** Máximo de linhas por exportação direta (seção 13.4). */
const LIMITE_DE_LINHAS = 100_000;

/** Tamanho de cada página lida do banco. */
const PAGINA = 200;

/**
 * Escapa um valor para CSV com separador `;`.
 * Recebe o valor cru.
 * Devolve o valor pronto para o arquivo, entre aspas quando precisa.
 */
function paraCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  if (/[";\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Converte o instante para ISO 8601 no fuso do projeto (seção 13.4). */
function isoNoFuso(iso: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return partes.replace(" ", "T");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const filtros = request.nextUrl.searchParams;
  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, slug, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) {
    return NextResponse.json({ codigo: "projeto_nao_encontrado" }, { status: 404 });
  }

  const dias = Number(filtros.get("periodo") ?? "0");
  const desde =
    Number.isFinite(dias) && dias > 0
      ? new Date(Date.now() - dias * 86_400_000).toISOString()
      : null;

  const linhas: string[] = ["nome;descricao;distinct_id;tela;ocorrido_em;propriedades"];
  let deslocamento = 0;

  // Lê em páginas para não carregar tudo na memória de uma vez.
  while (deslocamento < LIMITE_DE_LINHAS) {
    const { data, error } = await supabase.rpc("fn_atividade", {
      p_projeto_id: projeto.id,
      p_desde: desde,
      p_evento: filtros.get("evento") || null,
      p_pessoa: filtros.get("pessoa") || null,
      p_limite: PAGINA,
      p_offset: deslocamento,
    });

    if (error) {
      return NextResponse.json({ codigo: "falha_na_exportacao" }, { status: 500 });
    }

    const pagina = (data ?? []) as EventoDaAtividade[];
    if (pagina.length === 0) break;

    for (const evento of pagina) {
      linhas.push(
        [
          paraCsv(evento.nome),
          paraCsv(evento.descricao),
          paraCsv(evento.distinct_id),
          paraCsv(evento.tela),
          paraCsv(isoNoFuso(evento.ocorrido_em, projeto.fuso_exibicao)),
          paraCsv(evento.propriedades),
        ].join(";"),
      );
    }

    if (pagina.length < PAGINA) break;
    deslocamento += PAGINA;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  // BOM no começo: é o que faz o Excel abrir com acento certo.
  const corpo = "﻿" + linhas.join("\r\n") + "\r\n";

  return new NextResponse(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${projeto.slug}-eventos-${hoje}.csv"`,
    },
  });
}
