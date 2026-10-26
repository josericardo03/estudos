import type { Rect } from "./types";

type Caixa = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function normalizarRects(pagina: Caixa, clientRects: Caixa[]): Rect[] {
  if (pagina.width <= 0 || pagina.height <= 0) return [];

  const brutos = clientRects
    .map((caixa) => ({
      x: (caixa.left - pagina.left) / pagina.width,
      y: (caixa.top - pagina.top) / pagina.height,
      w: caixa.width / pagina.width,
      h: caixa.height / pagina.height,
    }))
    .filter((rect) => rect.w > 0.004 && rect.h > 0.004)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const linhas: Rect[] = [];
  for (const rect of brutos) {
    const ultimo = linhas[linhas.length - 1];
    if (ultimo && Math.abs(ultimo.y - rect.y) < 0.006) {
      const direita = Math.max(ultimo.x + ultimo.w, rect.x + rect.w);
      ultimo.x = Math.min(ultimo.x, rect.x);
      ultimo.w = direita - ultimo.x;
      ultimo.y = Math.min(ultimo.y, rect.y);
      ultimo.h = Math.max(ultimo.h, rect.h);
    } else {
      linhas.push({ ...rect });
    }
  }
  return linhas;
}
