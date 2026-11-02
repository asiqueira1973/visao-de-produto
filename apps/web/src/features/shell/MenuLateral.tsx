"use client";

/**
 * Menu lateral persistente, no estilo do App Store Connect.
 *
 * O que faz: mostra os grupos Projetos, projeto ativo e Conta, marcando um item
 *            ativo por vez, e traz o rodapé com o usuário e a saída.
 * Recebe:    os projetos da conta, o slug do projeto aberto e o e-mail de quem
 *            está logado.
 * Devolve:   a coluna de 248px à esquerda de todas as telas autenticadas.
 * Implementa: seção 13.1 — grupos com título em negrito e caixa normal, itens
 *             indentados sem marcador, hairline entre grupos, item ativo em
 *             pílula na cor primária, rodapé com sair.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Um projeto, do ponto de vista do menu. */
export interface ItemDeProjeto {
  nome: string;
  slug: string;
}

/** As telas de dentro de um projeto (inventário da seção 10). */
const TELAS_DO_PROJETO = [
  { rotulo: "Atividade", caminho: "atividade" },
  { rotulo: "Uso", caminho: "uso" },
  { rotulo: "Painel", caminho: "painel" },
  { rotulo: "Pessoas", caminho: "pessoas" },
  { rotulo: "Catálogo", caminho: "catalogo" },
  { rotulo: "Configurações", caminho: "configuracoes" },
] as const;

/**
 * As telas da conta. "Credenciais MCP" vem do inventário da seção 10; as duas
 * seguintes são conteúdo do produto — o que ele faz e sob que regras opera —,
 * e ficam aqui porque valem para a conta inteira, não para um projeto.
 */
const TELAS_DA_CONTA = [
  { rotulo: "Perfil", caminho: "/conta/perfil" },
  { rotulo: "Credenciais MCP", caminho: "/conta/credenciais" },
  { rotulo: "Sobre o produto", caminho: "/conta/sobre" },
  { rotulo: "Como usar", caminho: "/conta/como-usar" },
  { rotulo: "Termos e privacidade", caminho: "/conta/termos" },
] as const;

/** Estilo de um item do menu, ativo ou não (seção 13.1). */
function estiloDoItem(ativo: boolean): React.CSSProperties {
  return {
    display: "block",
    textAlign: "left",
    border: "none",
    cursor: "pointer",
    borderRadius: 7,
    padding: "6px 10px 6px 14px",
    fontSize: 13,
    fontWeight: ativo ? 500 : 400,
    color: ativo ? "var(--pri)" : "var(--dim)",
    background: ativo ? "var(--priSoft)" : "transparent",
    textDecoration: "none",
  };
}

const estiloDoGrupo: React.CSSProperties = {
  padding: "12px 14px 14px",
  borderTop: "1px solid var(--line)",
};

const estiloDoTitulo: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--text)",
  marginBottom: 6,
  padding: "0 6px",
};

export function MenuLateral({
  projetos,
  email,
  ehAdmin,
}: {
  projetos: ItemDeProjeto[];
  email: string;
  /** Quem não administra a plataforma não vê o grupo de administração. */
  ehAdmin?: boolean;
}) {
  const caminhoAtual = usePathname();
  // O projeto aberto sai da própria URL (/p/<slug>/...), para o layout não
  // precisar repassar o que o roteador já sabe.
  const slugAtivo = caminhoAtual.match(/^\/p\/([^/]+)/)?.[1];
  const projetoAtivo = projetos.find((p) => p.slug === slugAtivo);

  return (
    <aside
      style={{
        width: 248,
        flex: "none",
        borderRight: "1px solid var(--line)",
        background: "var(--panel)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div
        style={{
          padding: "18px 18px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{ width: 18, height: 18, borderRadius: 5, background: "var(--pri)", display: "block" }}
        />
        <span
          style={{ fontFamily: "var(--fonte-mono), monospace", fontSize: 12, color: "var(--dim)" }}
        >
          visao-de-produto
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        <div style={estiloDoGrupo}>
          <div style={estiloDoTitulo}>Produtos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {projetos.length === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--faint)", padding: "6px 10px 6px 14px" }}>
                nenhum ainda
              </span>
            )}
            {projetos.map((projeto) => (
              <Link
                key={projeto.slug}
                href={`/p/${projeto.slug}/atividade`}
                style={estiloDoItem(projeto.slug === slugAtivo)}
              >
                {projeto.nome}
              </Link>
            ))}
            <Link
              href="/projetos"
              style={estiloDoItem(caminhoAtual === "/projetos")}
            >
              Todos os produtos
            </Link>
          </div>
        </div>

        {projetoAtivo && (
          <div style={estiloDoGrupo}>
            <div style={estiloDoTitulo}>{projetoAtivo.nome}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {TELAS_DO_PROJETO.map((tela) => {
                const href = `/p/${projetoAtivo.slug}/${tela.caminho}`;
                return (
                  <Link key={tela.caminho} href={href} style={estiloDoItem(caminhoAtual === href)}>
                    {tela.rotulo}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div style={estiloDoGrupo}>
          <div style={estiloDoTitulo}>Conta</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {TELAS_DA_CONTA.map((tela) => (
              <Link
                key={tela.caminho}
                href={tela.caminho}
                style={estiloDoItem(caminhoAtual === tela.caminho)}
              >
                {tela.rotulo}
              </Link>
            ))}
          </div>
        </div>

        {ehAdmin && (
          <div style={estiloDoGrupo}>
            <div style={estiloDoTitulo}>Plataforma</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Link href="/admin" style={estiloDoItem(caminhoAtual === "/admin")}>
                Administração
              </Link>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line)",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {email}
          </div>
          <form action="/auth/sair" method="post">
            <button
              type="submit"
              style={{
                marginTop: 3,
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 11.5,
                color: "var(--faint)",
                cursor: "pointer",
              }}
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
