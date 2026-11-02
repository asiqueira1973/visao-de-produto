/**
 * Estado vazio da Atividade.
 *
 * O que faz: quando o projeto nunca recebeu evento, mostra o que fazer em
 *            seguida — o prefixo da chave de ingestão e o trecho de código —
 *            em vez de uma ilustração.
 * Recebe:    o id e o slug do projeto.
 * Lê:        `credenciais`, sob a política `credenciais_dono_total`.
 * Implementa: épico 8.4 e a seção 13.3, que proíbe estado vazio decorativo.
 *
 * Divergência declarada: o mock mostra a chave inteira aqui. Não dá — o valor
 * completo aparece uma única vez, no momento em que é gerada (seção 6.3). O que
 * aparece é o prefixo, com o caminho para gerar outra.
 */

import Link from "next/link";
import { clienteDaSessao } from "@/lib/supabase/server";
import { TrechosDeInstalacao } from "@/features/shell/TrechosDeInstalacao";

export async function EstadoVazio({ projetoId, slug }: { projetoId: string; slug: string }) {
  const supabase = await clienteDaSessao();

  const { data: chave } = await supabase
    .from("credenciais")
    .select("prefixo, criada_em")
    .eq("projeto_id", projetoId)
    .eq("tipo", "ingestao")
    .is("revogada_em", null)
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 60px" }}>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Atividade</div>

      <div style={{ maxWidth: 620, marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum evento recebido</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
          Envie o primeiro evento do aplicativo. Nada é capturado automaticamente: aqui só
          aparece o que o app enviar de propósito.
        </div>

        <div style={{ marginTop: 16 }}>
          {chave ? (
            <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--line)",
                  background: "var(--panel)",
                }}
              >
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Chave de ingestão (API key)</span>
                <Link
                  href={`/p/${slug}/configuracoes`}
                  style={{ fontSize: 11, color: "var(--dim)" }}
                >
                  Gerar outra
                </Link>
              </div>
              <div
                style={{
                  padding: "11px 12px",
                  background: "var(--code)",
                  fontFamily: "var(--fonte-mono), monospace",
                  fontSize: 12.5,
                }}
              >
                {chave.prefixo}…
              </div>
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 11.5,
                  color: "var(--faint)",
                  lineHeight: 1.5,
                  borderTop: "1px solid var(--line)",
                }}
              >
                O valor completo foi mostrado uma única vez, quando a chave foi criada. Se você
                não tem mais ele, gere outra.
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed var(--line2)",
                borderRadius: 10,
                padding: 14,
                fontSize: 12.5,
                color: "var(--dim)",
                lineHeight: 1.55,
              }}
            >
              Este produto ainda não tem chave de ingestão.{" "}
              <Link href={`/p/${slug}/configuracoes`}>Gere uma nas Configurações</Link> para o app
              conseguir enviar eventos.
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <TrechosDeInstalacao
            slug={slug}
            host={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
