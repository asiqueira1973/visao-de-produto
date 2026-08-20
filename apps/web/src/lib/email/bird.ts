/**
 * O transporte de e-mail, pelo Bird.
 *
 * O que faz: manda uma mensagem para um endereço, em HTML e em texto puro.
 * Recebe:    destinatário, assunto e os dois corpos.
 * Devolve:   `{ ok }` com o id da mensagem, ou `{ ok: false }` com o motivo —
 *            **nunca lança**.
 * Implementa: o backlog de e-mail transacional do `CLAUDE.md`, e o princípio
 *             0.1 aplicado a e-mail: nada de pixel de abertura e nada de link
 *             reescrito para medir clique.
 *
 * QUATRO COISAS QUE CUSTARAM TEMPO PARA DESCOBRIR:
 *
 * 1. **O host é regional e vem da própria chave.** Uma chave `bk_us1_…` fala
 *    com `https://us1.platform.bird.com`. O `api.bird.com` da documentação de
 *    Channels devolve 404 em tudo — inclusive sem chave nenhuma, o que faz
 *    parecer erro de credencial quando é endereço errado.
 *
 * 2. **A autenticação é `Bearer`, não `AccessKey`.** `AccessKey` é o esquema da
 *    API de Channels, que é outro produto dentro do mesmo painel.
 *
 * 3. **`to` é uma lista de strings**, não de objetos. Só o `from` é objeto.
 *
 * 4. **Sucesso é 202, não 200.** O Bird aceita e entrega depois; o id devolvido
 *    (`em_…`) é o que aparece nos Logs do painel.
 *
 * Falhar aqui nunca pode derrubar quem chamou: um webhook do Stripe que
 * estourasse por causa de e-mail viraria reentrega em loop, e um cancelamento
 * de conta que falhasse por causa de e-mail deixaria a pessoa sem conseguir
 * cancelar. Por isso o erro volta como valor, e quem chama decide o que fazer.
 */

/** O endereço que assina as mensagens. O domínio é o verificado no Bird. */
const REMETENTE = { email: "avisos@visaodeproduto.com.br", name: "Visão de Produto" };

/** Para onde vai a resposta de quem apertar "responder". É uma caixa real. */
const RESPONDER_PARA = "alexandre@dablab.com.br";

export interface ResultadoDoEnvio {
  ok: boolean;
  id?: string;
  erro?: string;
}

/**
 * Manda uma mensagem.
 * Recebe o destinatário, o assunto e os dois corpos.
 * Devolve o resultado, sem lançar.
 */
export async function enviarEmail(opcoes: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}): Promise<ResultadoDoEnvio> {
  const chave = process.env.BIRD_API_KEY;
  if (!chave) return { ok: false, erro: "BIRD_API_KEY não está no ambiente" };

  // A região vive dentro da chave: bk_us1_… fala com us1.platform.bird.com.
  const regiao = chave.split("_")[1];
  if (!regiao) return { ok: false, erro: "BIRD_API_KEY não tem região no formato bk_<região>_…" };

  try {
    const resposta = await fetch(`https://${regiao}.platform.bird.com/v1/email/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${chave}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: REMETENTE,
        to: [opcoes.para],
        reply_to: [RESPONDER_PARA],
        subject: opcoes.assunto,
        html: opcoes.html,
        text: opcoes.texto,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const corpo = (await resposta.json().catch(() => null)) as { id?: string } | null;

    if (resposta.status !== 202) {
      return { ok: false, erro: `o Bird respondeu ${resposta.status}: ${JSON.stringify(corpo)}` };
    }

    return { ok: true, id: corpo?.id };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
