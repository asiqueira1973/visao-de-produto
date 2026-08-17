/**
 * Registro do servidor MCP nos clientes de agente instalados.
 *
 * O que faz: encontra Claude Code, Claude Desktop e Cursor na máquina e escreve
 *            neles o bloco de configuração do servidor remoto.
 * Implementa: épico 8.7 e seção 12.3.
 *
 * O bloco é sempre o do servidor REMOTO. Um servidor local por `npx` exigiria
 * credencial de banco na máquina de quem usa (seção 12.3).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

/** Um cliente de agente que pode receber a configuração. */
export interface ClienteDeAgente {
  nome: string;
  caminho: string;
}

/** O nome pelo qual o servidor aparece na configuração dos clientes. */
export const NOME_DO_SERVIDOR = "visao-de-produto";

/**
 * Lista os clientes de agente instalados nesta máquina.
 * Devolve os que têm arquivo de configuração no lugar esperado.
 * Cliente que não está instalado simplesmente não aparece — a CLI não instala
 * nada por conta própria.
 */
export function detectarClientes(casa = homedir()): ClienteDeAgente[] {
  const sistema = platform();

  const candidatos: ClienteDeAgente[] = [
    // Claude Code guarda a configuração no ~/.claude.json.
    { nome: "Claude Code", caminho: join(casa, ".claude.json") },
    {
      nome: "Claude Desktop",
      caminho:
        sistema === "darwin"
          ? join(casa, "Library", "Application Support", "Claude", "claude_desktop_config.json")
          : sistema === "win32"
            ? join(casa, "AppData", "Roaming", "Claude", "claude_desktop_config.json")
            : join(casa, ".config", "Claude", "claude_desktop_config.json"),
    },
    {
      nome: "Cursor",
      caminho: join(casa, ".cursor", "mcp.json"),
    },
  ];

  return candidatos.filter((cliente) => existsSync(cliente.caminho) || existsSync(dirname(cliente.caminho)));
}

/**
 * Escreve o servidor MCP na configuração de um cliente.
 * Recebe o cliente, a URL do servidor e o token de leitura.
 * Devolve verdadeiro quando gravou.
 *
 * Preserva tudo o que já existe no arquivo e guarda uma cópia de segurança
 * antes de mexer: configuração de outro app não é nossa para perder.
 */
export function registrarNoCliente(
  cliente: ClienteDeAgente,
  url: string,
  token: string,
): boolean {
  try {
    let configuracao: Record<string, unknown> = {};

    if (existsSync(cliente.caminho)) {
      copyFileSync(cliente.caminho, `${cliente.caminho}.antes-do-visao`);
      try {
        configuracao = JSON.parse(readFileSync(cliente.caminho, "utf8")) as Record<string, unknown>;
      } catch {
        // Arquivo existente e ilegível: não sobrescreve às cegas.
        return false;
      }
    } else {
      mkdirSync(dirname(cliente.caminho), { recursive: true });
    }

    const servidores = (configuracao.mcpServers ?? {}) as Record<string, unknown>;
    servidores[NOME_DO_SERVIDOR] = {
      type: "http",
      url,
      headers: { Authorization: `Bearer ${token}` },
    };
    configuracao.mcpServers = servidores;

    writeFileSync(cliente.caminho, `${JSON.stringify(configuracao, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}
