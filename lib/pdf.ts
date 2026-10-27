const UNIDADES_CSS = 96 / 72;

let carregado: Promise<typeof import("pdfjs-dist")> | null = null;

export function carregarPdfjs() {
  if (!carregado) {
    carregado = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return carregado;
}

export async function abrirDocumento(dados: ArrayBuffer) {
  const pdfjs = await carregarPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;
}

export type DocumentoPdf = Awaited<ReturnType<typeof abrirDocumento>>;

export function escalaCss(escala: number) {
  return escala * UNIDADES_CSS;
}

function fracaoAproximada(valor: number): [number, number] {
  if (Math.floor(valor) === valor) return [valor, 1];
  const inverso = 1 / valor;
  const limite = 8;
  if (inverso > limite) return [1, limite];
  if (Math.floor(inverso) === inverso) return [1, inverso];
  const alvo = valor > 1 ? inverso : valor;
  let a = 0;
  let b = 1;
  let c = 1;
  let d = 1;
  while (true) {
    const numerador = a + c;
    const denominador = b + d;
    if (denominador > limite) break;
    if (alvo <= numerador / denominador) {
      c = numerador;
      d = denominador;
    } else {
      a = numerador;
      b = denominador;
    }
  }
  const primeira = alvo - a / b < c / d - alvo;
  if (alvo === valor) return primeira ? [a, b] : [c, d];
  return primeira ? [b, a] : [d, c];
}

function pisoDivisivel(valor: number, divisor: number) {
  return valor - (valor % divisor);
}

export function medidaNitida(largura: number, altura: number, proporcao = 1) {
  const [nx, dx] = fracaoAproximada(proporcao);
  const [ny, dy] = fracaoAproximada(proporcao);
  const canvasLargura = Math.max(1, pisoDivisivel(Math.round(largura * proporcao), nx));
  const canvasAltura = Math.max(1, pisoDivisivel(Math.round(altura * proporcao), ny));
  const cssLargura = Math.max(1, pisoDivisivel(Math.round(largura), dx));
  const cssAltura = Math.max(1, pisoDivisivel(Math.round(altura), dy));
  return {
    canvasLargura,
    canvasAltura,
    cssLargura,
    cssAltura,
    sx: canvasLargura / cssLargura,
    sy: canvasAltura / cssAltura,
    roundX: dx,
    roundY: dy,
  };
}

export async function contarPaginas(dados: ArrayBuffer) {
  const documento = await abrirDocumento(dados);
  const total = documento.numPages;
  await documento.loadingTask.destroy();
  return total;
}
