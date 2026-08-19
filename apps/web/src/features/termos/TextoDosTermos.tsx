/**
 * O texto de Termos de uso e Política de privacidade.
 *
 * O que faz: reúne os blocos do texto e os desenha.
 * Recebe:    nada.
 * Devolve:   o conteúdo, sem moldura — quem desenha a moldura é a página.
 * Implementa: seção 17 do spec, com as regras 11.8, 11.15, 11.16, 11.17 e 11.18
 *             nos prazos e limites, e as decisões de cobrança de EPICO-COBRANCA.md.
 *
 * Mora aqui, e não numa página, porque o mesmo texto precisa existir em dois
 * endereços: `/conta/termos`, dentro do app, e `/termos`, aberto — quem ainda
 * não entrou precisa poder ler os termos ANTES de aceitar.
 *
 * Cada afirmação corresponde a algo que existe no código ou no banco. Se uma
 * regra mudar, este texto muda junto: política que descreve outro produto é
 * pior do que política nenhuma.
 */

import Link from "next/link";

const ATUALIZADO_EM = "17 de agosto de 2026";
const CONTATO = "alexandre@dablab.com.br";

/** Um bloco de texto da política. */
interface Bloco {
  titulo: string;
  paragrafos: React.ReactNode[];
}

const TERMOS: Bloco[] = [
  {
    titulo: "1. Quem opera esta plataforma",
    paragrafos: [
      <>
        O Visão de Produto é operado pela <strong>Dab Lab</strong>, de Alexandre Siqueira. Falar
        com a gente é por <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
      </>,
      <>
        Ao entrar com sua conta Google e usar a plataforma, você concorda com os termos abaixo. Se
        não concordar com algum deles, não use o serviço — e, se já tiver usado, exporte seus dados
        e encerre a conta pelas ferramentas da própria plataforma, sem precisar pedir nada a
        ninguém.
      </>,
    ],
  },
  {
    titulo: "2. O que você pode fazer",
    paragrafos: [
      <>
        Você cria projetos, gera chaves de ingestão, envia eventos dos seus aplicativos, consulta o
        que enviou pelas telas ou pelo Claude, exporta tudo e encerra a conta. O plano{" "}
        <strong>gratuito</strong> dá <strong>1 projeto</strong> e <strong>1 mês</strong> de janela
        de consulta. O plano <strong>pago</strong> dará projetos ilimitados e <strong>12 meses</strong>{" "}
        de janela — <strong>ele ainda não está disponível</strong>, e o item 3 explica o que já
        está definido sobre ele.
      </>,
      <>
        Você não pode usar a plataforma para armazenar dado sensível, tentar acessar dados de outra
        conta, contornar os limites técnicos, ou revender o serviço como se fosse seu. Chaves de
        ingestão e tokens de leitura são seus: quem os tiver age em seu nome, então guarde-os como
        guardaria uma senha.
      </>,
    ],
  },
  {
    titulo: "3. Planos, preço e pagamento",
    paragrafos: [
      <>
        O plano pago custa <strong>R$ 50 por mês</strong> e dá projetos ilimitados e 12 meses de
        janela de consulta. Não há cobrança por volume: mandar mais eventos nunca aumenta o preço,
        porque instrumentar bem é exatamente o que esta plataforma existe para incentivar.
      </>,
      <>
        A cobrança é em <strong>real</strong>, sem conversão e sem IOF, e vem no seu cartão como
        compra nacional. A <strong>nota fiscal de serviço</strong> é emitida pela Dab Lab e enviada
        para o e-mail da conta.
      </>,
      <>
        O pagamento é processado pela <strong>Stripe</strong>. Nenhum dado do seu cartão passa por
        esta plataforma em momento algum: você digita na Stripe, e nós recebemos de volta apenas
        se a assinatura está ativa ou não. Também não guardamos os quatro últimos dígitos.
      </>,
      <>
        A assinatura é mensal e se renova sozinha até você cancelar. Cancelar é feito por você, no
        portal da Stripe, sem pedir nada a ninguém — e vale até o fim do período que você já pagou.
        Não há multa nem fidelidade. Como o cancelamento passa a valer no fim do período em curso,
        não devolvemos proporcional dos dias restantes; você continua com o plano pago até lá.
      </>,
      <>
        <strong>Se o pagamento falhar</strong>, a Stripe tenta de novo por alguns dias. Se ainda
        assim não entrar, a conta volta para o plano gratuito no fim do período pago — e o item 4
        descreve exatamente o que isso faz, e o que não faz.
      </>,
      <>
        <strong>Mudança de preço</strong> é avisada por e-mail com pelo menos 30 dias de
        antecedência e nunca vale para o período já pago. Se o novo preço não servir para você,
        cancelar antes de ele entrar em vigor resolve.
      </>,
      <>
        Algumas contas são <strong>cortesia</strong>: têm o plano pago sem pagar nada e sem cadastro
        na Stripe. Se a sua for uma delas, a tela de Perfil diz isso.
      </>,
    ],
  },
  {
    titulo: "4. Voltar para o plano gratuito não apaga nada",
    paragrafos: [
      <>
        Quando uma conta paga volta a ser gratuita — por cancelamento ou por pagamento que não
        entrou — <strong>nenhum evento é apagado e nenhum projeto é removido</strong>. Se você
        tinha quatro projetos, continua com quatro, todos legíveis e todos recebendo evento.
      </>,
      <>
        O que muda é isto, e só isto: você passa a enxergar <strong>1 mês</strong> de histórico em
        vez de 12, e não consegue criar projeto novo enquanto estiver acima do limite do gratuito.
        A exportação continua funcionando integralmente.
      </>,
      <>
        E voltar a assinar devolve os 12 meses <strong>sobre os dados que nunca saíram do banco</strong>,
        respeitado o prazo do item 10. Nada precisa ser recuperado porque nada foi perdido.
      </>,
    ],
  },
  {
    titulo: "5. O que é seu, e o que é nosso",
    paragrafos: [
      <>
        Os eventos que você envia são <strong>seus</strong>. Nós os guardamos, indexamos e
        devolvemos para você — nada mais. Não usamos os dados de uma conta para treinar modelo, para
        gerar estatística agregada de mercado, nem para qualquer finalidade que não seja mostrar a
        você o que você mesmo enviou. Não vendemos, não alugamos e não compartilhamos dados de
        conta com terceiros para fins comerciais.
      </>,
      <>
        O software da plataforma, a marca e a documentação continuam sendo da Dab Lab.
      </>,
    ],
  },
  {
    titulo: "6. Disponibilidade e responsabilidade",
    paragrafos: [
      <>
        Esta é a versão 1 de um produto pequeno, sem acordo de nível de serviço. A plataforma é
        oferecida <strong>como está</strong>: pode ficar indisponível, pode ter defeito e pode
        mudar. Fazemos o que é razoável para que ela funcione e para não perder dado, mas não
        prometemos operação ininterrupta.
      </>,
      <>
        Analytics não é sistema de registro. Não use esta plataforma como fonte única de nada que
        você não possa perder — nota fiscal, prontuário, contrato, histórico financeiro. Nossa
        responsabilidade por qualquer prejuízo decorrente do uso fica limitada, no máximo, ao valor
        que você tenha pago pelo serviço nos últimos 12 meses.
      </>,
    ],
  },
  {
    titulo: "7. Encerramento",
    paragrafos: [
      <>
        Você encerra a conta quando quiser. Encerrar a conta <strong>não</strong> cancela a
        assinatura sozinho: cancele antes no portal da Stripe, ou você continuará sendo cobrado
        por uma conta que não usa mais.
      </>,
      <>
        A partir do encerramento, os dados ficam guardados por{" "}
        <strong>30 dias</strong> — nesse período a exportação continua disponível e o cancelamento é
        reversível por você mesmo. Passados os 30 dias, tudo é apagado em definitivo por rotina
        automática, sem possibilidade de recuperação.
      </>,
      <>
        Podemos encerrar uma conta que esteja usando a plataforma para algo ilegal ou que ameace o
        funcionamento do serviço para os outros. Nesse caso, o mesmo prazo de 30 dias para exportar
        vale para você.
      </>,
    ],
  },
  {
    titulo: "8. Mudanças nestes termos",
    paragrafos: [
      <>
        Quando estes termos mudarem, a data de atualização no topo desta página muda junto, e
        mudanças relevantes são avisadas por e-mail antes de valer. Continuar usando a plataforma
        depois disso significa aceitar a nova versão.
      </>,
    ],
  },
];

const PRIVACIDADE: Bloco[] = [
  {
    titulo: "9. Que dados existem aqui",
    paragrafos: [
      <>
        A plataforma guarda <strong>exatamente o que o seu aplicativo enviou</strong>: nome do
        evento, o identificador que o seu app usa para a pessoa, a tela, a descrição do evento, as
        propriedades que você declarou e dois carimbos de tempo — quando aconteceu e quando chegou.
        Mais nada.
      </>,
      <>
        <strong>Não são coletados</strong>, por decisão de produto: endereço IP, geolocalização,
        CEP, cidade, fuso do aparelho, user-agent, modelo de celular, operadora e identificador de
        publicidade. Não existe captura automática de clique, de tela ou de sessão. Isso é o
        contrário do padrão da maioria das ferramentas de analytics, e é deliberado.
      </>,
      <>
        Da sua conta, guardamos o e-mail e o nome que vêm do login com Google, os projetos que você
        criou, e o hash das credenciais que você gerou.
      </>,
    ],
  },
  {
    titulo: "10. Cookies",
    paragrafos: [
      <>
        Este site usa <strong>um</strong> cookie: o de sessão, que mantém você logado. Não há
        cookie de publicidade, de rastreamento entre sites nem de terceiro. Nós não medimos o uso do
        próprio site com a nossa ferramenta.
      </>,
    ],
  },
  {
    titulo: "11. Papéis, e por que isso importa",
    paragrafos: [
      <>
        Sobre os dados <em>da sua conta</em> — seu e-mail, seus projetos — a Dab Lab é{" "}
        <strong>controladora</strong>. Sobre os eventos que o seu aplicativo envia, quem decide o
        que é coletado e por quê é você: nesse caso a Dab Lab é <strong>operadora</strong>, e
        processa esses dados apenas para prestar o serviço.
      </>,
      <>
        A consequência prática é direta: <strong>o que entra em um evento é responsabilidade de
        quem instrumenta</strong>. A plataforma não tem como impedir que alguém coloque um CPF
        dentro das propriedades de um evento. A orientação dada ao agente de instrumentação é
        explícita em nunca enviar dado sensível, e a nossa recomendação para você é a mesma: envie o
        identificador que o seu app já usa e nada além do necessário.
      </>,
      <>
        Esse identificador com frequência é um e-mail e, portanto, é dado pessoal. A plataforma o
        trata como identificador e nunca o enriquece com nenhuma outra informação.
      </>,
      <>
        A base legal para o tratamento é o <strong>legítimo interesse</strong> em medir o uso do
        próprio produto — não há dado sensível nem identificação de terceiro além do identificador
        que o seu aplicativo já usava.
      </>,
    ],
  },
  {
    titulo: "12. Por quanto tempo os dados ficam",
    paragrafos: [
      <>
        A janela que você <em>enxerga</em> depende do plano: 1 mês no gratuito, 12 meses no pago.
        Fisicamente, os eventos são apagados quando saem da janela de <strong>12 meses</strong>, por
        descarte de partição — uma operação em bloco, definitiva, sem cópia residual. Ou seja: numa
        conta gratuita, um evento pode continuar existindo no banco por até 12 meses mesmo depois de
        sair da sua janela de consulta.
      </>,
      <>
        Se você instrumenta um aplicativo com usuários, vale escrever esse prazo no aviso de
        privacidade do seu próprio app.
      </>,
    ],
  },
  {
    titulo: "13. Seus direitos, e como exercê-los sozinho",
    paragrafos: [
      <>
        Nada aqui depende de abrir chamado ou mandar e-mail — a LGPD dá o direito e a plataforma dá
        o botão:
      </>,
      <>
        <strong>Acesso e portabilidade:</strong> em Configurações de cada projeto você exporta os
        eventos em CSV, e pela conta você baixa o JSON completo — projetos, catálogo, pessoas,
        painéis e eventos.
        <br />
        <strong>Exclusão de uma pessoa:</strong> a tela de Pessoas apaga todos os eventos de um
        identificador específico. É por onde você atende um pedido de exclusão feito por um usuário
        do seu app.
        <br />
        <strong>Exclusão de tudo:</strong> encerrar a conta apaga tudo, em definitivo, depois dos 30
        dias descritos no item 5.
        <br />
        <strong>Revogação de acesso:</strong> em{" "}
        <Link href="/conta/credenciais">Credenciais MCP</Link> você corta na hora o acesso de
        qualquer Claude conectado, sem afetar os outros.
      </>,
    ],
  },
  {
    titulo: "14. Como os dados são protegidos",
    paragrafos: [
      <>
        Cada tabela do banco tem isolamento por conta aplicado no próprio banco, e não apenas no
        código do site — uma conta não consegue ler a linha de outra nem por engano de programação.
        Chaves e tokens são guardados como hash: o valor em claro aparece uma única vez, no momento
        em que você o gera, e não é recuperável depois.
      </>,
      <>
        O acesso do Claude é <strong>somente leitura</strong>, restrito a quatro tabelas, garantido
        pela permissão do usuário de banco e não apenas por verificação de texto. Nenhuma ferramenta
        do MCP grava, altera ou apaga qualquer coisa.
      </>,
    ],
  },
  {
    titulo: "15. Quem mais toca nos dados",
    paragrafos: [
      <>
        Quatro fornecedores, e só:
        <br />
        <strong>Supabase</strong> — banco de dados e autenticação. Os dados ficam em{" "}
        <strong>São Paulo, no Brasil</strong> (região sa-east-1).
        <br />
        <strong>Vercel</strong> — hospedagem deste site.
        <br />
        <strong>Google</strong> — apenas o login. Recebemos seu e-mail e seu nome; o Google não
        recebe nenhum evento seu.
        <br />
        <strong>Stripe</strong> — apenas o pagamento, e só se você assinar. Recebe seu e-mail e os
        dados do cartão, que você digita diretamente lá. Não recebe evento nenhum e não sabe o que
        seus aplicativos fazem.
      </>,
      <>
        Nenhum outro serviço recebe dado de conta ou de evento. Não há pixel, tag manager, ferramenta
        de suporte embutida nem serviço de análise de terceiro neste site.
      </>,
    ],
  },
];

/** Um cabeçalho de bloco de política. */
const estiloDoTitulo: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  marginBottom: 7,
};

function Secao({ bloco }: { bloco: Bloco }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
        padding: "15px 18px",
      }}
    >
      <div style={estiloDoTitulo}>{bloco.titulo}</div>
      {bloco.paragrafos.map((paragrafo, indice) => (
        <p
          key={indice}
          style={{
            margin: indice === 0 ? 0 : "10px 0 0",
            fontSize: 12.5,
            color: "var(--dim)",
            lineHeight: 1.7,
          }}
        >
          {paragrafo}
        </p>
      ))}
    </div>
  );
}

export function TextoDosTermos() {
  return (
    <>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Termos e privacidade
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          Escrito para ser lido, não para ser aceito sem ler. Cada afirmação abaixo corresponde a
          algo que existe no código — se a regra mudar, este texto muda junto.
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--faint)" }}>
          Última atualização: {ATUALIZADO_EM}
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Termos de uso</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TERMOS.map((bloco) => (
              <Secao key={bloco.titulo} bloco={bloco} />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 30 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
            Política de privacidade
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PRIVACIDADE.map((bloco) => (
              <Secao key={bloco.titulo} bloco={bloco} />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 11.5,
            color: "var(--faint)",
            lineHeight: 1.7,
          }}
        >
          Dúvida sobre qualquer ponto, ou pedido de titular que a plataforma não resolva sozinha:{" "}
          <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Para entender o que a plataforma faz e o que
          ela recusa fazer, veja <Link href="/conta/sobre">Sobre o produto</Link>.
        </div>
    </>
  );
}
