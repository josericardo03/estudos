"use client";

import { useEffect } from "react";
import { pedirArmazenamentoPersistente } from "@/lib/armazenamento";
import { useAvisoDeRevisoes } from "@/lib/avisoRevisoes";
import { supabaseConfigurado } from "@/lib/supabase";
import { useAplicarTema } from "@/lib/tema";

/** Tarefas de arranque que não desenham nada: tema, armazenamento persistente e cache offline. */
export function Inicializador() {
  useAplicarTema();
  useAvisoDeRevisoes();

  useEffect(() => {
    if (!supabaseConfigurado()) void pedirArmazenamentoPersistente();
  }, []);

  // Uma vez por semana, com o app parado há alguns segundos, guarda uma cópia dos dados neste aparelho.
  useEffect(() => {
    if (!supabaseConfigurado()) return;
    const espera = window.setTimeout(() => {
      void import("@/lib/copiaAutomatica").then(({ copiarSeNecessario }) => copiarSeNecessario().catch(() => {}));
    }, 30_000);
    return () => window.clearTimeout(espera);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* sem service worker o app continua funcionando, só não abre offline */
    });
  }, []);

  return null;
}
