import { resumoDoCard } from "./cards";
import { nomeDoMotivo } from "./types";
import type { Confianca, EditalTopico, Lancamento, Materia, MotivoErro, Questao, Tentativa } from "./types";
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
/** Quantas páginas formam um "trecho" na análise por PDF. */
export const PAGINAS_POR_TRECHO = 10;

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

function agrupar<T>(itens: T[], chave: (item: T) => string | null) {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    if (k === null) continue;
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

function inicioDoTrecho(pagina: number) {
  return Math.floor((pagina - 1) / PAGINAS_POR_TRECHO) * PAGINAS_POR_TRECHO + 1;
}

/**
 * Taxa e "força" de cada matéria, somando o app e as questões lançadas de fora.
 * Só precisa das tentativas e dos lançamentos, então a tela Hoje a usa sem carregar os cards.
 */
export function desempenhoDasMaterias(entrada: {
  materias: Materia[];
  tentativas: Tentativa[];
  lancamentos?: Lancamento[];
  agora?: number;
  caminhoMateria: (materiaId: string) => string;
}): GrupoMateria[] {
  const agora = entrada.agora ?? Date.now();
  const porMateria = agrupar(entrada.tentativas, (item) => item.materiaId);
  const lancamentosDaMateria = agrupar(entrada.lancamentos ?? [], (item) => item.materiaId);
  return entrada.materias
    .map((materia): GrupoMateria => {
      const internas = porMateria.get(materia.id) ?? [];
      const externas = lancamentosDaMateria.get(materia.id) ?? [];
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
}

export function montarDesempenho(entrada: {
  materias: Materia[];
  pdfs: PdfResumo[];
  topicos: EditalTopico[];
  questoes: Questao[];
  tentativas: Tentativa[];
  lancamentos?: Lancamento[];
  agora?: number;
  caminhoMateria: (materiaId: string) => string;
  caminhoPdf: (materiaId: string, pdfId: string, pagina?: number) => string;
  caminhoTopico: (editalId: string) => string;
}) {
  const agora = entrada.agora ?? Date.now();
  const lancamentos = entrada.lancamentos ?? [];
  const materiaDe = new Map(entrada.materias.map((materia) => [materia.id, materia.nome]));
  const pdfDe = new Map(entrada.pdfs.map((pdf) => [pdf.id, pdf]));
  const topicoDe = new Map(entrada.topicos.map((topico) => [topico.id, topico]));

  const questoesPorPdf = agrupar(entrada.questoes, (item) => item.pdfId);
  const questoesPorTopico = agrupar(entrada.questoes, (item) => item.topicoId);
  const tentativasPorPdf = agrupar(entrada.tentativas, (item) => item.pdfId);
  const tentativasPorTopico = agrupar(entrada.tentativas, (item) => item.topicoId);
  const tentativasPorQuestao = agrupar(entrada.tentativas, (item) => item.questaoId);

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

  const topicos = entrada.topicos
    .map((topico) =>
      resumirGrupo(
        topico.id,
        topico.nome,
        topico.materiaId ? (materiaDe.get(topico.materiaId) ?? "Matéria") : "Sem matéria",
        entrada.caminhoTopico(topico.editalId),
        questoesPorTopico.get(topico.id)?.length ?? 0,
        tentativasPorTopico.get(topico.id) ?? [],
        agora,
      ),
    )
    .filter((grupo) => grupo.questoes > 0)
    .sort(compararFraqueza);

  // Trechos: faixas de 10 páginas de um PDF onde os cards foram criados.
  const cardsPorTrecho = new Map<string, number>();
  for (const questao of entrada.questoes) {
    if (!questao.pdfId || !questao.pagina) continue;
    const chave = `${questao.pdfId}:${inicioDoTrecho(questao.pagina)}`;
    cardsPorTrecho.set(chave, (cardsPorTrecho.get(chave) ?? 0) + 1);
  }
  const tentativasPorTrecho = agrupar(entrada.tentativas, (item) =>
    item.pdfId && item.pagina ? `${item.pdfId}:${inicioDoTrecho(item.pagina)}` : null,
  );
  const trechos = [...tentativasPorTrecho.entries()]
    .flatMap(([chave, lista]) => {
      const [pdfId, inicioTexto] = chave.split(":");
      const pdf = pdfDe.get(pdfId);
      if (!pdf) return [];
      const inicio = Number(inicioTexto);
      return [
        resumirGrupo(
          chave,
          `${pdf.nome} · p. ${inicio}–${inicio + PAGINAS_POR_TRECHO - 1}`,
          materiaDe.get(pdf.materiaId) ?? "Matéria",
          entrada.caminhoPdf(pdf.materiaId, pdf.id, inicio),
          cardsPorTrecho.get(chave) ?? 0,
          lista,
          agora,
        ),
      ];
    })
    .sort(compararFraqueza);

  const materias = desempenhoDasMaterias({
    materias: entrada.materias,
    tentativas: entrada.tentativas,
    lancamentos,
    agora,
    caminhoMateria: entrada.caminhoMateria,
  });

  const comErro: QuestaoFraca[] = [];
  for (const questao of entrada.questoes) {
    const daQuestao = tentativasPorQuestao.get(questao.id);
    if (!daQuestao?.length) continue;
    const acertos = daQuestao.filter((item) => item.acertou).length;
    const erros = daQuestao.length - acertos;
    if (erros === 0) continue;
    const pdf = questao.pdfId ? pdfDe.get(questao.pdfId) : undefined;
    const topico = questao.topicoId ? topicoDe.get(questao.topicoId) : undefined;
    const origem = pdf
      ? `${pdf.nome}${questao.pagina ? ` · p. ${questao.pagina}` : ""}`
      : (materiaDe.get(questao.materiaId) ?? "Matéria");
    comErro.push({
      id: questao.id,
      enunciado: resumoDoCard(questao.tipo, questao.enunciado, 200),
      href: pdf ? entrada.caminhoPdf(pdf.materiaId, pdf.id, questao.pagina ?? undefined) : entrada.caminhoMateria(questao.materiaId),
      detalhe: topico ? `${origem} · ${topico.nome}` : origem,
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
    topicos: topicos.slice(0, 10),
    trechos: trechos.slice(0, 8),
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
