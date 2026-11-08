import { repo } from "./repo";
import type { Bloco, Materia, PdfDoc, Questao } from "./types";

export type Cartao = Questao & {
  materiaNome: string;
  pdfNome: string;
  blocoTitulo: string;
};

type Opcoes = {
  materiaIds?: string[];
  /** Listas já carregadas pela tela, para não buscar de novo. */
  questoes?: Questao[];
  materias?: Materia[];
  pdfs?: PdfDoc[];
  blocos?: Bloco[];
};

/**
 * Questões com os nomes de matéria, PDF e bloco. Poucas consultas em lote,
 * em vez de uma por questão, o que pesa muito quando os dados vêm do Supabase.
 */
export async function carregarCartoes(opcoes: Opcoes = {}): Promise<Cartao[]> {
  const [questoes, materias, pdfs, blocos] = await Promise.all([
    opcoes.questoes ??
      (opcoes.materiaIds
        ? Promise.all(opcoes.materiaIds.map((id) => repo.questoes.listarPorMateria(id))).then((listas) => listas.flat())
        : repo.questoes.listarTodas()),
    opcoes.materias ?? repo.materias.listar(),
    opcoes.pdfs ?? repo.pdfs.listarTodos(),
    opcoes.blocos ?? repo.blocos.listarTodos(),
  ]);
  return juntarCartoes(questoes, materias, pdfs, blocos);
}

export function juntarCartoes(questoes: Questao[], materias: Materia[], pdfs: PdfDoc[], blocos: Bloco[]): Cartao[] {
  const materiaPorId = new Map(materias.map((item) => [item.id, item]));
  const pdfPorId = new Map(pdfs.map((item) => [item.id, item]));
  const blocoPorId = new Map(blocos.map((item) => [item.id, item]));
  return questoes.flatMap((questao) => {
    const bloco = blocoPorId.get(questao.blocoId);
    const pdf = pdfPorId.get(questao.pdfId);
    const materia = materiaPorId.get(questao.materiaId);
    if (!bloco || !pdf || !materia) return [];
    const cartao: Cartao = {
      ...questao,
      materiaNome: materia.nome,
      pdfNome: pdf.nome,
      blocoTitulo: bloco.titulo,
    };
    return [cartao];
  });
}
