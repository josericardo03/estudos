import { nomeDoMotivo } from "./types";
import type { Bloco, Confianca, Lancamento, Materia, MotivoErro, Questao, Tentativa } from "./types";
import { CONFIANCAS } from "./types";

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
  /** Taxa de todas as tentativas. */
  taxa: number | null;
  /** Taxa suavizada, com mais peso nas tentativas recentes. Ordena do mais fraco ao mais forte. */
  forca: number;
};

export type GrupoMateria = {
  id: string;
  nome: string;
  href: string;
  internas: number;
  internasAcertos: number;
  externas: number;
  externasAcertos: number;
  total: number;
  acertos: number;
  taxa: number | null;
  forca: number;
};

export type QuestaoFraca = {
  id: string;
  enunciado: string;
  href: string;
  detalhe: string;
  acertos: number;
  erros: number;
  taxa: number;
  /** Quantas vezes errou com "tenho certeza". */
  certezaErrada: number;
};

type PdfResumo = { id: string; nome: string; materiaId: string };

const DIA = 86_400_000;
/** Uma tentativa vale metade depois de 30 dias. */
const MEIA_VIDA_DIAS = 30;
/** Suavização: sem dados, a força parte de 60%; poucos dados mal movem o número. */
const PRIOR_ACERTOS = 1.2;
const PRIOR_TOTAL = 2;

export function porcentagem(taxa: number) {
  return Math.round(taxa * 100);
}

function taxaDe(acertos: number, total: number) {
  if (!total) return null;
  return acertos / total;
}

type Soma = { acertos: number; total: number; pesoAcertos: number; pesoTotal: number; julgadas: Set<string> };

function novaSoma(): Soma {
  return { acertos: 0, total: 0, pesoAcertos: 0, pesoTotal: 0, julgadas: new Set() };
}

function somar(soma: Soma, tentativa: Tentativa, agora: number) {
  const idade = Math.max(0, (agora - tentativa.em) / DIA);
  const peso = 0.5 ** (idade / MEIA_VIDA_DIAS);
  soma.total += 1;
  soma.pesoTotal += peso;
  if (tentativa.acertou) {
    soma.acertos += 1;
    soma.pesoAcertos += peso;
  }
  soma.julgadas.add(tentativa.questaoId);
}

function forcaDe(soma: Soma, externos?: { feitas: number; acertos: number }) {
  const pesoAcertos = soma.pesoAcertos + (externos?.acertos ?? 0);
  const pesoTotal = soma.pesoTotal + (externos?.feitas ?? 0);
  return (pesoAcertos + PRIOR_ACERTOS) / (pesoTotal + PRIOR_TOTAL);
}

function compararFraqueza(a: GrupoDesempenho, b: GrupoDesempenho) {
  if (a.taxa === null && b.taxa === null) return a.nome.localeCompare(b.nome, "pt-BR");
  if (a.taxa === null) return 1;
  if (b.taxa === null) return -1;
  return a.forca - b.forca || b.erros - a.erros || a.nome.localeCompare(b.nome, "pt-BR");
}

function agrupar<T>(itens: T[], chave: (item: T) => string) {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = mapa.get(k);
    if (lista) lista.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

function resumirGrupo(
  id: string,
  nome: string,
  detalhe: string,
  href: string,
  questoes: number,
  tentativas: Tentativa[],
  agora: number,
): GrupoDesempenho {
  const soma = novaSoma();
  for (const item of tentativas) somar(soma, item, agora);
  return {
    id,
    nome,
    detalhe,
    href,
    questoes,
    julgadas: soma.julgadas.size,
    tentativas: soma.total,
    acertos: soma.acertos,
    erros: soma.total - soma.acertos,
    taxa: taxaDe(soma.acertos, soma.total),
    forca: forcaDe(soma),
  };
}

export function montarDesempenho(entrada: {
  materias: Materia[];
  pdfs: PdfResumo[];
  blocos: Bloco[];
  questoes: Questao[];
  tentativas: Tentativa[];
  lancamentos?: Lancamento[];
  agora?: number;
  caminhoMateria: (materiaId: string) => string;
  caminhoPdf: (materiaId: string, pdfId: string) => string;
  caminhoBloco: (materiaId: string, pdfId: string, blocoId: string) => string;
}) {
  const agora = entrada.agora ?? Date.now();
  const lancamentos = entrada.lancamentos ?? [];
  const materiaDe = new Map(entrada.materias.map((materia) => [materia.id, materia.nome]));
  const pdfDe = new Map(entrada.pdfs.map((pdf) => [pdf.id, pdf]));
  const blocoDe = new Map(entrada.blocos.map((bloco) => [bloco.id, bloco]));

  const questoesPorPdf = agrupar(entrada.questoes, (item) => item.pdfId);
  const questoesPorBloco = agrupar(entrada.questoes, (item) => item.blocoId);
  const tentativasPorPdf = agrupar(entrada.tentativas, (item) => item.pdfId);
  const tentativasPorBloco = agrupar(entrada.tentativas, (item) => item.blocoId);
  const tentativasPorQuestao = agrupar(entrada.tentativas, (item) => item.questaoId);
  const tentativasPorMateria = agrupar(entrada.tentativas, (item) => item.materiaId);
  const lancamentosPorMateria = agrupar(lancamentos, (item) => item.materiaId);

  const pdfs = entrada.pdfs
    .map((pdf) =>
      resumirGrupo(
        pdf.id,
        pdf.nome,
        materiaDe.get(pdf.materiaId) ?? "Matéria",
        entrada.caminhoPdf(pdf.materiaId, pdf.id),
        questoesPorPdf.get(pdf.id)?.length ?? 0,
        tentativasPorPdf.get(pdf.id) ?? [],
        agora,
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
        questoesPorBloco.get(bloco.id)?.length ?? 0,
        tentativasPorBloco.get(bloco.id) ?? [],
        agora,
      );
    })
    .filter((grupo) => grupo.tentativas > 0)
    .sort(compararFraqueza);

  const materias = entrada.materias
    .map((materia): GrupoMateria => {
      const internas = tentativasPorMateria.get(materia.id) ?? [];
      const externas = lancamentosPorMateria.get(materia.id) ?? [];
      const soma = novaSoma();
      for (const item of internas) somar(soma, item, agora);
      const externasFeitas = externas.reduce((total, item) => total + item.feitas, 0);
      const externasAcertos = externas.reduce((total, item) => total + item.acertos, 0);
      const total = soma.total + externasFeitas;
      const acertos = soma.acertos + externasAcertos;
      return {
        id: materia.id,
        nome: materia.nome,
        href: entrada.caminhoMateria(materia.id),
        internas: soma.total,
        internasAcertos: soma.acertos,
        externas: externasFeitas,
        externasAcertos,
        total,
        acertos,
        taxa: taxaDe(acertos, total),
        forca: forcaDe(soma, { feitas: externasFeitas, acertos: externasAcertos }),
      };
    })
    .sort((a, b) => {
      if (a.taxa === null && b.taxa === null) return a.nome.localeCompare(b.nome, "pt-BR");
      if (a.taxa === null) return 1;
      if (b.taxa === null) return -1;
      return a.forca - b.forca || a.nome.localeCompare(b.nome, "pt-BR");
    });

  const comErro: QuestaoFraca[] = [];
  for (const questao of entrada.questoes) {
    const daQuestao = tentativasPorQuestao.get(questao.id);
    const pdf = pdfDe.get(questao.pdfId);
    if (!daQuestao?.length || !pdf) continue;
    const acertos = daQuestao.filter((item) => item.acertou).length;
    const erros = daQuestao.length - acertos;
    if (erros === 0) continue;
    const bloco = blocoDe.get(questao.blocoId);
    comErro.push({
      id: questao.id,
      enunciado: questao.enunciado,
      href: entrada.caminhoBloco(pdf.materiaId, pdf.id, questao.blocoId),
      detalhe: `${pdf.nome}${bloco ? ` · ${bloco.titulo}` : ""}`,
      acertos,
      erros,
      taxa: acertos / daQuestao.length,
      certezaErrada: daQuestao.filter((item) => !item.acertou && item.confianca === 3).length,
    });
  }
  const questoes = comErro
    .slice()
    .sort((a, b) => a.taxa - b.taxa || b.erros - a.erros)
    .slice(0, 8);
  const pontosCegos = comErro
    .filter((item) => item.certezaErrada > 0)
    .sort((a, b) => b.certezaErrada - a.certezaErrada || a.taxa - b.taxa)
    .slice(0, 5);

  const motivosContados = new Map<MotivoErro, number>();
  const niveis = new Map<Confianca, { tentativas: number; acertos: number }>();
  let semanaTotal = 0;
  let semanaAcertos = 0;
  for (const item of entrada.tentativas) {
    if (!item.acertou && item.motivo) motivosContados.set(item.motivo, (motivosContados.get(item.motivo) ?? 0) + 1);
    if (item.confianca) {
      const nivel = niveis.get(item.confianca) ?? { tentativas: 0, acertos: 0 };
      nivel.tentativas += 1;
      if (item.acertou) nivel.acertos += 1;
      niveis.set(item.confianca, nivel);
    }
    if (agora - item.em <= 7 * DIA) {
      semanaTotal += 1;
      if (item.acertou) semanaAcertos += 1;
    }
  }
  const motivos = [...motivosContados.entries()]
    .map(([motivo, total]) => ({ motivo, nome: nomeDoMotivo(motivo), total }))
    .sort((a, b) => b.total - a.total);
  const calibracao = CONFIANCAS.flatMap((nivel) => {
    const dados = niveis.get(nivel.id);
    if (!dados) return [];
    return [{ nivel: nivel.id, nome: nivel.nome, tentativas: dados.tentativas, taxa: dados.acertos / dados.tentativas }];
  });

  const acertos = entrada.tentativas.filter((item) => item.acertou).length;
  const tentativas = entrada.tentativas.length;
  const julgadas = new Set(entrada.tentativas.map((item) => item.questaoId)).size;
  const externasFeitas = lancamentos.reduce((total, item) => total + item.feitas, 0);
  const externasAcertos = lancamentos.reduce((total, item) => total + item.acertos, 0);

  return {
    pdfs,
    blocos: blocos.slice(0, 8),
    materias,
    questoes,
    pontosCegos,
    motivos,
    calibracao,
    acertos,
    erros: tentativas - acertos,
    tentativas,
    julgadas,
    questoesNoBanco: entrada.questoes.length,
    taxa: taxaDe(acertos, tentativas),
    semana: { tentativas: semanaTotal, taxa: taxaDe(semanaAcertos, semanaTotal) },
    externas: { feitas: externasFeitas, acertos: externasAcertos, taxa: taxaDe(externasAcertos, externasFeitas) },
    geral: {
      feitas: tentativas + externasFeitas,
      acertos: acertos + externasAcertos,
      taxa: taxaDe(acertos + externasAcertos, tentativas + externasFeitas),
    },
  };
}
