/**
 * Layout das telas autenticadas.
 *
 * O que faz: carrega os projetos da conta e o e-mail de quem está logado, e
 *            monta o menu lateral ao lado do conteúdo.
 * Lê:        `projetos` (pela política `projetos_dono_total`) e a sessão.
 * Implementa: seção 13.1.
 */

import { redirect } from "next/navigation";
import { MenuLateral } from "@/features/shell/MenuLateral";
import { AvisoDeCancelamento } from "@/features/perfil/AvisoDeCancelamento";
import { clienteDaSessao } from "@/lib/supabase/server";

export default async function LayoutDoApp({ children }: { children: React.ReactNode }) {
  const supabase = await clienteDaSessao();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A RLS já limita aos projetos da conta de quem está logado.
  const { data: projetos } = await supabase
    .from("projetos")
    .select("nome, slug")
    .is("arquivado_em", null)
    .order("nome");

  // Conta cancelada continua entrando e exportando durante 30 dias (regra
  // 11.17) — o aviso existe para ela não perder o prazo por esquecimento.
  const { data: conta } = await supabase.from("contas").select("cancelada_em").maybeSingle();

  // O grupo de administração só aparece para quem administra a plataforma. Quem
  // decide isso é o banco, não o site.
  const { data: admin } = await supabase.rpc("fn_eh_admin");

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      <MenuLateral
        projetos={projetos ?? []}
        email={user.email ?? "sem e-mail"}
        ehAdmin={admin === true}
      />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <AvisoDeCancelamento canceladaEm={conta?.cancelada_em ?? null} />
        {children}
      </main>
    </div>
  );
}
