import type { NextConfig } from "next";

/**
 * Configuração do site.
 * Nada de exótico: o produto é uma aplicação App Router comum, e a
 * simplicidade aqui é deliberada (princípio 0.4).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O site nunca embute a service_role key: ela só existe em rota de servidor
  // (seção 17.3). Deixar isto explícito evita que alguém a exponha por engano.
  env: {},
};

export default nextConfig;
