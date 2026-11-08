"use client";

import { useCallback, useSyncExternalStore } from "react";

const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvir of [...ouvintes]) ouvir();
}

export function lerBruto(chave: string) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarBruto(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    /* modo privado ou sem espaço: a preferência vale só nesta aba */
  }
  avisar();
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  const aoArmazenar = (evento: StorageEvent) => {
    if (evento.storageArea === localStorage) ouvir();
  };
  window.addEventListener("storage", aoArmazenar);
  return () => {
    ouvintes.delete(ouvir);
    window.removeEventListener("storage", aoArmazenar);
  };
}

/** Valor bruto de uma chave do localStorage, que acompanha mudanças nesta e em outras abas. */
export function useBruto(chave: string) {
  return useSyncExternalStore(
    assinar,
    () => lerBruto(chave),
    () => null,
  );
}

export function usePreferencia<T extends string | number>(chave: string, padrao: T): [T, (valor: T) => void] {
  const bruto = useBruto(chave);
  let valor = padrao;
  if (bruto !== null) {
    if (typeof padrao === "number") {
      const numero = Number(bruto);
      if (Number.isFinite(numero)) valor = numero as T;
    } else {
      valor = bruto as T;
    }
  }
  const definir = useCallback((novo: T) => gravarBruto(chave, String(novo)), [chave]);
  return [valor, definir];
}
