/**
 * Quantos dias faltam até o expurgo de uma conta cancelada.
 *
 * O que faz: converte a data de cancelamento no número de dias que ainda
 *            restam dentro da carência da regra 11.17.
 * Recebe:    a data de cancelamento, ou nulo quando a conta está ativa.
 * Devolve:   os dias restantes, nunca negativos.
 * Implementa: regra 11.17 — 30 dias, reversíveis pelo próprio usuário.
 *
 * Mora fora dos componentes porque a conta precisa acontecer **no servidor**:
 * calcular com `Date.now()` durante o render de um componente de cliente faz o
 * servidor e o navegador discordarem quando o dia vira entre um e outro.
 */

/** Dias que a regra 11.17 dá antes do expurgo definitivo. */
export const DIAS_DE_GRACA = 30;

export function diasAteOExpurgo(canceladaEm: string | null): number {
  if (!canceladaEm) return DIAS_DE_GRACA;

  const decorridos = (Date.now() - new Date(canceladaEm).getTime()) / 86_400_000;
  // Arredonda para cima: dizer "faltam 0 dias" num dia em que ainda dá para
  // desfazer seria mentira.
  return Math.max(0, Math.ceil(DIAS_DE_GRACA - decorridos));
}
