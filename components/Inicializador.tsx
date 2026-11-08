"use client";

import { useEffect } from "react";
import { pedirArmazenamentoPersistente } from "@/lib/backup";
import { supabaseConfigurado } from "@/lib/supabase";
import { useAplicarTema } from "@/lib/tema";

/** Tarefas de arranque que não desenham nada: tema, armazenamento persistente e cache offline. */
export function Inicializador() {
  useAplicarTema();

  useEffect(() => {
    if (!supabaseConfigurado()) void pedirArmazenamentoPersistente();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* sem service worker o app continua funcionando, só não abre offline */
    });
  }, []);

  return null;
}
