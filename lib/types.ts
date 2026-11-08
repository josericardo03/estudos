export type Prioridade = "alta" | "media" | "baixa";
export type CorGrifo = Prioridade | "importante";
export type StatusBloco = "estudando" | "finalizado";
export type StatusRevisao = "nova" | "revisar" | "dominada";
/** 1 Errei, 2 Difícil, 3 Bom, 4 Fácil. */
export type Nota = 1 | 2 | 3 | 4;
/** 1 chute, 2 acho que sei, 3 tenho certeza. */
export type Confianca = 1 | 2 | 3;
export type MotivoErro = "nao-sabia" | "confundi" | "distracao" | "chute";

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
  blob?: Blob;
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
  /** Resumo escrito com as próprias palavras ao finalizar o bloco. */
  resumo?: string;
  /** Quando o bloco finalizado volta para releitura ativa. */
  proximaRevisaoEm?: number;
  /** Quantas releituras já foram feitas. */
  revisoes?: number;
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

export type Tentativa = {
  id: string;
  questaoId: string;
  pdfId: string;
  materiaId: string;
  blocoId: string;
  acertou: boolean;
  em: number;
  nota?: Nota;
  confianca?: Confianca;
  motivo?: MotivoErro;
};

export type Questao = {
  id: string;
  blocoId: string;
  materiaId: string;
  pdfId: string;
  enunciado: string;
  resposta: string;
  statusRevisao: StatusRevisao;
  /** Acertos seguidos. Erro zera. Questões antigas não têm o campo e contam como zero. */
  sequencia?: number;
  /** Fator de crescimento do intervalo (começa em 2,5). */
  facilidade?: number;
  /** Último intervalo, em dias. Ausente em questões antigas. */
  intervaloDias?: number;
  /** Quando a questão pode voltar. Ausente ou no passado: está vencida. */
  proximaEm?: number;
  createdAt: number;
};

export type Edital = {
  id: string;
  nome: string;
  orgao: string;
  /** Dia da prova, à meia-noite local. */
  dataProva?: number | null;
  createdAt: number;
};

export type EditalMateria = {
  id: string;
  editalId: string;
  materiaId: string;
};

export type EditalTopico = {
  id: string;
  editalId: string;
  materiaId: string | null;
  nome: string;
  /** 1 a 5: quanto o tópico pesa na prova. */
  peso: number;
  /** Bloco que cobre o tópico. Bloco finalizado conta como coberto. */
  blocoId: string | null;
  /** Marcação manual, para tópicos sem bloco. */
  feito: boolean;
  createdAt: number;
};

/** Questões resolvidas fora do app (Tec Concursos e outros). */
export type Lancamento = {
  id: string;
  materiaId: string;
  feitas: number;
  acertos: number;
  fonte: string;
  em: number;
};

/** Uma sessão de estudo cronometrada. */
export type Estudo = {
  id: string;
  materiaId: string | null;
  segundos: number;
  em: number;
};

export const MAX_QUESTOES = 50;

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

export const NOTAS: { id: Nota; nome: string }[] = [
  { id: 1, nome: "Errei" },
  { id: 2, nome: "Difícil" },
  { id: 3, nome: "Bom" },
  { id: 4, nome: "Fácil" },
];

export const CONFIANCAS: { id: Confianca; nome: string }[] = [
  { id: 1, nome: "Chute" },
  { id: 2, nome: "Acho que sei" },
  { id: 3, nome: "Tenho certeza" },
];

export const MOTIVOS_ERRO: { id: MotivoErro; nome: string }[] = [
  { id: "nao-sabia", nome: "Não sabia" },
  { id: "confundi", nome: "Confundi conceitos" },
  { id: "distracao", nome: "Distração" },
  { id: "chute", nome: "Chutei" },
];

export function nomeDoMotivo(motivo: MotivoErro) {
  return MOTIVOS_ERRO.find((item) => item.id === motivo)?.nome ?? motivo;
}
