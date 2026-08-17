/**
 * Tela de Pessoas.
 *
 * O que faz: lista os identificadores que o app enviou, com total de eventos e
 *            primeiro e último acesso; clicar abre a linha do tempo daquela
 *            pessoa.
 * Lê:        `fn_pessoas` e, no detalhe, `fn_atividade` filtrada pela pessoa.
 * Implementa: épico 8.5 e o inventário da seção 10.
 *
 * `distinct_id` é tratado como identificador, e nunca enriquecido — ele é
 * frequentemente um e-mail, e portanto dado pessoal (seção 17.2).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { dataCurta, horarioRelativo } from "@/lib/formato";
import type { EventoDaAtividade } from "@/lib/data/tipos";

export const dynamic = "force-dynamic";

const GRADE = "1fr 88px 140px 140px";

interface LinhaDePessoa {
  distinct_id: string;
  total_eventos: number;
  primeiro_visto_em: string;
  ultimo_visto_em: string;
}

export default async function Pessoas({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pessoa?: string }>;
}) {
  const { slug } = await params;
  const { pessoa } = await searchParams;

  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, nome, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) notFound();

  // Linha do tempo de uma pessoa específica.
  if (pessoa) {
    const [{ data: linhaDoTempo }, { data: pessoas }] = await Promise.all([
      supabase.rpc("fn_atividade", {
        p_projeto_id: projeto.id,
        p_pessoa: pessoa,
        p_limite: 50,
      }),
      supabase.rpc("fn_pessoas", { p_projeto_id: projeto.id }),
    ]);

    const eventos = (linhaDoTempo ?? []) as EventoDaAtividade[];
    const perfil = ((pessoas ?? []) as LinhaDePessoa[]).find((p) => p.distinct_id === pessoa);

    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "26px 32px 60px", maxWidth: 900 }}>
          <Link href={`/p/${slug}/pessoas`} style={{ fontSize: 12, color: "var(--dim)" }}>
            ← Pessoas
          </Link>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 18,
                  fontWeight: 500,
                }}
              >
                {pessoa}
              </div>
              {perfil && (
                <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
                  {perfil.total_eventos} eventos · primeiro acesso em{" "}
                  {dataCurta(perfil.primeiro_visto_em, projeto.fuso_exibicao)} · último{" "}
                  {horarioRelativo(perfil.ultimo_visto_em)}
                </div>
              )}
            </div>
            <Link
              href={`/p/${slug}/atividade?pessoa=${encodeURIComponent(pessoa)}`}
              style={{
                height: 30,
                padding: "0 11px",
                borderRadius: 7,
                border: "1px solid var(--line2)",
                background: "var(--elev)",
                fontSize: 12.5,
                color: "var(--text)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Ver na Atividade
            </Link>
          </div>

          <div style={{ marginTop: 20, borderLeft: "1px solid var(--line)", paddingLeft: 20 }}>
            {eventos.map((evento) => (
              <div
                key={evento.id}
                style={{ position: "relative", padding: "11px 0", borderBottom: "1px solid var(--line)" }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -24,
                    top: 17,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--pri)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {evento.descricao ?? evento.nome}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--fonte-mono), monospace",
                        fontSize: 11.5,
                        color: "var(--faint)",
                        marginTop: 2,
                      }}
                    >
                      {evento.nome}
                      {evento.tela ? ` · ${evento.tela}` : ""}
                    </div>
                  </div>
                  <div style={{ flex: "none", fontSize: 12, color: "var(--faint)" }}>
                    {horarioRelativo(evento.ocorrido_em)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { data } = await supabase.rpc("fn_pessoas", { p_projeto_id: projeto.id });
  const pessoas = (data ?? []) as LinhaDePessoa[];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 900 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Pessoas</div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
          Identificadores enviados pelo aplicativo.{" "}
          {pessoas.length === 1 ? "1 pessoa" : `${pessoas.length} pessoas`} neste projeto.
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
              padding: "9px 16px",
              borderBottom: "1px solid var(--line)",
              fontSize: 11,
              color: "var(--faint)",
            }}
          >
            <div>Pessoa</div>
            <div style={{ textAlign: "right" }}>Eventos</div>
            <div style={{ textAlign: "right" }}>Primeiro acesso</div>
            <div style={{ textAlign: "right" }}>Último acesso</div>
          </div>

          {pessoas.map((p) => (
            <Link
              key={p.distinct_id}
              href={`/p/${slug}/pessoas?pessoa=${encodeURIComponent(p.distinct_id)}`}
              style={{
                display: "grid",
                gridTemplateColumns: GRADE,
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--line)",
                alignItems: "center",
                color: "var(--text)",
              }}
            >
              <div style={{ fontFamily: "var(--fonte-mono), monospace", fontSize: 13 }}>
                {p.distinct_id}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 13,
                }}
              >
                {p.total_eventos}
              </div>
              <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--dim)" }}>
                {dataCurta(p.primeiro_visto_em, projeto.fuso_exibicao)}
              </div>
              <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--dim)" }}>
                {horarioRelativo(p.ultimo_visto_em)}
              </div>
            </Link>
          ))}

          {pessoas.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
              Ninguém apareceu ainda. Uma pessoa entra nesta lista quando o app envia o
              primeiro evento com o identificador dela.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
