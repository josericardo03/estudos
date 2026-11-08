import { prepararCard } from "./cards";
import type { TipoCard } from "./types";

/**
 * Importar e exportar cards em planilha (CSV) e no texto do Anki (tabulação).
 *
 * Formato do Foco: matéria;tipo;frente;verso (com a linha de cabeçalho).
 * Sem cabeçalho, entende "frente, verso" como no Anki. A matéria vem do cabeçalho ou da
 * escolha na tela. Lacunas do Anki ({{c1::texto}}) viram lacunas do Foco ({{texto}}).
 */

export type CardImportado = {
  /** Nome da matéria na planilha; vazio usa a matéria escolhida na tela. */
  materia: string;
  tipo: TipoCard;
  frente: string;
  verso: string;
};

export type ResultadoDaLeitura = {
  cards: CardImportado[];
  /** Linhas puladas, com o motivo. */
  ignoradas: { linha: number; motivo: string }[];
};

/** Descobre o separador pela primeira linha: tabulação, ponto e vírgula ou vírgula. */
export function detectarSeparador(texto: string) {
  const primeira = texto.split(/\r?\n/).find((linha) => linha.trim() && !linha.startsWith("#")) ?? "";
  const contar = (separador: string) => primeira.split(separador).length - 1;
  const opcoes: [string, number][] = [
    ["\t", contar("\t")],
    [";", contar(";")],
    [",", contar(",")],
  ];
  opcoes.sort((a, b) => b[1] - a[1]);
  return opcoes[0][1] > 0 ? opcoes[0][0] : ";";
}

/** Lê CSV com aspas ("" é uma aspa) e quebras de linha dentro das aspas. */
export function lerCsv(texto: string, separador = detectarSeparador(texto)) {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const limpo = texto.replace(/^﻿/, "");
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"' && campo === "") {
      aspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i += 1;
      linha.push(campo);
      campo = "";
      if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
      linha = [];
    } else {
      campo += c;
    }
  }
  linha.push(campo);
  if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
  return linhas;
}

export function escaparCampo(valor: string, separador: string) {
  if (valor.includes('"') || valor.includes("\n") || valor.includes("\r") || valor.includes(separador)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** Texto do Anki: tira o HTML e converte as lacunas {{c1::texto::dica}} em {{texto}}. */
export function limparTextoDoAnki(texto: string) {
  return texto
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*)?\}\}/g, "{{$1}}")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NOMES_DE_COLUNA: Record<string, "materia" | "tipo" | "frente" | "verso"> = {
  materia: "materia",
  matéria: "materia",
  disciplina: "materia",
  tipo: "tipo",
  frente: "frente",
  pergunta: "frente",
  front: "frente",
  verso: "verso",
  resposta: "verso",
  back: "verso",
};

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function lerCardsImportados(texto: string): ResultadoDaLeitura {
  const linhas = lerCsv(texto).filter((linha) => !linha[0]?.startsWith("#"));
  const cards: CardImportado[] = [];
  const ignoradas: { linha: number; motivo: string }[] = [];
  if (!linhas.length) return { cards, ignoradas };

  // Cabeçalho: se a primeira linha tem nomes de coluna conhecidos, usa-os.
  const cabecalho = linhas[0].map((celula) => NOMES_DE_COLUNA[semAcento(celula)] ?? null);
  const temCabecalho = cabecalho.includes("frente");
  const colunas = temCabecalho ? cabecalho : (["frente", "verso"] as const);
  const dados = temCabecalho ? linhas.slice(1) : linhas;
  const primeiraLinha = temCabecalho ? 2 : 1;

  dados.forEach((celulas, indice) => {
    const numero = primeiraLinha + indice;
    const valor = (nome: string) => {
      const posicao = colunas.indexOf(nome as never);
      return posicao >= 0 ? (celulas[posicao] ?? "").trim() : "";
    };
    const frente = limparTextoDoAnki(valor("frente"));
    const verso = limparTextoDoAnki(valor("verso"));
    const tipoPedido = semAcento(valor("tipo"));
    const ehLacuna = tipoPedido.startsWith("lacuna") || tipoPedido === "cloze" || (!tipoPedido && /\{\{[^{}]+\}\}/.test(frente));
    const tipo: TipoCard = ehLacuna ? "lacuna" : "basico";
    try {
      prepararCard(tipo, frente, verso);
    } catch (falha) {
      ignoradas.push({ linha: numero, motivo: falha instanceof Error ? falha.message : "Card inválido." });
      return;
    }
    cards.push({ materia: valor("materia"), tipo, frente, verso });
  });
  return { cards, ignoradas };
}

export function cardsParaCsv(
  cards: { materiaNome: string; tipo: TipoCard; enunciado: string; resposta: string }[],
  separador = ";",
) {
  const linhas = [["materia", "tipo", "frente", "verso"], ...cards.map((c) => [c.materiaNome, c.tipo, c.enunciado, c.resposta])];
  // A BOM faz o Excel abrir os acentos certos.
  return `﻿${linhas.map((linha) => linha.map((valor) => escaparCampo(valor, separador)).join(separador)).join("\r\n")}\r\n`;
}
