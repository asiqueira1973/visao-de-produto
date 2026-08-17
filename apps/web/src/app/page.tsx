/**
 * Raiz do site.
 * O que faz: manda quem chega para a lista de projetos. Quem não tem sessão é
 *            desviado para o login pelo middleware.
 */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/projetos");
}
