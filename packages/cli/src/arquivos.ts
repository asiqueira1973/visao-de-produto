/**
 * Escrita dos arquivos do app instrumentado.
 *
 * O que faz: grava a chave no `.env`, garante que ele está no `.gitignore`, e
 *            cria o arquivo que inicializa o SDK.
 * Implementa: épico 8.7 e a seção 15.5 (variáveis `VISAO_*`).
 *
 * Nada é sobrescrito em silêncio: se a variável já existe no `.env`, ela é
 * atualizada; se o arquivo de inicialização já existe, ele é preservado.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Repositorio } from "./projeto.js";

/**
 * Grava ou atualiza uma variável no `.env`.
 * Recebe a raiz do repositório, o nome e o valor.
 * Devolve nada.
 */
export function gravarNoEnv(raiz: string, variaveis: Record<string, string>): void {
  const caminho = join(raiz, ".env");
  const linhas = existsSync(caminho) ? readFileSync(caminho, "utf8").split("\n") : [];

  for (const [nome, valor] of Object.entries(variaveis)) {
    const indice = linhas.findIndex((linha) => linha.startsWith(`${nome}=`));
    if (indice >= 0) linhas[indice] = `${nome}=${valor}`;
    else linhas.push(`${nome}=${valor}`);
  }

  const conteudo = linhas.filter((l, i) => l !== "" || i < linhas.length - 1).join("\n");
  writeFileSync(caminho, `${conteudo.replace(/\n+$/, "")}\n`, { encoding: "utf8", mode: 0o600 });
}

/**
 * Garante que o `.env` está ignorado pelo git.
 * Recebe a raiz do repositório.
 * Devolve verdadeiro quando precisou acrescentar a linha.
 * A chave de ingestão é pública por natureza (regra 5.1.3), mas o `.env` do app
 * costuma ter outras coisas que não são.
 */
export function garantirGitignore(raiz: string): boolean {
  const caminho = join(raiz, ".gitignore");
  const atual = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";

  if (/^\.env$/m.test(atual)) return false;

  appendFileSync(caminho, `${atual.endsWith("\n") || atual === "" ? "" : "\n"}.env\n`);
  return true;
}

/** O trecho que inicializa o SDK, por tipo de app. */
function conteudoDaInicializacao(repositorio: Repositorio, slug: string): string {
  const cabecalho = `/**
 * Visão de Produto — inicialização do SDK.
 * Criado por \`npx visao init\`. A chave vive no .env, nunca no código.
 */
import { init } from "@dablab/visao";
`;

  if (repositorio.tipo === "expo" || repositorio.tipo === "react-native") {
    return `${cabecalho}import AsyncStorage from "@react-native-async-storage/async-storage";

init({
  key: process.env.EXPO_PUBLIC_VISAO_API_KEY!,
  projeto: "${slug}",
  // Em React Native o app entrega o AsyncStorage: assim o SDK não depende de
  // módulo nativo nenhum, e a fila sobrevive ao app fechar.
  storage: AsyncStorage,
});
`;
  }

  return `${cabecalho}
init({
  key: process.env.VISAO_API_KEY!,
  projeto: "${slug}",
});
`;
}

/**
 * Cria o arquivo que inicializa o SDK.
 * Recebe o repositório e o slug do projeto.
 * Devolve o caminho criado, ou nulo quando o arquivo já existia.
 */
export function criarInicializacao(repositorio: Repositorio, slug: string): string | null {
  const caminho = join(repositorio.raiz, repositorio.arquivoDeInicializacao);
  if (existsSync(caminho)) return null;

  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudoDaInicializacao(repositorio, slug), "utf8");
  return repositorio.arquivoDeInicializacao;
}
