/**
 * Tela "Como usar".
 *
 * O que faz: leva do zero ao primeiro gráfico em sete passos — criar o projeto,
 *            configurar prefixo e fuso, gerar a chave, mandar o evento, ler os
 *            relatórios, exportar e ligar o Claude.
 * Lê:        nada do banco; o host de ingestão vem da variável de ambiente.
 * Devolve:   a página `/conta/como-usar`.
 * Implementa: princípio 0.5 e 0.6 — o caminho inteiro tem que ser percorrível
 *             sozinho, sem ninguém do outro lado explicando.
 *
 * O trecho de código é o mesmo componente das Configurações e do estado vazio
 * da Atividade: contrato de API só pode ser escrito num lugar, senão as três
 * telas divergem.
 */

import Link from "next/link";
import { TrechosDeInstalacao } from "@/features/shell/TrechosDeInstalacao";

/** Os campos do JSON de um evento, e quais são obrigatórios (seção 12.1). */
const CAMPOS_DO_EVENTO = [
  {
    campo: "id",
    obrigatorio: true,
    texto: "Um UUID, novo a cada evento, gerado por você. Número ou texto solto é recusado. É a proteção contra duplicata: reenviar o mesmo id nunca conta duas vezes dentro do produto.",
  },
  {
    campo: "nome",
    obrigatorio: true,
    texto: "Minúsculas, números e underline, de 3 a 64 caracteres, começando por letra. Espaço é inválido.",
  },
  {
    campo: "distinct_id",
    obrigatorio: true,
    texto: "O identificador que o seu app já usa para a pessoa — normalmente o e-mail ou o id do usuário.",
  },
  {
    campo: "ocorrido_em",
    obrigatorio: true,
    texto: "Quando aconteceu, em ISO 8601 e em UTC. É o horário do evento, não o da chegada.",
  },
  {
    campo: "tela",
    obrigatorio: false,
    texto: "Onde aconteceu. Alimenta o filtro por tela na Atividade.",
  },
  {
    campo: "descricao",
    obrigatorio: false,
    texto: "O que o evento significa, em português. Na primeira vez que o nome aparece, vira a descrição do catálogo.",
  },
  {
    campo: "propriedades",
    obrigatorio: false,
    texto: "Objeto JSON com o que mais importar naquele evento. Nunca coloque dado sensível aqui.",
  },
];

/** As cinco telas de leitura, e a pergunta que cada uma responde. */
const RELATORIOS = [
  {
    nome: "Atividade",
    texto:
      "O que aconteceu agora. Lista ao vivo, evento por evento, com filtro por nome, por tela e por pessoa. Clicar em uma linha abre todos os campos daquele evento.",
  },
  {
    nome: "Uso",
    texto:
      "Alguém está usando isso? Todos os eventos do catálogo com total, pessoas distintas e última ocorrência no período — inclusive os que não ocorreram nenhuma vez, que é o dado mais útil da tela.",
  },
  {
    nome: "Painel",
    texto:
      "Os gráficos que você quis fixar. Escolha os eventos que importam e eles ficam ali, em barras, na janela de 7, 14, 30 ou 90 dias.",
  },
  {
    nome: "Pessoas",
    texto: "Quem usou, e o quê. A linha do tempo de um identificador específico, do primeiro ao último evento.",
  },
  {
    nome: "Catálogo",
    texto:
      "O dicionário do produto. Todo nome de evento que já chegou, com a descrição. Editar a descrição aqui manda em tudo: a partir daí é ela que aparece nas telas e nas respostas do Claude.",
  },
];

/** Um passo do guia. */
interface Passo {
  numero: number;
  titulo: string;
  corpo: React.ReactNode;
}

const estiloDeParagrafo: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12.5,
  color: "var(--dim)",
  lineHeight: 1.7,
};

const destaque: React.CSSProperties = { color: "var(--text)", fontWeight: 600 };

export default function ComoUsar() {
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const passos: Passo[] = [
    {
      numero: 1,
      titulo: "Crie o produto",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Um produto é um aplicativo. Vá em <Link href="/projetos">Todos os produtos</Link> e
            clique em <span style={destaque}>Criar produto</span>.
          </p>
          <p style={estiloDeParagrafo}>
            Você dá o nome — <em>Agenda Psi</em>, por exemplo — e o identificador curto sai dele
            sozinho: <code>agenda-psi</code>. Esse identificador aparece na URL e nas
            perguntas que você faz ao Claude, então vale ser curto e óbvio. Nada além disso é pedido:
            nenhuma tela de configuração é obrigatória antes do primeiro evento chegar.
          </p>
        </>
      ),
    },
    {
      numero: 2,
      titulo: "Ajuste o prefixo e o fuso",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Abra o produto e vá em <span style={destaque}>Configurações</span>. Dois campos importam
            aqui.
          </p>
          <p style={estiloDeParagrafo}>
            <span style={destaque}>Prefixo de evento.</span> Se você preencher com <code>psi_</code>,
            todos os eventos deste app passam a se chamar <code>psi_nova_sessao</code>,{" "}
            <code>psi_novo_paciente</code>, e assim por diante. Serve para você reconhecer de onde
            veio um evento quando tiver vários apps, e é o que o agente de instrumentação lê antes de
            propor um nome novo. Deixar em branco é uma escolha válida: significa que este produto
            não adota prefixo.
          </p>
          <p style={estiloDeParagrafo}>
            <span style={destaque}>Fuso de exibição.</span> O banco guarda tudo em UTC; este campo
            decide em que horário você lê. Com <code>America/Sao_Paulo</code>, um evento das 23h de
            uma terça aparece na terça, e não na quarta de madrugada.
          </p>
        </>
      ),
    },
    {
      numero: 3,
      titulo: "Gere a chave de ingestão",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Ainda em <span style={destaque}>Configurações</span>, gere a chave de ingestão — a{" "}
            <em>API key</em> deste produto. Ela aparece <span style={destaque}>uma única vez</span>:
            copie na hora e guarde numa variável de ambiente do seu app, tipicamente{" "}
            <code>VISAO_API_KEY</code>. Se perder, gere outra e revogue a anterior; as duas coisas
            estão na mesma tela.
          </p>
          <p style={estiloDeParagrafo}>
            A chave <span style={destaque}>só escreve</span>. Ela não lê evento, não lista produto e
            não apaga nada — se vazar, o estrago possível é alguém mandar evento errado para o seu
            produto, e você revoga. Ler é o outro tipo de credencial, o do passo 7.
          </p>
          <p style={{ ...estiloDeParagrafo, marginBottom: 0 }}>
            É a chave que determina o projeto. Não existe campo de projeto no corpo da requisição —
            se vier um, é ignorado.
          </p>
        </>
      ),
    },
    {
      numero: 4,
      titulo: "Mande um evento a cada ação que você quer acompanhar",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Este é o passo que faz a plataforma existir, e é o único que mexe no seu código. Para
            cada coisa que você quer saber se está sendo usada — salvou, exportou, agendou, cancelou
            — você faz <span style={destaque}>uma chamada</span> mandando o JSON do evento. Nada é
            capturado automaticamente: o que não for enviado de propósito não vai existir aqui.
          </p>
          <div style={{ margin: "14px 0" }}>
            <TrechosDeInstalacao slug="meu-app" host={host} />
          </div>
          <p style={estiloDeParagrafo}>
            Uma chamada HTTP, em qualquer linguagem que saiba fazer POST. Não há pacote para
            instalar: o contrato é o REST, e ele é o que não muda.
          </p>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
              margin: "14px 0 10px",
            }}
          >
            {CAMPOS_DO_EVENTO.map((linha, indice) => (
              <div
                key={linha.campo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "128px 1fr",
                  gap: 12,
                  padding: "9px 12px",
                  borderTop: indice === 0 ? "none" : "1px solid var(--line)",
                  background: "var(--elev)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <code
                    style={{
                      fontFamily: "var(--fonte-mono), monospace",
                      fontSize: 11.5,
                      color: "var(--text)",
                    }}
                  >
                    {linha.campo}
                  </code>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>
                    {linha.obrigatorio ? "obrigatório" : "opcional"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>
                  {linha.texto}
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...estiloDeParagrafo, marginBottom: 0 }}>
            Até <span style={destaque}>100 eventos</span> por chamada. Um evento inválido não derruba
            o lote: ele volta na resposta dizendo qual campo e por quê, e os outros entram. A resposta
            é sempre <code>202</code> com a contagem de aceitos, duplicados e rejeitados.
          </p>
        </>
      ),
    },
    {
      numero: 5,
      titulo: "Leia o que chegou",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Assim que o primeiro evento chega, as cinco telas do produto param de estar vazias. Cada
            uma responde uma pergunta diferente:
          </p>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            {RELATORIOS.map((relatorio, indice) => (
              <div
                key={relatorio.nome}
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 12,
                  padding: "10px 12px",
                  borderTop: indice === 0 ? "none" : "1px solid var(--line)",
                  background: "var(--elev)",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{relatorio.nome}</div>
                <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
                  {relatorio.texto}
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...estiloDeParagrafo, marginBottom: 0 }}>
            O catálogo se mantém sozinho: nome novo que chega vira linha nova, e a descrição que você
            editar nunca é sobrescrita por um envio posterior.
          </p>
        </>
      ),
    },
    {
      numero: 6,
      titulo: "Exporte quando quiser",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Os dados são seus e saem daqui sem pedir autorização a ninguém. Em cada produto, o botão
            de exportação ao lado dos filtros baixa os eventos em{" "}
            <span style={destaque}>CSV</span> — separador ponto e vírgula e acentuação preservada,
            para abrir no Excel sem susto. A tela de Uso exporta a tabela do período do mesmo jeito.
          </p>
          <p style={{ ...estiloDeParagrafo, marginBottom: 0 }}>
            E pela conta você baixa o <span style={destaque}>JSON completo</span>: produtos, catálogo,
            pessoas, painéis e eventos, tudo de uma vez.
          </p>
        </>
      ),
    },
    {
      numero: 7,
      titulo: "Ligue o Claude",
      corpo: (
        <>
          <p style={estiloDeParagrafo}>
            Aqui a plataforma deixa de ser um site e vira uma conversa. Vá em{" "}
            <Link href="/conta/credenciais">Credenciais MCP</Link>. Há dois caminhos, e você só
            precisa de um:
          </p>
          <p style={estiloDeParagrafo}>
            <span style={destaque}>Pelo aplicativo.</span> No Claude, em Configurações → Conectores →
            Adicionar conector personalizado, cole o endereço do servidor e deixe os campos de OAuth
            em branco. O Claude abre esta plataforma pedindo autorização, você clica em Autorizar e
            acabou. Não envolve token nenhum.
          </p>
          <p style={estiloDeParagrafo}>
            <span style={destaque}>Por arquivo de configuração.</span> Para o Claude Code e para quem
            prefere versionar a configuração: gere um token de leitura, cole o bloco JSON no arquivo
            do seu cliente e reinicie o Claude. A tela mostra o caminho do arquivo em cada sistema.
          </p>
          <p style={{ ...estiloDeParagrafo, marginBottom: 0 }}>
            Feito isso, você pergunta em português — <em>o que andou acontecendo no Agenda Psi esta
            semana?</em> — sem precisar saber o nome de nenhum evento. O Claude descobre lendo o
            catálogo. Veja um exemplo em <Link href="/conta/sobre">Sobre o produto</Link>. Esse acesso
            é <span style={destaque}>somente leitura</span>: o Claude nunca grava, altera ou apaga
            nada, e você revoga qualquer conexão na hora.
          </p>
        </>
      ),
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px", maxWidth: 800 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Como usar</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          Do zero ao primeiro gráfico, na ordem. Os passos 1 a 4 você faz uma vez por aplicativo; do
          5 em diante é uso do dia a dia.
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {passos.map((passo) => (
            <div
              key={passo.numero}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    flex: "none",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--priSoft)",
                    color: "var(--pri)",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {passo.numero}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{passo.titulo}</div>
              </div>
              {passo.corpo}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--elev)",
            padding: "14px 18px",
            fontSize: 12.5,
            color: "var(--dim)",
            lineHeight: 1.7,
          }}
        >
          <span style={destaque}>Um SDK está a caminho.</span> Ele vai dar fila offline, reenvio
          automático e envio em lote para quem usa JavaScript, React Native ou Node. Enquanto ele
          não sai, a chamada acima é o caminho — e vai continuar sendo, porque é o contrato estável
          da plataforma.
        </div>
      </div>
    </div>
  );
}
