"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePreferencia } from "./preferencias";

export type EscolhaDeTema = "auto" | "claro" | "sepia" | "escuro";
export type Tema = "claro" | "sepia" | "escuro";

export const CHAVE_TEMA = "foco.tema";

export const TEMAS: { id: EscolhaDeTema; nome: string }[] = [
  { id: "auto", nome: "Automático" },
  { id: "claro", nome: "Claro" },
  { id: "sepia", nome: "Sépia" },
  { id: "escuro", nome: "Escuro" },
];

function resolver(escolha: EscolhaDeTema): Tema {
  if (escolha !== "auto") return escolha;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** Aplica o tema escolhido no <html>. Fica montado no layout. */
export function useAplicarTema() {
  const [escolha] = usePreferencia<EscolhaDeTema>(CHAVE_TEMA, "auto");
  useEffect(() => {
    const aplicar = () => {
      document.documentElement.dataset.tema = resolver(escolha);
    };
    aplicar();
    if (escolha !== "auto") return;
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, [escolha]);
}

/** Tema que está valendo agora (já resolvido). */
export function useTema(): Tema {
  return useSyncExternalStore(
    (avisar) => {
      const observador = new MutationObserver(avisar);
      observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
      return () => observador.disconnect();
    },
    () => (document.documentElement.dataset.tema as Tema | undefined) ?? "claro",
    () => "claro",
  );
}

/** Script que roda antes da hidratação e evita o clarão do tema claro. */
export const SCRIPT_TEMA = `(function(){try{var e=localStorage.getItem("${CHAVE_TEMA}")||"auto";var t=e==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro"):e;document.documentElement.dataset.tema=t}catch(_){}})()`;
