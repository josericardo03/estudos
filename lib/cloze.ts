const PALAVRAS_FRACAS = new Set([
  "porque", "entretanto", "contudo", "todavia", "portanto", "quando", "sempre", "mesmo", "outros",
  "outras", "assim", "também", "depois", "antes", "ainda", "sobre", "entre", "dentro", "contra",
  "segundo", "conforme", "mediante", "através", "durante", "inclusive", "somente", "apenas",
  "qualquer", "quaisquer", "seguinte", "seguintes", "quanto", "quanta", "cujo", "cuja",
]);

type Palavra = { inicio: number; fim: number; texto: string; nota: number };

function palavrasDe(texto: string) {
  const achadas: Palavra[] = [];
  const regra = /[\p{L}\p{N}][\p{L}\p{N}\-/.,]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu;
  for (const achado of texto.matchAll(regra)) {
    const bruta = achado[0];
    const limpa = bruta.replace(/[.,]+$/g, "");
    if (limpa.length < 5) continue;
    if (PALAVRAS_FRACAS.has(limpa.toLowerCase())) continue;
    const inicio = achado.index ?? 0;
    const temNumero = /\p{N}/u.test(limpa);
    // Números e prazos valem mais; depois as palavras longas; maiúscula no meio da frase conta.
    let nota = limpa.length + (temNumero ? 8 : 0);
    if (/^\p{Lu}/u.test(limpa) && inicio > 0) nota += 3;
    achadas.push({ inicio, fim: inicio + limpa.length, texto: limpa, nota });
  }
  return achadas;
}

/**
 * Sugere onde pôr as lacunas de um trecho: devolve o texto com {{ }} em volta das
 * palavras-chave (até 3, ou 1 em trecho curto). Você pode editar à vontade.
 */
export function sugerirLacunas(texto: string, maximo = 3) {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  const candidatas = palavrasDe(limpo);
  if (!candidatas.length) return limpo;

  const quantas = Math.min(maximo, candidatas.length, limpo.length < 90 ? 1 : maximo);
  const escolhidas = candidatas
    .slice()
    .sort((a, b) => b.nota - a.nota || a.inicio - b.inicio)
    .slice(0, quantas)
    .sort((a, b) => a.inicio - b.inicio);

  let saida = "";
  let cursor = 0;
  for (const palavra of escolhidas) {
    saida += limpo.slice(cursor, palavra.inicio);
    saida += `{{${limpo.slice(palavra.inicio, palavra.fim)}}}`;
    cursor = palavra.fim;
  }
  return saida + limpo.slice(cursor);
}
