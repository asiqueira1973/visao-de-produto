/**
 * Apoio da suíte de testes.
 *
 * O que faz: monta os clientes do banco, cria e destrói a conta descartável que
 *            cada arquivo de teste usa, e gera credenciais de verdade.
 * Implementa: seção 19 do spec.
 *
 * Os testes rodam contra o projeto real, e não contra um banco de mentira: é a
 * única forma de provar que RLS, trigger, partição e Edge Function se comportam
 * como o spec diz. Para isso cada arquivo cria a própria conta e apaga tudo no
 * fim — nada é compartilhado entre arquivos.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Lê o .env da raiz do repositório, que nunca vai para o git. */
function lerEnv(): Record<string, string> {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const bruto = readFileSync(join(raiz, ".env"), "utf8");
  return Object.fromEntries(
    bruto
      .split("\n")
      .filter((linha) => linha.includes("=") && !linha.trimStart().startsWith("#"))
      .map((linha) => [linha.slice(0, linha.indexOf("=")).trim(), linha.slice(linha.indexOf("=") + 1).trim()]),
  );
}

export const env = lerEnv();
export const URL_DO_PROJETO = env.NEXT_PUBLIC_SUPABASE_URL!;

/** Cliente que ignora RLS. Usado para montar e desmontar o cenário. */
export function clienteDeServico(): SupabaseClient {
  return createClient(URL_DO_PROJETO, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente anônimo, do jeito que um curioso na internet teria. */
export function clienteAnonimo(): SupabaseClient {
  return createClient(URL_DO_PROJETO, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** O cenário descartável de um arquivo de teste. */
export interface Cenario {
  contaId: string;
  projetoId: string;
  slug: string;
  usuarioId: string;
  email: string;
  senha: string;
  chaveDeIngestao: string;
  tokenDeLeitura: string;
  limpar: () => Promise<void>;
}

/** Sorteia uma credencial no formato da seção 6.3. */
function sortear(prefixo: "ing_" | "mcp_") {
  const valor = prefixo + randomBytes(32).toString("base64url");
  return { valor, hash: createHash("sha256").update(valor).digest("hex"), prefixo8: valor.slice(0, 8) };
}

/**
 * Monta uma conta nova, com usuário, projeto e as duas credenciais.
 * Recebe um apelido, para os nomes ficarem legíveis no banco durante a rodada.
 * Devolve o cenário, com a função que apaga tudo no fim.
 */
export async function montarCenario(apelido: string): Promise<Cenario> {
  const servico = clienteDeServico();
  const sufixo = randomUUID().slice(0, 8);
  const email = `teste-${apelido}-${sufixo}@dablab.test`;
  const senha = `s${randomBytes(9).toString("base64url")}A9!`;

  // O usuário nasce e a trigger de cadastro cria a conta (seção 5.2).
  const { data: criado, error: erroUsuario } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `Teste ${apelido}` },
  });
  if (erroUsuario || !criado.user) throw new Error(`não criei o usuário: ${erroUsuario?.message}`);

  const { data: vinculo } = await servico
    .from("usuarios_conta")
    .select("conta_id")
    .eq("usuario_id", criado.user.id)
    .single();

  const contaId = vinculo!.conta_id as string;
  const slug = `teste-${apelido}-${sufixo}`;

  const { data: projeto } = await servico
    .from("projetos")
    .insert({ conta_id: contaId, nome: `Teste ${apelido}`, slug, prefixo_evento: "teste_" })
    .select("id")
    .single();

  const chave = sortear("ing_");
  const token = sortear("mcp_");

  await servico.from("credenciais").insert([
    {
      conta_id: contaId,
      tipo: "ingestao",
      projeto_id: projeto!.id,
      nome: "chave do teste",
      prefixo: chave.prefixo8,
      valor_hash: chave.hash,
    },
    {
      conta_id: contaId,
      tipo: "leitura",
      projeto_id: null,
      nome: "token do teste",
      prefixo: token.prefixo8,
      valor_hash: token.hash,
    },
  ]);

  return {
    contaId,
    projetoId: projeto!.id as string,
    slug,
    usuarioId: criado.user.id,
    email,
    senha,
    chaveDeIngestao: chave.valor,
    tokenDeLeitura: token.valor,
    async limpar() {
      // Apagar a conta leva projeto, eventos, catálogo, pessoas e credenciais
      // junto, pelo cascade — é o mesmo caminho do expurgo da regra 11.17.
      await servico.from("contas").delete().eq("id", contaId);
      await servico.auth.admin.deleteUser(criado.user!.id);
    },
  };
}

/**
 * Grava eventos direto no banco, sem passar pela Edge Function.
 * Recebe o cenário e os eventos parciais.
 * Devolve nada. Serve para testar trigger e consulta sem depender da rede.
 */
export async function semearEventos(
  cenario: Cenario,
  eventos: Array<{
    nome: string;
    distinct_id?: string;
    tela?: string | null;
    descricao?: string | null;
    propriedades?: Record<string, unknown>;
    ocorrido_em?: string;
  }>,
): Promise<void> {
  const servico = clienteDeServico();
  const { error } = await servico.from("eventos").insert(
    eventos.map((e) => ({
      id: randomUUID(),
      conta_id: cenario.contaId,
      projeto_id: cenario.projetoId,
      nome: e.nome,
      distinct_id: e.distinct_id ?? "pessoa@exemplo.com",
      tela: e.tela ?? null,
      descricao: e.descricao ?? null,
      propriedades: e.propriedades ?? {},
      ocorrido_em: e.ocorrido_em ?? new Date().toISOString(),
    })),
  );
  if (error) throw new Error(`não semeei os eventos: ${error.message}`);
}

/** Manda um lote para a Edge Function de ingestão, como um app faria. */
export async function ingerir(
  chave: string | null,
  eventos: unknown[],
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const cabecalhos: Record<string, string> = { "content-type": "application/json" };
  if (chave) cabecalhos["x-api-key"] = chave;

  const resposta = await fetch(`${URL_DO_PROJETO}/functions/v1/ingest`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({ eventos }),
  });

  const corpo = (await resposta.json()) as Record<string, unknown>;
  return { status: resposta.status, corpo };
}

/** Monta um evento válido, com o que o teste quiser sobrescrito. */
export function eventoValido(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    nome: "teste_algo_aconteceu",
    distinct_id: "pessoa@exemplo.com",
    ocorrido_em: new Date().toISOString(),
    descricao: "usuário fez a coisa que o teste mede",
    ...extra,
  };
}
