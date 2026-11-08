"use client";

import { useEffect, useState } from "react";
import { aoMudar } from "./mudancas";

// Resolvida no build (veja repo.ts): na nuvem o Dexie nem chega ao navegador.
const NA_NUVEM = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? true
    : false
  : false;

type Opcoes = {
  /**
   * Enquanto verdadeiro, a tela não relê os dados a cada gravação. Serve para telas em que
   * o usuário é quem está gravando (a sessão de revisão), onde reler tudo depois de cada nota
   * só gasta rede. Ao voltar a falso, a tela relê uma vez.
   */
  pausado?: boolean;
};

export function useConsulta<T>(
  consultar: () => Promise<T>,
  deps: readonly unknown[],
  vazio: T,
  opcoes: Opcoes = {},
): { dados: T; pronto: boolean; erro: string | null } {
  const pausado = Boolean(opcoes.pausado);
  const [estado, setEstado] = useState<{
    dados: T;
    pronto: boolean;
    erro: string | null;
  }>({
    dados: vazio,
    pronto: false,
    erro: null,
  });

  useEffect(() => {
    let ativo = true;
    let pedido = 0;

    const aplicar = (dados: T) => {
      if (ativo) setEstado({ dados, pronto: true, erro: null });
    };
    const falhar = (erro: unknown) => {
      if (!ativo) return;
      const mensagem = erro instanceof Error ? erro.message : "Não foi possível ler os dados.";
      setEstado({ dados: vazio, pronto: true, erro: mensagem });
    };

    if (!NA_NUVEM) {
      let inscricao: { unsubscribe: () => void } | null = null;
      // O Dexie só é carregado no modo local.
      void import("dexie").then(({ liveQuery }) => {
        if (!ativo) return;
        if (pausado) {
          // Pausado: lê uma vez e não acompanha as gravações.
          void consultar().then(aplicar, falhar);
          return;
        }
        inscricao = liveQuery(() => consultar()).subscribe({ next: aplicar, error: falhar });
      });
      return () => {
        ativo = false;
        inscricao?.unsubscribe();
      };
    }

    const carregar = () => {
      const atual = ++pedido;
      consultar().then(
        (dados) => {
          if (ativo && atual === pedido) aplicar(dados);
        },
        (erro: unknown) => {
          if (ativo && atual === pedido) falhar(erro);
        },
      );
    };
    carregar();
    const parar = pausado ? () => {} : aoMudar(carregar);
    return () => {
      ativo = false;
      parar();
    };
    // consultar e vazio acompanham a chave da consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pausado]);

  return estado;
}
