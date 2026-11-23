/**
 * Tela de Credenciais MCP.
 *
 * O que faz: lista os tokens de leitura da conta, gera e revoga, e mostra o
 *            bloco de configuração para colar no cliente de agente.
 * Lê:        `credenciais`.
 * Escreve:   `credenciais`, pela política `credenciais_dono_total`.
 * Implementa: épico 8.5, seção 12.3 e regra 5.1.2.
 *
 * O bloco de configuração é o do servidor REMOTO (seção 12.3). O mock do Claude
 * Design mostra uma variante local por `npx`, que está errada: servidor local
 * exigiria credencial de banco na máquina de quem usa (divergência 1).
 */

import { clienteDaSessao } from "@/lib/supabase/server";
import { TokensDeLeitura } from "@/features/credenciais/TokensDeLeitura";
import { urlDoMcp } from "@/features/oauth/servidor";
import type { Credencial } from "@/lib/data/tipos";

export const dynamic = "force-dynamic";

export default async function CredenciaisMcp() {
  const supabase = await clienteDaSessao();

  const { data } = await supabase
    .from("credenciais")
    .select("id, tipo, projeto_id, nome, prefixo, criada_em, ultimo_uso_em, revogada_em")
    .eq("tipo", "leitura")
    .order("criada_em", { ascending: false });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 60px", maxWidth: 800 }}>
        <TokensDeLeitura
          tokens={(data ?? []) as Credencial[]}
          urlDoMcp={urlDoMcp()}
        />
      </div>
    </div>
  );
}
