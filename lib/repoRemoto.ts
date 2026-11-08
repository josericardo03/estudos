import { chaveDia, dataDaChave, somarDias } from "./datas";
import { ErroEstudo } from "./erros";
import { blocoDaPagina, conflitoDeFaixa, descreverFaixa, validarFaixa } from "./faixa";
import { garantirMigracao } from "./migrar";
import { avisarMudanca } from "./mudancas";
import { supabase } from "./supabase";
import type {
  Bloco,
  Confianca,
  CorGrifo,
  Edital,
  EditalMateria,
  EditalTopico,
  Estudo,
  Grifo,
  Lancamento,
  Materia,
  MotivoErro,
  Nota,
  PdfDoc,
  PostIt,
  Questao,
  Rect,
  StatusBloco,
  StatusRevisao,
  Tentativa,
} from "./types";
import { MAX_QUESTOES } from "./types";

type LinhaMateria = { id: string; nome: string; created_at: string };
type LinhaPdf = {
  id: string;
  materia_id: string;
  nome: string;
  storage_path: string;
  num_pages: number;
  created_at: string;
};
type LinhaBloco = {
  id: string;
  pdf_id: string;
  titulo: string;
  pagina_inicio: number;
  pagina_fim: number;
  status: StatusBloco;
  resumo: string | null;
  proxima_revisao_em: string | null;
  revisoes: number | null;
  created_at: string;
};
type LinhaGrifo = {
  id: string;
  pdf_id: string;
  bloco_id: string | null;
  pagina: number;
  texto: string;
  cor: CorGrifo;
  rects: Rect[];
  imagem_path: string | null;
  created_at: string;
};
type LinhaPostit = {
  id: string;
  pdf_id: string;
  bloco_id: string | null;
  pagina: number;
  texto: string;
  x: number;
  y: number;
  created_at: string;
};
type LinhaQuestao = {
  id: string;
  bloco_id: string;
  materia_id: string;
  pdf_id: string;
  enunciado: string;
  resposta: string;
  status_revisao: StatusRevisao;
  sequencia: number;
  facilidade: number | null;
  intervalo_dias: number | null;
  proxima_em: string | null;
  created_at: string;
};
type LinhaTentativa = {
  id: string;
  questao_id: string;
  pdf_id: string;
  materia_id: string;
  bloco_id: string;
  acertou: boolean;
  nota: number | null;
  confianca: number | null;
  motivo: string | null;
  em: string;
};
type LinhaEdital = { id: string; nome: string; orgao: string; data_prova: string | null; created_at: string };
type LinhaVinculo = { id: string; edital_id: string; materia_id: string };
type LinhaTopico = {
  id: string;
  edital_id: string;
  materia_id: string | null;
  nome: string;
  peso: number;
  bloco_id: string | null;
  feito: boolean;
  created_at: string;
};
type LinhaLancamento = {
  id: string;
  materia_id: string;
  feitas: number;
  acertos: number;
  fonte: string;
  em: string;
};
type LinhaEstudo = { id: string; materia_id: string | null; segundos: number; em: string };

const cachePdf = new Map<string, Blob>();
const cacheMarca = new Map<string, Blob>();
const PDFS_NA_MEMORIA = 3;
const NOME_CACHE_PDF = "foco-pdfs-v1";
const LIMITE_CACHE_PDF = 600 * 1024 * 1024;

/** Guarda só os PDFs mais recentes na memória. O resto fica no Cache Storage. */
function lembrarPdf(caminho: string, blob: Blob) {
  cachePdf.delete(caminho);
  cachePdf.set(caminho, blob);
  while (cachePdf.size > PDFS_NA_MEMORIA) {
    const maisAntigo = cachePdf.keys().next().value;
    if (maisAntigo === undefined) break;
    cachePdf.delete(maisAntigo);
  }
}

async function cacheDePdfs() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(NOME_CACHE_PDF);
  } catch {
    return null;
  }
}

function enderecoDoCache(caminho: string) {
  return new Request(`/__foco-cache/pdfs/${encodeURIComponent(caminho)}`);
}

async function lerPdfDoCache(caminho: string) {
  const cache = await cacheDePdfs();
  if (!cache) return null;
  try {
    const resposta = await cache.match(enderecoDoCache(caminho));
    return resposta ? await resposta.blob() : null;
  } catch {
    return null;
  }
}

async function guardarPdfNoCache(caminho: string, blob: Blob) {
  const cache = await cacheDePdfs();
  if (!cache) return;
  try {
    const chaves = await cache.keys();
    let total = blob.size;
    const tamanhos: { chave: Request; tamanho: number }[] = [];
    for (const chave of chaves) {
      const guardada = await cache.match(chave);
      const tamanho = guardada ? Number(guardada.headers.get("content-length") ?? 0) : 0;
      tamanhos.push({ chave, tamanho });
      total += tamanho;
    }
    // Os mais antigos entram primeiro em keys(): saem primeiro.
    for (const item of tamanhos) {
      if (total <= LIMITE_CACHE_PDF) break;
      await cache.delete(item.chave);
      total -= item.tamanho;
    }
    await cache.put(
      enderecoDoCache(caminho),
      new Response(blob, {
        headers: { "content-type": "application/pdf", "content-length": String(blob.size) },
      }),
    );
  } catch {
    /* sem espaço ou sem permissão: o PDF continua vindo do servidor */
  }
}

async function tirarPdfDoCache(caminho: string) {
  const cache = await cacheDePdfs();
  if (!cache) return;
  try {
    await cache.delete(enderecoDoCache(caminho));
  } catch {
    /* nada a fazer */
  }
}

function novoId() {
  return crypto.randomUUID();
}

function exigirNome(nome: string, vazio: string) {
  const limpo = nome.trim();
  if (!limpo) throw new ErroEstudo(vazio);
  return limpo;
}

function limitar(valor: number, minimo: number, maximo: number) {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function epoca(valor: string | null | undefined) {
  if (!valor) return undefined;
  const numero = Date.parse(valor);
  return Number.isNaN(numero) ? undefined : numero;
}

function epocaObrigatoria(valor: string) {
  return epoca(valor) ?? Date.now();
}

function checar(error: { message: string } | null, fallback: string) {
  if (!error) return;
  const texto = error.message;
  if (/row-level security|permission denied|invalid api key|jwt/i.test(texto)) {
    throw new ErroEstudo("O Supabase recusou o acesso. Confira se o schema.sql terminou sem erro.");
  }
  if (/bucket not found/i.test(texto)) {
    throw new ErroEstudo("Falta o espaço de arquivos pdfs ou marcas. Rode o schema.sql até o fim.");
  }
  throw new ErroEstudo(fallback);
}

function porNome<T extends { nome: string }>(lista: T[]) {
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function ordenarBlocos(lista: Bloco[]) {
  return lista.sort((a, b) => a.paginaInicio - b.paginaInicio || a.createdAt - b.createdAt);
}

function materiaDe(linha: LinhaMateria): Materia {
  return { id: linha.id, nome: linha.nome, createdAt: epocaObrigatoria(linha.created_at) };
}

function pdfDe(linha: LinhaPdf, blob?: Blob): PdfDoc {
  return {
    id: linha.id,
    materiaId: linha.materia_id,
    nome: linha.nome,
    numPages: linha.num_pages,
    createdAt: epocaObrigatoria(linha.created_at),
    ...(blob ? { blob } : {}),
  };
}

function blocoDe(linha: LinhaBloco): Bloco {
  const proximaRevisaoEm = epoca(linha.proxima_revisao_em);
  return {
    id: linha.id,
    pdfId: linha.pdf_id,
    titulo: linha.titulo,
    paginaInicio: linha.pagina_inicio,
    paginaFim: linha.pagina_fim,
    status: linha.status,
    ...(linha.resumo ? { resumo: linha.resumo } : {}),
    ...(proximaRevisaoEm != null ? { proximaRevisaoEm } : {}),
    ...(linha.revisoes != null ? { revisoes: linha.revisoes } : {}),
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function grifoDe(linha: LinhaGrifo, imagem?: Blob): Grifo {
  return {
    id: linha.id,
    pdfId: linha.pdf_id,
    blocoId: linha.bloco_id,
    pagina: linha.pagina,
    texto: linha.texto,
    cor: linha.cor,
    rects: Array.isArray(linha.rects) ? linha.rects : [],
    createdAt: epocaObrigatoria(linha.created_at),
    ...(imagem ? { imagem } : {}),
  };
}

function postitDe(linha: LinhaPostit): PostIt {
  return {
    id: linha.id,
    pdfId: linha.pdf_id,
    blocoId: linha.bloco_id,
    pagina: linha.pagina,
    texto: linha.texto,
    x: linha.x,
    y: linha.y,
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function questaoDe(linha: LinhaQuestao): Questao {
  const proximaEm = epoca(linha.proxima_em);
  return {
    id: linha.id,
    blocoId: linha.bloco_id,
    materiaId: linha.materia_id,
    pdfId: linha.pdf_id,
    enunciado: linha.enunciado,
    resposta: linha.resposta,
    statusRevisao: linha.status_revisao,
    sequencia: linha.sequencia ?? 0,
    ...(linha.facilidade != null ? { facilidade: linha.facilidade } : {}),
    ...(linha.intervalo_dias != null ? { intervaloDias: linha.intervalo_dias } : {}),
    ...(proximaEm != null ? { proximaEm } : {}),
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function tentativaDe(linha: LinhaTentativa): Tentativa {
  return {
    id: linha.id,
    questaoId: linha.questao_id,
    pdfId: linha.pdf_id,
    materiaId: linha.materia_id,
    blocoId: linha.bloco_id,
    acertou: linha.acertou,
    em: epocaObrigatoria(linha.em),
    ...(linha.nota != null ? { nota: linha.nota as Nota } : {}),
    ...(linha.confianca != null ? { confianca: linha.confianca as Confianca } : {}),
    ...(linha.motivo ? { motivo: linha.motivo as MotivoErro } : {}),
  };
}

function editalDe(linha: LinhaEdital): Edital {
  return {
    id: linha.id,
    nome: linha.nome,
    orgao: linha.orgao,
    dataProva: linha.data_prova ? dataDaChave(linha.data_prova.slice(0, 10)) : null,
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function vinculoDe(linha: LinhaVinculo): EditalMateria {
  return { id: linha.id, editalId: linha.edital_id, materiaId: linha.materia_id };
}

function topicoDe(linha: LinhaTopico): EditalTopico {
  return {
    id: linha.id,
    editalId: linha.edital_id,
    materiaId: linha.materia_id,
    nome: linha.nome,
    peso: linha.peso,
    blocoId: linha.bloco_id,
    feito: linha.feito,
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function lancamentoDe(linha: LinhaLancamento): Lancamento {
  return {
    id: linha.id,
    materiaId: linha.materia_id,
    feitas: linha.feitas,
    acertos: linha.acertos,
    fonte: linha.fonte,
    em: epocaObrigatoria(linha.em),
  };
}

function estudoDe(linha: LinhaEstudo): Estudo {
  return {
    id: linha.id,
    materiaId: linha.materia_id,
    segundos: linha.segundos,
    em: epocaObrigatoria(linha.em),
  };
}

function limitarPeso(peso: number) {
  if (!Number.isFinite(peso)) return 3;
  return Math.min(5, Math.max(1, Math.round(peso)));
}

function validarLancamento(feitas: number, acertos: number) {
  if (!Number.isInteger(feitas) || !Number.isInteger(acertos)) {
    throw new ErroEstudo("Use números inteiros.");
  }
  if (feitas < 1) throw new ErroEstudo("Informe quantas questões você fez.");
  if (acertos < 0 || acertos > feitas) throw new ErroEstudo("Os acertos não podem passar do total.");
}

async function baixar(bucket: "pdfs" | "marcas", caminho: string, cache: Map<string, Blob>, fallback: string) {
  const guardado = cache.get(caminho);
  if (guardado) {
    if (bucket === "pdfs") lembrarPdf(caminho, guardado);
    return guardado;
  }
  if (bucket === "pdfs") {
    const emDisco = await lerPdfDoCache(caminho);
    if (emDisco && emDisco.size > 0) {
      lembrarPdf(caminho, emDisco);
      return emDisco;
    }
  }
  const { data, error } = await supabase().storage.from(bucket).download(caminho);
  checar(error, fallback);
  if (!data) throw new ErroEstudo(fallback);
  if (bucket === "pdfs") {
    lembrarPdf(caminho, data);
    void guardarPdfNoCache(caminho, data);
  } else {
    cache.set(caminho, data);
  }
  return data;
}

async function comImagens(linhas: LinhaGrifo[]) {
  return Promise.all(
    linhas.map(async (linha) => {
      if (!linha.imagem_path) return grifoDe(linha);
      try {
        const imagem = await baixar("marcas", linha.imagem_path, cacheMarca, "Não foi possível abrir a marcação.");
        return grifoDe(linha, imagem);
      } catch {
        return grifoDe(linha);
      }
    }),
  );
}

async function sincronizarAnotacoes(pdfId: string) {
  const blocos = await repoRemoto.blocos.listarPorPdf(pdfId);
  const { data: grifos, error: erroGrifos } = await supabase().from("grifos").select("*").eq("pdf_id", pdfId);
  checar(erroGrifos, "Não foi possível atualizar os grifos.");
  const { data: postits, error: erroPostits } = await supabase().from("postits").select("*").eq("pdf_id", pdfId);
  checar(erroPostits, "Não foi possível atualizar os post-its.");
  const linhasGrifo = (grifos ?? []) as LinhaGrifo[];
  const linhasPostit = (postits ?? []) as LinhaPostit[];
  await Promise.all([
    ...linhasGrifo.map(async (grifo) => {
      const blocoId = blocoDaPagina(blocos, grifo.pagina)?.id ?? null;
      if (grifo.bloco_id === blocoId) return;
      const { error } = await supabase().from("grifos").update({ bloco_id: blocoId }).eq("id", grifo.id);
      checar(error, "Não foi possível atualizar os grifos.");
    }),
    ...linhasPostit.map(async (postit) => {
      const blocoId = blocoDaPagina(blocos, postit.pagina)?.id ?? null;
      if (postit.bloco_id === blocoId) return;
      const { error } = await supabase().from("postits").update({ bloco_id: blocoId }).eq("id", postit.id);
      checar(error, "Não foi possível atualizar os post-its.");
    }),
  ]);
}

async function caminhosDasMarcas(pdfIds: string[]) {
  if (!pdfIds.length) return [];
  const { data, error } = await supabase().from("grifos").select("imagem_path").in("pdf_id", pdfIds);
  checar(error, "Não foi possível ler as marcações.");
  return ((data ?? []) as { imagem_path: string | null }[])
    .map((linha) => linha.imagem_path)
    .filter((caminho): caminho is string => Boolean(caminho));
}

export const repoRemoto = {
  materias: {
    async listar(): Promise<Materia[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("materias").select("*");
      checar(error, "Não foi possível ler as matérias.");
      return porNome(((data ?? []) as LinhaMateria[]).map(materiaDe));
    },
    async obter(idMateria: string): Promise<Materia | null> {
      await garantirMigracao();
      const { data, error } = await supabase().from("materias").select("*").eq("id", idMateria).maybeSingle();
      checar(error, "Não foi possível ler a matéria.");
      return data ? materiaDe(data as LinhaMateria) : null;
    },
    async criar(nome: string): Promise<Materia> {
      await garantirMigracao();
      const materia: Materia = {
        id: novoId(),
        nome: exigirNome(nome, "Dê um nome à matéria."),
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("materias").insert({
        id: materia.id,
        nome: materia.nome,
        created_at: iso(materia.createdAt),
      });
      checar(error, "Não foi possível criar a matéria.");
      avisarMudanca();
      return materia;
    },
    async renomear(idMateria: string, nome: string) {
      await garantirMigracao();
      const limpo = exigirNome(nome, "Dê um nome à matéria.");
      const { data, error } = await supabase()
        .from("materias")
        .update({ nome: limpo })
        .eq("id", idMateria)
        .select("id");
      checar(error, "Não foi possível renomear a matéria.");
      if (!data?.length) throw new ErroEstudo("Matéria não encontrada.");
      avisarMudanca();
    },
    async remover(idMateria: string) {
      await garantirMigracao();
      const { data: pdfs, error: erroPdfs } = await supabase()
        .from("pdfs")
        .select("id, storage_path")
        .eq("materia_id", idMateria);
      checar(erroPdfs, "Não foi possível excluir a matéria.");
      const linhas = (pdfs ?? []) as { id: string; storage_path: string }[];
      const marcas = await caminhosDasMarcas(linhas.map((pdf) => pdf.id));
      if (marcas.length) {
        const { error } = await supabase().storage.from("marcas").remove(marcas);
        checar(error, "Não foi possível excluir a matéria.");
        for (const caminho of marcas) cacheMarca.delete(caminho);
      }
      if (linhas.length) {
        const caminhos = linhas.map((pdf) => pdf.storage_path);
        const { error } = await supabase().storage.from("pdfs").remove(caminhos);
        checar(error, "Não foi possível excluir a matéria.");
        for (const caminho of caminhos) {
          cachePdf.delete(caminho);
          void tirarPdfDoCache(caminho);
        }
      }
      const { error } = await supabase().from("materias").delete().eq("id", idMateria);
      checar(error, "Não foi possível excluir a matéria.");
      avisarMudanca();
    },
  },

  pdfs: {
    async listarTodos(): Promise<PdfDoc[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("pdfs").select("*");
      checar(error, "Não foi possível ler os PDFs.");
      return ((data ?? []) as LinhaPdf[])
        .map((linha) => pdfDe(linha))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async listarPorMateria(materiaId: string): Promise<PdfDoc[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("pdfs").select("*").eq("materia_id", materiaId);
      checar(error, "Não foi possível ler os PDFs.");
      return ((data ?? []) as LinhaPdf[])
        .map((linha) => pdfDe(linha))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async obter(pdfId: string, opcoes?: { arquivo?: boolean }): Promise<PdfDoc | null> {
      await garantirMigracao();
      const { data, error } = await supabase().from("pdfs").select("*").eq("id", pdfId).maybeSingle();
      checar(error, "Não foi possível abrir o PDF.");
      if (!data) return null;
      const linha = data as LinhaPdf;
      if (!opcoes?.arquivo) return pdfDe(linha);
      const blob = await baixar("pdfs", linha.storage_path, cachePdf, "Não foi possível abrir o PDF.");
      return pdfDe(linha, blob);
    },
    async criar(entrada: { materiaId: string; nome: string; blob: Blob; numPages: number }): Promise<PdfDoc> {
      await garantirMigracao();
      const materia = await repoRemoto.materias.obter(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      if (entrada.numPages < 1) throw new ErroEstudo("Este PDF não tem páginas.");
      const pdf: PdfDoc = {
        id: novoId(),
        materiaId: entrada.materiaId,
        nome: exigirNome(entrada.nome, "O PDF precisa de um nome."),
        blob: entrada.blob,
        numPages: entrada.numPages,
        createdAt: Date.now(),
      };
      const caminho = `${pdf.id}.pdf`;
      const enviado = await supabase().storage.from("pdfs").upload(caminho, entrada.blob, {
        contentType: "application/pdf",
        upsert: false,
      });
      checar(enviado.error, "Não foi possível guardar o PDF.");
      const { error } = await supabase().from("pdfs").insert({
        id: pdf.id,
        materia_id: pdf.materiaId,
        nome: pdf.nome,
        storage_path: caminho,
        num_pages: pdf.numPages,
        created_at: iso(pdf.createdAt),
      });
      if (error) {
        await supabase().storage.from("pdfs").remove([caminho]);
        checar(error, "Não foi possível guardar o PDF.");
      }
      lembrarPdf(caminho, entrada.blob);
      void guardarPdfNoCache(caminho, entrada.blob);
      avisarMudanca();
      return pdf;
    },
    async renomear(pdfId: string, nome: string) {
      await garantirMigracao();
      const limpo = exigirNome(nome, "O PDF precisa de um nome.");
      const { data, error } = await supabase().from("pdfs").update({ nome: limpo }).eq("id", pdfId).select("id");
      checar(error, "Não foi possível renomear o PDF.");
      if (!data?.length) throw new ErroEstudo("PDF não encontrado.");
      avisarMudanca();
    },
    async remover(pdfId: string) {
      await garantirMigracao();
      const { data, error: erroLeitura } = await supabase()
        .from("pdfs")
        .select("storage_path")
        .eq("id", pdfId)
        .maybeSingle();
      checar(erroLeitura, "Não foi possível excluir o PDF.");
      const marcas = await caminhosDasMarcas([pdfId]);
      if (marcas.length) {
        const { error } = await supabase().storage.from("marcas").remove(marcas);
        checar(error, "Não foi possível excluir o PDF.");
        for (const caminho of marcas) cacheMarca.delete(caminho);
      }
      const caminho = (data as { storage_path: string } | null)?.storage_path;
      if (caminho) {
        const { error } = await supabase().storage.from("pdfs").remove([caminho]);
        checar(error, "Não foi possível excluir o PDF.");
        cachePdf.delete(caminho);
        void tirarPdfDoCache(caminho);
      }
      const { error } = await supabase().from("pdfs").delete().eq("id", pdfId);
      checar(error, "Não foi possível excluir o PDF.");
      avisarMudanca();
    },
  },

  blocos: {
    async listarTodos() {
      await garantirMigracao();
      const { data, error } = await supabase().from("blocos").select("*");
      checar(error, "Não foi possível ler os blocos.");
      return ordenarBlocos(((data ?? []) as LinhaBloco[]).map(blocoDe));
    },
    async listarPorPdf(pdfId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("blocos").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os blocos.");
      return ordenarBlocos(((data ?? []) as LinhaBloco[]).map(blocoDe));
    },
    async obter(blocoId: string): Promise<Bloco | null> {
      await garantirMigracao();
      const { data, error } = await supabase().from("blocos").select("*").eq("id", blocoId).maybeSingle();
      checar(error, "Não foi possível ler o bloco.");
      return data ? blocoDe(data as LinhaBloco) : null;
    },
    async criar(entrada: { pdfId: string; titulo: string; paginaInicio: number; paginaFim: number }) {
      await garantirMigracao();
      const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const erroFaixa = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
      if (erroFaixa) throw new ErroEstudo(erroFaixa);
      const existentes = await repoRemoto.blocos.listarPorPdf(pdf.id);
      const conflito = conflitoDeFaixa(existentes, entrada.paginaInicio, entrada.paginaFim);
      if (conflito) {
        throw new ErroEstudo(
          `Esta faixa cruza "${conflito.titulo}" (${descreverFaixa(conflito.paginaInicio, conflito.paginaFim)}).`,
        );
      }
      const bloco: Bloco = {
        id: novoId(),
        pdfId: pdf.id,
        titulo: entrada.titulo.trim() || `Páginas ${entrada.paginaInicio}–${entrada.paginaFim}`,
        paginaInicio: entrada.paginaInicio,
        paginaFim: entrada.paginaFim,
        status: "estudando",
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("blocos").insert({
        id: bloco.id,
        pdf_id: bloco.pdfId,
        titulo: bloco.titulo,
        pagina_inicio: bloco.paginaInicio,
        pagina_fim: bloco.paginaFim,
        status: bloco.status,
        created_at: iso(bloco.createdAt),
      });
      checar(error, "Não foi possível criar o bloco.");
      await sincronizarAnotacoes(pdf.id);
      avisarMudanca();
      return bloco;
    },
    async atualizar(blocoId: string, entrada: { titulo: string; paginaInicio: number; paginaFim: number }) {
      await garantirMigracao();
      const bloco = await repoRemoto.blocos.obter(blocoId);
      if (!bloco) throw new ErroEstudo("Bloco não encontrado.");
      const pdf = await repoRemoto.pdfs.obter(bloco.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const erroFaixa = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
      if (erroFaixa) throw new ErroEstudo(erroFaixa);
      const existentes = await repoRemoto.blocos.listarPorPdf(pdf.id);
      const conflito = conflitoDeFaixa(existentes, entrada.paginaInicio, entrada.paginaFim, bloco.id);
      if (conflito) {
        throw new ErroEstudo(
          `Esta faixa cruza "${conflito.titulo}" (${descreverFaixa(conflito.paginaInicio, conflito.paginaFim)}).`,
        );
      }
      const { data, error } = await supabase()
        .from("blocos")
        .update({
          titulo: exigirNome(entrada.titulo, "Dê um título ao bloco."),
          pagina_inicio: entrada.paginaInicio,
          pagina_fim: entrada.paginaFim,
        })
        .eq("id", bloco.id)
        .select("id");
      checar(error, "Não foi possível atualizar o bloco.");
      if (!data?.length) throw new ErroEstudo("Bloco não encontrado.");
      await sincronizarAnotacoes(pdf.id);
      avisarMudanca();
    },
    async definirStatus(blocoId: string, status: StatusBloco) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("blocos")
        .update({ status })
        .eq("id", blocoId)
        .select("id");
      checar(error, "Não foi possível atualizar o bloco.");
      if (!data?.length) throw new ErroEstudo("Bloco não encontrado.");
      avisarMudanca();
    },
    async salvarResumo(blocoId: string, resumo: string) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("blocos")
        .update({ resumo: resumo.trim() })
        .eq("id", blocoId)
        .select("id");
      checar(error, "Não foi possível guardar o resumo.");
      if (!data?.length) throw new ErroEstudo("Bloco não encontrado.");
      avisarMudanca();
    },
    async finalizar(blocoId: string, resumo: string) {
      await garantirMigracao();
      const limpo = exigirNome(resumo, "Resuma o bloco com as suas palavras antes de finalizar.");
      const { data, error } = await supabase()
        .from("blocos")
        .update({
          status: "finalizado",
          resumo: limpo,
          revisoes: 0,
          proxima_revisao_em: iso(somarDias(Date.now(), 1)),
        })
        .eq("id", blocoId)
        .select("id");
      checar(error, "Não foi possível finalizar o bloco.");
      if (!data?.length) throw new ErroEstudo("Bloco não encontrado.");
      avisarMudanca();
    },
    async registrarRevisao(blocoId: string, entrada: { revisoes: number; proximaRevisaoEm: number }) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("blocos")
        .update({ revisoes: entrada.revisoes, proxima_revisao_em: iso(entrada.proximaRevisaoEm) })
        .eq("id", blocoId)
        .select("id");
      checar(error, "Não foi possível registrar a revisão.");
      if (!data?.length) throw new ErroEstudo("Bloco não encontrado.");
      avisarMudanca();
    },
    async remover(blocoId: string) {
      await garantirMigracao();
      const bloco = await repoRemoto.blocos.obter(blocoId);
      if (!bloco) return;
      const { error } = await supabase().from("blocos").delete().eq("id", blocoId);
      checar(error, "Não foi possível excluir o bloco.");
      await sincronizarAnotacoes(bloco.pdfId);
      avisarMudanca();
    },
  },

  grifos: {
    async listarPorPdf(pdfId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("grifos").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os grifos.");
      const lista = await comImagens((data ?? []) as LinhaGrifo[]);
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async listarPorBloco(blocoId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("grifos").select("*").eq("bloco_id", blocoId);
      checar(error, "Não foi possível ler os grifos.");
      const lista = await comImagens((data ?? []) as LinhaGrifo[]);
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: { pdfId: string; pagina: number; texto: string; cor: CorGrifo; rects: Rect[]; imagem?: Blob }) {
      await garantirMigracao();
      const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Selecione um trecho de texto para grifar.");
      if (!entrada.rects.length) throw new ErroEstudo("Não consegui localizar o trecho selecionado.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const blocos = await repoRemoto.blocos.listarPorPdf(pdf.id);
      const grifo: Grifo = {
        id: novoId(),
        pdfId: pdf.id,
        blocoId: blocoDaPagina(blocos, entrada.pagina)?.id ?? null,
        pagina: entrada.pagina,
        texto,
        cor: entrada.cor,
        rects: entrada.rects,
        ...(entrada.imagem ? { imagem: entrada.imagem } : {}),
        createdAt: Date.now(),
      };
      let imagemPath: string | null = null;
      if (entrada.imagem) {
        imagemPath = `${grifo.id}.png`;
        const enviado = await supabase().storage.from("marcas").upload(imagemPath, entrada.imagem, {
          contentType: "image/png",
          upsert: false,
        });
        checar(enviado.error, "Não foi possível guardar a marcação.");
        cacheMarca.set(imagemPath, entrada.imagem);
      }
      const { error } = await supabase().from("grifos").insert({
        id: grifo.id,
        pdf_id: grifo.pdfId,
        bloco_id: grifo.blocoId,
        pagina: grifo.pagina,
        texto: grifo.texto,
        cor: grifo.cor,
        rects: grifo.rects,
        imagem_path: imagemPath,
        created_at: iso(grifo.createdAt),
      });
      if (error) {
        if (imagemPath) await supabase().storage.from("marcas").remove([imagemPath]);
        checar(error, "Não foi possível guardar a marcação.");
      }
      avisarMudanca();
      return grifo;
    },
    async remover(grifoId: string) {
      await garantirMigracao();
      const { data, error: erroLeitura } = await supabase()
        .from("grifos")
        .select("imagem_path")
        .eq("id", grifoId)
        .maybeSingle();
      checar(erroLeitura, "Não foi possível apagar a marcação.");
      const caminho = (data as { imagem_path: string | null } | null)?.imagem_path;
      const { error } = await supabase().from("grifos").delete().eq("id", grifoId);
      checar(error, "Não foi possível apagar a marcação.");
      if (caminho) {
        cacheMarca.delete(caminho);
        await supabase().storage.from("marcas").remove([caminho]);
      }
      avisarMudanca();
    },
  },

  postits: {
    async listarPorPdf(pdfId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("postits").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os post-its.");
      return ((data ?? []) as LinhaPostit[])
        .map(postitDe)
        .sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async listarPorBloco(blocoId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("postits").select("*").eq("bloco_id", blocoId);
      checar(error, "Não foi possível ler os post-its.");
      return ((data ?? []) as LinhaPostit[])
        .map(postitDe)
        .sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: { pdfId: string; pagina: number; texto: string; x: number; y: number }) {
      await garantirMigracao();
      const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Escreva o post-it antes de fixar.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const blocos = await repoRemoto.blocos.listarPorPdf(pdf.id);
      const postit: PostIt = {
        id: novoId(),
        pdfId: pdf.id,
        blocoId: blocoDaPagina(blocos, entrada.pagina)?.id ?? null,
        pagina: entrada.pagina,
        texto,
        x: limitar(entrada.x, 0.01, 0.98),
        y: limitar(entrada.y, 0.01, 0.98),
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("postits").insert({
        id: postit.id,
        pdf_id: postit.pdfId,
        bloco_id: postit.blocoId,
        pagina: postit.pagina,
        texto: postit.texto,
        x: postit.x,
        y: postit.y,
        created_at: iso(postit.createdAt),
      });
      checar(error, "Não foi possível guardar o post-it.");
      avisarMudanca();
      return postit;
    },
    async definirTexto(postitId: string, texto: string) {
      await garantirMigracao();
      const limpo = exigirNome(texto, "O post-it precisa de um texto.");
      const { data, error } = await supabase()
        .from("postits")
        .update({ texto: limpo })
        .eq("id", postitId)
        .select("id");
      checar(error, "Não foi possível atualizar o post-it.");
      if (!data?.length) throw new ErroEstudo("Post-it não encontrado.");
      avisarMudanca();
    },
    async mover(postitId: string, x: number, y: number) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("postits")
        .update({ x: limitar(x, 0.01, 0.98), y: limitar(y, 0.01, 0.98) })
        .eq("id", postitId)
        .select("id");
      checar(error, "Não foi possível mover o post-it.");
      if (!data?.length) throw new ErroEstudo("Post-it não encontrado.");
      avisarMudanca();
    },
    async remover(postitId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("postits").delete().eq("id", postitId);
      checar(error, "Não foi possível tirar o post-it.");
      avisarMudanca();
    },
  },

  questoes: {
    async listarPorBloco(blocoId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("questoes").select("*").eq("bloco_id", blocoId);
      checar(error, "Não foi possível ler as questões.");
      return ((data ?? []) as LinhaQuestao[]).map(questaoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorPdf(pdfId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("questoes").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler as questões.");
      return ((data ?? []) as LinhaQuestao[]).map(questaoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorMateria(materiaId: string) {
      await garantirMigracao();
      const { data, error } = await supabase().from("questoes").select("*").eq("materia_id", materiaId);
      checar(error, "Não foi possível ler as questões.");
      return ((data ?? []) as LinhaQuestao[]).map(questaoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarTodas() {
      await garantirMigracao();
      const { data, error } = await supabase().from("questoes").select("*");
      checar(error, "Não foi possível ler as questões.");
      return ((data ?? []) as LinhaQuestao[]).map(questaoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async contarPorMateria(): Promise<Record<string, number>> {
      await garantirMigracao();
      const { data, error } = await supabase().from("questoes").select("materia_id");
      checar(error, "Não foi possível contar as questões.");
      const contagem: Record<string, number> = {};
      for (const linha of (data ?? []) as { materia_id: string }[]) {
        contagem[linha.materia_id] = (contagem[linha.materia_id] ?? 0) + 1;
      }
      return contagem;
    },
    async contarVencidas(agora = Date.now()): Promise<number> {
      await garantirMigracao();
      const { count, error } = await supabase()
        .from("questoes")
        .select("id", { count: "exact", head: true })
        .or(`proxima_em.is.null,proxima_em.lte.${iso(agora)}`);
      checar(error, "Não foi possível contar as questões vencidas.");
      return count ?? 0;
    },
    async criar(entrada: { blocoId: string; materiaId: string; enunciado: string; resposta: string }) {
      await garantirMigracao();
      const enunciado = exigirNome(entrada.enunciado, "Escreva o enunciado.");
      const resposta = exigirNome(entrada.resposta, "Escreva a resposta.");
      const bloco = await repoRemoto.blocos.obter(entrada.blocoId);
      if (!bloco) throw new ErroEstudo("Bloco não encontrado.");
      const pdf = await repoRemoto.pdfs.obter(bloco.pdfId);
      if (!pdf || pdf.materiaId !== entrada.materiaId) {
        throw new ErroEstudo("Este bloco não pertence a esta matéria.");
      }
      const { count, error: erroContagem } = await supabase()
        .from("questoes")
        .select("id", { count: "exact", head: true })
        .eq("bloco_id", bloco.id);
      checar(erroContagem, "Não foi possível guardar a questão.");
      if ((count ?? 0) >= MAX_QUESTOES) throw new ErroEstudo(`Este bloco já tem ${MAX_QUESTOES} questões.`);
      const questao: Questao = {
        id: novoId(),
        blocoId: bloco.id,
        materiaId: pdf.materiaId,
        pdfId: pdf.id,
        enunciado,
        resposta,
        statusRevisao: "nova",
        sequencia: 0,
        facilidade: 2.5,
        intervaloDias: 0,
        proximaEm: Date.now(),
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("questoes").insert({
        id: questao.id,
        bloco_id: questao.blocoId,
        materia_id: questao.materiaId,
        pdf_id: questao.pdfId,
        enunciado: questao.enunciado,
        resposta: questao.resposta,
        status_revisao: questao.statusRevisao,
        sequencia: 0,
        facilidade: 2.5,
        intervalo_dias: 0,
        proxima_em: iso(questao.proximaEm ?? Date.now()),
        created_at: iso(questao.createdAt),
      });
      checar(error, "Não foi possível guardar a questão.");
      avisarMudanca();
      return questao;
    },
    async atualizar(questaoId: string, entrada: { enunciado: string; resposta: string }) {
      await garantirMigracao();
      const enunciado = exigirNome(entrada.enunciado, "Escreva o enunciado.");
      const resposta = exigirNome(entrada.resposta, "Escreva a resposta.");
      const { data, error } = await supabase()
        .from("questoes")
        .update({ enunciado, resposta })
        .eq("id", questaoId)
        .select("id");
      checar(error, "Não foi possível atualizar a questão.");
      if (!data?.length) throw new ErroEstudo("Questão não encontrada.");
      avisarMudanca();
    },
    async registrarJulgamento(
      questaoId: string,
      entrada: {
        sequencia: number;
        proximaEm: number;
        statusRevisao: StatusRevisao;
        facilidade: number;
        intervaloDias: number;
      },
      tentativa: Omit<Tentativa, "questaoId" | "em">,
    ) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("questoes")
        .update({
          sequencia: entrada.sequencia,
          facilidade: entrada.facilidade,
          intervalo_dias: entrada.intervaloDias,
          proxima_em: iso(entrada.proximaEm),
          status_revisao: entrada.statusRevisao,
        })
        .eq("id", questaoId)
        .select("id");
      checar(error, "Não foi possível guardar o resultado.");
      if (!data?.length) throw new ErroEstudo("Questão não encontrada.");
      const { error: erroTentativa } = await supabase().from("tentativas").upsert({
        id: tentativa.id,
        questao_id: questaoId,
        pdf_id: tentativa.pdfId,
        materia_id: tentativa.materiaId,
        bloco_id: tentativa.blocoId,
        acertou: tentativa.acertou,
        nota: tentativa.nota ?? null,
        confianca: tentativa.confianca ?? null,
        motivo: tentativa.motivo ?? null,
        em: iso(Date.now()),
      });
      checar(erroTentativa, "Não foi possível guardar o resultado.");
      avisarMudanca();
    },
    async remover(questaoId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("questoes").delete().eq("id", questaoId);
      checar(error, "Não foi possível excluir a questão.");
      avisarMudanca();
    },
  },

  tentativas: {
    async listar(): Promise<Tentativa[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("tentativas").select("*");
      checar(error, "Não foi possível ler os resultados.");
      return ((data ?? []) as LinhaTentativa[]).map(tentativaDe);
    },
  },

  editais: {
    async listar(): Promise<Edital[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("editais").select("*");
      checar(error, "Não foi possível ler os editais.");
      return porNome(((data ?? []) as LinhaEdital[]).map(editalDe));
    },
    async obter(editalId: string): Promise<Edital | null> {
      await garantirMigracao();
      const { data, error } = await supabase().from("editais").select("*").eq("id", editalId).maybeSingle();
      checar(error, "Não foi possível ler o edital.");
      return data ? editalDe(data as LinhaEdital) : null;
    },
    async criar(entrada: { nome: string; orgao: string; dataProva?: number | null }) {
      await garantirMigracao();
      const edital: Edital = {
        id: novoId(),
        nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
        orgao: entrada.orgao.trim(),
        dataProva: entrada.dataProva ?? null,
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("editais").insert({
        id: edital.id,
        nome: edital.nome,
        orgao: edital.orgao,
        data_prova: edital.dataProva ? chaveDia(edital.dataProva) : null,
        created_at: iso(edital.createdAt),
      });
      checar(error, "Não foi possível criar o edital.");
      avisarMudanca();
      return edital;
    },
    async atualizar(editalId: string, entrada: { nome: string; orgao: string; dataProva?: number | null }) {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("editais")
        .update({
          nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
          orgao: entrada.orgao.trim(),
          data_prova: entrada.dataProva ? chaveDia(entrada.dataProva) : null,
        })
        .eq("id", editalId)
        .select("id");
      checar(error, "Não foi possível atualizar o edital.");
      if (!data?.length) throw new ErroEstudo("Edital não encontrado.");
      avisarMudanca();
    },
    async remover(editalId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("editais").delete().eq("id", editalId);
      checar(error, "Não foi possível excluir o edital.");
      avisarMudanca();
    },
    async vinculos(): Promise<EditalMateria[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("edital_materias").select("*");
      checar(error, "Não foi possível ler os vínculos dos editais.");
      return ((data ?? []) as LinhaVinculo[]).map(vinculoDe);
    },
    async materias(editalId: string): Promise<string[]> {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("edital_materias")
        .select("materia_id")
        .eq("edital_id", editalId);
      checar(error, "Não foi possível ler as matérias do edital.");
      return ((data ?? []) as { materia_id: string }[]).map((vinculo) => vinculo.materia_id);
    },
    async daMateria(materiaId: string): Promise<Edital[]> {
      await garantirMigracao();
      const { data, error } = await supabase()
        .from("edital_materias")
        .select("edital_id")
        .eq("materia_id", materiaId);
      checar(error, "Não foi possível ler os editais da matéria.");
      const ids = ((data ?? []) as { edital_id: string }[]).map((vinculo) => vinculo.edital_id);
      if (!ids.length) return [];
      const resposta = await supabase().from("editais").select("*").in("id", ids);
      checar(resposta.error, "Não foi possível ler os editais da matéria.");
      return porNome(((resposta.data ?? []) as LinhaEdital[]).map(editalDe));
    },
    async definirMaterias(editalId: string, materiaIds: string[]) {
      await garantirMigracao();
      const edital = await repoRemoto.editais.obter(editalId);
      if (!edital) throw new ErroEstudo("Edital não encontrado.");
      const unicos = [...new Set(materiaIds)];
      const atuais = await repoRemoto.editais.materias(editalId);
      const retirar = atuais.filter((idMateria) => !unicos.includes(idMateria));
      const incluir = unicos.filter((idMateria) => !atuais.includes(idMateria));
      if (retirar.length) {
        const { error } = await supabase()
          .from("edital_materias")
          .delete()
          .eq("edital_id", editalId)
          .in("materia_id", retirar);
        checar(error, "Não foi possível atualizar as matérias do edital.");
      }
      if (incluir.length) {
        const { error } = await supabase()
          .from("edital_materias")
          .insert(
            incluir.map((materiaId) => ({
              id: novoId(),
              edital_id: editalId,
              materia_id: materiaId,
            })),
          );
        checar(error, "Não foi possível atualizar as matérias do edital.");
      }
      avisarMudanca();
    },
  },

  topicos: {
    async listarTodos(): Promise<EditalTopico[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("edital_topicos").select("*");
      checar(error, "Não foi possível ler os tópicos.");
      return ((data ?? []) as LinhaTopico[]).map(topicoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorEdital(editalId: string): Promise<EditalTopico[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("edital_topicos").select("*").eq("edital_id", editalId);
      checar(error, "Não foi possível ler os tópicos.");
      return ((data ?? []) as LinhaTopico[]).map(topicoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async criar(entrada: { editalId: string; materiaId: string | null; nome: string; peso: number }) {
      await garantirMigracao();
      const edital = await repoRemoto.editais.obter(entrada.editalId);
      if (!edital) throw new ErroEstudo("Edital não encontrado.");
      const topico: EditalTopico = {
        id: novoId(),
        editalId: edital.id,
        materiaId: entrada.materiaId,
        nome: exigirNome(entrada.nome, "Dê um nome ao tópico."),
        peso: limitarPeso(entrada.peso),
        blocoId: null,
        feito: false,
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("edital_topicos").insert({
        id: topico.id,
        edital_id: topico.editalId,
        materia_id: topico.materiaId,
        nome: topico.nome,
        peso: topico.peso,
        bloco_id: null,
        feito: false,
        created_at: iso(topico.createdAt),
      });
      checar(error, "Não foi possível guardar o tópico.");
      avisarMudanca();
      return topico;
    },
    async atualizar(
      topicoId: string,
      entrada: Partial<Pick<EditalTopico, "nome" | "peso" | "materiaId" | "blocoId" | "feito">>,
    ) {
      await garantirMigracao();
      const mudanca: Record<string, unknown> = {};
      if (entrada.nome !== undefined) mudanca.nome = exigirNome(entrada.nome, "Dê um nome ao tópico.");
      if (entrada.peso !== undefined) mudanca.peso = limitarPeso(entrada.peso);
      if (entrada.materiaId !== undefined) mudanca.materia_id = entrada.materiaId;
      if (entrada.blocoId !== undefined) mudanca.bloco_id = entrada.blocoId;
      if (entrada.feito !== undefined) mudanca.feito = entrada.feito;
      const { data, error } = await supabase()
        .from("edital_topicos")
        .update(mudanca)
        .eq("id", topicoId)
        .select("id");
      checar(error, "Não foi possível atualizar o tópico.");
      if (!data?.length) throw new ErroEstudo("Tópico não encontrado.");
      avisarMudanca();
    },
    async remover(topicoId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("edital_topicos").delete().eq("id", topicoId);
      checar(error, "Não foi possível excluir o tópico.");
      avisarMudanca();
    },
  },

  lancamentos: {
    async listar(): Promise<Lancamento[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("lancamentos").select("*");
      checar(error, "Não foi possível ler os lançamentos.");
      return ((data ?? []) as LinhaLancamento[]).map(lancamentoDe).sort((a, b) => b.em - a.em);
    },
    async criar(entrada: { materiaId: string; feitas: number; acertos: number; fonte: string }) {
      await garantirMigracao();
      validarLancamento(entrada.feitas, entrada.acertos);
      const materia = await repoRemoto.materias.obter(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      const lancamento: Lancamento = {
        id: novoId(),
        materiaId: materia.id,
        feitas: entrada.feitas,
        acertos: entrada.acertos,
        fonte: entrada.fonte.trim(),
        em: Date.now(),
      };
      const { error } = await supabase().from("lancamentos").insert({
        id: lancamento.id,
        materia_id: lancamento.materiaId,
        feitas: lancamento.feitas,
        acertos: lancamento.acertos,
        fonte: lancamento.fonte,
        em: iso(lancamento.em),
      });
      checar(error, "Não foi possível guardar o lançamento.");
      avisarMudanca();
      return lancamento;
    },
    async remover(lancamentoId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("lancamentos").delete().eq("id", lancamentoId);
      checar(error, "Não foi possível excluir o lançamento.");
      avisarMudanca();
    },
  },

  estudos: {
    async listar(): Promise<Estudo[]> {
      await garantirMigracao();
      const { data, error } = await supabase().from("estudos").select("*");
      checar(error, "Não foi possível ler o tempo de estudo.");
      return ((data ?? []) as LinhaEstudo[]).map(estudoDe);
    },
    async registrar(entrada: { materiaId: string | null; segundos: number; em?: number }) {
      await garantirMigracao();
      const segundos = Math.round(entrada.segundos);
      if (!Number.isFinite(segundos) || segundos < 1) throw new ErroEstudo("A sessão ficou curta demais para registrar.");
      const estudo: Estudo = {
        id: novoId(),
        materiaId: entrada.materiaId,
        segundos,
        em: entrada.em ?? Date.now(),
      };
      const { error } = await supabase().from("estudos").insert({
        id: estudo.id,
        materia_id: estudo.materiaId,
        segundos: estudo.segundos,
        em: iso(estudo.em),
      });
      checar(error, "Não foi possível guardar a sessão.");
      avisarMudanca();
      return estudo;
    },
    async remover(estudoId: string) {
      await garantirMigracao();
      const { error } = await supabase().from("estudos").delete().eq("id", estudoId);
      checar(error, "Não foi possível excluir a sessão.");
      avisarMudanca();
    },
  },
};
