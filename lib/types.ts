export type Prioridade = "alta" | "media" | "baixa";
export type CorGrifo = Prioridade | "importante";
export type StatusRevisao = "nova" | "revisar" | "dominada";
/** 1 Errei, 2 Difícil, 3 Bom, 4 Fácil. */
export type Nota = 1 | 2 | 3 | 4;
/** 1 chute, 2 acho que sei, 3 tenho certeza. */
export type Confianca = 1 | 2 | 3;
export type MotivoErro = "nao-sabia" | "confundi" | "distracao" | "chute";
/** Frente e verso, ou texto com lacunas marcadas com {{ }}. */
export type TipoCard = "basico" | "lacuna";

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
  /** Página em que você parou. Acompanha você em qualquer aparelho. */
  ultimaPagina?: number;
  /** A página mais adiante que você já abriu. Mede o progresso de leitura. */
  maiorPagina?: number;
  createdAt: number;
};

export type Grifo = {
  id: string;
  pdfId: string;
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
  pagina: number;
  texto: string;
  x: number;
  y: number;
  createdAt: number;
};

export type Tentativa = {
  id: string;
  questaoId: string;
  materiaId: string;
  pdfId: string | null;
  topicoId: string | null;
  pagina: number | null;
  acertou: boolean;
  em: number;
  /** Foi a primeira vez que o card foi julgado. Dispensa reler o histórico para contar os novos do dia. */
  nova?: boolean;
  nota?: Nota;
  confianca?: Confianca;
  motivo?: MotivoErro;
};

/** Um card de revisão. No app se chama questão. */
export type Questao = {
  id: string;
  materiaId: string;
  /** De onde o card veio. Vazio quando criado fora do leitor. */
  pdfId: string | null;
  pagina: number | null;
  /** Tópico do edital a que o card pertence. */
  topicoId: string | null;
  tipo: TipoCard;
  /** Frente do card. Em card de lacuna, o texto inteiro com {{respostas}}. */
  enunciado: string;
  /** Verso do card. Em card de lacuna, um comentário opcional. */
  resposta: string;
  /** Figura que acompanha o card, como o recorte de um "Importante". */
  imagem?: Blob;
  /** Cards suspensos não entram em nenhuma fila. */
  suspensa?: boolean;
  /**
   * Estado derivado, guardado no card para a fila e os avisos não dependerem de reler todo o
   * histórico de tentativas (que cresce sem parar).
   */
  julgadaEm?: number | null;
  errosSeguidos?: number;
  /** O último julgamento foi um erro com "tenho certeza". */
  erroComCerteza?: boolean;
  statusRevisao: StatusRevisao;
  /** Acertos seguidos. Erro zera. */
  sequencia?: number;
  /** Fator de crescimento do intervalo (começa em 2,5). */
  facilidade?: number;
  /** Último intervalo, em dias. */
  intervaloDias?: number;
  /** Quando o card pode voltar. Ausente ou no passado: está vencido. */
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
  /** Onde o tópico está no material: PDF e faixa de páginas (opcionais). */
  pdfId: string | null;
  paginaInicio: number | null;
  paginaFim: number | null;
  /** Marcação de que você já estudou o tópico. */
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
  { id: "nova", nome: "Em aprendizado" },
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
