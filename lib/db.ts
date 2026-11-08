import Dexie, { type Table } from "dexie";
import type {
  Edital,
  EditalMateria,
  EditalTopico,
  Estudo,
  Grifo,
  Lancamento,
  Materia,
  PdfDoc,
  PostIt,
  Questao,
  Tentativa,
} from "./types";

/**
 * A classe é criada dentro de uma função, e não no topo do arquivo, para este módulo não ter
 * efeito colateral ao ser carregado. Assim, na versão da nuvem, o empacotador consegue
 * descartar o Dexie inteiro (o modo local é o único que o usa).
 */
function criarBanco() {
  class BancoFoco extends Dexie {
    materias!: Table<Materia, string>;
    pdfs!: Table<PdfDoc, string>;
    grifos!: Table<Grifo, string>;
    postits!: Table<PostIt, string>;
    questoes!: Table<Questao, string>;
    tentativas!: Table<Tentativa, string>;
    editais!: Table<Edital, string>;
    editalMaterias!: Table<EditalMateria, string>;
    editalTopicos!: Table<EditalTopico, string>;
    lancamentos!: Table<Lancamento, string>;
    estudos!: Table<Estudo, string>;

    constructor() {
      super("foco");
      this.version(1).stores({
        materias: "id, nome, createdAt",
        pdfs: "id, materiaId, createdAt",
        blocos: "id, pdfId, status, createdAt",
        grifos: "id, pdfId, blocoId, pagina, createdAt",
        postits: "id, pdfId, blocoId, pagina, createdAt",
        questoes: "id, blocoId, materiaId, pdfId, statusRevisao, createdAt",
        editais: "id, createdAt",
        editalMaterias: "id, editalId, materiaId",
      });
      this.version(2).stores({
        tentativas: "id, questaoId, pdfId, materiaId, blocoId, em",
      });
      this.version(3).stores({
        editalTopicos: "id, editalId, materiaId, blocoId",
        lancamentos: "id, materiaId, em",
        estudos: "id, materiaId, em",
      });
      // Versão sem blocos: o card pertence à matéria, ao PDF, à página e ao tópico.
      this.version(4).stores({
        blocos: null,
        grifos: "id, pdfId, pagina, createdAt",
        postits: "id, pdfId, pagina, createdAt",
        questoes: "id, materiaId, pdfId, topicoId, statusRevisao, createdAt",
        tentativas: "id, questaoId, materiaId, pdfId, topicoId, em",
        editalTopicos: "id, editalId, materiaId, pdfId",
      });
    }
  }
  return new BancoFoco();
}

export type BancoFoco = ReturnType<typeof criarBanco>;

let banco: BancoFoco | null = null;

export function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("O estudo fica salvo neste navegador.");
  }
  if (!banco) banco = criarBanco();
  return banco;
}
