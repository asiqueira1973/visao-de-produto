/**
 * Tela "Sobre o produto".
 *
 * O que faz: explica o que a plataforma faz, para quem ela foi feita e como
 *            ela é usada, e mostra um exemplo de consulta pelo Claude.
 * Lê:        nada — é conteúdo estático, sem consulta ao banco.
 * Devolve:   a página `/conta/sobre`.
 * Implementa: os princípios da seção 0, a visão da seção 1 e as personas da
 *             seção 2 do spec, escritos em linguagem de usuário.
 *
 * Existe porque o produto se explica mal sozinho: quem chega vê "Atividade",
 * "Uso" e "Catálogo" sem saber o que a plataforma se recusa a fazer, que é
 * justamente o que a distingue.
 */

import Link from "next/link";
import { ExemploDoClaude } from "@/features/sobre/ExemploDoClaude";

/** Um dos três blocos de "o que ela faz". */
const O_QUE_FAZ = [
  {
    titulo: "Guarda só o que você declarou",
    texto:
      "Nada é capturado automaticamente. Sem clique fantasma, sem pageview implícito, sem IP, sem geolocalização, sem modelo de aparelho. Só existe aqui o evento que o código do seu app enviou de propósito.",
  },
  {
    titulo: "Todo evento diz o que significa",
    texto:
      "Cada evento carrega uma descrição em português, tratada como campo de primeira classe. Seis meses depois, psi_nova_sessao continua dizendo “registrou uma sessão realizada” — para você e para o agente.",
  },
  {
    titulo: "Responde na tela e no Claude",
    texto:
      "As mesmas perguntas que estas telas respondem, o Claude responde em linguagem natural pelo MCP. Não é integração de lado: é a segunda porta da mesma casa.",
  },
];

/** Os três passos do uso, do código à pergunta. */
const COMO_SE_USA = [
  {
    numero: "1",
    titulo: "O agente instrumenta enquanto constrói",
    texto:
      "Ao implementar uma tela nova, o Claude adiciona a chamada de evento no código, seguindo a convenção de nomes que o produto já usa e escrevendo a descrição em português. Você não precisa parar para pensar em analytics.",
  },
  {
    numero: "2",
    titulo: "O app envia, por uma chamada de API",
    texto:
      "Uma chamada de rede com a chave de ingestão do produto, em qualquer linguagem que saiba fazer POST. Não há pacote para instalar: o contrato é o REST, e é ele que não muda.",
  },
  {
    numero: "3",
    titulo: "Você pergunta — aqui ou no Claude",
    texto:
      "Pelas telas, quando quer olhar. Pelo Claude, quando a pergunta aparece no meio do trabalho e você não quer abrir o navegador.",
  },
];

/** O que a plataforma explicitamente não é (anti-escopo da seção 1). */
const NAO_E = [
  "Web analytics — não conta pageview, sessão, bounce, origem de tráfego nem campanha",
  "Ferramenta de crescimento — não tem funil, retenção, coorte nem path analysis",
  "Plataforma de experimentação — não tem feature flag nem teste A/B",
  "Ferramenta de suporte — não tem session replay nem error tracking",
  "Substituta do PostHog para quem já usa o PostHog bem",
];

const estiloDoTituloDeSecao: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
  marginBottom: 10,
};

export default function SobreOProduto() {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px", maxWidth: 800 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Sobre o produto
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          O <strong style={{ color: "var(--text)" }}>Visão de Produto</strong> é uma plataforma de
          product analytics deliberadamente pequena. Seus aplicativos enviam os eventos que
          importam, e a resposta fica disponível de duas formas equivalentes: estas telas e o
          Claude, conversando.
        </div>

        {/* O que faz */}
        <div style={{ marginTop: 26 }}>
          <div style={estiloDoTituloDeSecao}>O que ela faz</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {O_QUE_FAZ.map((bloco) => (
              <div
                key={bloco.titulo}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "var(--panel)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{bloco.titulo}</div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 12.5,
                    color: "var(--dim)",
                    lineHeight: 1.6,
                  }}
                >
                  {bloco.texto}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Para quem é */}
        <div style={{ marginTop: 30 }}>
          <div style={estiloDoTituloDeSecao}>Para quem ela foi feita</div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--panel)",
              padding: "16px 18px",
              fontSize: 13,
              color: "var(--dim)",
              lineHeight: 1.65,
            }}
          >
            <p style={{ margin: 0 }}>
              Para quem constrói software com IA — sozinho ou em time pequeno, com o Claude Code, a
              partir de specs — e entrega feature rápido sem fazer ideia do que está sendo usado. É
              gente que não procura ferramenta de analytics, não compara tabela de preço e desiste
              no primeiro muro de onboarding: criar conta, criar organização, criar produto,
              escolher entre mil opções.
            </p>
            <p style={{ margin: "12px 0 0" }}>
              As perguntas desse público são três, e só três:{" "}
              <em style={{ color: "var(--text)" }}>alguém está usando isso?</em>,{" "}
              <em style={{ color: "var(--text)" }}>quem usou, e o quê?</em> e{" "}
              <em style={{ color: "var(--text)" }}>o que aconteceu no app hoje?</em> A plataforma
              inteira foi desenhada para responder essas três bem, e recusar o resto.
            </p>
            <p style={{ margin: "12px 0 0" }}>
              E tem um segundo usuário, que não é humano: o próprio agente. Ele escreve a
              instrumentação enquanto implementa e lê os dados quando você pergunta. Por isso as
              respostas do MCP são curtas e autoexplicativas — um dump de mil linhas seria uma
              resposta ruim mesmo estando tecnicamente correta.
            </p>
          </div>
        </div>

        {/* Como se usa */}
        <div style={{ marginTop: 30 }}>
          <div style={estiloDoTituloDeSecao}>Como se usa, do começo ao fim</div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--panel)",
              overflow: "hidden",
            }}
          >
            {COMO_SE_USA.map((passo, indice) => (
              <div
                key={passo.numero}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 16px",
                  borderTop: indice === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    flex: "none",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "var(--priSoft)",
                    color: "var(--pri)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {passo.numero}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{passo.titulo}</div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12.5,
                      color: "var(--dim)",
                      lineHeight: 1.6,
                    }}
                  >
                    {passo.texto}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--faint)", lineHeight: 1.6 }}>
            A chave de ingestão e os trechos prontos de código ficam em{" "}
            <strong style={{ color: "var(--dim)" }}>Configurações</strong>, dentro de cada produto.
            Para ligar o Claude a esta conta, veja{" "}
            <Link href="/conta/credenciais">Credenciais MCP</Link>.
          </div>
        </div>

        {/* Exemplo real de uso pelo Claude */}
        <div style={{ marginTop: 30 }}>
          <div style={estiloDoTituloDeSecao}>Como fica na prática</div>
          <div
            style={{
              marginBottom: 12,
              fontSize: 12.5,
              color: "var(--dim)",
              lineHeight: 1.6,
            }}
          >
            Com o conector ligado, a conversa é esta — você pergunta em português, o Claude consulta
            a plataforma e responde já sabendo o que cada evento significa.
          </div>
          <ExemploDoClaude />
        </div>

        {/* Anti-escopo */}
        <div style={{ marginTop: 30 }}>
          <div style={estiloDoTituloDeSecao}>O que ela não é</div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--panel)",
              padding: "14px 18px",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
              A lista abaixo não é falta de tempo: é desenho. Cada item aqui é uma pergunta que
              outra ferramenta responde melhor.
            </div>
            <ul
              style={{
                margin: "10px 0 0",
                paddingLeft: 18,
                fontSize: 12.5,
                color: "var(--dim)",
                lineHeight: 1.85,
              }}
            >
              {NAO_E.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 11.5,
            color: "var(--faint)",
            lineHeight: 1.6,
          }}
        >
          Visão de Produto é um produto da Dab Lab. Sobre o que é guardado e por quanto tempo, veja{" "}
          <Link href="/conta/termos">Termos e privacidade</Link>.
        </div>
      </div>
    </div>
  );
}
