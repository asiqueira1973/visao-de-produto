/**
 * Os textos dos e-mails que a plataforma manda.
 *
 * O que faz: monta assunto, HTML e texto puro de cada aviso.
 * Recebe:    só os números que o aviso precisa citar.
 * Devolve:   `{ assunto, html, texto }`, pronto para `enviarEmail`.
 * Implementa: os quatro e-mails do backlog do `CLAUDE.md`, em ordem de valor,
 *             e a regra 11.17 no primeiro deles.
 *
 * TRÊS REGRAS DE ESCRITA QUE VALEM PARA TODOS:
 *
 * 1. **Nenhum e-mail pede resposta para resolver problema.** O princípio 0.6
 *    diz que a pessoa resolve tudo sozinha; um e-mail que termina em "fale com
 *    o suporte" é a confissão de que o produto não faz isso. Todo aviso aqui
 *    aponta para uma tela onde a própria pessoa age.
 *
 * 2. **Sem pixel de abertura e sem link reescrito.** É por isso que o CNAME de
 *    rastreamento do Bird nunca foi criado. Medir leitura de e-mail em silêncio
 *    desmentiria o princípio 0.1, que é o que o produto vende.
 *
 * 3. **O número vem antes do adjetivo.** "Faltam 12 dias" resolve; "sua conta
 *    será removida em breve" obriga a pessoa a adivinhar.
 *
 * O HTML é deliberadamente pobre: sem imagem, sem fonte externa, sem tabela de
 * layout. Cliente de e-mail quebra tudo que é sofisticado, e um aviso que chega
 * torto é pior do que um aviso feio.
 */

const APP = "https://app.visaodeproduto.com.br";

export interface Mensagem {
  assunto: string;
  html: string;
  texto: string;
}

/**
 * Embrulha o corpo no mesmo enquadramento para todos os e-mails.
 * Recebe o título, os parágrafos em HTML e o botão principal.
 * Devolve o HTML completo.
 */
function molde(titulo: string, corpo: string, botao?: { texto: string; url: string }): string {
  const acao = botao
    ? `<p style="margin:26px 0 0"><a href="${botao.url}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#2f6df6;color:#ffffff;font-weight:600;text-decoration:none">${botao.texto}</a></p>`
    : "";

  return `<div style="margin:0;padding:24px;background:#f6f7f9">
  <div style="max-width:520px;margin:0 auto;padding:28px 26px;background:#ffffff;border:1px solid #e4e6ea;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#17181c">
    <div style="font-size:13px;color:#7a7f88;letter-spacing:.02em">Visão de Produto</div>
    <h1 style="margin:12px 0 0;font-size:21px;line-height:1.25;font-weight:700">${titulo}</h1>
    ${corpo}
    ${acao}
    <p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e4e6ea;font-size:12.5px;color:#7a7f88">
      Você recebeu este e-mail porque tem uma conta no Visão de Produto. Ele não
      tem rastreamento de abertura nem de clique — o produto não faria isso com
      os seus usuários, e não faz com você.
    </p>
  </div>
</div>`;
}

/** Um parágrafo do corpo. */
function p(texto: string): string {
  return `<p style="margin:16px 0 0">${texto}</p>`;
}

/** Destaca um número dentro do parágrafo. */
function forte(texto: string): string {
  return `<strong style="color:#17181c">${texto}</strong>`;
}

/**
 * 1. Conta cancelada, faltam N dias.
 * Recebe quantos dias faltam e o que existe na conta hoje.
 * Devolve a mensagem.
 * Implementa a regra 11.17: a janela de 30 dias só protege quem lembra que
 * pediu, e este é o único e-mail da lista que evita perda de dado.
 */
export function contaCancelada(d: {
  dias: number;
  projetos: number;
  eventos: number;
}): Mensagem {
  const dia = d.dias === 1 ? "dia" : "dias";
  const assunto = `Faltam ${d.dias} ${dia} para sua conta ser apagada`;

  const corpo =
    p(
      `Você pediu o cancelamento da sua conta. ${forte("Nada foi apagado ainda")} — os dados continuam aqui e a exportação continua funcionando.`,
    ) +
    p(
      `Em ${forte(`${d.dias} ${dia}`)} tudo vai embora de vez: ${forte(`${d.projetos} ${d.projetos === 1 ? "projeto" : "projetos"}`)}, ${forte(`${d.eventos.toLocaleString("pt-BR")} ${d.eventos === 1 ? "evento" : "eventos"}`)}, o catálogo, as pessoas, os painéis e as credenciais. Depois disso não existe recuperação, nem por nós.`,
    ) +
    p(
      `Se mudou de ideia, é um clique — a mesma tela onde você cancelou tem o botão de manter a conta. Se quer mesmo sair, vale baixar seus dados antes.`,
    );

  const texto = `Você pediu o cancelamento da sua conta no Visão de Produto. Nada foi apagado ainda.

Em ${d.dias} ${dia} tudo vai embora de vez: ${d.projetos} ${d.projetos === 1 ? "projeto" : "projetos"}, ${d.eventos.toLocaleString("pt-BR")} ${d.eventos === 1 ? "evento" : "eventos"}, o catálogo, as pessoas, os painéis e as credenciais. Depois disso não existe recuperação, nem por nós.

Mudou de ideia? ${APP}/conta/perfil
Quer baixar tudo antes? ${APP}/conta/exportar`;

  return {
    assunto,
    html: molde(assunto, corpo, { texto: "Manter minha conta", url: `${APP}/conta/perfil` }),
    texto,
  };
}

/**
 * 2. Pagamento falhou.
 * Recebe a data da tentativa.
 * Devolve a mensagem.
 * Sem este aviso, a pessoa perde o plano sem entender por quê — e a decisão
 * registrada no épico de cobrança é que atraso nunca apaga nada.
 */
export function pagamentoFalhou(d: { tentativaEm: string }): Mensagem {
  const assunto = "O pagamento da sua assinatura não passou";

  const corpo =
    p(
      `A cobrança de ${forte(d.tentativaEm)} foi recusada pelo cartão. Costuma ser cartão vencido, limite, ou compra internacional bloqueada pelo banco.`,
    ) +
    p(
      `${forte("Nenhum dado seu foi apagado")}, e nada vai ser. Seus projetos continuam recebendo evento normalmente e o Claude continua respondendo. O que trava enquanto a assinatura estiver em atraso é ${forte("criar projeto novo")}.`,
    ) +
    p(
      `Para resolver, troque o cartão na tela de assinatura. A cobrança é tentada de novo automaticamente depois disso.`,
    );

  const texto = `A cobrança da sua assinatura do Visão de Produto, em ${d.tentativaEm}, foi recusada pelo cartão.

Nenhum dado seu foi apagado, e nada vai ser. Seus projetos continuam recebendo evento e o Claude continua respondendo. O que trava enquanto estiver em atraso é criar projeto novo.

Troque o cartão em ${APP}/conta/perfil`;

  return {
    assunto,
    html: molde(assunto, corpo, { texto: "Atualizar pagamento", url: `${APP}/conta/perfil` }),
    texto,
  };
}

/**
 * 3. Perto do teto de eventos do mês.
 * Recebe quantos eventos entraram, o teto e a fração usada.
 * Devolve a mensagem.
 * A fração vem de `fn_uso_do_teto`, que já existe no banco.
 */
export function pertoDoTeto(d: {
  usados: number;
  teto: number;
  percentual: number;
}): Mensagem {
  const assunto = `Você já usou ${d.percentual}% dos eventos deste mês`;

  const corpo =
    p(
      `Entraram ${forte(d.usados.toLocaleString("pt-BR"))} eventos neste mês, de um teto de ${forte(d.teto.toLocaleString("pt-BR"))}.`,
    ) +
    p(
      `Isso não muda o valor da sua conta — ${forte("mandar mais evento nunca aumenta o preço")}. O teto existe para conter loop de código, não para cobrar por volume.`,
    ) +
    p(
      `Se o teto for atingido, os eventos seguintes passam a ser recusados até a virada do mês. ${forte("O que já chegou continua guardado")}, e as telas e o Claude continuam respondendo normalmente.`,
    ) +
    p(
      `Se esse volume é esperado no seu caso, responda este e-mail que eu levanto o teto da sua conta.`,
    );

  const texto = `Entraram ${d.usados.toLocaleString("pt-BR")} eventos neste mês na sua conta do Visão de Produto, de um teto de ${d.teto.toLocaleString("pt-BR")} — ${d.percentual}%.

Isso não muda o valor da sua conta: mandar mais evento nunca aumenta o preço. O teto existe para conter loop de código.

Se o teto for atingido, os eventos seguintes são recusados até a virada do mês. O que já chegou continua guardado.

Veja o consumo em ${APP}/conta/perfil`;

  return {
    assunto,
    html: molde(assunto, corpo, { texto: "Ver o consumo", url: `${APP}/conta/perfil` }),
    texto,
  };
}

/**
 * 4. Boas-vindas.
 * Recebe o primeiro nome de quem se cadastrou, quando existir.
 * Devolve a mensagem.
 * É o de menor valor da lista: serve para abrir canal, não para resolver
 * problema. Por isso é curto e termina em uma ação só.
 */
export function boasVindas(d: { nome?: string | null }): Mensagem {
  const assunto = "Sua conta no Visão de Produto está pronta";
  const saudacao = d.nome ? `Oi, ${d.nome}. ` : "";

  const corpo =
    p(
      `${saudacao}Sua conta está criada e o plano gratuito já vale: ${forte("um projeto")}, um mês de histórico, o painel e o Claude — os dois.`,
    ) +
    p(`São três passos até o primeiro gráfico, e o primeiro leva um minuto:`) +
    `<ol style="margin:16px 0 0;padding-left:20px">
      <li style="margin:0 0 8px"><strong>Crie o projeto.</strong> Um projeto é um aplicativo seu.</li>
      <li style="margin:0 0 8px"><strong>Gere a chave.</strong> Ela aparece uma vez só; guarde na hora.</li>
      <li><strong>Peça ao seu assistente.</strong> Cole a chave na conversa com o Claude ou o Lovable e peça para avisar o Visão de Produto quando a pessoa fizer o que você quer acompanhar.</li>
    </ol>` +
    p(
      `Depois disso, dá para perguntar em português — no painel ou dentro do próprio Claude, pelo conector. A tela ${forte("Como usar")} tem o passo a passo inteiro, com o exemplo pronto para copiar.`,
    );

  const texto = `${saudacao}Sua conta no Visão de Produto está criada. O plano gratuito já vale: um projeto, um mês de histórico, o painel e o Claude.

São três passos:
1. Crie o projeto — um projeto é um aplicativo seu.
2. Gere a chave — ela aparece uma vez só.
3. Cole a chave na conversa com o Claude ou o Lovable e peça para avisar o Visão de Produto quando a pessoa fizer o que você quer acompanhar.

O passo a passo inteiro está em ${APP}/conta/como-usar`;

  return {
    assunto,
    html: molde(assunto, corpo, { texto: "Abrir o Visão de Produto", url: APP }),
    texto,
  };
}
