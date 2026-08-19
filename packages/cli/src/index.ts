#!/usr/bin/env node

/**
 * `npx visao init` — instala a Visão de Produto num aplicativo.
 *
 * O que faz: reconhece o repositório, cria o projeto e as credenciais pelo
 *            site, instala o SDK, escreve o `.env` e o arquivo de
 *            inicialização, e registra o servidor MCP nos clientes de agente
 *            que encontrar.
 * Recebe:    o nome do projeto (a única pergunta) e, opcionalmente, `--site`.
 * Devolve:   código 0 quando terminou, e o próximo passo impresso na tela.
 * Implementa: épico 8.7 e princípio 0.5 — instalar a plataforma num app novo é
 *             um comando, e nenhuma tela de configuração é obrigatória antes do
 *             primeiro evento aparecer.
 *
 * A autorização acontece no navegador, e não por token colado: o site já sabe
 * quem é o dono, cria o projeto com a sessão dele e devolve para a CLI apenas
 * as duas credenciais que o produto já define — a chave de ingestão e o token
 * de leitura. Assim nenhuma credencial de dono fica em disco.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { stdin, stdout, argv, exit, cwd } from "node:process";
import { detectarClientes, registrarNoCliente } from "./clientes-de-agente.js";
import { criarInicializacao, garantirGitignore, gravarNoEnv } from "./arquivos.js";
import { paraSlug, reconhecer, type Repositorio } from "./projeto.js";

/**
 * Os endereços de PRODUÇÃO.
 *
 * Este pacote é publicado e roda na máquina de quem instala, então o padrão
 * precisa ser produção — é o que a pessoa espera ao rodar `npx visao init`.
 * Quem trabalha no repositório aponta para o ambiente de dev definindo
 * `VISAO_SITE` e `VISAO_HOST`, ou passando `--site=`.
 *
 * Estes são os endereços PRÓPRIOS, e não os da Vercel e do Supabase. É o que
 * torna a plataforma mudável de casa: a chave de ingestão que a CLI escreve no `.env` de
 * um app vai durar anos lá dentro, e trocar de hospedagem não pode obrigar
 * ninguém a fazer release de app.
 */
const SITE_DE_PRODUCAO = "https://app.visaodeproduto.com.br";
const HOST_DE_PRODUCAO = "https://api.visaodeproduto.com.br";

/** Site que autoriza a instalação. Trocável por `--site`, para desenvolvimento. */
const SITE_PADRAO = process.env.VISAO_SITE ?? SITE_DE_PRODUCAO;

/** Host da ingestão, gravado no `.env` do app. */
const HOST_PADRAO = process.env.VISAO_HOST ?? HOST_DE_PRODUCAO;

/** O que o site devolve depois que o dono autoriza. */
interface Autorizacao {
  slug: string;
  nome: string;
  chave_de_ingestao: string;
  token_de_leitura: string;
  url_do_mcp: string;
}

const cores = {
  titulo: (t: string) => `[1m${t}[0m`,
  ok: (t: string) => `[32m${t}[0m`,
  fraco: (t: string) => `[2m${t}[0m`,
  erro: (t: string) => `[31m${t}[0m`,
  aviso: (t: string) => `[33m${t}[0m`,
};

/**
 * Abre o navegador no sistema em que estivermos.
 * `VISAO_SEM_NAVEGADOR=1` desliga a abertura, para teste automatizado e para
 * quem roda a CLI numa máquina sem interface — o link impresso continua valendo.
 */
function abrirNavegador(url: string): void {
  if (process.env.VISAO_SEM_NAVEGADOR === "1") return;

  const comando =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(comando, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Sem navegador: o link impresso na tela resolve.
  }
}

/**
 * Espera o site devolver as credenciais.
 * Recebe o estado sorteado, para conferir que a resposta é da nossa chamada.
 * Devolve a autorização e a porta em que ficou escutando.
 */
function esperarAutorizacao(estado: string): {
  porta: Promise<number>;
  autorizacao: Promise<Autorizacao>;
} {
  let resolvePorta: (p: number) => void;
  let resolveAutorizacao: (a: Autorizacao) => void;
  let rejeitaAutorizacao: (e: Error) => void;

  const porta = new Promise<number>((r) => (resolvePorta = r));
  const autorizacao = new Promise<Autorizacao>((r, j) => {
    resolveAutorizacao = r;
    rejeitaAutorizacao = j;
  });

  const servidor = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const dados = url.searchParams.get("dados");
    const estadoRecebido = url.searchParams.get("estado");

    res.setHeader("content-type", "text/html; charset=utf-8");

    if (!dados || estadoRecebido !== estado) {
      res.statusCode = 400;
      res.end("<p>Autorização inválida. Volte ao terminal e rode o comando de novo.</p>");
      return;
    }

    res.end(
      "<p style=\"font-family:system-ui\">Pronto. Pode fechar esta aba e voltar ao terminal.</p>",
    );

    try {
      resolveAutorizacao(JSON.parse(Buffer.from(dados, "base64url").toString("utf8")));
    } catch (erro) {
      rejeitaAutorizacao(erro instanceof Error ? erro : new Error(String(erro)));
    } finally {
      servidor.close();
    }
  });

  servidor.listen(0, "127.0.0.1", () => {
    const endereco = servidor.address();
    resolvePorta(typeof endereco === "object" && endereco ? endereco.port : 0);
  });

  return { porta, autorizacao };
}

/** Instala o SDK com o gerenciador de pacotes do repositório. */
function instalarSdk(repositorio: Repositorio): boolean {
  const argumentos =
    repositorio.gerenciador === "npm"
      ? ["install", "@dablab/visao"]
      : ["add", "@dablab/visao"];

  const resultado = spawnSync(repositorio.gerenciador, argumentos, {
    cwd: repositorio.raiz,
    stdio: "inherit",
  });

  return resultado.status === 0;
}

async function init(): Promise<void> {
  const site = (argv.find((a) => a.startsWith("--site="))?.split("=")[1] ?? SITE_PADRAO).replace(
    /\/+$/,
    "",
  );

  console.log(cores.titulo("\nVisão de Produto — instalação\n"));

  // Nunca instale às cegas: se alguém apontou a CLI para outro ambiente por
  // variável ou por `--site=`, isso precisa aparecer antes de qualquer escrita.
  if (site !== SITE_DE_PRODUCAO) {
    console.log(cores.aviso(`Atenção: instalando contra ${site}, que não é o ambiente de produção.\n`));
  }

  const repositorio = reconhecer(cwd());
  console.log(
    `Encontrei um app ${cores.titulo(repositorio.tipo)} usando ${cores.titulo(repositorio.gerenciador)}.`,
  );

  // A única pergunta do fluxo (princípio 0.5).
  const leitura = createInterface({ input: stdin, output: stdout });
  const respondido = await leitura.question(
    `Nome do projeto ${cores.fraco(`[${repositorio.nomeSugerido}]`)}: `,
  );
  leitura.close();

  const nome = respondido.trim() || repositorio.nomeSugerido;
  const slug = paraSlug(nome);

  const estado = randomBytes(16).toString("base64url");
  const { porta, autorizacao } = esperarAutorizacao(estado);
  const portaEscolhida = await porta;

  const url = `${site}/cli/autorizar?nome=${encodeURIComponent(nome)}&slug=${encodeURIComponent(slug)}&porta=${portaEscolhida}&estado=${encodeURIComponent(estado)}`;

  console.log(`\nAbrindo o navegador para você autorizar:\n${cores.fraco(url)}\n`);
  abrirNavegador(url);

  const dados = await autorizacao;
  console.log(cores.ok(`Projeto "${dados.nome}" criado.`));

  // 1. O SDK.
  const instalou = instalarSdk(repositorio);
  console.log(instalou ? cores.ok("SDK instalado.") : cores.erro("Não consegui instalar o SDK."));

  // 2. O .env, com a chave e o host.
  const ehReactNative = repositorio.tipo === "expo" || repositorio.tipo === "react-native";
  gravarNoEnv(repositorio.raiz, {
    // No Expo, só variável com prefixo EXPO_PUBLIC_ chega ao app.
    [ehReactNative ? "EXPO_PUBLIC_VISAO_API_KEY" : "VISAO_API_KEY"]: dados.chave_de_ingestao,
    [ehReactNative ? "EXPO_PUBLIC_VISAO_HOST" : "VISAO_HOST"]: HOST_PADRAO,
  });
  console.log(cores.ok("Chave gravada no .env."));

  if (garantirGitignore(repositorio.raiz)) {
    console.log(cores.ok(".env acrescentado ao .gitignore."));
  }

  // 3. O arquivo que inicializa o SDK.
  const criado = criarInicializacao(repositorio, dados.slug);
  console.log(
    criado
      ? cores.ok(`Inicialização criada em ${criado}.`)
      : cores.fraco("Arquivo de inicialização já existia; deixei como estava."),
  );

  // 4. O MCP em cada cliente de agente encontrado.
  const clientes = detectarClientes();
  for (const cliente of clientes) {
    const gravou = registrarNoCliente(cliente, dados.url_do_mcp, dados.token_de_leitura);
    console.log(
      gravou
        ? cores.ok(`MCP registrado no ${cliente.nome}.`)
        : cores.fraco(`Não consegui escrever no ${cliente.nome}.`),
    );
  }
  if (clientes.length === 0) {
    console.log(cores.fraco("Nenhum cliente de agente encontrado nesta máquina."));
  }

  console.log(cores.titulo("\nPróximo passo\n"));
  console.log(`Importe a inicialização no ponto de entrada do app e mande o primeiro evento:\n`);
  console.log(
    cores.fraco(`  import { track } from "@dablab/visao";

  track("${slug.replace(/-/g, "_").slice(0, 20)}_app_aberto", {
    descricao: "usuário abriu o aplicativo",
    tela: "Inicio",
  });\n`),
  );
  console.log(`Depois abra ${site}/p/${dados.slug}/atividade para ver o evento chegar.\n`);
}

async function principal(): Promise<void> {
  const comando = argv[2];

  if (comando !== "init") {
    console.log(`
${cores.titulo("visao")} — Visão de Produto

  npx visao init            instala a plataforma neste repositório
  npx visao init --site=…   aponta para outro site (desenvolvimento)
`);
    exit(comando ? 1 : 0);
  }

  try {
    await init();
  } catch (erro) {
    console.error(cores.erro(`\n${erro instanceof Error ? erro.message : String(erro)}\n`));
    exit(1);
  }
}

void principal();
