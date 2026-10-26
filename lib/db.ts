import Dexie, { type Table } from "dexie";
import type {
  Bloco,
  Edital,
  EditalMateria,
  Grifo,
  Materia,
  PdfDoc,
  PostIt,
  Questao,
} from "./types";

class BancoFoco extends Dexie {
  materias!: Table<Materia, string>;
  pdfs!: Table<PdfDoc, string>;
  blocos!: Table<Bloco, string>;
  grifos!: Table<Grifo, string>;
  postits!: Table<PostIt, string>;
  questoes!: Table<Questao, string>;
  editais!: Table<Edital, string>;
  editalMaterias!: Table<EditalMateria, string>;

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
  }
}

let banco: BancoFoco | null = null;

export function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("O estudo fica salvo neste navegador.");
  }
  if (!banco) banco = new BancoFoco();
  return banco;
}
