/**
 * Tela de Projetos.
 *
 * O que faz: lista os projetos ativos da conta com o total de eventos nas
 *            últimas 24 h e o horário do último evento.
 * Lê:        `fn_resumo_projetos`, que passa por `projetos` e `eventos` sob as
 *            políticas `projetos_dono_total` e `eventos_dono_leitura`.
 * Implementa: épico 8.4 e o inventário da seção 10.
 *
 * Escreve:   `projetos` — criar e arquivar são ações desta tela (seção 10).
 *
 * O estado vazio não é ilustração: ele mostra os dois caminhos para o primeiro
 * projeto existir (princípio 0.5 — instalar é um comando).
 */

import Link from "next/link";
import { clienteDaSessao } from "@/lib/supabase/server";
import { horarioRelativo } from "@/lib/formato";
import type { ResumoDeProjeto } from "@/lib/data/tipos";
import { BotaoArquivar, BotaoCriarProjeto } from "@/features/projetos/AcoesDoProjeto";

export const dynamic = "force-dynamic";

const GRADE = "1fr 120px 180px 132px";

export default async function Projetos() {
  const supabase = await clienteDaSessao();
  const { data, error } = await supabase.rpc("fn_resumo_projetos");
  const projetos = (data ?? []) as ResumoDeProjeto[];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 900, padding: "26px 32px 60px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Produtos</div>
            <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
              Aplicativos que enviam eventos para esta conta.
            </div>
          </div>
          <BotaoCriarProjeto />
        </div>

        {error && (
          <div
            style={{
              marginTop: 22,
              border: "1px solid var(--errLine)",
              background: "var(--errSoft)",
              borderRadius: 11,
              padding: 18,
              maxWidth: 560,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--err)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--err)" }} />
              Não foi possível carregar os produtos
            </div>
            <div style={{ marginTop: 7, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.55 }}>
              {error.message}
            </div>
          </div>
        )}

        {!error && projetos.length === 0 && (
          <div
            style={{
              marginTop: 22,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 24,
              background: "var(--panel)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum produto ainda</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "var(--dim)",
                lineHeight: 1.55,
                maxWidth: 520,
              }}
            >
              Um produto é um aplicativo. Crie o primeiro pelo botão acima, gere a chave de
              ingestão nas Configurações dele, e o seu app começa a mandar evento com uma
              chamada HTTP — sem instalar pacote nenhum.
            </div>
          </div>
        )}

        {!error && projetos.length > 0 && (
          <div
            style={{
              marginTop: 20,
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
              <div>Produto</div>
              <div style={{ textAlign: "right" }}>Eventos 24 h</div>
              <div style={{ textAlign: "right" }}>Último evento</div>
              <div />
            </div>

            {projetos.map((projeto) => (
              <div
                key={projeto.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRADE,
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--line)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{projeto.nome}</div>
                  <div
                    style={{
                      fontFamily: "var(--fonte-mono), monospace",
                      fontSize: 11.5,
                      color: "var(--faint)",
                      marginTop: 2,
                    }}
                  >
                    {projeto.slug}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--fonte-mono), monospace",
                    fontSize: 13,
                    // Semântica da seção 13: cinza é ausência de ocorrência.
                    color: Number(projeto.eventos_24h) === 0 ? "var(--off)" : "var(--text)",
                  }}
                >
                  {projeto.eventos_24h}
                </div>

                <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--dim)" }}>
                  {projeto.ultimo_evento_em
                    ? horarioRelativo(projeto.ultimo_evento_em)
                    : "nenhum evento"}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                  <BotaoArquivar projetoId={projeto.id} nome={projeto.nome} />
                  <Link
                    href={`/p/${projeto.slug}/atividade`}
                    style={{
                      border: "1px solid var(--line2)",
                      borderRadius: 6,
                      padding: "3px 9px",
                      fontSize: 11.5,
                      color: "var(--text)",
                    }}
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
