"use client";

/**
 * Botão de atualizar os dados da tela.
 *
 * O que faz: refaz a busca no servidor sem recarregar a página.
 * Recebe:    nada.
 * Devolve:   o botão, com estado de espera enquanto os dados não voltam.
 * Implementa: nada do spec — é uma falta que apareceu no uso. Sem ele, ver se
 *             chegou evento novo exigia sair da tela e voltar, e clicar duas
 *             vezes no menu para reler a mesma tela não é um gesto que alguém
 *             descubra sozinho.
 *
 * `router.refresh()` refaz as consultas dos componentes de servidor e mantém o
 * estado do que é cliente — o filtro escolhido, o período, a rolagem. É por isso
 * que ele é melhor do que `location.reload()` aqui: recarregar a página inteira
 * jogaria fora o recorte que a pessoa montou, que é justamente o que ela quer
 * manter enquanto observa a chegada dos eventos.
 *
 * A Atividade se encaixa nisso sem código extra: a lista já reinicia sozinha
 * quando o servidor manda uma primeira página nova, então atualizar não deixa
 * páginas velhas empilhadas embaixo das novas.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function BotaoDeAtualizar() {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();

  return (
    <button
      onClick={() => iniciarTransicao(() => router.refresh())}
      disabled={pendente}
      aria-label="Atualizar os dados desta tela"
      style={{
        height: 30,
        padding: "0 11px",
        borderRadius: 7,
        border: "1px solid var(--line2)",
        background: "var(--elev)",
        fontSize: 12.5,
        color: pendente ? "var(--faint)" : "var(--text)",
        cursor: pendente ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {/* A seta gira enquanto espera: sem sinal nenhum, quem clica e vê os
          mesmos números não sabe se atualizou e não mudou nada, ou se travou. */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
        className={pendente ? "girando" : undefined}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {pendente ? "Atualizando…" : "Atualizar"}
    </button>
  );
}
