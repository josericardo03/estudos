"use client";

import { useEffect, useState } from "react";
import { gravarBruto, useBruto } from "./preferencias";

export type FaseCronometro = "foco" | "pausa";

export type EstadoCronometro = {
  materiaId: string | null;
  fase: FaseCronometro;
  /** Quando a fase começou, em ms. */
  inicio: number;
  /** Duração da fase em segundos. 0 = livre, sem fim marcado. */
  duracaoS: number;
};

const CHAVE = "foco.cronometro";
/** Cronômetro livre esquecido não vira sessão de 20 horas. */
const TETO_LIVRE_S = 4 * 3600;

function ler(bruto: string | null): EstadoCronometro | null {
  if (!bruto) return null;
  try {
    const dado = JSON.parse(bruto) as Partial<EstadoCronometro>;
    if (typeof dado.inicio !== "number" || (dado.fase !== "foco" && dado.fase !== "pausa")) return null;
    return {
      materiaId: typeof dado.materiaId === "string" ? dado.materiaId : null,
      fase: dado.fase,
      inicio: dado.inicio,
      duracaoS: typeof dado.duracaoS === "number" && dado.duracaoS > 0 ? dado.duracaoS : 0,
    };
  } catch {
    return null;
  }
}

export function useCronometro() {
  return ler(useBruto(CHAVE));
}

export function iniciarCronometro(estado: Omit<EstadoCronometro, "inicio"> & { inicio?: number }) {
  const completo: EstadoCronometro = { ...estado, inicio: estado.inicio ?? Date.now() };
  gravarBruto(CHAVE, JSON.stringify(completo));
}

export function limparCronometro() {
  gravarBruto(CHAVE, null);
}

export function lerCronometro() {
  try {
    return ler(localStorage.getItem(CHAVE));
  } catch {
    return null;
  }
}

/** Segundos que a fase realmente vale, respeitando o fim marcado e o teto do cronômetro livre. */
export function segundosDaFase(estado: EstadoCronometro, agora = Date.now()) {
  const passados = Math.max(0, Math.floor((agora - estado.inicio) / 1000));
  if (estado.duracaoS > 0) return Math.min(passados, estado.duracaoS);
  return Math.min(passados, TETO_LIVRE_S);
}

export function formatarRelogio(segundos: number) {
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  const mm = String(minutos).padStart(2, "0");
  const ss = String(resto).padStart(2, "0");
  return horas > 0 ? `${horas}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Hora atual que se atualiza a cada `intervalo` ms enquanto `ativo`.
 * Vale 0 até o primeiro tique, para não ler o relógio durante a pré-renderização.
 */
export function useAgora(ativo: boolean, intervalo = 1000) {
  const [agora, setAgora] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const primeiro = setTimeout(() => setAgora(Date.now()), 0);
    const quando = setInterval(() => setAgora(Date.now()), intervalo);
    return () => {
      clearTimeout(primeiro);
      clearInterval(quando);
    };
  }, [ativo, intervalo]);
  return agora;
}
