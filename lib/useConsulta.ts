"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

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
    const inscricao = liveQuery(() => consultar()).subscribe({
      next(dados) {
        if (ativo) setEstado({ dados, pronto: true, erro: null });
      },
      error(erro: unknown) {
        if (!ativo) return;
        const mensagem =
          erro instanceof Error
            ? erro.message
            : "Não foi possível ler os dados deste navegador.";
        setEstado({ dados: vazio, pronto: true, erro: mensagem });
      },
    });
    return () => {
      ativo = false;
      inscricao.unsubscribe();
    };
    // consultar e vazio acompanham a chave da consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return estado;
}
