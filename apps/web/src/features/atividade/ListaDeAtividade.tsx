"use client";

/**
 * A lista da tela de Atividade.
 *
 * O que faz: desenha os eventos agrupados por dia, aplica os filtros, carrega
 *            mais 50 quando a pessoa chega ao fim da página, e abre o detalhe.
 * Recebe:    o projeto, o fuso de exibição, a primeira página de eventos, as
 *            opções dos filtros e os filtros já aplicados.
 * Devolve:   a tela inteira de Atividade.
 * Implementa: épico 8.4 — ordem decrescente, separador de data, filtros que
 *             compõem, rolagem infinita de 50 em 50 — e a regra 11.7, com a
 *             conversão de fuso feita aqui, na apresentação.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clienteDoNavegador } from "@/lib/supabase/client";
import { diaNoFuso, horarioRelativo, rotuloDoDia } from "@/lib/formato";
import type { EventoDaAtividade } from "@/lib/data/tipos";
import { DetalheDoEvento } from "./DetalheDoEvento";

const TAMANHO_DA_PAGINA = 50;
const GRADE = "1fr 148px 132px 88px";

const PERIODOS = [
  { valor: "1", rotulo: "Hoje" },
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "14", rotulo: "Últimos 14 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "0", rotulo: "Tudo que está visível" },
];

const estiloDeSeletor: React.CSSProperties = {
  height: 30,
  padding: "0 8px",
  borderRadius: 7,
  border: "1px solid var(--line)",
  background: "var(--elev)",
  fontSize: 12.5,
};

export function ListaDeAtividade({
  projetoId,
  fuso,
  eventosIniciais,
  nomesDeEvento,
  pessoas,
  filtros,
}: {
  projetoId: string;
  fuso: string;
  eventosIniciais: EventoDaAtividade[];
  nomesDeEvento: string[];
  pessoas: string[];
  filtros: { evento: string; pessoa: string; periodo: string };
}) {
  const router = useRouter();
  const parametros = useSearchParams();

  const [eventos, setEventos] = useState(eventosIniciais);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [acabou, setAcabou] = useState(eventosIniciais.length < TAMANHO_DA_PAGINA);
  const [aberto, setAberto] = useState<EventoDaAtividade | null>(null);

  // Filtro novo recarrega a página pelo servidor: a URL passa a descrever o que
  // está na tela, e o link fica compartilhável.
  function trocarFiltro(campo: "evento" | "pessoa" | "periodo", valor: string) {
    const novos = new URLSearchParams(parametros.toString());
    if (valor) novos.set(campo, valor);
    else novos.delete(campo);
    router.push(`?${novos.toString()}`);
  }

  function limparFiltros() {
    router.push("?");
  }

  useEffect(() => {
    setEventos(eventosIniciais);
    setAcabou(eventosIniciais.length < TAMANHO_DA_PAGINA);
  }, [eventosIniciais]);

  const carregarMais = useCallback(async () => {
    if (carregandoMais || acabou) return;
    setCarregandoMais(true);

    const supabase = clienteDoNavegador();
    const dias = Number(filtros.periodo);
    const desde =
      Number.isFinite(dias) && dias > 0
        ? new Date(Date.now() - dias * 86_400_000).toISOString()
        : null;

    const { data } = await supabase.rpc("fn_atividade", {
      p_projeto_id: projetoId,
      p_desde: desde,
      p_evento: filtros.evento || null,
      p_pessoa: filtros.pessoa || null,
      p_limite: TAMANHO_DA_PAGINA,
      p_offset: eventos.length,
    });

    const novos = (data ?? []) as EventoDaAtividade[];
    setEventos((atuais) => [...atuais, ...novos]);
    if (novos.length < TAMANHO_DA_PAGINA) setAcabou(true);
    setCarregandoMais(false);
  }, [acabou, carregandoMais, eventos.length, filtros, projetoId]);

  /**
   * Rolagem infinita: pede a próxima página quando falta pouco para o fim.
   * É um handler de rolagem, e não um IntersectionObserver, porque a lista
   * rola dentro de um painel próprio — e observador de interseção sobre um
   * elemento sem altura não dispara de forma confiável nesse arranjo.
   */
  function aoRolar(evento: React.UIEvent<HTMLDivElement>) {
    const painel = evento.currentTarget;
    const faltaParaOFim = painel.scrollHeight - painel.scrollTop - painel.clientHeight;
    if (faltaParaOFim < 300) void carregarMais();
  }

  // Agrupa por dia no fuso do projeto (regra 11.7): um evento à meia-noite em
  // São Paulo tem que cair no dia certo, e não no seguinte por causa do UTC.
  const grupos: Array<{ dia: string; rotulo: string; linhas: EventoDaAtividade[] }> = [];
  for (const evento of eventos) {
    const dia = diaNoFuso(evento.ocorrido_em, fuso);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) {
      ultimo.linhas.push(evento);
    } else {
      grupos.push({ dia, rotulo: rotuloDoDia(evento.ocorrido_em, fuso), linhas: [evento] });
    }
  }

  const temFiltro = Boolean(filtros.evento || filtros.pessoa);

  return (
    <>
      <div style={{ flex: "none", padding: "26px 32px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Atividade</div>
            <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)" }}>
              {temFiltro
                ? `${eventos.length} eventos · filtro ativo`
                : "descrição primeiro, nome técnico depois"}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            paddingBottom: 14,
          }}
        >
          <select
            value={filtros.periodo}
            onChange={(e) => trocarFiltro("periodo", e.target.value)}
            style={estiloDeSeletor}
            aria-label="Período"
          >
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>

          <select
            value={filtros.evento}
            onChange={(e) => trocarFiltro("evento", e.target.value)}
            style={{ ...estiloDeSeletor, fontFamily: "var(--fonte-mono), monospace", fontSize: 12 }}
            aria-label="Evento"
          >
            <option value="">todos os eventos</option>
            {nomesDeEvento.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>

          <select
            value={filtros.pessoa}
            onChange={(e) => trocarFiltro("pessoa", e.target.value)}
            style={{ ...estiloDeSeletor, fontFamily: "var(--fonte-mono), monospace", fontSize: 12 }}
            aria-label="Pessoa"
          >
            <option value="">todas as pessoas</option>
            {pessoas.map((pessoa) => (
              <option key={pessoa} value={pessoa}>
                {pessoa}
              </option>
            ))}
          </select>

          {temFiltro && (
            <button
              onClick={limparFiltros}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 7,
                border: "1px solid var(--pri)",
                background: "var(--priSoft)",
                color: "var(--pri)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div
        onScroll={aoRolar}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 32px 40px",
          borderTop: "1px solid var(--line)",
        }}
      >
        {eventos.length === 0 && (
          <div style={{ maxWidth: 620, marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum evento neste filtro</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
              O projeto tem eventos, mas nenhum que combine com o que está filtrado. Tente um
              período maior ou limpe os filtros.
            </div>
          </div>
        )}

        {grupos.map((grupo) => (
          <div key={grupo.dia} style={{ marginBottom: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 2px 8px",
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--dim)" }}>
                {grupo.rotulo}
              </span>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span style={{ fontSize: 11, color: "var(--faint)" }}>
                {grupo.linhas.length === 1 ? "1 evento" : `${grupo.linhas.length} eventos`}
              </span>
            </div>

            {grupo.linhas.map((evento) => (
              <div
                key={evento.id}
                role="button"
                tabIndex={0}
                onClick={() => setAberto(evento)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAberto(evento);
                  }
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRADE,
                  gap: 14,
                  alignItems: "center",
                  padding: "9px 8px",
                  borderBottom: "1px solid var(--line)",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35 }}>
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
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--fonte-mono), monospace",
                    fontSize: 12,
                    color: "var(--dim)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {evento.distinct_id}
                </div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{evento.tela ?? "—"}</div>
                <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "right" }}>
                  {horarioRelativo(evento.ocorrido_em)}
                </div>
              </div>
            ))}
          </div>
        ))}

        {carregandoMais && (
          <div
            style={{
              padding: "18px 2px",
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 12,
              color: "var(--faint)",
            }}
          >
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                border: "1.5px solid var(--line2)",
                borderTopColor: "var(--dim)",
                display: "block",
                animation: "spin 0.9s linear infinite",
              }}
            />
            Carregando mais {TAMANHO_DA_PAGINA} eventos
          </div>
        )}

        {/* A rolagem já carrega sozinha; o botão existe para quem navega por
            teclado e para quando o navegador não dispara evento de rolagem
            (área de toque de 44px, seção 14). */}
        {!carregandoMais && !acabou && eventos.length > 0 && (
          <div style={{ padding: "18px 2px" }}>
            <button
              onClick={() => void carregarMais()}
              style={{
                height: 44,
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid var(--line2)",
                background: "var(--elev)",
                fontSize: 12.5,
                color: "var(--dim)",
                cursor: "pointer",
              }}
            >
              Carregar mais {TAMANHO_DA_PAGINA} eventos
            </button>
          </div>
        )}

        {acabou && eventos.length > 0 && (
          <div style={{ padding: "18px 2px", fontSize: 12, color: "var(--faint)" }}>
            Fim da lista.
          </div>
        )}
      </div>

      {aberto && (
        <DetalheDoEvento
          evento={aberto}
          fuso={fuso}
          aoFechar={() => setAberto(null)}
          aoFiltrarPorPessoa={(pessoa) => {
            setAberto(null);
            trocarFiltro("pessoa", pessoa);
          }}
        />
      )}
    </>
  );
}
