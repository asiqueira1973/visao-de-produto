/**
 * Reconhecimento do repositório onde a CLI foi chamada.
 *
 * O que faz: descobre que tipo de app é, qual gerenciador de pacotes usar, e
 *            que nome de projeto propor.
 * Implementa: épico 8.7 e princípio 0.5 — instalar não pode virar um
 *             questionário. Tudo o que dá para descobrir sozinho, se descobre.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Os tipos de app que a CLI sabe instrumentar sozinha. */
export type TipoDeApp = "next" | "expo" | "react-native" | "node";

/** Gerenciadores de pacote reconhecidos, na ordem em que são procurados. */
export type Gerenciador = "pnpm" | "yarn" | "bun" | "npm";

/** O que a CLI descobriu sobre o repositório. */
export interface Repositorio {
  raiz: string;
  tipo: TipoDeApp;
  gerenciador: Gerenciador;
  nomeSugerido: string;
  slugSugerido: string;
  /** Onde o SDK deve ser inicializado, conforme o tipo de app. */
  arquivoDeInicializacao: string;
}

/** Lê o package.json da pasta, se houver. */
function lerPackageJson(raiz: string): Record<string, unknown> | null {
  const caminho = join(raiz, "package.json");
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Transforma um nome em slug.
 * Recebe o nome do projeto.
 * Devolve algo que casa com `^[a-z0-9-]+$` (seção 7.3).
 */
export function paraSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "app";
}

/**
 * Descobre o tipo do app pelas dependências declaradas.
 * Recebe as dependências do package.json.
 * Devolve o tipo, caindo para `node` quando não reconhece nada.
 */
export function descobrirTipo(dependencias: Record<string, string>): TipoDeApp {
  if (dependencias.expo) return "expo";
  if (dependencias.next) return "next";
  if (dependencias["react-native"]) return "react-native";
  return "node";
}

/**
 * Descobre qual gerenciador de pacotes o repositório usa.
 * Recebe a raiz do repositório.
 * Devolve o gerenciador, pelo arquivo de lock presente.
 */
export function descobrirGerenciador(raiz: string): Gerenciador {
  if (existsSync(join(raiz, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(raiz, "bun.lockb")) || existsSync(join(raiz, "bun.lock"))) return "bun";
  if (existsSync(join(raiz, "yarn.lock"))) return "yarn";
  return "npm";
}

/** Onde cada tipo de app costuma inicializar bibliotecas. */
function arquivoDeInicializacao(tipo: TipoDeApp): string {
  switch (tipo) {
    case "next":
      return "lib/visao.ts";
    case "expo":
    case "react-native":
      return "src/visao.ts";
    default:
      return "visao.ts";
  }
}

/**
 * Reconhece o repositório onde a CLI está rodando.
 * Recebe a pasta atual.
 * Devolve o que foi descoberto, ou lança quando não há package.json — sem ele
 * não há como instalar o SDK.
 */
export function reconhecer(raiz: string): Repositorio {
  const pacote = lerPackageJson(raiz);
  if (!pacote) {
    throw new Error(
      "Não achei um package.json aqui. Rode `npx visao init` na raiz do repositório do seu app.",
    );
  }

  const dependencias = {
    ...(pacote.dependencies as Record<string, string> | undefined),
    ...(pacote.devDependencies as Record<string, string> | undefined),
  };

  const tipo = descobrirTipo(dependencias);
  const nomeSugerido = typeof pacote.name === "string" && pacote.name ? pacote.name : "app";

  return {
    raiz,
    tipo,
    gerenciador: descobrirGerenciador(raiz),
    nomeSugerido,
    slugSugerido: paraSlug(nomeSugerido),
    arquivoDeInicializacao: arquivoDeInicializacao(tipo),
  };
}
