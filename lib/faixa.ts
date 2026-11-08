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
