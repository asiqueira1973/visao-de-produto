/**
 * Tela de dados da nota fiscal.
 *
 * O que faz: pede os dados do tomador antes do pagamento e leva para a Stripe.
 * Lê:        `dados_de_cobranca` e `contas`, pela RLS da sessão.
 * Devolve:   a página `/conta/assinar`.
 * Implementa: EPICO-COBRANCA.md, seções 3.1 e 5.
 *
 * Os dados vêm ANTES do pagamento de propósito. Cobrar primeiro e correr atrás
 * do CNPJ depois é como se acumula dívida: com trinta clientes já pagos, faltar
 * um campo vira vinte e nove conversas.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { clienteDaSessao } from "@/lib/supabase/server";
import { cobrancaConfigurada } from "@/features/cobranca/stripe";
import { PainelDeAssinatura } from "@/features/cobranca/PainelDeAssinatura";
import type { DadosDoTomador } from "@/features/cobranca/acoes";

export const dynamic = "force-dynamic";

export default async function Assinar() {
  // Ambiente sem cobrança não tem o que assinar: a tela some em vez de pedir
  // CPF para um pagamento que não existe.
  if (!cobrancaConfigurada()) redirect("/conta/perfil");

  const supabase = await clienteDaSessao();

  const { data: conta } = await supabase
    .from("contas")
    .select("plano, cortesia")
    .maybeSingle();

  // Conta cortesia não tem o que assinar.
  if (conta?.cortesia) redirect("/conta/perfil");

  const { data: dados } = await supabase
    .from("dados_de_cobranca")
    .select("tipo, documento, nome, email_nota, cep, logradouro, numero, complemento, bairro, municipio, uf")
    .maybeSingle();

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px", maxWidth: 760 }}>
        <Link href="/conta/perfil" style={{ fontSize: 12, color: "var(--dim)" }}>
          ← Perfil
        </Link>

        <div style={{ marginTop: 14, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Dados da nota fiscal
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6, maxWidth: 620 }}>
          A assinatura custa <strong style={{ color: "var(--text)" }}>R$ 50 por mês</strong>, em
          real, e dá produtos ilimitados e 12 meses de janela de consulta. Precisamos destes dados
          para emitir a nota fiscal de serviço — eles não vão para lugar nenhum além dela.
        </div>

        <div
          style={{
            marginTop: 20,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            padding: "18px",
          }}
        >
          <PainelDeAssinatura
            inicial={(dados as Partial<DadosDoTomador>) ?? null}
            jaEhPago={conta?.plano === "pago"}
          />
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.65 }}>
          O pagamento acontece na Stripe. Nenhum dado do seu cartão passa por esta plataforma, em
          momento nenhum. O que a gente guarda é o que está neste formulário, e só para a nota.
        </div>
      </div>
    </div>
  );
}
