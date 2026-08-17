/**
 * Validações do lado do cliente.
 *
 * O que faz: recusa nome de evento fora do formato antes de o evento entrar na
 *            fila, e gera o identificador de deduplicação.
 * Implementa: regra 11.1 (formato do nome) e regra 11.4 (id gerado no cliente).
 *
 * Validar aqui é o que faz o erro aparecer no console de quem instrumentou, e
 * não numa lista de rejeitados que ninguém vai olhar depois.
 */

/** Formato da regra 11.1. Espaço é inválido de propósito. */
const NOME_VALIDO = /^[a-z][a-z0-9_]{2,63}$/;

/**
 * Diz se o nome do evento serve.
 * Recebe o nome proposto pelo app.
 * Devolve verdadeiro quando ele passa na regra 11.1.
 */
export function nomeDeEventoEhValido(nome: string): boolean {
  return NOME_VALIDO.test(nome);
}

/**
 * Explica, em português, por que um nome foi recusado.
 * Recebe o nome inválido.
 * Devolve a mensagem que vai para o console de quem está instrumentando.
 */
export function motivoDoNomeInvalido(nome: string): string {
  if (nome.includes(" ")) {
    return `"${nome}" tem espaço. Use underscore: "${nome.replace(/\s+/g, "_")}".`;
  }
  if (/[A-Z]/.test(nome)) {
    return `"${nome}" tem maiúscula. Use tudo em minúsculo: "${nome.toLowerCase()}".`;
  }
  if (nome.length < 3) {
    return `"${nome}" é curto demais. O mínimo são 3 caracteres.`;
  }
  if (nome.length > 64) {
    return `"${nome}" passa de 64 caracteres.`;
  }
  return `"${nome}" precisa começar com letra minúscula e usar só letras, números e underscore.`;
}

/**
 * Gera o identificador do evento.
 * Devolve um UUID v4, que é a chave de deduplicação da regra 11.4 — é o que
 * torna o retry seguro: reenviar o mesmo evento nunca duplica.
 * Usa `crypto.randomUUID` quando existe, e cai para uma implementação própria
 * em ambientes antigos (Hermes de RN mais velho, por exemplo).
 */
export function gerarId(): string {
  const cripto = (globalThis as { crypto?: Crypto }).crypto;

  if (cripto?.randomUUID) {
    return cripto.randomUUID();
  }

  if (cripto?.getRandomValues) {
    const bytes = cripto.getRandomValues(new Uint8Array(16));
    // Marca a versão 4 e a variante, conforme a RFC 4122.
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  // Último recurso: sem fonte de aleatoriedade criptográfica, ainda assim
  // precisamos de um id único por evento.
  let saida = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) saida += "-";
    else if (i === 14) saida += "4";
    else {
      const digito = Math.floor(Math.random() * 16);
      saida += (i === 19 ? (digito & 0x3) | 0x8 : digito).toString(16);
    }
  }
  return saida;
}
