"use client";

import { useEffect, useRef } from "react";
import {
  iniciarCronometro,
  lerCronometro,
  limparCronometro,
  useAgora,
  useCronometro,
} from "@/lib/cronometro";
import { repo } from "@/lib/repo";

function avisar(texto: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Foco", { body: texto, icon: "/icon-192.png" });
    }
  } catch {
    /* notificação indisponível */
  }
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* sem vibração */
  }
}

/**
 * Fecha a fase do cronômetro quando o tempo acaba, em qualquer tela.
 * Fim do foco: grava a sessão e abre a pausa. Fim da pausa: limpa.
 */
export function AutoCronometro() {
  const estado = useCronometro();
  const agora = useAgora(Boolean(estado?.duracaoS));
  const fechada = useRef<number | null>(null);

  useEffect(() => {
    if (!estado || estado.duracaoS <= 0 || agora === 0) return;
    const fim = estado.inicio + estado.duracaoS * 1000;
    if (agora < fim || fechada.current === estado.inicio) return;
    fechada.current = estado.inicio;

    if (estado.fase === "pausa") {
      limparCronometro();
      avisar("A pausa acabou. Hora de voltar.");
      return;
    }

    void (async () => {
      const atual = lerCronometro();
      if (!atual || atual.inicio !== estado.inicio) return;
      try {
        await repo.estudos.registrar({ materiaId: estado.materiaId, segundos: estado.duracaoS, em: estado.inicio });
      } catch {
        /* a sessão não foi gravada; a pausa segue mesmo assim */
      }
      const pausaS = Math.round(estado.duracaoS / 5);
      if (pausaS > 0 && Date.now() < fim + pausaS * 1000) {
        iniciarCronometro({ materiaId: estado.materiaId, fase: "pausa", duracaoS: pausaS, inicio: fim });
        avisar("Sessão registrada. Faça uma pausa.");
      } else {
        limparCronometro();
        avisar("Sessão registrada.");
      }
    })();
  }, [estado, agora]);

  return null;
}
