"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentoPdf } from "@/lib/pdf";

type ItemSumario = { titulo: string; destino: unknown; nivel: number };
type Resultado = { pagina: number; trecho: string };

const MAXIMO_DE_RESULTADOS = 300;

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

type NoDoSumario = { title: string; dest: unknown; items?: NoDoSumario[] };

function achatar(nos: NoDoSumario[], nivel = 0, saida: ItemSumario[] = []) {
  for (const no of nos) {
    if (saida.length >= 400) break;
    saida.push({ titulo: no.title, destino: no.dest, nivel });
    if (no.items?.length) achatar(no.items, nivel + 1, saida);
  }
  return saida;
}

/** Busca no texto do PDF e sumário (índice do próprio arquivo, quando ele tem). */
export function PainelBusca({
  documento,
  onIrParaPagina,
  onTermo,
}: {
  documento: DocumentoPdf;
  onIrParaPagina: (pagina: number) => void;
  /** Avisa o leitor qual termo destacar na página aberta. */
  onTermo: (termo: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [buscou, setBuscou] = useState(false);
  const [sumario, setSumario] = useState<ItemSumario[] | null>(null);
  const textos = useRef(new Map<number, string>());
  const rodada = useRef(0);

  useEffect(() => {
    let ativo = true;
    textos.current = new Map();
    void documento
      .getOutline()
      .then((nos) => {
        if (ativo) setSumario(nos ? achatar(nos as NoDoSumario[]) : []);
      })
      .catch(() => {
        if (ativo) setSumario([]);
      });
    return () => {
      ativo = false;
      rodada.current += 1;
    };
  }, [documento]);

  async function textoDaPagina(numero: number) {
    const guardado = textos.current.get(numero);
    if (guardado !== undefined) return guardado;
    const pagina = await documento.getPage(numero);
    const conteudo = await pagina.getTextContent();
    pagina.cleanup();
    const texto = conteudo.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ");
    textos.current.set(numero, texto);
    return texto;
  }

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const procurado = normalizar(termo.trim());
    const minha = ++rodada.current;
    onTermo(termo.trim());
    setResultados([]);
    setBuscou(false);
    if (procurado.length < 2) {
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const achados: Resultado[] = [];
    for (let numero = 1; numero <= documento.numPages; numero += 1) {
      if (rodada.current !== minha) return;
      let texto = "";
      try {
        texto = await textoDaPagina(numero);
      } catch {
        continue;
      }
      const normalizado = normalizar(texto);
      let posicao = normalizado.indexOf(procurado);
      let naPagina = 0;
      while (posicao !== -1 && naPagina < 3 && achados.length < MAXIMO_DE_RESULTADOS) {
        const inicio = Math.max(0, posicao - 40);
        const fim = Math.min(texto.length, posicao + procurado.length + 60);
        achados.push({
          pagina: numero,
          trecho: `${inicio > 0 ? "…" : ""}${texto.slice(inicio, fim)}${fim < texto.length ? "…" : ""}`,
        });
        naPagina += 1;
        posicao = normalizado.indexOf(procurado, posicao + procurado.length);
      }
      if (numero % 5 === 0 || numero === documento.numPages) {
        setResultados(achados.slice());
        setProgresso(numero);
      }
      if (achados.length >= MAXIMO_DE_RESULTADOS) break;
    }
    if (rodada.current !== minha) return;
    setResultados(achados.slice());
    setBuscando(false);
    setBuscou(true);
  }

  async function irParaItem(item: ItemSumario) {
    try {
      const destino = typeof item.destino === "string" ? await documento.getDestination(item.destino) : item.destino;
      if (!Array.isArray(destino)) return;
      const referencia = destino[0];
      const indice = typeof referencia === "object" && referencia !== null ? await documento.getPageIndex(referencia) : Number(referencia);
      if (Number.isInteger(indice)) onIrParaPagina(indice + 1);
    } catch {
      /* destino que o PDF não resolve: nada a fazer */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <section className="cartao shrink-0 p-4">
        <h2 className="font-serif text-2xl">Buscar no PDF</h2>
        <form onSubmit={buscar} className="mt-3 flex gap-2" role="search">
          <label className="sr-only" htmlFor="busca-pdf">
            Texto a buscar
          </label>
          <input
            id="busca-pdf"
            className="campo"
            type="search"
            autoFocus
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value);
              if (!evento.target.value.trim()) {
                onTermo("");
                setResultados([]);
                setBuscou(false);
              }
            }}
            placeholder="Palavra ou frase"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primario" disabled={buscando}>
            Buscar
          </button>
        </form>
        {buscando ? (
          <p className="mt-2 text-sm text-muted" role="status">
            Procurando… página {progresso} de {documento.numPages}
          </p>
        ) : null}
        {buscou && resultados.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nada encontrado. Se o PDF é um escaneado, ele não tem texto para buscar.</p>
        ) : null}
        {resultados.length > 0 ? (
          <>
            <p className="mt-3 text-sm text-muted">
              {resultados.length}
              {resultados.length >= MAXIMO_DE_RESULTADOS ? "+" : ""} {resultados.length === 1 ? "resultado" : "resultados"}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {resultados.map((resultado, indice) => (
                <li key={`${resultado.pagina}-${indice}`}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-[var(--campo-bg)] px-3 py-2 text-left"
                    onClick={() => onIrParaPagina(resultado.pagina)}
                  >
                    <span className="text-xs tracking-wider text-pine">PÁGINA {resultado.pagina}</span>
                    <span className="mt-1 block text-sm">{resultado.trecho}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="cartao p-4">
        <h2 className="font-serif text-2xl">Sumário</h2>
        {sumario === null ? (
          <p className="mt-2 text-sm text-muted">Lendo o índice do arquivo…</p>
        ) : sumario.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Este PDF não traz um índice. Use a busca para achar um assunto.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {sumario.map((item, indice) => (
              <li key={indice}>
                <button
                  type="button"
                  className="w-full rounded-lg py-1.5 pr-2 text-left text-sm hover:bg-[var(--campo-bg)]"
                  style={{ paddingLeft: `${0.5 + item.nivel * 0.9}rem` }}
                  onClick={() => void irParaItem(item)}
                >
                  {item.titulo}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
