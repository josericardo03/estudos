import { chaveDia, somarDias } from "./datas";
import type { Estudo } from "./types";

/** A partir de 10 minutos o dia conta como dia de estudo na sequência. */
export const SEGUNDOS_DIA_VALIDO = 10 * 60;

export type DiaDeEstudo = { chave: string; inicio: number; segundos: number };

export function resumirEstudo(estudos: Estudo[], agora = Date.now(), dias = 28) {
  const totais = new Map<string, number>();
  for (const estudo of estudos) {
    const chave = chaveDia(estudo.em);
    totais.set(chave, (totais.get(chave) ?? 0) + estudo.segundos);
  }

  const grade: DiaDeEstudo[] = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const inicio = somarDias(agora, -i);
    const chave = chaveDia(inicio);
    grade.push({ chave, inicio, segundos: totais.get(chave) ?? 0 });
  }

  const hoje = totais.get(chaveDia(agora)) ?? 0;
  let semana = 0;
  const porMateriaSemana = new Map<string, number>();
  const limiteSemana = somarDias(agora, -6);
  for (const estudo of estudos) {
    if (estudo.em >= limiteSemana) {
      semana += estudo.segundos;
      const chave = estudo.materiaId ?? "";
      porMateriaSemana.set(chave, (porMateriaSemana.get(chave) ?? 0) + estudo.segundos);
    }
  }

  // A sequência segue viva se hoje ainda não bateu o mínimo, desde que ontem tenha batido.
  let sequencia = 0;
  let recuo = hoje >= SEGUNDOS_DIA_VALIDO ? 0 : 1;
  while ((totais.get(chaveDia(somarDias(agora, -recuo))) ?? 0) >= SEGUNDOS_DIA_VALIDO) {
    sequencia += 1;
    recuo += 1;
  }

  return { grade, hoje, semana, sequencia, porMateriaSemana };
}
