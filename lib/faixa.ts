import type { Bloco } from "./types";

export function faixasCruzam(
  inicioA: number,
  fimA: number,
  inicioB: number,
  fimB: number,
) {
  return inicioA <= fimB && inicioB <= fimA;
}

export function blocoDaPagina(blocos: Bloco[], pagina: number) {
  return (
    blocos.find(
      (bloco) => pagina >= bloco.paginaInicio && pagina <= bloco.paginaFim,
    ) ?? null
  );
}

export function conflitoDeFaixa(
  blocos: Bloco[],
  inicio: number,
  fim: number,
  ignorarId?: string,
) {
  return (
    blocos.find(
      (bloco) =>
        bloco.id !== ignorarId &&
        faixasCruzam(inicio, fim, bloco.paginaInicio, bloco.paginaFim),
    ) ?? null
  );
}

export function descreverFaixa(inicio: number, fim: number) {
  return inicio === fim ? `página ${inicio}` : `páginas ${inicio}–${fim}`;
}

export function validarFaixa(inicio: number, fim: number, numPages: number) {
  if (!Number.isInteger(inicio) || !Number.isInteger(fim)) {
    return "Use números inteiros de página.";
  }
  if (inicio < 1 || fim < 1) return "A primeira página do PDF é a 1.";
  if (fim < inicio) {
    return "A página inicial precisa ser menor ou igual à final.";
  }
  if (fim > numPages) {
    return `Este PDF tem ${numPages} ${numPages === 1 ? "página" : "páginas"}.`;
  }
  return null;
}
