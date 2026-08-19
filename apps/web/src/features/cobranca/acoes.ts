"use server";

/**
 * Ações da assinatura.
 *
 * O que faz: consulta CNPJ e CEP para a tela, guarda os dados do tomador da
 *            nota, abre a sessão de pagamento na Stripe e abre o portal onde a
 *            pessoa gerencia ou cancela a assinatura.
 * Implementa: EPICO-COBRANCA.md, seções 3.1 e 8.
 *
 * **Nada aqui muda plano.** Quem muda plano é o webhook, e só ele. Estas ações
 * levam a pessoa até a Stripe e a trazem de volta; o que acontece com a conta
 * depois é a Stripe que conta, pelo webhook (seção 3.2).
 *
 * A chave secreta da Stripe é lida aqui, em Server Action, e por isso nenhum
 * componente de cliente pode importar este arquivo diretamente — só chamar as
 * funções, que é o que o "use server" garante.
 */

import { revalidatePath } from "next/cache";
import { clienteDaSessao } from "@/lib/supabase/server";
import { stripe, PRECO_MENSAL, cobrancaConfigurada } from "./stripe";
import { emissor } from "@/features/oauth/servidor";
import {
  buscarEmpresa,
  buscarEndereco,
  soDigitos,
  type EmpresaEncontrada,
  type EnderecoEncontrado,
} from "./consultas-externas";

/** Os dados do tomador, como a tela envia. */
export interface DadosDoTomador {
  tipo: "pf" | "pj";
  documento: string;
  nome: string;
  email_nota?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
}

/** Acha a conta da sessão. Toda ação daqui começa por isto. */
async function contaDaSessao(): Promise<
  { supabase: Awaited<ReturnType<typeof clienteDaSessao>>; contaId: string } | { erro: string }
> {
  const supabase = await clienteDaSessao();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre de novo." };

  const { data: vinculo } = await supabase.from("usuarios_conta").select("conta_id").maybeSingle();
  if (!vinculo) return { erro: "Não achei a conta desta sessão." };

  return { supabase, contaId: vinculo.conta_id as string };
}

/**
 * Consulta um CNPJ para preencher o formulário.
 * Recebe o CNPJ, com ou sem pontuação.
 * Devolve o que encontrou, ou nulo — falhar aqui nunca impede de digitar à mão.
 */
export async function consultarCnpj(cnpj: string): Promise<EmpresaEncontrada | null> {
  return buscarEmpresa(cnpj);
}

/**
 * Consulta um CEP para preencher o endereço.
 * Devolve o endereço sem o número, que só quem mora lá sabe.
 */
export async function consultarCep(cep: string): Promise<EnderecoEncontrado | null> {
  return buscarEndereco(cep);
}

/** Valida o que a nota exige, conforme o tipo de tomador (EPICO-COBRANCA.md, 5). */
function validar(dados: DadosDoTomador): string | null {
  const documento = soDigitos(dados.documento ?? "");

  if (dados.tipo === "pf") {
    if (documento.length !== 11) return "O CPF precisa ter 11 dígitos.";
  } else {
    if (documento.length !== 14) return "O CNPJ precisa ter 14 dígitos.";
  }

  if (!dados.nome?.trim()) {
    return dados.tipo === "pf" ? "Informe o nome completo." : "Informe a razão social.";
  }

  // Endereço é exigido só da pessoa jurídica — é o que a nota dela pede.
  if (dados.tipo === "pj") {
    const faltando = [
      [dados.cep, "CEP"],
      [dados.logradouro, "endereço"],
      [dados.numero, "número"],
      [dados.bairro, "bairro"],
      [dados.municipio, "município"],
      [dados.uf, "estado"],
    ].find(([valor]) => !String(valor ?? "").trim());

    if (faltando) return `Falta o ${faltando[1]}, que a nota fiscal de empresa exige.`;
    if (soDigitos(dados.cep!).length !== 8) return "O CEP precisa ter 8 dígitos.";
  }

  return null;
}

/**
 * Guarda os dados do tomador da nota fiscal.
 * Recebe os dados da tela.
 * Devolve o erro, quando houver.
 * Uma linha por conta: se já existe, é atualizada.
 */
export async function salvarDadosDeCobranca(dados: DadosDoTomador): Promise<{ erro?: string }> {
  const problema = validar(dados);
  if (problema) return { erro: problema };

  const sessao = await contaDaSessao();
  if ("erro" in sessao) return { erro: sessao.erro };

  const linha = {
    conta_id: sessao.contaId,
    tipo: dados.tipo,
    documento: soDigitos(dados.documento),
    nome: dados.nome.trim(),
    email_nota: dados.email_nota?.trim() || null,
    // Pessoa física pode ter endereço, mas não precisa. Se não mandou, fica nulo.
    cep: dados.cep ? soDigitos(dados.cep) : null,
    logradouro: dados.logradouro?.trim() || null,
    numero: dados.numero?.trim() || null,
    complemento: dados.complemento?.trim() || null,
    bairro: dados.bairro?.trim() || null,
    municipio: dados.municipio?.trim() || null,
    uf: dados.uf?.trim().toUpperCase() || null,
    atualizado_em: new Date().toISOString(),
  };

  const { error } = await sessao.supabase
    .from("dados_de_cobranca")
    .upsert(linha, { onConflict: "conta_id" });

  if (error) return { erro: error.message };

  revalidatePath("/conta/perfil");
  return {};
}

/**
 * Abre a sessão de pagamento na Stripe.
 * Recebe nada; usa a conta da sessão.
 * Devolve a URL para onde mandar o navegador, ou o motivo de não dar.
 *
 * O `client_reference_id` carrega a conta até a Stripe e volta com ela no
 * webhook — é o fio que liga o pagamento à conta certa. Sem ele, o webhook não
 * saberia quem promover.
 */
export async function criarSessaoDeCheckout(): Promise<{ url?: string; erro?: string }> {
  if (!cobrancaConfigurada()) {
    return { erro: "A cobrança ainda não está configurada neste ambiente." };
  }

  const sessao = await contaDaSessao();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data: conta } = await sessao.supabase
    .from("contas")
    .select("plano, cortesia, stripe_cliente_id")
    .eq("id", sessao.contaId)
    .single();

  if (conta?.cortesia) return { erro: "Esta conta é cortesia e não precisa pagar." };
  if (conta?.plano === "pago") return { erro: "Esta conta já é paga." };

  // A nota fiscal não sai sem o tomador, então ele é exigido ANTES do pagamento:
  // cobrar primeiro e correr atrás do CNPJ depois é como se acumula dívida.
  const { data: tomador } = await sessao.supabase
    .from("dados_de_cobranca")
    .select("id")
    .eq("conta_id", sessao.contaId)
    .maybeSingle();

  if (!tomador) return { erro: "Preencha os dados da nota fiscal antes de pagar." };

  const { data: { user } } = await sessao.supabase.auth.getUser();
  const site = emissor();

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRECO_MENSAL, quantity: 1 }],
      // É por aqui que o webhook descobre de quem é o pagamento.
      client_reference_id: sessao.contaId,
      ...(conta?.stripe_cliente_id
        ? { customer: conta.stripe_cliente_id }
        : { customer_email: user?.email ?? undefined }),
      // A volta é informativa: quem muda o plano é o webhook (seção 3.2).
      success_url: `${site}/conta/perfil?assinatura=processando`,
      cancel_url: `${site}/conta/perfil?assinatura=cancelada`,
      locale: "pt-BR",
    });

    if (!checkout.url) return { erro: "A Stripe não devolveu o endereço do pagamento." };
    return { url: checkout.url };
  } catch (falha) {
    console.error("falha ao abrir o checkout", falha);
    return { erro: "Não consegui abrir o pagamento agora. Tente de novo em instantes." };
  }
}

/**
 * Abre o portal da Stripe, onde a pessoa troca o cartão, vê as faturas e cancela.
 * Devolve a URL, ou o motivo de não dar.
 *
 * Cancelar acontece LÁ, e não numa tela nossa: é o que torna o cancelamento
 * autosserviço de verdade, sem ninguém no meio (princípio 0.6).
 */
export async function abrirPortalDaStripe(): Promise<{ url?: string; erro?: string }> {
  if (!cobrancaConfigurada()) {
    return { erro: "A cobrança ainda não está configurada neste ambiente." };
  }

  const sessao = await contaDaSessao();
  if ("erro" in sessao) return { erro: sessao.erro };

  const { data: conta } = await sessao.supabase
    .from("contas")
    .select("stripe_cliente_id")
    .eq("id", sessao.contaId)
    .single();

  if (!conta?.stripe_cliente_id) {
    return { erro: "Esta conta não tem assinatura para gerenciar." };
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: conta.stripe_cliente_id,
      return_url: `${emissor()}/conta/perfil`,
    });
    return { url: portal.url };
  } catch (falha) {
    console.error("falha ao abrir o portal", falha);
    return { erro: "Não consegui abrir o portal da Stripe agora." };
  }
}
