import { repo } from "./repo";
import type { EditalTopico, Materia, PdfDoc, Questao } from "./types";

export type Cartao = Questao & {
  materiaNome: string;
  pdfNome: string | null;
  topicoNome: string | null;
};

type Opcoes = {
  materiaIds?: string[];
  /** Listas já carregadas pela tela, para não buscar de novo. */
  questoes?: Questao[];
  materias?: Materia[];
  pdfs?: PdfDoc[];
  topicos?: EditalTopico[];
};

/**
 * Cards com os nomes de matéria, PDF e tópico. Poucas consultas em lote,
 * em vez de uma por card, o que pesa muito quando os dados vêm do Supabase.
 */
export async function carregarCartoes(opcoes: Opcoes = {}): Promise<Cartao[]> {
  const [questoes, materias, pdfs, topicos] = await Promise.all([
    opcoes.questoes ??
      (opcoes.materiaIds
        ? Promise.all(opcoes.materiaIds.map((id) => repo.questoes.listarPorMateria(id))).then((listas) => listas.flat())
        : repo.questoes.listarTodas()),
    opcoes.materias ?? repo.materias.listar(),
    opcoes.pdfs ?? repo.pdfs.listarTodos(),
    opcoes.topicos ?? repo.topicos.listarTodos(),
  ]);
  return juntarCartoes(questoes, materias, pdfs, topicos);
}

export function juntarCartoes(questoes: Questao[], materias: Materia[], pdfs: PdfDoc[], topicos: EditalTopico[]): Cartao[] {
  const materiaPorId = new Map(materias.map((item) => [item.id, item]));
  const pdfPorId = new Map(pdfs.map((item) => [item.id, item]));
  const topicoPorId = new Map(topicos.map((item) => [item.id, item]));
  return questoes.flatMap((questao) => {
    const materia = materiaPorId.get(questao.materiaId);
    if (!materia) return [];
    const cartao: Cartao = {
      ...questao,
      materiaNome: materia.nome,
      pdfNome: questao.pdfId ? (pdfPorId.get(questao.pdfId)?.nome ?? null) : null,
      topicoNome: questao.topicoId ? (topicoPorId.get(questao.topicoId)?.nome ?? null) : null,
    };
    return [cartao];
  });
}
