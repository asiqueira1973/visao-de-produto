/**
 * Exportação da tabela de Uso em CSV.
 *
 * O que faz: devolve, em CSV, o que a tela de Uso mostra na janela escolhida —
 *            inclusive os eventos com zero ocorrências.
 * Recebe:    o slug do projeto e a janela (`7d`, `14d`, `30d`, `90d`).
 * Devolve:   um arquivo CSV para download.
 * Implementa: seção 13.4 e regra 11.16 (exportar é autosserviço), e a regra
 *             11.12 — o zero explícito também vai para o arquivo, porque é
 *             justamente ele que o dono precisa levar para a reunião.
 *
 * Mesmo formato do CSV de eventos: UTF-8 com BOM e separador `;`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clienteDaSessao } from "@/lib/supabase/server";

/** Escapa um valor para CSV com separador `;`. */
function paraCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Escreve o instante no fuso do projeto, em ISO 8601. */
function isoNoFuso(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const pedido = request.nextUrl.searchParams.get("janela") ?? "30d";
  const janela = ["7d", "14d", "30d", "90d"].includes(pedido) ? pedido : "30d";

  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, slug, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) {
    return NextResponse.json({ codigo: "projeto_nao_encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("fn_uso_por_evento", {
    p_projeto_id: projeto.id,
    p_janela: janela,
  });

  if (error) {
    return NextResponse.json({ codigo: "falha_na_exportacao" }, { status: 500 });
  }

  const linhas = ["evento;descricao;total_no_periodo;usuarios_unicos;ultima_ocorrencia"];

  for (const uso of (data ?? []) as Array<{
    nome: string;
    descricao: string | null;
    total_no_periodo: number;
    usuarios_unicos: number;
    ultima_ocorrencia_em: string | null;
  }>) {
    linhas.push(
      [
        paraCsv(uso.nome),
        paraCsv(uso.descricao),
        paraCsv(uso.total_no_periodo),
        paraCsv(uso.usuarios_unicos),
        paraCsv(
          uso.ultima_ocorrencia_em ? isoNoFuso(uso.ultima_ocorrencia_em, projeto.fuso_exibicao) : "nunca",
        ),
      ].join(";"),
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return new NextResponse(`﻿${linhas.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${projeto.slug}-uso-${janela}-${hoje}.csv"`,
    },
  });
}
