"use client";

import { useEffect } from "react";
import { lerBruto } from "./preferencias";
import { repo } from "./repo";
import { LIMITE_NOVOS_PADRAO, LIMITE_REVISOES_PADRAO } from "./revisao";

const A_CADA = 10 * 60_000;
const PREFIXO = /^\(\d+\) /;

function limiteDoDia() {
  const novos = Number(lerBruto("foco.limiteNovos") ?? LIMITE_NOVOS_PADRAO);
  const revisoes = Number(lerBruto("foco.limiteRevisoes") ?? LIMITE_REVISOES_PADRAO);
  const soma = (Number.isFinite(novos) ? novos : LIMITE_NOVOS_PADRAO) + (Number.isFinite(revisoes) ? revisoes : LIMITE_REVISOES_PADRAO);
  return Math.max(1, soma);
}

/** Põe o número de revisões do dia no título da aba e, no app instalado, no ícone. */
export function aplicarAviso(quantidade: number) {
  const titulo = document.title.replace(PREFIXO, "");
  const novo = quantidade > 0 ? `(${quantidade}) ${titulo}` : titulo;
  if (document.title !== novo) document.title = novo;
  const navegador = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (quantidade > 0) void navegador.setAppBadge?.(quantidade)?.catch(() => {});
    else void navegador.clearAppBadge?.()?.catch(() => {});
  } catch {
    /* o ícone com número não existe neste navegador */
  }
}

/**
 * Mantém o aviso de revisões em dia: lê só a contagem (sem baixar cards), a cada dez minutos,
 * e ao voltar para a aba. Quando o Next troca o título ao mudar de página, o número volta.
 * Respeita o limite diário, para o número ser o que você realmente vai revisar hoje.
 */
export function useAvisoDeRevisoes() {
  useEffect(() => {
    let ativo = true;
    let ultimo = 0;
    const atualizar = async () => {
      try {
        const vencidas = await repo.questoes.contarVencidas();
        if (!ativo) return;
        ultimo = Math.min(vencidas, limiteDoDia());
        aplicarAviso(ultimo);
      } catch {
        /* sem rede ou sem login: o aviso só não aparece */
      }
    };
    void atualizar();
    const intervalo = window.setInterval(() => {
      if (!document.hidden) void atualizar();
    }, A_CADA);
    const aoVoltar = () => {
      if (!document.hidden) void atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const titulo = document.querySelector("title");
    const observador = new MutationObserver(() => {
      if (ultimo > 0 && !PREFIXO.test(document.title)) aplicarAviso(ultimo);
    });
    if (titulo) observador.observe(titulo, { childList: true, characterData: true, subtree: true });
    return () => {
      ativo = false;
      observador.disconnect();
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
}
