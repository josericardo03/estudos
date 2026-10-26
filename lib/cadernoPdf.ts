import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Prioridade } from "./types";

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 50;

const TINTA = rgb(0.11, 0.14, 0.12);
const SUAVE = rgb(0.42, 0.4, 0.36);
const CORES: Record<Prioridade, ReturnType<typeof rgb>> = {
  alta: rgb(0.78, 0.35, 0.28),
  media: rgb(0.72, 0.55, 0.12),
  baixa: rgb(0.28, 0.45, 0.6),
};

export type ItemCadernoPdf =
  | { tipo: "grifo"; cor: Prioridade; pagina: number; texto: string }
  | { tipo: "postit"; pagina: number; texto: string };

export type SecaoCadernoPdf = {
  titulo: string;
  detalhe: string;
  itens: ItemCadernoPdf[];
};

function textoSeguro(texto: string, fonte: PDFFont) {
  const trocado = texto
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("‘", "'")
    .replaceAll("’", "'")
    .replaceAll("…", "...")
    .replaceAll("\u00a0", " ");
  let saida = "";
  for (const caractere of trocado) {
    try {
      fonte.encodeText(caractere);
      saida += caractere;
    } catch {
      saida += " ";
    }
  }
  return saida.replace(/[ \t]+\n/g, "\n").replace(/[ ]{2,}/g, " ").trim();
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\n+/)) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    let atual = "";
    const empurrar = (pedaço: string) => {
      if (!atual) {
        atual = pedaço;
        return;
      }
      const tentativa = `${atual} ${pedaço}`;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        linhas.push(atual);
        atual = pedaço;
      }
    };
    for (const palavra of palavras) {
      if (fonte.widthOfTextAtSize(palavra, tamanho) <= largura) {
        empurrar(palavra);
        continue;
      }
      if (atual) {
        linhas.push(atual);
        atual = "";
      }
      let pedaço = "";
      for (const caractere of palavra) {
        const tentativa = pedaço + caractere;
        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) pedaço = tentativa;
        else {
          if (pedaço) linhas.push(pedaço);
          pedaço = caractere;
        }
      }
      atual = pedaço;
    }
    linhas.push(atual || " ");
  }
  return linhas.length ? linhas : [" "];
}

function nomeDoArquivo(nome: string) {
  const base = nome
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `cadernao-${base || "estudo"}.pdf`;
}

export async function gerarBytesCaderno(entrada: {
  materia: string;
  arquivo: string;
  secoes: SecaoCadernoPdf[];
}) {
  const documento = await PDFDocument.create();
  const corpo = await documento.embedFont(StandardFonts.TimesRoman);
  const destaque = await documento.embedFont(StandardFonts.TimesRomanBold);
  const miuda = await documento.embedFont(StandardFonts.Helvetica);
  let pagina = documento.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;
  const larguraUtil = LARGURA - MARGEM * 2;

  function novaPagina() {
    pagina = documento.addPage([LARGURA, ALTURA]);
    y = ALTURA - MARGEM;
  }

  function reservar(altura: number) {
    if (y - altura < MARGEM) novaPagina();
  }

  function linhasDe(texto: string, fonte: PDFFont, tamanho: number, largura = larguraUtil) {
    return quebrar(textoSeguro(texto, fonte), fonte, tamanho, largura);
  }

  function escrever(texto: string, fonte: PDFFont, tamanho: number, cor: ReturnType<typeof rgb>, x = MARGEM, largura = larguraUtil) {
    const linhas = linhasDe(texto, fonte, tamanho, largura);
    for (const linha of linhas) {
      reservar(tamanho + 6);
      pagina.drawText(linha, { x, y: y - tamanho, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 5;
    }
  }

  escrever(entrada.materia, miuda, 10, SUAVE);
  y -= 4;
  escrever("Cadernão", destaque, 26, TINTA);
  escrever(entrada.arquivo, corpo, 13, SUAVE);
  y -= 8;

  for (const secao of entrada.secoes) {
    reservar(48);
    y -= 8;
    pagina.drawLine({
      start: { x: MARGEM, y },
      end: { x: LARGURA - MARGEM, y },
      thickness: 0.6,
      color: rgb(0.86, 0.83, 0.76),
    });
    y -= 16;
    escrever(secao.titulo, destaque, 16, TINTA);
    escrever(secao.detalhe, miuda, 10, SUAVE);
    y -= 6;

    if (!secao.itens.length) {
      escrever("Nenhuma anotação nesta faixa.", corpo, 12, SUAVE);
      continue;
    }

    for (const item of secao.itens) {
      reservar(36);
      y -= 6;
      if (item.tipo === "grifo") {
        const cor = CORES[item.cor];
        const rotulo = item.cor === "alta" ? "Alta" : item.cor === "media" ? "Média" : "Baixa";
        escrever(`${rotulo}  ·  p. ${item.pagina}`, miuda, 9, cor);
        const linhas = linhasDe(item.texto, corpo, 12, larguraUtil - 14);
        for (const linha of linhas) {
          reservar(18);
          const topo = y;
          pagina.drawText(linha, {
            x: MARGEM + 14,
            y: topo - 12,
            size: 12,
            font: corpo,
            color: TINTA,
          });
          pagina.drawRectangle({ x: MARGEM, y: topo - 16, width: 3, height: 16, color: cor });
          y -= 18;
        }
      } else {
        escrever(`Post-it  ·  p. ${item.pagina}`, miuda, 9, CORES.media);
        escrever(item.texto, corpo, 12, TINTA, MARGEM + 14, larguraUtil - 14);
      }
    }
  }

  const paginas = documento.getPages();
  paginas.forEach((folha: PDFPage, indice) => {
    const rodape = textoSeguro(`Cadernão  ·  ${indice + 1} de ${paginas.length}`, miuda);
    folha.drawText(rodape, {
      x: MARGEM,
      y: 28,
      size: 9,
      font: miuda,
      color: SUAVE,
    });
  });

  return documento.save();
}

export async function baixarPdfCaderno(entrada: {
  materia: string;
  arquivo: string;
  secoes: SecaoCadernoPdf[];
}) {
  const bytes = await gerarBytesCaderno(entrada);
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const blob = new Blob([copia], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeDoArquivo(entrada.arquivo);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
