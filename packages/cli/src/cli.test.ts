/**
 * Testes das decisões que a CLI toma sozinha.
 *
 * O que cobre: reconhecimento do repositório e escrita dos arquivos do app.
 * O fluxo de autorização no navegador é verificado de ponta a ponta contra o
 * site, e não aqui.
 */

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { descobrirGerenciador, descobrirTipo, paraSlug, reconhecer } from "./projeto.js";
import { criarInicializacao, garantirGitignore, gravarNoEnv } from "./arquivos.js";

/** Cria uma pasta temporária com um package.json dentro. */
function pastaComPacote(pacote: Record<string, unknown>, arquivos: string[] = []): string {
  const pasta = mkdtempSync(join(tmpdir(), "visao-cli-"));
  writeFileSync(join(pasta, "package.json"), JSON.stringify(pacote));
  for (const arquivo of arquivos) writeFileSync(join(pasta, arquivo), "");
  return pasta;
}

describe("slug", () => {
  it("respeita o formato do banco", () => {
    expect(paraSlug("Agenda Psi")).toBe("agenda-psi");
    expect(paraSlug("Portal do Síndico")).toBe("portal-do-sindico");
    expect(paraSlug("  App   com   espaços  ")).toBe("app-com-espacos");
    expect(paraSlug("@escopo/pacote")).toBe("escopo-pacote");
    expect(paraSlug("!!!")).toBe("app");
    expect(paraSlug("Agenda Psi")).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("reconhecimento do repositório", () => {
  it("distingue expo, next, react native e node", () => {
    expect(descobrirTipo({ expo: "57.0.0", "react-native": "0.86.0" })).toBe("expo");
    expect(descobrirTipo({ next: "16.3.1" })).toBe("next");
    expect(descobrirTipo({ "react-native": "0.86.0" })).toBe("react-native");
    expect(descobrirTipo({ fastify: "5.0.0" })).toBe("node");
  });

  it("descobre o gerenciador pelo arquivo de lock", () => {
    expect(descobrirGerenciador(pastaComPacote({}, ["pnpm-lock.yaml"]))).toBe("pnpm");
    expect(descobrirGerenciador(pastaComPacote({}, ["yarn.lock"]))).toBe("yarn");
    expect(descobrirGerenciador(pastaComPacote({}, ["bun.lockb"]))).toBe("bun");
    expect(descobrirGerenciador(pastaComPacote({}, []))).toBe("npm");
  });

  it("recusa pasta sem package.json, explicando o que fazer", () => {
    const vazia = mkdtempSync(join(tmpdir(), "visao-vazia-"));
    expect(() => reconhecer(vazia)).toThrow(/package.json/);
  });

  it("propõe o nome do package.json e o arquivo certo por tipo", () => {
    const next = reconhecer(pastaComPacote({ name: "portal", dependencies: { next: "16.3.1" } }));
    expect(next.nomeSugerido).toBe("portal");
    expect(next.arquivoDeInicializacao).toBe("lib/visao.ts");

    const expo = reconhecer(pastaComPacote({ name: "app-mobile", dependencies: { expo: "57.0.0" } }));
    expect(expo.arquivoDeInicializacao).toBe("src/visao.ts");
  });
});

describe("arquivos do app", () => {
  it("acrescenta variáveis sem apagar as que já existem", () => {
    const pasta = pastaComPacote({ name: "app" });
    writeFileSync(join(pasta, ".env"), "OUTRA_COISA=valor\nVISAO_API_KEY=antiga\n");

    gravarNoEnv(pasta, { VISAO_API_KEY: "ing_nova", VISAO_HOST: "https://exemplo" });

    const env = readFileSync(join(pasta, ".env"), "utf8");
    expect(env).toContain("OUTRA_COISA=valor");
    expect(env).toContain("VISAO_API_KEY=ing_nova");
    expect(env).toContain("VISAO_HOST=https://exemplo");
    expect(env).not.toContain("antiga");
  });

  it("põe o .env no .gitignore uma vez só", () => {
    const pasta = pastaComPacote({ name: "app" });
    expect(garantirGitignore(pasta)).toBe(true);
    expect(garantirGitignore(pasta)).toBe(false);
    expect(readFileSync(join(pasta, ".gitignore"), "utf8").match(/^\.env$/gm)).toHaveLength(1);
  });

  it("cria a inicialização com AsyncStorage só em React Native", () => {
    const expo = reconhecer(pastaComPacote({ name: "movel", dependencies: { expo: "57.0.0" } }));
    criarInicializacao(expo, "movel");
    const conteudoExpo = readFileSync(join(expo.raiz, "src/visao.ts"), "utf8");
    expect(conteudoExpo).toContain("AsyncStorage");
    expect(conteudoExpo).toContain("EXPO_PUBLIC_VISAO_API_KEY");

    const next = reconhecer(pastaComPacote({ name: "site", dependencies: { next: "16.3.1" } }));
    criarInicializacao(next, "site");
    const conteudoNext = readFileSync(join(next.raiz, "lib/visao.ts"), "utf8");
    expect(conteudoNext).not.toContain("AsyncStorage");
    expect(conteudoNext).toContain("process.env.VISAO_API_KEY");
  });

  it("não sobrescreve inicialização que já existe", () => {
    const repo = reconhecer(pastaComPacote({ name: "site", dependencies: { next: "16.3.1" } }));
    expect(criarInicializacao(repo, "site")).toBe("lib/visao.ts");
    expect(criarInicializacao(repo, "site")).toBeNull();
    expect(existsSync(join(repo.raiz, "lib/visao.ts"))).toBe(true);
  });
});
