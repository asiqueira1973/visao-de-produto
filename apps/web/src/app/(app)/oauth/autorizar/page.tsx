/**
 * Tela de autorização do OAuth.
 *
 * O que faz: mostra qual cliente está pedindo acesso e o que ele vai poder
 *            fazer, e cria o código de autorização quando o dono aprova.
 * Recebe:    os parâmetros do OAuth vindos do cliente de agente.
 * Implementa: épico 8.8.
 *
 * Fica dentro do grupo autenticado de propósito: quem não tem sessão é levado
 * ao login e volta para cá, que é o comportamento esperado de um servidor de
 * autorização.
 */

import { acharCliente, redirecionamentoPermitido } from "@/features/oauth/servidor";
import { ConfirmacaoDoOauth } from "@/features/oauth/ConfirmacaoDoOauth";

export const dynamic = "force-dynamic";

/** Cartão de recusa, para todo caso em que o pedido não serve. */
function Recusa({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 560 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>{titulo}</div>
        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--errLine)",
            background: "var(--errSoft)",
            borderRadius: 11,
            padding: 18,
            fontSize: 12.5,
            color: "var(--err)",
            lineHeight: 1.55,
          }}
        >
          {detalhe}
        </div>
      </div>
    </div>
  );
}

export default async function Autorizar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;

  if (p.response_type !== "code") {
    return (
      <Recusa
        titulo="Pedido não reconhecido"
        detalhe="Este servidor só trabalha com response_type=code."
      />
    );
  }

  if (!p.client_id || !p.redirect_uri || !p.code_challenge) {
    return (
      <Recusa
        titulo="Pedido incompleto"
        detalhe="Faltam client_id, redirect_uri ou code_challenge. Refaça a conexão pelo aplicativo."
      />
    );
  }

  // OAuth 2.1 não aceita PKCE `plain`.
  if ((p.code_challenge_method ?? "S256") !== "S256") {
    return (
      <Recusa
        titulo="Método de PKCE não aceito"
        detalhe="Só aceito code_challenge_method=S256."
      />
    );
  }

  const cliente = await acharCliente(p.client_id);
  if (!cliente) {
    return (
      <Recusa
        titulo="Aplicativo desconhecido"
        detalhe="Este cliente não está registrado. Tente conectar de novo pelo aplicativo."
      />
    );
  }

  if (!redirecionamentoPermitido(cliente, p.redirect_uri)) {
    return (
      <Recusa
        titulo="Endereço de retorno não autorizado"
        detalhe="O endereço para onde o aplicativo quer voltar não é um dos que ele registrou. Por segurança, não continuo."
      />
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 560 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Conectar {cliente.nome}
        </div>
        <div style={{ marginTop: 5, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>
          Um aplicativo está pedindo para ler os dados desta conta.
        </div>

        <ConfirmacaoDoOauth
          nomeDoCliente={cliente.nome}
          clientId={p.client_id}
          redirectUri={p.redirect_uri}
          codeChallenge={p.code_challenge}
          estado={p.state ?? ""}
        />
      </div>
    </div>
  );
}
