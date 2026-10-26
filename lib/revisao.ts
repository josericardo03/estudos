import type { Questao, StatusRevisao } from "./types";

const PESO: Record<StatusRevisao, number> = {
  revisar: 0,
  nova: 1,
  dominada: 2,
};

export function compararRevisao(a: Questao, b: Questao) {
  const peso = PESO[a.statusRevisao] - PESO[b.statusRevisao];
  if (peso !== 0) return peso;
  return a.createdAt - b.createdAt;
}
