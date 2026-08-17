/**
 * Exportação completa da conta, em JSON.
 *
 * O que faz: devolve projetos, catálogo, pessoas, painéis e eventos da conta
 *            num único arquivo JSON.
 * Recebe:    nada; a conta sai da sessão.
 * Devolve:   um arquivo JSON para download.
 * Implementa: item D11, seção 13.4 e regra 11.16 — portabilidade sob LGPD, em
 *             autosserviço, sem ninguém do outro lado (princípio 0.6).
 *
 * Divergência declarada: a seção 13.4 fala em link assinado com validade de
 * 24 h. Aqui o arquivo é servido direto, porque no volume da v1 ele sai em um
 * request e um link assinado exigiria bucket, expiração e limpeza — peças que
 * só se pagam acima de 100 mil linhas (princípio 0.4).
 */

import { NextResponse } from "next/server";
import { clienteDaSessao } from "@/lib/supabase/server";

/** Teto da exportação direta (seção 13.4). */
const LIMITE_DE_EVENTOS = 100_000;
const PAGINA = 1_000;

export async function GET() {
  const supabase = await clienteDaSessao();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ codigo: "sem_sessao" }, { status: 401 });

  // Tudo aqui passa pela RLS: o que vier é o que é da conta de quem pediu.
  const [{ data: conta }, { data: projetos }, { data: paineis }, { data: itens }] =
    await Promise.all([
      supabase.from("contas").select("*").maybeSingle(),
      supabase.from("projetos").select("*"),
      supabase.from("paineis").select("*"),
      supabase.from("paineis_itens").select("*"),
    ]);

  const projetosDaConta = projetos ?? [];
  const catalogoPorProjeto: Record<string, unknown> = {};
  const pessoasPorProjeto: Record<string, unknown> = {};
  const eventos: unknown[] = [];

  for (const projeto of projetosDaConta) {
    const [{ data: catalogo }, { data: pessoas }] = await Promise.all([
      supabase.from("definicoes_evento").select("*").eq("projeto_id", projeto.id),
      supabase.from("pessoas").select("*").eq("projeto_id", projeto.id),
    ]);
    catalogoPorProjeto[projeto.slug] = catalogo ?? [];
    pessoasPorProjeto[projeto.slug] = pessoas ?? [];

    let deslocamento = 0;
    while (eventos.length < LIMITE_DE_EVENTOS) {
      const { data: pagina } = await supabase
        .from("eventos")
        .select("*")
        .eq("projeto_id", projeto.id)
        .order("ocorrido_em", { ascending: false })
        .range(deslocamento, deslocamento + PAGINA - 1);

      const lote = pagina ?? [];
      eventos.push(...lote);
      if (lote.length < PAGINA) break;
      deslocamento += PAGINA;
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const conteudo = {
    exportado_em: new Date().toISOString(),
    conta,
    projetos: projetosDaConta,
    catalogo_por_projeto: catalogoPorProjeto,
    pessoas_por_projeto: pessoasPorProjeto,
    paineis: paineis ?? [],
    paineis_itens: itens ?? [],
    eventos,
  };

  return new NextResponse(JSON.stringify(conteudo, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="visao-de-produto-conta-${hoje}.json"`,
    },
  });
}
