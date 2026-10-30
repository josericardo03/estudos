import type { Questao, StatusRevisao } from "./types";

const PESO: Record<StatusRevisao, number> = {
  revisar: 0,
  nova: 1,
  dominada: 2,
};

const DIA = 86_400_000;
/** 1º ao 5º acerto. Do 6º em diante o intervalo dobra a partir de 30 dias. */
const DIAS_INICIAIS = [1, 3, 7, 14, 30];
const FAIXAS = ["revisar", "nova", "dominada"] as const;
type Faixa = (typeof FAIXAS)[number];
/** 1 + 2 + 1 = 25% erro, 50% nova, 25% dominada. */
const PESO_FAIXA: Record<Faixa, number> = {
  revisar: 1,
  nova: 2,
  dominada: 1,
};

export const ERROS_PARA_GARGALO = 3;

export function compararRevisao(a: Questao, b: Questao) {
  const peso = PESO[a.statusRevisao] - PESO[b.statusRevisao];
  if (peso !== 0) return peso;
  return a.createdAt - b.createdAt;
}

export function estaDevida(questao: Questao, agora = Date.now()) {
  return (questao.proximaEm ?? 0) <= agora;
}

export function diasDoAcerto(sequencia: number) {
  if (sequencia <= DIAS_INICIAIS.length) return DIAS_INICIAIS[Math.max(0, sequencia - 1)];
  return 30 * 2 ** (sequencia - DIAS_INICIAIS.length);
}

function faixaDaQuestao(questao: Questao): Faixa {
  if (questao.statusRevisao === "revisar" || questao.statusRevisao === "dominada") return questao.statusRevisao;
  return "nova";
}

function maisAtrasada(a: Questao, b: Questao) {
  return (a.proximaEm ?? 0) - (b.proximaEm ?? 0) || a.createdAt - b.createdAt;
}

function metasPorFaixa(vagas: number): Record<Faixa, number> {
  const metas: Record<Faixa, number> = { revisar: 0, nova: 0, dominada: 0 };
  if (vagas <= 0) return metas;
  const soma = FAIXAS.reduce((total, faixa) => total + PESO_FAIXA[faixa], 0);
  const sobras = FAIXAS.map((faixa) => {
    const exato = (vagas * PESO_FAIXA[faixa]) / soma;
    const inteiro = Math.floor(exato);
    metas[faixa] = inteiro;
    return { faixa, fracao: exato - inteiro };
  });
  const faltam = vagas - FAIXAS.reduce((total, faixa) => total + metas[faixa], 0);
  sobras.sort((a, b) => b.fracao - a.fracao || FAIXAS.indexOf(a.faixa) - FAIXAS.indexOf(b.faixa));
  for (let i = 0; i < faltam; i += 1) metas[sobras[i % sobras.length].faixa] += 1;
  return metas;
}

function escolherPorCota<T extends Questao>(questoes: T[], vagas: number): T[] {
  const limite = Math.min(Math.max(0, vagas), questoes.length);
  if (limite === 0) return [];
  const grupos: Record<Faixa, T[]> = { revisar: [], nova: [], dominada: [] };
  for (const questao of questoes) grupos[faixaDaQuestao(questao)].push(questao);
  for (const faixa of FAIXAS) grupos[faixa].sort(maisAtrasada);

  const metas = metasPorFaixa(limite);
  const escolhidas: T[] = [];
  const usadas = new Set<string>();
  const cursor: Record<Faixa, number> = { revisar: 0, nova: 0, dominada: 0 };

  for (const faixa of FAIXAS) {
    const ate = Math.min(metas[faixa], grupos[faixa].length);
    for (let i = 0; i < ate; i += 1) {
      escolhidas.push(grupos[faixa][i]);
      usadas.add(grupos[faixa][i].id);
      cursor[faixa] = i + 1;
    }
  }

  while (escolhidas.length < limite) {
    let avancou = false;
    for (const faixa of FAIXAS) {
      while (grupos[faixa][cursor[faixa]] && usadas.has(grupos[faixa][cursor[faixa]].id)) cursor[faixa] += 1;
      const questao = grupos[faixa][cursor[faixa]];
      if (!questao) continue;
      escolhidas.push(questao);
      usadas.add(questao.id);
      cursor[faixa] += 1;
      avancou = true;
      if (escolhidas.length >= limite) break;
    }
    if (!avancou) break;
  }
  return escolhidas;
}

export function limitarSimulado<T extends Questao>(devidas: T[], quantidade: number) {
  const porMateria = new Map<string, T[]>();
  const ordem: string[] = [];
  for (const questao of devidas) {
    const lista = porMateria.get(questao.materiaId);
    if (lista) lista.push(questao);
    else {
      porMateria.set(questao.materiaId, [questao]);
      ordem.push(questao.materiaId);
    }
  }

  const vagas = new Map<string, number>();
  let restantes = Math.max(0, quantidade);
  while (restantes > 0) {
    let avancou = false;
    for (const materiaId of ordem) {
      const disponiveis = porMateria.get(materiaId)?.length ?? 0;
      const ja = vagas.get(materiaId) ?? 0;
      if (ja >= disponiveis) continue;
      vagas.set(materiaId, ja + 1);
      restantes -= 1;
      avancou = true;
      if (restantes === 0) break;
    }
    if (!avancou) break;
  }

  const prova: T[] = [];
  for (const materiaId of ordem) {
    const pedidas = vagas.get(materiaId) ?? 0;
    if (!pedidas) continue;
    prova.push(...escolherPorCota(porMateria.get(materiaId) ?? [], pedidas));
  }
  return { prova, sobraram: Math.max(0, devidas.length - prova.length) };
}

export function separarSimulado<T extends Questao>(questoes: T[], agora = Date.now()) {
  const entram: T[] = [];
  const esperando: T[] = [];
  for (const questao of questoes) {
    if (estaDevida(questao, agora)) entram.push(questao);
    else esperando.push(questao);
  }
  return { entram, esperando };
}

export function aplicarJulgamento(questao: Questao, acertou: boolean, agora = Date.now()) {
  if (!acertou) {
    return {
      sequencia: 0,
      proximaEm: agora,
      statusRevisao: "revisar" as const,
    };
  }
  const sequencia = (questao.sequencia ?? 0) + 1;
  return {
    sequencia,
    proximaEm: agora + diasDoAcerto(sequencia) * DIA,
    statusRevisao: (sequencia >= DIAS_INICIAIS.length ? "dominada" : "nova") as StatusRevisao,
  };
}

export function descreverVolta(proximaEm: number, agora = Date.now()) {
  if (proximaEm <= agora) return "Continua no banco";
  const dias = Math.max(1, Math.round((proximaEm - agora) / DIA));
  if (dias <= 1) return "Volta amanhã";
  if (dias < 60) return `Volta em ${dias} dias`;
  const meses = Math.max(2, Math.round(dias / 30));
  if (meses < 24) return `Volta em ${meses} meses`;
  const anos = Math.max(2, Math.round(meses / 12));
  return `Volta em ${anos} anos`;
}

export function proximaData(questoes: Questao[], agora = Date.now()) {
  const futuras = questoes
    .map((questao) => questao.proximaEm ?? 0)
    .filter((quando) => quando > agora);
  if (!futuras.length) return null;
  return Math.min(...futuras);
}

export function errosSeguidos(
  tentativas: { questaoId: string; acertou: boolean; em: number }[],
  questaoId: string,
) {
  const daQuestao = tentativas.filter((item) => item.questaoId === questaoId).sort((a, b) => b.em - a.em);
  let seguidos = 0;
  for (const item of daQuestao) {
    if (item.acertou) break;
    seguidos += 1;
  }
  return seguidos;
}

export function ehGargalo(tentativas: { questaoId: string; acertou: boolean; em: number }[], questaoId: string) {
  return errosSeguidos(tentativas, questaoId) >= ERROS_PARA_GARGALO;
}
