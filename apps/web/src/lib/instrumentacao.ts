/**
 * A plataforma instrumentada com ela mesma.
 *
 * O que faz: manda para o próprio endpoint de ingestão os eventos que dizem
 *            como a plataforma está sendo usada.
 * Recebe:    o nome do evento, quem fez e o que aconteceu.
 * Devolve:   nada, e **nunca lança**.
 * Implementa: o item "um app real enviando eventos em produção" do Definition
 *             of Done (seção 23), e o princípio 0.1 — só entra o que foi
 *             declarado aqui, um por um.
 *
 * TRÊS DECISÕES QUE VALEM SER LIDAS ANTES DE MEXER:
 *
 * 1. **O identificador é a conta, não o e-mail.** O produto ensina que
 *    `distinct_id` costuma ser e-mail e portanto dado pessoal. Aqui a
 *    plataforma seria a dona desse dado duas vezes: na tabela de contas e,
 *    de novo, espalhado em milhares de linhas de evento. Usando o id da conta,
 *    dá para responder tudo que interessa — quantas contas criaram projeto,
 *    quem conectou o Claude — sem duplicar e-mail em lugar nenhum. Quem
 *    precisar do e-mail cruza pela tela de administração.
 *
 * 2. **Só no servidor.** Nada de instrumentação no navegador: colocaria a
 *    chave de ingestão no bundle e criaria captura de comportamento no
 *    cliente, que é exatamente o que o princípio 0.1 recusa.
 *
 * 3. **Falhar aqui não pode quebrar nada.** Se a ingestão estiver fora do ar, a
 *    pessoa que estava criando um projeto não pode nem perceber. Por isso tudo
 *    é disparado sem espera e com o erro engolido — analytics que derruba o
 *    produto é pior do que analytics nenhum.
 *
 * E o que NUNCA é enviado daqui: nome de projeto, nome de evento de cliente,
 * conteúdo de propriedade, ou qualquer coisa que pertença ao aplicativo de
 * quem usa a plataforma. Instrumentar a si mesma não é desculpa para olhar o
 * dado dos outros.
 */

import { randomUUID } from "node:crypto";

/** Os eventos que a plataforma declara sobre si. Não existe nome fora daqui. */
export type EventoDaPlataforma =
  | "visao_conta_criada"
  | "visao_projeto_criado"
  | "visao_chave_de_ingestao_gerada"
  | "visao_token_mcp_gerado"
  | "visao_claude_conectado"
  | "visao_primeiro_evento_recebido"
  | "visao_dados_exportados"
  | "visao_assinatura_iniciada"
  | "visao_conta_cancelada"
  | "visao_conta_reativada";

/** O que cada evento significa, em português (princípio 0.2). */
const DESCRICOES: Record<EventoDaPlataforma, string> = {
  visao_conta_criada: "alguém entrou pela primeira vez e a conta foi criada",
  visao_projeto_criado: "a pessoa criou um produto novo",
  visao_chave_de_ingestao_gerada: "a pessoa gerou a chave para o app começar a mandar evento",
  visao_token_mcp_gerado: "a pessoa gerou um token de leitura para o Claude",
  visao_claude_conectado: "a pessoa autorizou o Claude a ler os dados dela",
  visao_primeiro_evento_recebido: "o primeiro evento de um produto chegou",
  visao_dados_exportados: "a pessoa baixou os próprios dados",
  visao_assinatura_iniciada: "a pessoa foi para o pagamento do plano pago",
  visao_conta_cancelada: "a pessoa pediu o encerramento da conta",
  visao_conta_reativada: "a pessoa desistiu de encerrar e voltou atrás",
};

/**
 * Registra um evento sobre a própria plataforma.
 * Recebe o nome declarado, o id da conta, a tela e as propriedades.
 * Devolve nada. **Não espere por ela e não a coloque em bloco de erro** — ela
 * já cuida disso sozinha.
 */
export function registrar(
  nome: EventoDaPlataforma,
  contaId: string | null | undefined,
  tela: string,
  propriedades: Record<string, unknown> = {},
): void {
  const chave = process.env.VISAO_API_KEY;
  const host = process.env.VISAO_HOST;

  // Ambiente sem instrumentação configurada simplesmente não instrumenta.
  if (!chave || !host || !contaId) return;

  const corpo = {
    eventos: [
      {
        id: randomUUID(),
        nome,
        // A conta, e não o e-mail. Ver a decisão 1 no cabeçalho.
        distinct_id: contaId,
        ocorrido_em: new Date().toISOString(),
        tela,
        descricao: DESCRICOES[nome],
        propriedades,
      },
    ],
  };

  // Sem `await`: quem chamou não espera, e o `catch` garante que uma falha de
  // rede aqui não vire erro na tela de ninguém.
  void fetch(`${host}/functions/v1/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": chave },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Silêncio de propósito. Ver a decisão 3 no cabeçalho.
  });
}
