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

export async function contarPaginas(dados: ArrayBuffer) {
  const documento = await abrirDocumento(dados);
  const total = documento.numPages;
  await documento.loadingTask.destroy();
  return total;
}
