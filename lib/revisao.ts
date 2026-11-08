import { diasEntre, inicioDoDia, somarDias } from "./datas";
import type { Confianca, Nota, Questao, StatusRevisao, Tentativa } from "./types";

/** 1º ao 5º acerto das questões antigas, que ainda não têm intervalo guardado. */
const DIAS_LEGADO = [1, 3, 7, 14, 30];
const FACILIDADE_INICIAL = 2.5;
const FACILIDADE_MINIMA = 1.3;
const INTERVALO_MAXIMO = 365;
/** Dos 21 dias em diante a questão conta como dominada. */
const DIAS_PARA_DOMINADA = 21;
/** Fração do tempo até a prova que o intervalo pode ocupar (Cepeda et al., 2008: 10–20%). */
const FRACAO_DA_PROVA = 0.2;

const FAIXAS = ["revisar", "nova", "dominada"] as const;
type Faixa = (typeof FAIXAS)[number];
/** 1 + 2 + 1 = 25% erro, 50% nova, 25% dominada. */
const PESO_FAIXA: Record<Faixa, number> = {
  revisar: 1,
  nova: 2,
  dominada: 1,
};

export const ERROS_PARA_GARGALO = 3;

export type Agenda = {
  sequencia: number;
  facilidade: number;
  intervaloDias: number;
  proximaEm: number;
  statusRevisao: StatusRevisao;
  errosSeguidos: number;
  erroComCerteza: boolean;
  /** Quando o card foi julgado pela primeira vez. */
  julgadaEm: number | null;
};

export function estaDevida(questao: Questao, agora = Date.now()) {
  return !questao.suspensa && (questao.proximaEm ?? 0) <= agora;
}

function intervaloLegado(sequencia: number) {
  if (sequencia <= 0) return 0;
  if (sequencia <= DIAS_LEGADO.length) return DIAS_LEGADO[sequencia - 1];
  return 30 * 2 ** (sequencia - DIAS_LEGADO.length);
}

function intervaloAtual(questao: Questao) {
  if (questao.intervaloDias != null) return questao.intervaloDias;
  return intervaloLegado(questao.sequencia ?? 0);
}

/**
 * Teto do intervalo em dias, a partir de quanto falta para a prova.
 * Sem prova futura, não há teto.
 */
export function limiteDaProva(diasAteProva: number | null | undefined) {
  if (diasAteProva == null || diasAteProva <= 0) return null;
  return Math.max(1, Math.floor(diasAteProva * FRACAO_DA_PROVA));
}

/**
 * Próxima data da questão depois de uma nota.
 * Errei zera a sequência e volta hoje. Os demais acertos esticam o intervalo
 * (1, 3 dias e depois intervalo × facilidade). A data cai à meia-noite do dia
 * de calendário, então "amanhã" é de manhã e não 24 horas depois.
 */
export function calcularAgenda(
  questao: Questao,
  nota: Nota,
  opcoes: { agora?: number; limiteDias?: number | null; confianca?: Confianca | null } = {},
): Agenda {
  const agora = opcoes.agora ?? Date.now();
  const facilidadeAtual = questao.facilidade ?? FACILIDADE_INICIAL;
  const julgadaEm = questao.julgadaEm ?? agora;

  if (nota === 1) {
    return {
      sequencia: 0,
      facilidade: Math.max(FACILIDADE_MINIMA, facilidadeAtual - 0.2),
      intervaloDias: 0,
      proximaEm: agora,
      statusRevisao: "revisar",
      errosSeguidos: (questao.errosSeguidos ?? 0) + 1,
      erroComCerteza: opcoes.confianca === 3,
      julgadaEm,
    };
  }

  const anterior = intervaloAtual(questao);
  const sequencia = (questao.sequencia ?? 0) + 1;
  let facilidade = facilidadeAtual;
  let dias: number;

  if (nota === 2) {
    facilidade = Math.max(FACILIDADE_MINIMA, facilidadeAtual - 0.15);
    dias = sequencia <= 1 ? 1 : Math.max(1, Math.round(anterior * 1.2));
  } else if (nota === 3) {
    if (sequencia === 1) dias = 1;
    else if (sequencia === 2) dias = 3;
    else dias = Math.max(anterior + 1, Math.round(anterior * facilidadeAtual));
  } else {
    facilidade = facilidadeAtual + 0.15;
    if (sequencia === 1) dias = 3;
    else if (sequencia === 2) dias = 6;
    else dias = Math.max(anterior + 2, Math.round(anterior * facilidadeAtual * 1.3));
  }

  dias = Math.min(dias, INTERVALO_MAXIMO);
  if (opcoes.limiteDias != null) dias = Math.max(1, Math.min(dias, opcoes.limiteDias));

  return {
    sequencia,
    facilidade,
    intervaloDias: dias,
    proximaEm: somarDias(agora, dias),
    statusRevisao: dias >= DIAS_PARA_DOMINADA ? "dominada" : "nova",
    errosSeguidos: 0,
    erroComCerteza: false,
    julgadaEm,
  };
}

export function notaDeAcerto(acertou: boolean): Nota {
  return acertou ? 3 : 1;
}

export function descreverIntervalo(dias: number) {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "1 dia";
  if (dias < 30) return `${dias} dias`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return meses === 1 ? "1 mês" : `${meses} meses`;
  const anos = Math.round((dias / 365) * 10) / 10;
  return anos === 1 ? "1 ano" : `${String(anos).replace(".", ",")} anos`;
}

/** O que cada botão vai agendar, para mostrar "Bom · 3 dias" antes do clique. */
export function previsaoDasNotas(
  questao: Questao,
  opcoes: { agora?: number; limiteDias?: number | null; confianca?: Confianca | null } = {},
): Record<Nota, { dias: number; texto: string }> {
  const resultado = {} as Record<Nota, { dias: number; texto: string }>;
  for (const nota of [1, 2, 3, 4] as const) {
    const agenda = calcularAgenda(questao, nota, opcoes);
    resultado[nota] = { dias: agenda.intervaloDias, texto: descreverIntervalo(agenda.intervaloDias) };
  }
  return resultado;
}

export function descreverVolta(proximaEm: number, agora = Date.now()) {
  if (proximaEm <= agora) return "Continua no banco";
  const dias = diasEntre(agora, proximaEm);
  if (dias <= 1) return "Volta amanhã";
  if (dias < 60) return `Volta em ${dias} dias`;
  const meses = Math.max(2, Math.round(dias / 30));
  if (meses < 24) return `Volta em ${meses} meses`;
  const anos = Math.max(2, Math.round(meses / 12));
  return `Volta em ${anos} anos`;
}

export function proximaData(questoes: Questao[], agora = Date.now()) {
  let menor: number | null = null;
  for (const questao of questoes) {
    const quando = questao.proximaEm ?? 0;
    if (quando > agora && (menor === null || quando < menor)) menor = quando;
  }
  return menor;
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

/** Três erros seguidos: o card pede releitura da teoria antes de insistir. */
export function ehGargalo(questao: Pick<Questao, "errosSeguidos">) {
  return (questao.errosSeguidos ?? 0) >= ERROS_PARA_GARGALO;
}

/** Uma de cada matéria por vez, mantendo a ordem de prioridade dentro de cada uma. */
export function intercalarPorMateria<T extends Questao>(ordenadas: T[]) {
  const filas = new Map<string, T[]>();
  for (const questao of ordenadas) {
    const fila = filas.get(questao.materiaId);
    if (fila) fila.push(questao);
    else filas.set(questao.materiaId, [questao]);
  }
  const listas = [...filas.values()];
  const resultado: T[] = [];
  for (let rodada = 0; resultado.length < ordenadas.length; rodada += 1) {
    for (const lista of listas) {
      if (lista[rodada]) resultado.push(lista[rodada]);
    }
  }
  return resultado;
}

export const LIMITE_NOVOS_PADRAO = 20;
export const LIMITE_REVISOES_PADRAO = 200;

type TentativaDoDia = Pick<Tentativa, "em" | "nova">;

/**
 * Quantos cards novos você começou e quantas revisões fez hoje. Só olha as tentativas de hoje,
 * graças ao campo "nova" de cada tentativa: não precisa do histórico inteiro.
 */
export function resumoDoDia(tentativas: TentativaDoDia[], agora = Date.now()) {
  const comeco = inicioDoDia(agora);
  let novos = 0;
  let revisoes = 0;
  for (const item of tentativas) {
    if (item.em < comeco) continue;
    if (item.nova) novos += 1;
    else revisoes += 1;
  }
  return { novos, revisoes };
}

/**
 * Fila do dia, como no Anki: só o que venceu, com teto de cards novos e de revisões
 * por dia. Primeiro as revisões (erros com certeza, depois erros, depois as mais
 * atrasadas), depois os cards novos. As matérias se intercalam em cada grupo.
 */
export function filaDeHoje<T extends Questao>(
  questoes: T[],
  tentativasDeHoje: TentativaDoDia[],
  opcoes: { agora?: number; limiteNovos?: number; limiteRevisoes?: number } = {},
) {
  const agora = opcoes.agora ?? Date.now();
  const limiteNovos = opcoes.limiteNovos ?? LIMITE_NOVOS_PADRAO;
  const limiteRevisoes = opcoes.limiteRevisoes ?? LIMITE_REVISOES_PADRAO;
  const feitoHoje = resumoDoDia(tentativasDeHoje, agora);
  const julgada = (questao: T) => questao.julgadaEm != null;
  const peso = (questao: T) => (questao.erroComCerteza ? 0 : questao.statusRevisao === "revisar" ? 1 : 2);

  const devidas = questoes.filter((questao) => estaDevida(questao, agora));
  const novas = devidas.filter((questao) => !julgada(questao)).sort((a, b) => a.createdAt - b.createdAt);
  const revisoes = devidas.filter(julgada).sort((a, b) => peso(a) - peso(b) || maisAtrasada(a, b));

  const vagasNovas = Math.max(0, limiteNovos - feitoHoje.novos);
  const vagasRevisoes = Math.max(0, limiteRevisoes - feitoHoje.revisoes);
  const novasDoDia = novas.slice(0, vagasNovas);
  const revisoesDoDia = revisoes.slice(0, vagasRevisoes);

  return {
    fila: [...intercalarPorMateria(revisoesDoDia), ...intercalarPorMateria(novasDoDia)],
    novas: novasDoDia.length,
    revisoes: revisoesDoDia.length,
    ficaramNovas: novas.length - novasDoDia.length,
    ficaramRevisoes: revisoes.length - revisoesDoDia.length,
    feitoHoje,
  };
}
