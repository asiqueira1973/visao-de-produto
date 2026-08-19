/**
 * Configuração do ESLint para o monorepo.
 *
 * O que faz: aplica as regras recomendadas de JavaScript e de TypeScript em
 *            todos os pacotes, mais as do Next no site.
 * Implementa: o item "`pnpm typecheck` e `pnpm lint` sem erro" do Definition of
 *             Done (seção 23).
 *
 * O script de lint do site era `next lint`, comando que o Next 16 removeu — ele
 * falhava desde sempre e ninguém tinha rodado. Aqui o ESLint é chamado direto.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

const configuracao = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/*.d.ts",
      "supabase/functions/**", // roda em Deno, com outro conjunto de globais
      // As telas geradas no Claude Design são referência de layout, não código
      // deste produto: elas prevalecem em desenho (regra 4.4) e não são mantidas.
      "visao de produto-telas claude design/**",
      // O export do Claude Design do site institucional: o support.js é arnês
      // gerado pelo editor, e o que vai para o ar é a pasta `publico`, que é
      // HTML estático sem script de terceiro.
      "site-visao-de-produto/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    rules: {
      // Regra do Pages Router, que este projeto não usa: o site é App Router
      // inteiro. Sem desligar, o ESLint avisa que não achou a pasta `pages`.
      "@next/next/no-html-link-for-pages": "off",
      // O código é em inglês e os tipos que espelham o banco ficam em
      // português: a regra de nomenclatura não se aplica aqui.
      "@typescript-eslint/no-explicit-any": "error",
      // `void x` é o jeito deliberado de dizer "descartei este retorno".
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default configuracao;
