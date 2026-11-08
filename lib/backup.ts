import { registrarCopia } from "./copias";
import { chaveDia } from "./datas";
import { getDb } from "./db";
import { ErroEstudo } from "./erros";

const TABELAS = [
  "materias",
  "pdfs",

  "grifos",
  "postits",
  "questoes",
  "tentativas",
  "editais",
  "editalMaterias",
  "editalTopicos",
  "lancamentos",
  "estudos",
] as const;

const CAMPOS_BLOB = ["blob", "imagem"] as const;
type Linha = Record<string, unknown>;

function dataUrlDe(blob: Blob) {
  return new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

async function prepararLinha(linha: Linha) {
  const copia: Linha = { ...linha };
  for (const campo of CAMPOS_BLOB) {
    const valor = copia[campo];
    if (valor instanceof Blob) copia[campo] = { __blob: await dataUrlDe(valor) };
  }
  return JSON.stringify(copia);
}

async function reviverLinha(linha: Linha) {
  const copia: Linha = { ...linha };
  for (const campo of CAMPOS_BLOB) {
    const valor = copia[campo];
    if (valor && typeof valor === "object" && "__blob" in valor && typeof valor.__blob === "string") {
      copia[campo] = await (await fetch(valor.__blob)).blob();
    }
  }
  return copia;
}

/** Tudo o que está neste navegador (PDFs e figuras incluídos) num arquivo só. */
export async function gerarBackup() {
  const db = getDb();
  const partes: BlobPart[] = [`{"app":"foco","versao":1,"criadoEm":${Date.now()},"tabelas":{`];
  let primeira = true;
  for (const nome of TABELAS) {
    const linhas = (await db.table(nome).toArray()) as Linha[];
    partes.push(`${primeira ? "" : ","}${JSON.stringify(nome)}:[`);
    primeira = false;
    for (let i = 0; i < linhas.length; i += 1) {
      partes.push(`${i ? "," : ""}${await prepararLinha(linhas[i])}`);
    }
    partes.push("]");
  }
  partes.push("}}");
  return new Blob(partes, { type: "application/json" });
}

export async function baixarBackup() {
  const blob = await gerarBackup();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `foco-backup-${chaveDia(Date.now())}.json`;
  link.click();
  registrarCopia();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob.size;
}

/** Mescla o backup com o que já existe: linhas com o mesmo id são sobrescritas. */
export async function restaurarBackup(arquivo: File) {
  let conteudo: { app?: string; versao?: number; tabelas?: Record<string, Linha[]> };
  try {
    conteudo = JSON.parse(await arquivo.text());
  } catch {
    throw new ErroEstudo("Este arquivo não é um backup do Foco, ou é grande demais para abrir de uma vez.");
  }
  if (conteudo.app !== "foco" || !conteudo.tabelas) {
    throw new ErroEstudo("Este arquivo não é um backup do Foco.");
  }
  const db = getDb();
  let total = 0;
  for (const nome of TABELAS) {
    const linhas = conteudo.tabelas[nome];
    if (!Array.isArray(linhas) || !linhas.length) continue;
    const revividas: Linha[] = [];
    for (const linha of linhas) revividas.push(await reviverLinha(linha));
    await db.table(nome).bulkPut(revividas);
    total += revividas.length;
  }
  return total;
}
