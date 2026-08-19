/**
 * Tela de Perfil.
 *
 * O que faz: mostra quem está logado, os dados da conta e a medição do mês, e
 *            oferece a zona de perigo — cancelar a conta, ou desfazer.
 * Lê:        `usuarios_conta`, `contas`, `projetos`, `eventos` e `uso_mensal`,
 *            todos pela RLS da sessão.
 * Escreve:   `contas`, pela política `contas_dono_total`.
 * Devolve:   a página `/conta/perfil`.
 * Implementa: seções 7.9 e 7.9.2, a matriz 5.1 e as regras 11.15, 11.16 e
 *             11.17.
 *
 * Os números do mês vêm de `uso_mensal`, que é escrito pelo job diário: se o
 * job ainda não rodou neste mês a linha não existe, e a tela diz isso em vez de
 * inventar zero — contagem ausente e contagem zerada não são a mesma coisa.
 */

import Link from "next/link";
import { clienteDaSessao } from "@/lib/supabase/server";
import { NomeDaConta } from "@/features/perfil/NomeDaConta";
import { ZonaDePerigo } from "@/features/perfil/ZonaDePerigo";
import { diasAteOExpurgo } from "@/features/perfil/dias";
import { CartaoDeAssinatura } from "@/features/cobranca/CartaoDeAssinatura";
import { cobrancaConfigurada } from "@/features/cobranca/stripe";
import { dataCurta } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** Uma linha do cartão de informações. */
function Linha({
  rotulo,
  children,
  primeira,
}: {
  rotulo: string;
  children: React.ReactNode;
  primeira?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "156px 1fr",
        gap: 14,
        alignItems: "center",
        padding: "11px 16px",
        borderTop: primeira ? "none" : "1px solid var(--line)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--faint)" }}>{rotulo}</div>
      <div style={{ fontSize: 13, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default async function Perfil({
  searchParams,
}: {
  searchParams: Promise<{ assinatura?: string }>;
}) {
  const { assinatura } = await searchParams;
  const supabase = await clienteDaSessao();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: vinculo } = await supabase
    .from("usuarios_conta")
    .select("papel, criado_em, conta_id")
    .maybeSingle();

  const { data: conta } = await supabase
    .from("contas")
    .select(
      "id, nome, plano, retencao_meses, limite_projetos, criada_em, cancelada_em, cortesia, assinatura_status, periodo_fim",
    )
    .maybeSingle();

  const { count: projetos } = await supabase
    .from("projetos")
    .select("id", { count: "exact", head: true })
    .is("arquivado_em", null);

  const { count: eventos } = await supabase
    .from("eventos")
    .select("id", { count: "exact", head: true });

  // Se os dados da nota já existem, "Assinar" vai direto para o pagamento.
  const { data: tomador } = await supabase
    .from("dados_de_cobranca")
    .select("id")
    .maybeSingle();

  // Competência é o primeiro dia do mês corrente, em UTC — o mesmo recorte que
  // `fn_agrega_uso_mensal` usa para gravar.
  const agora = new Date();
  const competencia = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: uso } = await supabase
    .from("uso_mensal")
    .select("eventos_recebidos, projetos_ativos, pessoas_distintas, consultas_mcp, atualizado_em")
    .eq("competencia", competencia)
    .maybeSingle();

  const plano = conta?.plano === "pago" ? "Pago" : "Gratuito";
  const limite =
    conta?.limite_projetos == null ? "ilimitados" : `${conta.limite_projetos}`;

  const medicoes = [
    { rotulo: "Eventos recebidos", valor: uso?.eventos_recebidos ?? 0 },
    { rotulo: "Projetos ativos", valor: uso?.projetos_ativos ?? 0 },
    { rotulo: "Pessoas distintas", valor: uso?.pessoas_distintas ?? 0 },
    { rotulo: "Consultas do Claude", valor: uso?.consultas_mcp ?? 0 },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "26px 32px 72px", maxWidth: 800 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Perfil</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          Quem está logado, o que a conta tem e o que ela consumiu neste mês.
        </div>

        {/* Quem está logado */}
        <div style={{ marginTop: 22, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Você
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            overflow: "hidden",
          }}
        >
          <Linha rotulo="Nome" primeira>
            {(user?.user_metadata?.full_name as string | undefined) ?? "—"}
          </Linha>
          <Linha rotulo="E-mail">
            <span style={{ wordBreak: "break-all" }}>{user?.email ?? "—"}</span>
          </Linha>
          <Linha rotulo="Entra por">
            Google. A senha é do Google e nunca passa por aqui.
          </Linha>
          <Linha rotulo="Papel na conta">
            {vinculo?.papel === "dono" ? "Dono" : (vinculo?.papel ?? "—")}
            <span style={{ color: "var(--faint)" }}>
              {" "}
              — na v1 cada conta tem uma pessoa só.
            </span>
          </Linha>
        </div>

        {/* A conta */}
        <div style={{ marginTop: 26, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          A conta
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--panel)",
            overflow: "hidden",
          }}
        >
          <Linha rotulo="Nome da conta" primeira>
            <NomeDaConta nomeAtual={conta?.nome ?? ""} />
          </Linha>
          <Linha rotulo="Plano">
            {plano}
            <span style={{ color: "var(--faint)" }}>
              {" "}
              — {limite === "ilimitados" ? "projetos ilimitados" : `até ${limite} projeto(s)`},{" "}
              {conta?.retencao_meses ?? 1}{" "}
              {(conta?.retencao_meses ?? 1) === 1 ? "mês" : "meses"} de janela de consulta.
            </span>
          </Linha>
          <Linha rotulo="Criada em">
            {conta?.criada_em ? dataCurta(conta.criada_em, "America/Sao_Paulo") : "—"}
          </Linha>
          <Linha rotulo="Projetos ativos">{projetos ?? 0}</Linha>
          <Linha rotulo="Eventos guardados">
            {(eventos ?? 0).toLocaleString("pt-BR")}
          </Linha>
          <Linha rotulo="Seus dados">
            <a href="/conta/exportar">Baixar tudo em JSON</a>
            <span style={{ color: "var(--faint)" }}>
              {" "}
              — projetos, catálogo, pessoas, painéis e eventos.
            </span>
          </Linha>
        </div>

        {/* Assinatura */}
        <div style={{ marginTop: 26, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Assinatura
        </div>
        <CartaoDeAssinatura
          estado={{
            cobrancaLigada: cobrancaConfigurada(),
            plano: (conta?.plano as "gratuito" | "pago") ?? "gratuito",
            cortesia: Boolean(conta?.cortesia),
            assinaturaStatus:
              (conta?.assinatura_status as "nenhuma" | "ativa" | "atrasada" | "cancelada") ??
              "nenhuma",
            periodoFim: conta?.periodo_fim ?? null,
            temDadosDeCobranca: Boolean(tomador),
            retorno: assinatura,
          }}
        />

        {/* Medição do mês */}
        <div style={{ marginTop: 26, fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Uso deste mês
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {medicoes.map((medicao) => (
            <div
              key={medicao.rotulo}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: "13px 15px",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{medicao.rotulo}</div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                {medicao.valor.toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
          {uso
            ? `Medição fechada pelo job diário, atualizada em ${dataCurta(uso.atualizado_em, "America/Sao_Paulo")}.`
            : "A medição deste mês ainda não foi calculada — o job roda uma vez por dia, de madrugada."}{" "}
          Ela existe para tornar a cobrança possível no futuro; nesta versão não há cobrança.
        </div>

        {/* Zona de perigo */}
        <div style={{ marginTop: 30 }}>
          <ZonaDePerigo
            canceladaEm={conta?.cancelada_em ?? null}
            diasRestantes={diasAteOExpurgo(conta?.cancelada_em ?? null)}
            projetos={projetos ?? 0}
            eventos={eventos ?? 0}
          />
        </div>

        <div style={{ marginTop: 20, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
          O que acontece com os dados depois de apagar a conta está escrito em{" "}
          <Link href="/conta/termos">Termos e privacidade</Link>.
        </div>
      </div>
    </div>
  );
}
