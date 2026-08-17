/**
 * Faixa de aviso de conta cancelada.
 *
 * O que faz: aparece no topo de todas as telas autenticadas enquanto a conta
 *            estiver marcada para exclusão, dizendo quantos dias faltam.
 * Recebe:    a data de cancelamento.
 * Devolve:   a faixa, ou nada quando a conta está ativa.
 * Implementa: regra 11.17 — os 30 dias são para a pessoa poder mudar de ideia,
 *             e mudar de ideia só é possível se ela lembrar que pediu.
 */

import Link from "next/link";

/** Dias de graça da regra 11.17. */
const DIAS_DE_GRACA = 30;

export function AvisoDeCancelamento({ canceladaEm }: { canceladaEm: string | null }) {
  if (!canceladaEm) return null;

  const dias = Math.max(
    0,
    Math.ceil(DIAS_DE_GRACA - (Date.now() - new Date(canceladaEm).getTime()) / 86_400_000),
  );

  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "9px 32px",
        borderBottom: "1px solid var(--errLine)",
        background: "var(--errSoft)",
        fontSize: 12.5,
        color: "var(--err)",
      }}
    >
      <span>
        Esta conta será apagada em definitivo em {dias} {dias === 1 ? "dia" : "dias"}.
      </span>
      <Link href="/conta/perfil" style={{ color: "var(--err)", textDecoration: "underline" }}>
        Desfazer ou exportar
      </Link>
    </div>
  );
}
