/**
 * Tela de Configurações do projeto.
 *
 * O que faz: edita nome, slug, prefixo de evento e fuso; gera e revoga a chave
 *            de ingestão; mostra o trecho de instalação; e exporta os dados.
 * Lê:        `projetos` e `credenciais`.
 * Escreve:   `projetos` e `credenciais`, pelas políticas de propriedade.
 * Implementa: épico 8.5, seções 6.3 e 13.4, e a divergência 5 da seção 4.4 — o
 *             mock não tem exportação, e ela entra por ser item do MVP (D11).
 */

import { notFound } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { FormularioDoProjeto } from "@/features/configuracoes/FormularioDoProjeto";
import { ChaveDeIngestao } from "@/features/configuracoes/ChaveDeIngestao";
import { TrechosDeInstalacao } from "@/features/shell/TrechosDeInstalacao";
import type { Credencial } from "@/lib/data/tipos";

export const dynamic = "force-dynamic";

export default async function Configuracoes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await clienteDaSessao();

  const { data: projeto } = await supabase
    .from("projetos")
    .select("id, nome, slug, prefixo_evento, fuso_exibicao")
    .eq("slug", slug)
    .maybeSingle();

  if (!projeto) notFound();

  const { data: chaves } = await supabase
    .from("credenciais")
    .select("id, tipo, projeto_id, nome, prefixo, criada_em, ultimo_uso_em, revogada_em")
    .eq("projeto_id", projeto.id)
    .eq("tipo", "ingestao")
    .order("criada_em", { ascending: false });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 720 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Configurações
        </div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>{projeto.nome}</div>

        <FormularioDoProjeto projeto={projeto} />

        <ChaveDeIngestao
          projetoId={projeto.id}
          slug={projeto.slug}
          chaves={(chaves ?? []) as Credencial[]}
        />

        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 18px 12px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Instalação</div>
            <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
              Uma chamada HTTP com esta chave, de qualquer linguagem. O contrato REST é o
              que não muda: o que for construído em cima dele continua valendo.
            </div>
          </div>
          <div style={{ padding: "0 18px 18px" }}>
            <TrechosDeInstalacao
              slug={projeto.slug}
              host={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            />
          </div>
        </div>

        {/* Exportação (seção 13.4 e regra 11.16): autosserviço, sem pedir nada
            a ninguém, em qualquer plano. */}
        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            padding: 18,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Exportar dados</div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
            Os dados são seus e saem daqui quando você quiser, sem pedir nada a ninguém.
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={`/p/${projeto.slug}/exportar/csv`}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: "1px solid var(--line2)",
                background: "var(--elev)",
                fontSize: 12.5,
                color: "var(--text)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Eventos deste produto em CSV
            </a>
            <a
              href="/conta/exportar"
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: "1px solid var(--line2)",
                background: "var(--elev)",
                fontSize: 12.5,
                color: "var(--text)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Conta inteira em JSON
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
