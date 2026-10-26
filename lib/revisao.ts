import type { Questao, StatusRevisao } from "./types";

const PESO: Record<StatusRevisao, number> = {
  revisar: 0,
  nova: 1,
  dominada: 2,
};

const DIA = 86_400_000;
/** Cada acerto seguido empurra a questão mais para a frente. */
const DIAS_POR_ACERTO = [1, 3, 7, 14, 30];

export function compararRevisao(a: Questao, b: Questao) {
  const peso = PESO[a.statusRevisao] - PESO[b.statusRevisao];
  if (peso !== 0) return peso;
  return a.createdAt - b.createdAt;
}

export function estaDevida(questao: Questao, agora = Date.now()) {
  return (questao.proximaEm ?? 0) <= agora;
}

export function separarSimulado<T extends Questao>(questoes: T[], agora = Date.now()) {
  const entram: T[] = [];
  const esperando: T[] = [];
  for (const questao of questoes) {
    if (estaDevida(questao, agora)) entram.push(questao);
    else esperando.push(questao);
  }
  return { entram, esperando };
}

export function aplicarJulgamento(questao: Questao, acertou: boolean, agora = Date.now()) {
  if (!acertou) {
    return {
      sequencia: 0,
      proximaEm: agora,
      statusRevisao: "revisar" as const,
    };
  }
  const sequencia = (questao.sequencia ?? 0) + 1;
  const dias = DIAS_POR_ACERTO[Math.min(sequencia, DIAS_POR_ACERTO.length) - 1];
  return {
    sequencia,
    proximaEm: agora + dias * DIA,
    statusRevisao: (sequencia >= DIAS_POR_ACERTO.length ? "dominada" : "nova") as StatusRevisao,
  };
}

export function descreverVolta(proximaEm: number, agora = Date.now()) {
  if (proximaEm <= agora) return "Continua no banco";
  const dias = Math.max(1, Math.round((proximaEm - agora) / DIA));
  if (dias <= 1) return "Volta amanhã";
  return `Volta em ${dias} dias`;
}

export function proximaData(questoes: Questao[], agora = Date.now()) {
  const futuras = questoes
    .map((questao) => questao.proximaEm ?? 0)
    .filter((quando) => quando > agora);
  if (!futuras.length) return null;
  return Math.min(...futuras);
}
