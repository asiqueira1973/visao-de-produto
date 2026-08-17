/**
 * Layout raiz do site.
 *
 * O que faz: carrega as duas fontes da seção 13 — Inter para a interface e
 *            JetBrains Mono para nome de evento, chave e JSON — e os tokens de
 *            cor da seção 13.2.
 * Implementa: seções 13 e 14 (interface em português do Brasil).
 */

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fonte-interface",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fonte-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Visão de Produto",
  description: "Painel de uso dos aplicativos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.variable} ${jetbrains.variable}`}
        style={{ fontFamily: "var(--fonte-interface), system-ui, sans-serif", margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
