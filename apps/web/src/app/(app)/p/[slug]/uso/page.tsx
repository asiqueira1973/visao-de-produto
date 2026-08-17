/**
 * Tela de Uso.
 *
 * O que faz: lista todos os eventos do catálogo com total, usuários únicos e
 *            última ocorrência no período escolhido.
 * Lê:        `fn_uso_por_evento`, que passa por `definicoes_evento` e `eventos`.
 * Implementa: épico 8.5; regras 11.11 e 11.12.
 *
 * O subtítulo é conteúdo final do spec (seção 13.3) e não pode ser reescrito:
 * ele declara na interface a regra que o produto existe para cumprir.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { horarioRelativo } from "@/lib/formato";
import { SeletorDePeriodo } from "@/features/uso/SeletorDePeriodo";
import { LinkDeExportacao } from "@/features/shell/LinkDeExportacao";

export const dynamic = "force-dynamic";

const GRADE = "1fr 92px 116px 148px";

/** Uma linha do retorno de `fn_uso_por_evento`. */
interface LinhaDeUso {
  nome: string;
  descricao: string | null;
  total_no_periodo: number;
  usuarios_unicos: number;
  ultima_ocorrencia_em: string | null;
  total_acumulado: number;
}

export default async function Uso({
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

  const { data } = await supabase.rpc("fn_uso_por_evento", {
    p_projeto_id: projeto.id,
    p_janela: janelaAtual,
  });

  const linhas = (data ?? []) as LinhaDeUso[];
  const zerados = linhas.filter((l) => Number(l.total_no_periodo) === 0).length;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px" }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Uso</div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)", maxWidth: 640 }}>
          Todos os eventos do catálogo, inclusive os que não ocorreram nenhuma vez no período.
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <SeletorDePeriodo janelaAtual={janelaAtual} />
          <LinkDeExportacao
            caminho={`/p/${slug}/exportar/uso`}
            rotulo="Exportar CSV"
            parametros={["janela"]}
          />
        </div>

        <div
          style={{
            marginTop: 18,
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--panel)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRADE,
              gap: 12,
              padding: "8px 16px",
              borderBottom: "1px solid var(--line)",
              fontSize: 11,
              color: "var(--faint)",
            }}
          >
            <div>Evento e descrição</div>
            <div style={{ textAlign: "right" }}>Total</div>
            <div style={{ textAlign: "right" }}>Usuários únicos</div>
            <div style={{ textAlign: "right" }}>Última ocorrência</div>
          </div>

          {linhas.map((linha) => {
            // Semântica da seção 13: verde é evento com ocorrências no período,
            // cinza é evento sem nenhuma. Cor aqui carrega significado.
            const semOcorrencia = Number(linha.total_no_periodo) === 0;
            return (
              <Link
                key={linha.nome}
                href={`/p/${slug}/atividade?evento=${encodeURIComponent(linha.nome)}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRADE,
                  gap: 12,
                  padding: "11px 16px",
                  borderBottom: "1px solid var(--line)",
                  alignItems: "center",
                  color: "var(--text)",
                }}
              >
                <div style={{ minWidth: 0, display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      flex: "none",
                      marginTop: 6,
                      background: semOcorrencia ? "var(--off)" : "var(--ok)",
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        color: semOcorrencia ? "var(--faint)" : "var(--text)",
                      }}
                    >
                      {linha.descricao ?? "sem descrição no catálogo"}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fonte-mono), monospace",
                        fontSize: 11.5,
                        color: "var(--faint)",
                        marginTop: 2,
                      }}
                    >
                      {linha.nome}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--fonte-mono), monospace",
                    fontSize: 13,
                    color: semOcorrencia ? "var(--off)" : "var(--text)",
                  }}
                >
                  {linha.total_no_periodo}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--fonte-mono), monospace",
                    fontSize: 13,
                    color: semOcorrencia ? "var(--off)" : "var(--text)",
                  }}
                >
                  {linha.usuarios_unicos}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 12.5,
                    color: semOcorrencia ? "var(--faint)" : "var(--dim)",
                  }}
                >
                  {linha.ultima_ocorrencia_em
                    ? horarioRelativo(linha.ultima_ocorrencia_em)
                    : "nunca"}
                </div>
              </Link>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--faint)" }}>
          {linhas.length} {linhas.length === 1 ? "evento" : "eventos"} no catálogo · {zerados} sem
          nenhuma ocorrência em {janelaAtual.replace("d", " dias")}
        </div>
      </div>
    </div>
  );
}
