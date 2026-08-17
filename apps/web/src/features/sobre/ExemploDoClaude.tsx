/**
 * Exemplo ilustrativo de uma consulta feita pelo Claude.
 *
 * O que faz: reproduz, sem chamar o banco, uma pergunta em linguagem natural e
 *            a resposta que o Claude devolve pelo MCP — texto mais gráfico de
 *            barras, com a descrição de cada evento junto do nome técnico.
 * Recebe:    nada; os números são fixos e estão marcados como exemplo.
 * Devolve:   o cartão "Como fica na prática" da tela Sobre o produto.
 * Implementa: princípios 0.2 e 0.3 e a regra 11.10 — série sempre em barra com
 *             rótulo, e todo evento acompanhado do que ele significa.
 *
 * Os dados aqui são de demonstração e nunca vêm do banco: a tela deixa isso
 * escrito, para ninguém confundir exemplo com número da própria conta.
 */

/** Uma linha do gráfico de exemplo. */
interface LinhaDoExemplo {
  nome: string;
  descricao: string;
  total: number;
}

const EXEMPLO: LinhaDoExemplo[] = [
  { nome: "psi_nova_sessao", descricao: "registrou uma sessão realizada", total: 24 },
  { nome: "psi_novo_agendamento", descricao: "criou um novo agendamento na agenda", total: 24 },
  { nome: "psi_atualizacao_preco", descricao: "alterou o preço de um atendimento", total: 23 },
  { nome: "psi_nova_despesa", descricao: "registrou uma despesa da clínica", total: 23 },
  { nome: "psi_novo_paciente", descricao: "cadastrou um novo paciente", total: 23 },
  { nome: "psi_novo_pagamento", descricao: "registrou um pagamento de um paciente", total: 23 },
  { nome: "psi_exportar_csv", descricao: "exportou a planilha de dados", total: 1 },
  { nome: "psi_lembrete_whatsapp", descricao: "enviou um lembrete por WhatsApp", total: 0 },
];

const MAIOR = Math.max(...EXEMPLO.map((linha) => linha.total));

export function ExemploDoClaude() {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
        overflow: "hidden",
      }}
    >
      {/* A pergunta, do jeito que ela é feita: sem citar nome de evento. */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--line)",
          background: "var(--elev)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 5 }}>
          Você, no Claude
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          O que andou acontecendo no Agenda Psi nos últimos 15 dias? Me mostra num gráfico.
        </div>
      </div>

      <div style={{ padding: "16px 18px 18px" }}>
        <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 6 }}>Claude</div>
        <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          Foram 141 eventos de 8 tipos, de 3 pessoas. O movimento está concentrado na rotina de
          atendimento — sessão, agendamento e pagamento andam juntos, quase empatados. Duas coisas
          chamam atenção: a exportação de planilha só foi usada uma vez, e o lembrete por WhatsApp,
          que está no catálogo, não foi disparado nenhuma vez no período.
        </div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {EXEMPLO.map((linha) => {
            const zerado = linha.total === 0;
            return (
              <div
                key={linha.nome}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 168px) 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0, textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "var(--fonte-mono), monospace",
                      fontSize: 11.5,
                      color: zerado ? "var(--faint)" : "var(--text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {linha.nome}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--faint)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {linha.descricao}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      height: 16,
                      borderRadius: "0 4px 4px 0",
                      // A barra zerada continua visível, só que apagada — evento
                      // que não ocorreu é informação, não ausência (regra 11.12).
                      background: zerado ? "var(--priSoft)" : "var(--pri)",
                      width: `calc(${Math.max(linha.total / MAIOR, 0.02)} * (100% - 76px))`,
                      minWidth: 3,
                    }}
                  />
                  <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {linha.total}
                    {zerado && (
                      <span style={{ fontWeight: 400, color: "var(--faint)" }}>
                        {" "}
                        nunca disparado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--line)",
            fontSize: 11.5,
            color: "var(--faint)",
            lineHeight: 1.6,
          }}
        >
          Exemplo ilustrativo, com números fictícios. Repare que a pergunta não cita nome de
          evento nenhum: o Claude descobre quais existem lendo o catálogo, e cada nome técnico
          chega acompanhado do que ele significa.
        </div>
      </div>
    </div>
  );
}
