import { diasEntre } from "./datas";
import type { Edital, EditalMateria, EditalTopico } from "./types";

export function diasAteProva(dataProva: number | null | undefined, agora = Date.now()) {
  if (!dataProva) return null;
  return diasEntre(agora, dataProva);
}

export function descreverProva(dataProva: number | null | undefined, agora = Date.now()) {
  const dias = diasAteProva(dataProva, agora);
  if (dias === null) return null;
  if (dias < 0) return "A prova já passou";
  if (dias === 0) return "A prova é hoje";
  if (dias === 1) return "A prova é amanhã";
  if (dias < 14) return `Faltam ${dias} dias`;
  const semanas = Math.round(dias / 7);
  return `Faltam ${dias} dias (${semanas} semanas)`;
}

export type Cobertura = {
  total: number;
  cobertos: number;
  pesoTotal: number;
  pesoCoberto: number;
  /** 0 a 1, ponderado pelo peso dos tópicos. */
  fracao: number | null;
};

/** Cobertura do edital: os tópicos que você marcou como estudados, pelo peso. */
export function coberturaDe(topicos: EditalTopico[]): Cobertura {
  let cobertos = 0;
  let pesoTotal = 0;
  let pesoCoberto = 0;
  for (const topico of topicos) {
    pesoTotal += topico.peso;
    if (topico.feito) {
      cobertos += 1;
      pesoCoberto += topico.peso;
    }
  }
  return {
    total: topicos.length,
    cobertos,
    pesoTotal,
    pesoCoberto,
    fracao: pesoTotal > 0 ? pesoCoberto / pesoTotal : null,
  };
}

/** Para cada matéria, quantos dias faltam para a prova mais próxima entre os editais dela. */
export function diasAteProvaPorMateria(editais: Edital[], vinculos: EditalMateria[], agora = Date.now()) {
  const dataDoEdital = new Map(editais.map((edital) => [edital.id, edital.dataProva ?? null]));
  const resultado = new Map<string, number>();
  for (const vinculo of vinculos) {
    const dias = diasAteProva(dataDoEdital.get(vinculo.editalId), agora);
    if (dias === null || dias < 0) continue;
    const atual = resultado.get(vinculo.materiaId);
    if (atual === undefined || dias < atual) resultado.set(vinculo.materiaId, dias);
  }
  return resultado;
}

export type Ritmo = {
  /** Tópicos ainda não marcados como estudados. */
  pendentes: number;
  /** Dias até a prova. */
  dias: number;
  /** Dias reservados para a revisão final, sem matéria nova. */
  reserva: number;
  /** Dias para estudar tópicos novos. */
  diasDeEstudo: number;
  /** Quantos tópicos por semana para terminar a tempo. */
  porSemana: number;
  /** O ritmo passa de um tópico por dia: dificilmente se cumpre. */
  apertado: boolean;
};

/**
 * Quanto falta e em que ritmo estudar para cobrir o edital antes da prova.
 * Reserva os últimos dias (até 14, no máximo um quarto do tempo) para a revisão final.
 */
export function ritmoParaProva(topicos: Pick<EditalTopico, "feito">[], dataProva: number | null | undefined, agora = Date.now()): Ritmo | null {
  const dias = diasAteProva(dataProva, agora);
  if (dias === null || dias < 0) return null;
  const pendentes = topicos.filter((topico) => !topico.feito).length;
  const reserva = Math.min(14, Math.floor(dias / 4));
  const diasDeEstudo = Math.max(1, dias - reserva);
  const porSemana = pendentes / (diasDeEstudo / 7);
  return { pendentes, dias, reserva, diasDeEstudo, porSemana, apertado: pendentes / diasDeEstudo > 1 };
}
