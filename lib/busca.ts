/** Minúsculas e sem acento, para "adminstração" achar "administração" e "ação" achar "ACAO". */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Divide o que foi digitado em palavras já normalizadas. */
export function palavrasDaBusca(termo: string) {
  return normalizar(termo).split(/\s+/).filter(Boolean);
}

/** O texto (já normalizado) tem todas as palavras da busca, em qualquer ordem. */
export function combinaComBusca(textoNormalizado: string, palavras: string[]) {
  return palavras.every((palavra) => textoNormalizado.includes(palavra));
}
