"use client";

/**
 * Os dois caminhos para mandar evento: com SDK ou direto pela API.
 *
 * O que faz: mostra o trecho de instrumentação em duas abas — o SDK
 *            JavaScript e a chamada HTTP crua — sobre a mesma chave.
 * Recebe:    o slug do projeto e, quando houver, a chave em claro (só existe no
 *            instante em que ela é gerada).
 * Devolve:   o bloco usado no estado vazio da Atividade e nas Configurações.
 * Implementa: seção 12.1 (o contrato REST é o estável) e a assunção 21.2 — quem
 *             não é JavaScript usa a API direta, que é contrato simples.
 *
 * A aba de API existe porque o SDK é conveniência, não requisito: a plataforma
 * é uma API REST, e qualquer stack que saiba fazer POST manda evento.
 */

import { useState } from "react";
import { BlocoCopiavel } from "./BlocoCopiavel";

/** O que aparece no lugar da chave quando ela não está mais disponível. */
const CHAVE_OCULTA = "$VISAO_API_KEY";

/**
 * O SDK ainda não está publicado no npm.
 *
 * Enquanto `@dablab/visao` não existir no registro, `pnpm add @dablab/visao`
 * falha — e instrução que não funciona é pior do que instrução ausente: quem
 * tenta conclui que o produto está quebrado. Então a aba some, e o caminho
 * mostrado é a API, que é o contrato estável (seção 12.1) e funciona hoje.
 *
 * Para devolver a aba, basta trocar esta linha para `true` depois de publicar.
 */
const SDK_PUBLICADO = false;

export function TrechosDeInstalacao({
  slug,
  host,
  chaveEmClaro,
}: {
  slug: string;
  host: string;
  chaveEmClaro?: string;
}) {
  const [aba, setAba] = useState<"sdk" | "api">(SDK_PUBLICADO ? "sdk" : "api");
  const chave = chaveEmClaro ?? CHAVE_OCULTA;

  const trechoDoSdk = `import { init, identify, track } from "@dablab/visao";

init({ key: process.env.VISAO_API_KEY, projeto: "${slug}" });
identify("pessoa@exemplo.com");

track("${slug.replace(/-/g, "_").slice(0, 20)}_algo_aconteceu", {
  descricao: "usuário fez a coisa que você quer medir",
  tela: "NomeDaTela",
  props: { valor: 250 }
});`;

  const trechoDaApi = `curl -X POST "${host}/functions/v1/ingest" \\
  -H "content-type: application/json" \\
  -H "x-api-key: ${chave}" \\
  -d '{
    "eventos": [{
      "id": "3f9a1c2e-7b45-4d81-9e63-0a5f8c2d1b47",
      "nome": "${slug.replace(/-/g, "_").slice(0, 20)}_algo_aconteceu",
      "distinct_id": "pessoa@exemplo.com",
      "ocorrido_em": "2026-08-19T14:32:05Z",
      "tela": "NomeDaTela",
      "descricao": "usuário fez a coisa que você quer medir",
      "propriedades": { "valor": 250 }
    }]
  }'`;

  const estiloDaAba = (ativa: boolean): React.CSSProperties => ({
    height: 26,
    padding: "0 10px",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 11.5,
    border: `1px solid ${ativa ? "var(--pri)" : "var(--line)"}`,
    background: ativa ? "var(--priSoft)" : "var(--elev)",
    color: ativa ? "var(--pri)" : "var(--dim)",
  });

  return (
    <div>
      {SDK_PUBLICADO && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <button onClick={() => setAba("sdk")} style={estiloDaAba(aba === "sdk")}>
            Com o SDK
          </button>
          <button onClick={() => setAba("api")} style={estiloDaAba(aba === "api")}>
            Direto pela API
          </button>
        </div>
      )}

      {aba === "sdk" ? (
        <BlocoCopiavel texto={trechoDoSdk} rotulo="JavaScript, React Native ou Node" />
      ) : (
        <>
          <BlocoCopiavel texto={trechoDaApi} rotulo="Qualquer linguagem que faça POST" />
          <div
            style={{
              marginTop: 8,
              fontSize: 11.5,
              color: "var(--faint)",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "var(--text)" }}>O <code>id</code> precisa ser um UUID</strong>,
            novo a cada evento. Número ou texto solto é recusado — o valor acima é só um exemplo, e
            copiá-lo tal qual faz o segundo evento ser tratado como repetição do primeiro.
            <br />
            Ele é a sua proteção contra duplicata: reenviar o mesmo evento, com o mesmo id, nunca
            conta duas vezes dentro deste projeto. É o que torna seguro tentar de novo quando a
            rede falha.
            <br />
            O <code>ocorrido_em</code> é o instante em que a coisa aconteceu, em UTC. Até 100
            eventos por chamada.
            {!chaveEmClaro && " Troque $VISAO_API_KEY pela chave deste projeto."}
          </div>
        </>
      )}
    </div>
  );
}
