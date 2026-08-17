/**
 * Persistência da fila.
 *
 * O que faz: escolhe onde guardar a fila conforme o ambiente — `localStorage`
 *            no navegador, memória no Node, e o que o app passar em React
 *            Native (normalmente o AsyncStorage).
 * Implementa: a linha "persistência" da tabela do épico 8.3.
 *
 * O SDK não importa AsyncStorage: importar significaria depender de um módulo
 * nativo, e o critério do épico 8.3 exige funcionar no Expo SDK 57 sem nenhum.
 * Em React Native o app passa o AsyncStorage em `init({ storage })`, e a CLI
 * (`npx visao init`) escreve essa linha sozinha quando detecta um projeto Expo.
 */

import type { StorageAdapter } from "./types.js";

/** Guarda a fila só na memória. Some quando o processo morre. */
export class MemoryStorage implements StorageAdapter {
  private dados = new Map<string, string>();

  getItem(chave: string): string | null {
    return this.dados.get(chave) ?? null;
  }

  setItem(chave: string, valor: string): void {
    this.dados.set(chave, valor);
  }

  removeItem(chave: string): void {
    this.dados.delete(chave);
  }
}

/** Guarda a fila no `localStorage` do navegador. */
class LocalStorage implements StorageAdapter {
  constructor(private readonly alvo: Storage) {}

  getItem(chave: string): string | null {
    try {
      return this.alvo.getItem(chave);
    } catch {
      // Navegador em modo privado pode recusar leitura. Perder a fila é melhor
      // do que quebrar o app do cliente.
      return null;
    }
  }

  setItem(chave: string, valor: string): void {
    try {
      this.alvo.setItem(chave, valor);
    } catch {
      // Cota estourada: idem.
    }
  }

  removeItem(chave: string): void {
    try {
      this.alvo.removeItem(chave);
    } catch {
      // idem
    }
  }
}

/** Verdadeiro quando o SDK está rodando dentro de React Native. */
export function estaEmReactNative(): boolean {
  const nav = (globalThis as { navigator?: { product?: string } }).navigator;
  return nav?.product === "ReactNative";
}

/**
 * Escolhe o storage do ambiente.
 * Recebe o storage explícito, quando o app passou um.
 * Devolve o adapter que será usado pela fila.
 */
export function escolherStorage(explicito?: StorageAdapter): StorageAdapter {
  if (explicito) return explicito;

  const janela = globalThis as { localStorage?: Storage };
  if (!estaEmReactNative() && janela.localStorage) {
    return new LocalStorage(janela.localStorage);
  }

  return new MemoryStorage();
}
