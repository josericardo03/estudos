"use client";

import { gravarBruto, useBruto } from "./preferencias";

export const CHAVE_ULTIMA_COPIA = "foco.ultimaCopia";
/** Depois de tanto tempo sem exportar, o app lembra. */
export const DIAS_PARA_LEMBRAR = 30;

export function registrarCopia() {
  gravarBruto(CHAVE_ULTIMA_COPIA, String(Date.now()));
}

/** Quando foi a última cópia feita neste aparelho, ou null se nunca. */
export function useUltimaCopia() {
  const bruto = useBruto(CHAVE_ULTIMA_COPIA);
  const valor = bruto ? Number(bruto) : NaN;
  return Number.isFinite(valor) ? valor : null;
}
