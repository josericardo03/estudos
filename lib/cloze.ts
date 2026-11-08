export type ParteCloze = { texto: string; oculto: boolean };

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
 * Esconde as palavras-chave de um trecho (até 3, ou 1 em trecho curto).
 * Serve para virar pergunta de lacuna e para a releitura ativa do cadernão.
 */
export function lacunar(texto: string, maximo = 3): ParteCloze[] {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return [];
  const candidatas = palavrasDe(limpo);
  if (!candidatas.length) return [{ texto: limpo, oculto: false }];

  const quantas = Math.min(maximo, candidatas.length, limpo.length < 90 ? 1 : maximo);
  const escolhidas = candidatas
    .slice()
    .sort((a, b) => b.nota - a.nota || a.inicio - b.inicio)
    .slice(0, quantas)
    .sort((a, b) => a.inicio - b.inicio);

  const partes: ParteCloze[] = [];
  let cursor = 0;
  for (const palavra of escolhidas) {
    if (palavra.inicio > cursor) partes.push({ texto: limpo.slice(cursor, palavra.inicio), oculto: false });
    partes.push({ texto: limpo.slice(palavra.inicio, palavra.fim), oculto: true });
    cursor = palavra.fim;
  }
  if (cursor < limpo.length) partes.push({ texto: limpo.slice(cursor), oculto: false });
  return partes;
}

/** Enunciado com lacunas e gabarito com o trecho inteiro, prontos para editar. */
export function gerarCloze(texto: string) {
  const partes = lacunar(texto);
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!partes.some((parte) => parte.oculto)) {
    return { enunciado: `Explique com as suas palavras: ${limpo}`, resposta: limpo };
  }
  const lacunado = partes.map((parte) => (parte.oculto ? "_____" : parte.texto)).join("");
  const escondidas = partes.filter((parte) => parte.oculto).map((parte) => parte.texto);
  return {
    enunciado: `Complete: ${lacunado}`,
    resposta: `${escondidas.join(" · ")}\n\n${limpo}`,
  };
}
