export type Prioridade = "alta" | "media" | "baixa";
export type CorGrifo = Prioridade | "importante";
export type StatusBloco = "estudando" | "finalizado";
export type StatusRevisao = "nova" | "revisar" | "dominada";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Materia = {
  id: string;
  nome: string;
  createdAt: number;
};

export type PdfDoc = {
  id: string;
  materiaId: string;
  nome: string;
  blob: Blob;
  numPages: number;
  createdAt: number;
};

export type Bloco = {
  id: string;
  pdfId: string;
  titulo: string;
  paginaInicio: number;
  paginaFim: number;
  status: StatusBloco;
  createdAt: number;
};

export type Grifo = {
  id: string;
  pdfId: string;
  blocoId: string | null;
  pagina: number;
  texto: string;
  cor: CorGrifo;
  rects: Rect[];
  imagem?: Blob;
  createdAt: number;
};

export type PostIt = {
  id: string;
  pdfId: string;
  blocoId: string | null;
  pagina: number;
  texto: string;
  x: number;
  y: number;
  createdAt: number;
};

export type Questao = {
  id: string;
  blocoId: string;
  materiaId: string;
  pdfId: string;
  enunciado: string;
  resposta: string;
  statusRevisao: StatusRevisao;
  createdAt: number;
};

export type Edital = {
  id: string;
  nome: string;
  orgao: string;
  createdAt: number;
};

export type EditalMateria = {
  id: string;
  editalId: string;
  materiaId: string;
};

export const MAX_QUESTOES = 15;

export const PRIORIDADES: { id: Prioridade; nome: string }[] = [
  { id: "alta", nome: "Alta" },
  { id: "media", nome: "Média" },
  { id: "baixa", nome: "Baixa" },
];

export const IMPORTANTE = { id: "importante" as const, nome: "Importante" };

export function nomeDaCor(cor: CorGrifo) {
  if (cor === IMPORTANTE.id) return IMPORTANTE.nome;
  return PRIORIDADES.find((item) => item.id === cor)?.nome ?? cor;
}

export const STATUS_REVISAO: { id: StatusRevisao; nome: string }[] = [
  { id: "nova", nome: "Nova" },
  { id: "revisar", nome: "Revisar" },
  { id: "dominada", nome: "Dominada" },
];
