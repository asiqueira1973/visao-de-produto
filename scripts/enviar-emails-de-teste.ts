/**
 * Manda os quatro e-mails da plataforma para um endereço, para conferir na
 * caixa de entrada como eles chegam de verdade.
 *
 * O que faz: monta as quatro mensagens com números plausíveis e envia uma a uma.
 * Recebe:    o destino no primeiro argumento.
 * Devolve:   um relatório por linha, e sai com erro se algum envio falhar.
 *
 * Rodar:
 *   node --experimental-strip-types --env-file=.env \
 *     scripts/enviar-emails-de-teste.ts alguem@exemplo.com
 *
 * Existe porque assunto, quebra de linha e botão só se conhecem no cliente de
 * e-mail. Ler o HTML no editor não diz se o aviso chega legível no Gmail, nem
 * se ele cai na caixa de entrada ou no spam — e é isso que precisa ser sabido
 * antes de o primeiro cliente receber qualquer coisa.
 */

import { enviarEmail } from "../apps/web/src/lib/email/bird.ts";
import {
  boasVindas,
  contaCancelada,
  pagamentoFalhou,
  pertoDoTeto,
} from "../apps/web/src/lib/email/mensagens.ts";

const destino = process.argv[2];
if (!destino) {
  console.error("Falta o endereço de destino como primeiro argumento.");
  process.exit(1);
}

const aEnviar = [
  ["1 · conta cancelada", contaCancelada({ dias: 12, projetos: 3, eventos: 48_215 })],
  ["2 · pagamento falhou", pagamentoFalhou({ tentativaEm: "19 de agosto" })],
  ["3 · perto do teto", pertoDoTeto({ usados: 812_400, teto: 1_000_000, percentual: 81 })],
  ["4 · boas-vindas", boasVindas({ nome: "Alexandre" })],
] as const;

let falhou = false;

for (const [rotulo, mensagem] of aEnviar) {
  const r = await enviarEmail({
    para: destino,
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
  });

  if (r.ok) {
    console.log(`ok      ${rotulo.padEnd(24)} ${r.id ?? ""}  "${mensagem.assunto}"`);
  } else {
    falhou = true;
    console.log(`FALHOU  ${rotulo.padEnd(24)} ${r.erro}`);
  }
}

if (falhou) process.exit(1);
console.log(`\nOs quatro saíram para ${destino}.`);
