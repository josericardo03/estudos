"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { aoMudar } from "./mudancas";
import { supabaseConfigurado } from "./supabase";

export function useConsulta<T>(
  consultar: () => Promise<T>,
  deps: readonly unknown[],
  vazio: T,
): { dados: T; pronto: boolean; erro: string | null } {
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

    if (!supabaseConfigurado()) {
      const inscricao = liveQuery(() => consultar()).subscribe({
        next: aplicar,
        error: falhar,
      });
      return () => {
        ativo = false;
        inscricao.unsubscribe();
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
    const parar = aoMudar(carregar);
    return () => {
      ativo = false;
      parar();
    };
    // consultar e vazio acompanham a chave da consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return estado;
}
