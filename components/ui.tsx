"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CorGrifo } from "@/lib/types";
import { nomeDaCor } from "@/lib/types";

export function Abrindo({ texto }: { texto: string }) {
  return <p className="px-5 py-10 text-muted">{texto}</p>;
}

export function Aviso({ texto }: { texto: string }) {
  return (
    <p className="aviso" role="alert">
      {texto}
    </p>
  );
}

export function Rotulo({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="rotulo" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function NaoEncontrado({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <p className="olho">Foco</p>
      <h1 className="mt-2 font-serif text-4xl">{titulo}</h1>
      <p className="mt-3 text-muted">{detalhe}</p>
      <Link href="/" className="btn mt-6">
        Voltar às matérias
      </Link>
    </div>
  );
}

export function MarcaPrioridade({ cor }: { cor: CorGrifo }) {
  return (
    <span className={`marca marca-${cor}`}>
      <span className={`quadrado quadrado-${cor}`} aria-hidden />
      {nomeDaCor(cor)}
    </span>
  );
}

export function RecorteGrifo({ imagem, texto }: { imagem: Blob; texto: string }) {
  const imagemRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const elemento = imagemRef.current;
    if (!elemento) return;
    const endereco = URL.createObjectURL(imagem);
    elemento.src = endereco;
    return () => URL.revokeObjectURL(endereco);
  }, [imagem]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imagemRef} className="recorte-grifo" alt={texto} />;
}

export function Confirmar({
  rotulo,
  confirmar,
  onConfirmar,
  className,
}: {
  rotulo: string;
  confirmar: string;
  onConfirmar: () => void | Promise<void>;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button type="button" className={className ?? "btn btn-perigo"} onClick={() => setAberto(true)}>
        {rotulo}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-primario"
        onClick={() => {
          void Promise.resolve(onConfirmar()).finally(() => setAberto(false));
        }}
      >
        {confirmar}
      </button>
      <button type="button" className="btn" onClick={() => setAberto(false)}>
        Cancelar
      </button>
    </span>
  );
}
