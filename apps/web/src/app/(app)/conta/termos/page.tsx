/**
 * Tela "Termos e privacidade", dentro do app.
 *
 * O que faz: desenha o texto de termos e privacidade com a moldura das telas
 *            autenticadas.
 * Lê:        nada — o conteúdo é estático.
 * Devolve:   a página `/conta/termos`.
 * Implementa: seção 17 do spec.
 *
 * O texto em si mora em `features/termos/TextoDosTermos`, porque o mesmo
 * conteúdo também é servido em `/termos`, aberto a quem ainda não entrou.
 */

import { TextoDosTermos } from "@/features/termos/TextoDosTermos";

export default function TermosEPrivacidade() {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px", maxWidth: 800 }}>
        <TextoDosTermos />
      </div>
    </div>
  );
}
