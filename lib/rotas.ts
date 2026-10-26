export function caminhoMateria(materiaId: string) {
  return `/materias/${materiaId}`;
}

export function caminhoPdf(materiaId: string, pdfId: string, pagina?: number, marca?: string) {
  const base = `/materias/${materiaId}/pdfs/${pdfId}`;
  const params = new URLSearchParams();
  if (pagina) params.set("pagina", String(pagina));
  if (marca) params.set("marca", marca);
  const busca = params.toString();
  return busca ? `${base}?${busca}` : base;
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
