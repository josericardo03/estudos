import { chaveDia } from "./datas";
import { ErroEstudo } from "./erros";
import { registrarCopia } from "./copias";
import { supabase } from "./supabase";

/**
 * Cópia de segurança dos dados guardados no Supabase.
 *
 * Um projeto gratuito não tem backup automático, e um ano de estudo vale a pena guardar.
 * A cópia leva as linhas de todas as tabelas, em JSON. Os arquivos dos PDFs e das figuras
 * não vão junto (continuam no Storage); ao restaurar, os cards, o histórico e os editais
 * voltam, e você reenvia os PDFs.
 */

const TABELAS = [
  "materias",
  "pdfs",
  "editais",
  "edital_materias",
  "edital_topicos",
  "grifos",
  "postits",
  "questoes",
  "tentativas",
  "lancamentos",
  "estudos",
] as const;

type Tabela = (typeof TABELAS)[number];
type Linha = Record<string, unknown>;

const POR_PAGINA = 1000;
async function lerTabela(tabela: Tabela) {
  const linhas: Linha[] = [];
  for (let de = 0; ; de += POR_PAGINA) {
    const { data, error } = await supabase()
      .from(tabela)
      .select("*")
      .order("id")
      .range(de, de + POR_PAGINA - 1);
    if (error) throw new ErroEstudo(`Não foi possível ler a tabela ${tabela}.`);
    const lote = (data ?? []) as Linha[];
    linhas.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }
  return linhas;
}

export async function gerarCopiaDaNuvem() {
  const tabelas: Record<string, Linha[]> = {};
  const contagem: Record<string, number> = {};
  for (const tabela of TABELAS) {
    tabelas[tabela] = await lerTabela(tabela);
    contagem[tabela] = tabelas[tabela].length;
  }
  const conteudo = { app: "foco", origem: "nuvem", versao: 1, criadoEm: Date.now(), contagem, tabelas };
  return new Blob([JSON.stringify(conteudo)], { type: "application/json" });
}

export async function baixarCopiaDaNuvem() {
  const blob = await gerarCopiaDaNuvem();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `foco-nuvem-${chaveDia(Date.now())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  registrarCopia();
  return blob.size;
}

/** O que dá para restaurar sem os arquivos dos PDFs, na ordem em que as tabelas dependem umas das outras. */
const RESTAURAVEIS: Tabela[] = [
  "materias",
  "editais",
  "edital_materias",
  "edital_topicos",
  "questoes",
  "tentativas",
  "lancamentos",
  "estudos",
];

/** Colunas que apontam para um PDF: sem o arquivo, o vínculo é desfeito. */
const SEM_PDF: Partial<Record<Tabela, string[]>> = {
  edital_topicos: ["pdf_id", "pagina_inicio", "pagina_fim"],
  questoes: ["pdf_id"],
  tentativas: ["pdf_id"],
};

export async function restaurarCopiaDaNuvem(arquivo: File) {
  let conteudo: { app?: string; origem?: string; tabelas?: Record<string, Linha[]> };
  try {
    conteudo = JSON.parse(await arquivo.text());
  } catch {
    throw new ErroEstudo("Este arquivo não é uma cópia do Foco.");
  }
  if (conteudo.app !== "foco" || conteudo.origem !== "nuvem" || !conteudo.tabelas) {
    throw new ErroEstudo("Este arquivo não é uma cópia da nuvem do Foco. Cópias do modo local usam outro formato.");
  }
  let total = 0;
  for (const tabela of RESTAURAVEIS) {
    const linhas = conteudo.tabelas[tabela];
    if (!Array.isArray(linhas) || !linhas.length) continue;
    const limpas = linhas.map((linha) => {
      const copia: Linha = { ...linha };
      // O dono é sempre quem está logado, mesmo ao restaurar numa conta nova.
      delete copia.user_id;
      for (const coluna of SEM_PDF[tabela] ?? []) copia[coluna] = null;
      return copia;
    });
    for (let i = 0; i < limpas.length; i += 500) {
      const { error } = await supabase()
        .from(tabela)
        .upsert(limpas.slice(i, i + 500), { onConflict: "id" });
      if (error) throw new ErroEstudo(`A restauração parou na tabela ${tabela}. O que já voltou foi mantido.`);
    }
    total += limpas.length;
  }
  return total;
}
