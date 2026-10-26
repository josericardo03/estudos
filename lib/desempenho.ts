import type { Bloco, Materia, Questao, Tentativa } from "./types";

export type GrupoDesempenho = {
  id: string;
  nome: string;
  detalhe: string;
  href: string;
  questoes: number;
  julgadas: number;
  tentativas: number;
  acertos: number;
  erros: number;
  taxa: number | null;
};

export type QuestaoFraca = {
  id: string;
  enunciado: string;
  href: string;
  detalhe: string;
  acertos: number;
  erros: number;
  taxa: number;
};

type PdfResumo = { id: string; nome: string; materiaId: string };

function taxaDe(acertos: number, tentativas: number) {
  if (!tentativas) return null;
  return acertos / tentativas;
}

export function porcentagem(taxa: number) {
  return Math.round(taxa * 100);
}

function compararFraqueza(a: GrupoDesempenho, b: GrupoDesempenho) {
  if (a.taxa === null && b.taxa === null) return a.nome.localeCompare(b.nome, "pt-BR");
  if (a.taxa === null) return 1;
  if (b.taxa === null) return -1;
  return a.taxa - b.taxa || b.erros - a.erros || a.nome.localeCompare(b.nome, "pt-BR");
}

function resumirGrupo(
  id: string,
  nome: string,
  detalhe: string,
  href: string,
  questoes: Questao[],
  tentativas: Tentativa[],
): GrupoDesempenho {
  const acertos = tentativas.filter((item) => item.acertou).length;
  const julgadas = new Set(tentativas.map((item) => item.questaoId)).size;
  return {
    id,
    nome,
    detalhe,
    href,
    questoes: questoes.length,
    julgadas,
    tentativas: tentativas.length,
    acertos,
    erros: tentativas.length - acertos,
    taxa: taxaDe(acertos, tentativas.length),
  };
}

export function montarDesempenho(entrada: {
  materias: Materia[];
  pdfs: PdfResumo[];
  blocos: Bloco[];
  questoes: Questao[];
  tentativas: Tentativa[];
  caminhoPdf: (materiaId: string, pdfId: string) => string;
  caminhoBloco: (materiaId: string, pdfId: string, blocoId: string) => string;
}) {
  const materiaDe = new Map(entrada.materias.map((materia) => [materia.id, materia.nome]));
  const pdfDe = new Map(entrada.pdfs.map((pdf) => [pdf.id, pdf]));
  const blocoDe = new Map(entrada.blocos.map((bloco) => [bloco.id, bloco]));

  const pdfs = entrada.pdfs
    .map((pdf) =>
      resumirGrupo(
        pdf.id,
        pdf.nome,
        materiaDe.get(pdf.materiaId) ?? "Matéria",
        entrada.caminhoPdf(pdf.materiaId, pdf.id),
        entrada.questoes.filter((questao) => questao.pdfId === pdf.id),
        entrada.tentativas.filter((item) => item.pdfId === pdf.id),
      ),
    )
    .filter((grupo) => grupo.questoes > 0)
    .sort(compararFraqueza);

  const blocos = entrada.blocos
    .map((bloco) => {
      const pdf = pdfDe.get(bloco.pdfId);
      return resumirGrupo(
        bloco.id,
        bloco.titulo,
        pdf ? `${pdf.nome} · ${materiaDe.get(pdf.materiaId) ?? "Matéria"}` : "PDF",
        pdf ? entrada.caminhoBloco(pdf.materiaId, pdf.id, bloco.id) : "/",
        entrada.questoes.filter((questao) => questao.blocoId === bloco.id),
        entrada.tentativas.filter((item) => item.blocoId === bloco.id),
      );
    })
    .filter((grupo) => grupo.tentativas > 0)
    .sort(compararFraqueza);

  const questoes = entrada.questoes
    .map((questao) => {
      const daQuestao = entrada.tentativas.filter((item) => item.questaoId === questao.id);
      const acertos = daQuestao.filter((item) => item.acertou).length;
      const erros = daQuestao.length - acertos;
      const taxa = taxaDe(acertos, daQuestao.length);
      const pdf = pdfDe.get(questao.pdfId);
      const bloco = blocoDe.get(questao.blocoId);
      if (taxa === null || erros === 0 || !pdf) return null;
      const fraca: QuestaoFraca = {
        id: questao.id,
        enunciado: questao.enunciado,
        href: entrada.caminhoBloco(pdf.materiaId, pdf.id, questao.blocoId),
        detalhe: `${pdf.nome}${bloco ? ` · ${bloco.titulo}` : ""}`,
        acertos,
        erros,
        taxa,
      };
      return fraca;
    })
    .filter((item): item is QuestaoFraca => Boolean(item))
    .sort((a, b) => a.taxa - b.taxa || b.erros - a.erros)
    .slice(0, 8);

  const acertos = entrada.tentativas.filter((item) => item.acertou).length;
  const tentativas = entrada.tentativas.length;
  const julgadas = new Set(entrada.tentativas.map((item) => item.questaoId)).size;

  return {
    pdfs,
    blocos: blocos.slice(0, 8),
    questoes,
    acertos,
    erros: tentativas - acertos,
    tentativas,
    julgadas,
    questoesNoBanco: entrada.questoes.length,
    taxa: taxaDe(acertos, tentativas),
  };
}
