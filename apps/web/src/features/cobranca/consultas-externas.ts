/**
 * Consulta de CNPJ e de CEP, para o formulário do tomador não ser um paredão.
 *
 * O que faz: busca razão social e endereço a partir do CNPJ, e endereço a
 *            partir do CEP, na BrasilAPI.
 * Recebe:    o documento ou o CEP, com ou sem pontuação.
 * Devolve:   o que encontrou, ou nulo — **nunca lança**.
 * Implementa: EPICO-COBRANCA.md, seção 5: sem consulta, pessoa jurídica seriam
 *             oito campos entre a pessoa e o pagamento, que é onde carrinho
 *             morre. Com consulta, são três.
 *
 * Roda no servidor de propósito: assim não há CORS, a chamada não aparece no
 * navegador de quem está pagando, e um dia dá para trocar de provedor sem
 * mexer na tela.
 *
 * **Falhar aqui não pode impedir ninguém de assinar.** A BrasilAPI é gratuita e
 * sem contrato; se ela cair, o formulário continua aceitando digitação à mão.
 * É por isso que tudo aqui devolve nulo em vez de erro.
 */

/** Quanto tempo esperar antes de desistir. Ninguém espera dez segundos por um CEP. */
const TEMPO_LIMITE_MS = 4_000;

/**
 * Sem `user-agent`, a BrasilAPI responde 403 na consulta de CNPJ — descoberto
 * na prática, não na documentação. O de CEP funciona sem, mas mandamos nos dois
 * para não depender de dois comportamentos diferentes.
 */
const IDENTIFICACAO = "visao-de-produto/0.1 (+https://visaodeproduto.com.br)";

/** Tira ponto, traço, barra e espaço. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** O endereço como as duas consultas devolvem. */
export interface EnderecoEncontrado {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
}

/** O que a consulta de CNPJ traz. */
export interface EmpresaEncontrada extends Partial<EnderecoEncontrado> {
  razaoSocial: string;
  numero?: string;
}

/** Faz a chamada com prazo, e devolve nulo em qualquer problema. */
async function buscar<T>(url: string): Promise<T | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { accept: "application/json", "user-agent": IDENTIFICACAO },
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as T;
  } catch {
    // Rede fora, prazo estourado, JSON quebrado: para quem está pagando, tudo
    // isso é a mesma coisa — o campo continua vazio e ele digita.
    return null;
  }
}

/**
 * Busca uma empresa pelo CNPJ.
 * Devolve razão social e endereço, ou nulo quando não encontra.
 */
export async function buscarEmpresa(cnpj: string): Promise<EmpresaEncontrada | null> {
  const limpo = soDigitos(cnpj);
  if (limpo.length !== 14) return null;

  const dados = await buscar<Record<string, unknown>>(
    `https://brasilapi.com.br/api/cnpj/v1/${limpo}`,
  );
  if (!dados) return null;

  const razao = (dados.razao_social ?? dados.nome_fantasia) as string | undefined;
  if (!razao) return null;

  return {
    razaoSocial: razao,
    cep: dados.cep ? soDigitos(String(dados.cep)) : undefined,
    logradouro: [dados.descricao_tipo_de_logradouro, dados.logradouro]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined,
    numero: dados.numero ? String(dados.numero) : undefined,
    bairro: (dados.bairro as string) || undefined,
    municipio: (dados.municipio as string) || undefined,
    uf: (dados.uf as string) || undefined,
  };
}

/**
 * Busca um endereço pelo CEP.
 * Devolve o endereço sem o número, que só quem mora lá sabe.
 */
export async function buscarEndereco(cep: string): Promise<EnderecoEncontrado | null> {
  const limpo = soDigitos(cep);
  if (limpo.length !== 8) return null;

  const dados = await buscar<Record<string, unknown>>(
    `https://brasilapi.com.br/api/cep/v2/${limpo}`,
  );
  if (!dados || !dados.city) return null;

  return {
    cep: limpo,
    logradouro: (dados.street as string) ?? "",
    bairro: (dados.neighborhood as string) ?? "",
    municipio: dados.city as string,
    uf: dados.state as string,
  };
}
