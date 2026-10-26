export function caminhoMateria(materiaId: string) {
  return `/materias/${materiaId}`;
}

export function caminhoPdf(materiaId: string, pdfId: string, pagina?: number) {
  const base = `/materias/${materiaId}/pdfs/${pdfId}`;
  return pagina ? `${base}?pagina=${pagina}` : base;
}

export function caminhoCaderno(materiaId: string, pdfId: string) {
  return `/materias/${materiaId}/pdfs/${pdfId}/caderno`;
}

export function caminhoBloco(materiaId: string, pdfId: string, blocoId: string) {
  return `/materias/${materiaId}/pdfs/${pdfId}/blocos/${blocoId}`;
}

export function caminhoBanco(materiaId?: string) {
  return materiaId ? `/banco?materia=${materiaId}` : "/banco";
}
