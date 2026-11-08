import { ErroEstudo } from "./erros";
import type { TipoCard } from "./types";

export type ParteLacuna = { texto: string; oculto: boolean };

const LACUNA = /\{\{([^{}]+?)\}\}/g;

/** Quebra um texto com {{respostas}} em partes visíveis e partes escondidas. */
export function partesDaLacuna(texto: string): ParteLacuna[] {
  const partes: ParteLacuna[] = [];
  let cursor = 0;
  for (const achado of texto.matchAll(LACUNA)) {
    const inicio = achado.index ?? 0;
    if (inicio > cursor) partes.push({ texto: texto.slice(cursor, inicio), oculto: false });
    partes.push({ texto: achado[1].trim(), oculto: true });
    cursor = inicio + achado[0].length;
  }
  if (cursor < texto.length) partes.push({ texto: texto.slice(cursor), oculto: false });
  return partes;
}

export function contarLacunas(texto: string) {
  return partesDaLacuna(texto).filter((parte) => parte.oculto).length;
}

/** O texto com cada lacuna trocada por um traço, como o card aparece antes de revelar. */
export function ocultarLacunas(texto: string) {
  return partesDaLacuna(texto)
    .map((parte) => (parte.oculto ? "_____" : parte.texto))
    .join("");
}

/** O texto sem as chaves, como ele fica depois de revelado. */
export function textoRevelado(texto: string) {
  return partesDaLacuna(texto)
    .map((parte) => parte.texto)
    .join("");
}

/** Resumo de uma linha para listas, sem as chaves. */
export function resumoDoCard(tipo: TipoCard, enunciado: string, tamanho = 140) {
  const texto = tipo === "lacuna" ? partesDaLacuna(enunciado).map((p) => (p.oculto ? "[…]" : p.texto)).join("") : enunciado;
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho - 1)}…` : limpo;
}

/** Confere e limpa os textos de um card. Devolve os textos prontos para guardar. */
export function prepararCard(tipo: TipoCard, enunciado: string, resposta: string, temImagem = false) {
  const frente = enunciado.trim();
  const verso = resposta.trim();
  if (tipo === "lacuna") {
    if (!frente) throw new ErroEstudo("Escreva o texto do card.");
    if (contarLacunas(frente) === 0) {
      throw new ErroEstudo("Marque ao menos uma lacuna entre {{ e }}.");
    }
  } else {
    if (!frente && !temImagem) throw new ErroEstudo("Escreva a frente do card.");
    if (!verso) throw new ErroEstudo("Escreva o verso do card.");
  }
  return { enunciado: frente, resposta: verso };
}
