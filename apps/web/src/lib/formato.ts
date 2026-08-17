/**
 * Formatação de data e hora para a tela.
 *
 * O que faz: converte os instantes que vêm do banco em UTC para o fuso de
 *            exibição do projeto, e escreve horário relativo em português.
 * Implementa: regra 11.7 — o banco guarda tudo em UTC e a conversão acontece
 *             na apresentação, nunca no banco.
 */

/**
 * Escreve há quanto tempo algo aconteceu.
 * Recebe o instante em ISO e, opcionalmente, o "agora" (para teste).
 * Devolve texto como "há 21 minutos" ou "agora".
 */
export function horarioRelativo(iso: string, agora = new Date()): string {
  const segundos = Math.round((agora.getTime() - new Date(iso).getTime()) / 1000);

  if (segundos < 45) return "agora";
  if (segundos < 90) return "há 1 minuto";

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} minutos`;

  const horas = Math.round(minutos / 60);
  if (horas === 1) return "há 1 hora";
  if (horas < 24) return `há ${horas} horas`;

  const dias = Math.round(horas / 24);
  if (dias === 1) return "há 1 dia";
  if (dias < 30) return `há ${dias} dias`;

  const meses = Math.round(dias / 30);
  if (meses === 1) return "há 1 mês";
  if (meses < 12) return `há ${meses} meses`;

  const anos = Math.round(meses / 12);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}

/**
 * Devolve o dia do evento no fuso do projeto, no formato AAAA-MM-DD.
 * É o que agrupa os eventos sob o separador de data (critério do épico 8.4):
 * um evento à meia-noite em São Paulo precisa cair no dia certo, e não no dia
 * seguinte por causa do UTC.
 */
export function diaNoFuso(iso: string, fuso: string): string {
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatador.format(new Date(iso));
}

/**
 * Escreve o rótulo do separador de data.
 * Recebe o instante, o fuso do projeto e o "agora".
 * Devolve "Hoje · 17 de agosto", "Ontem · 16 de agosto" ou "12 de julho".
 */
export function rotuloDoDia(iso: string, fuso: string, agora = new Date()): string {
  const dia = diaNoFuso(iso, fuso);
  const hoje = diaNoFuso(agora.toISOString(), fuso);
  const ontem = diaNoFuso(new Date(agora.getTime() - 86_400_000).toISOString(), fuso);

  const porExtenso = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

  if (dia === hoje) return `Hoje · ${porExtenso}`;
  if (dia === ontem) return `Ontem · ${porExtenso}`;
  return porExtenso;
}

/**
 * Escreve data e hora completas no fuso do projeto, com o deslocamento.
 * Usado no detalhe do evento, onde a hora exata importa.
 */
export function dataHoraCompleta(iso: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(iso));
  return partes;
}

/** Escreve a data curta ("12 de julho") no fuso do projeto. */
export function dataCurta(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}
