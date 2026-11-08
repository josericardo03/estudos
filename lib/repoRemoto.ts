import { prepararCard } from "./cards";
import { chaveDia, dataDaChave } from "./datas";
import { ErroEstudo } from "./erros";
import { validarFaixa } from "./faixa";
import { avisarMudanca } from "./mudancas";
import { supabase } from "./supabase";
import type {
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
  StatusRevisao,
  Tentativa,
  TipoCard,
} from "./types";

type LinhaMateria = { id: string; nome: string; created_at: string };
type LinhaPdf = {
  id: string;
  materia_id: string;
  nome: string;
  storage_path: string;
  num_pages: number;
  ultima_pagina: number | null;
  maior_pagina: number | null;
  created_at: string;
};
type LinhaGrifo = {
  id: string;
  pdf_id: string;
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
  pagina: number;
  texto: string;
  x: number;
  y: number;
  created_at: string;
};
type LinhaQuestao = {
  id: string;
  materia_id: string;
  pdf_id: string | null;
  pagina: number | null;
  topico_id: string | null;
  tipo: TipoCard;
  enunciado: string;
  resposta: string;
  imagem_path: string | null;
  suspensa: boolean;
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
  materia_id: string;
  pdf_id: string | null;
  topico_id: string | null;
  pagina: number | null;
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
  pdf_id: string | null;
  pagina_inicio: number | null;
  pagina_fim: number | null;
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

type AgendaCard = {
  sequencia: number;
  proximaEm: number;
  statusRevisao: StatusRevisao;
  facilidade: number;
  intervaloDias: number;
};

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
    throw new ErroEstudo("O Supabase recusou o acesso. Entre de novo ou confira se o schema.sql terminou sem erro.");
  }
  if (/bucket not found/i.test(texto)) {
    throw new ErroEstudo("Falta o espaço de arquivos pdfs ou marcas. Rode o schema.sql até o fim.");
  }
  throw new ErroEstudo(fallback);
}

function porNome<T extends { nome: string }>(lista: T[]) {
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
    ...(linha.ultima_pagina != null ? { ultimaPagina: linha.ultima_pagina } : {}),
    ...(linha.maior_pagina != null ? { maiorPagina: linha.maior_pagina } : {}),
    createdAt: epocaObrigatoria(linha.created_at),
    ...(blob ? { blob } : {}),
  };
}

function grifoDe(linha: LinhaGrifo, imagem?: Blob): Grifo {
  return {
    id: linha.id,
    pdfId: linha.pdf_id,
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
    pagina: linha.pagina,
    texto: linha.texto,
    x: linha.x,
    y: linha.y,
    createdAt: epocaObrigatoria(linha.created_at),
  };
}

function questaoDe(linha: LinhaQuestao, imagem?: Blob): Questao {
  const proximaEm = epoca(linha.proxima_em);
  return {
    id: linha.id,
    materiaId: linha.materia_id,
    pdfId: linha.pdf_id,
    pagina: linha.pagina,
    topicoId: linha.topico_id,
    tipo: linha.tipo ?? "basico",
    enunciado: linha.enunciado,
    resposta: linha.resposta ?? "",
    ...(imagem ? { imagem } : {}),
    suspensa: Boolean(linha.suspensa),
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
    materiaId: linha.materia_id,
    pdfId: linha.pdf_id,
    topicoId: linha.topico_id,
    pagina: linha.pagina,
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
    pdfId: linha.pdf_id,
    paginaInicio: linha.pagina_inicio,
    paginaFim: linha.pagina_fim,
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

async function imagemOuNada(caminho: string | null) {
  if (!caminho) return undefined;
  try {
    return await baixar("marcas", caminho, cacheMarca, "Não foi possível abrir a imagem.");
  } catch {
    return undefined;
  }
}

async function comImagens(linhas: LinhaGrifo[]) {
  return Promise.all(linhas.map(async (linha) => grifoDe(linha, await imagemOuNada(linha.imagem_path))));
}

async function cardsComImagens(linhas: LinhaQuestao[]) {
  return Promise.all(linhas.map(async (linha) => questaoDe(linha, await imagemOuNada(linha.imagem_path))));
}

async function caminhosDeMarcasDosPdfs(pdfIds: string[]) {
  if (!pdfIds.length) return [];
  const { data, error } = await supabase().from("grifos").select("imagem_path").in("pdf_id", pdfIds);
  checar(error, "Não foi possível ler as marcações.");
  return ((data ?? []) as { imagem_path: string | null }[])
    .map((linha) => linha.imagem_path)
    .filter((caminho): caminho is string => Boolean(caminho));
}

async function caminhosDeImagensDeCards(materiaId: string) {
  const { data, error } = await supabase()
    .from("questoes")
    .select("imagem_path")
    .eq("materia_id", materiaId)
    .not("imagem_path", "is", null);
  checar(error, "Não foi possível ler as imagens dos cards.");
  return ((data ?? []) as { imagem_path: string | null }[])
    .map((linha) => linha.imagem_path)
    .filter((caminho): caminho is string => Boolean(caminho));
}

function ordenarCards(lista: Questao[]) {
  return lista.sort((a, b) => a.createdAt - b.createdAt);
}

export const repoRemoto = {
  materias: {
    async listar(): Promise<Materia[]> {
      const { data, error } = await supabase().from("materias").select("*");
      checar(error, "Não foi possível ler as matérias.");
      return porNome(((data ?? []) as LinhaMateria[]).map(materiaDe));
    },
    async obter(idMateria: string): Promise<Materia | null> {
      const { data, error } = await supabase().from("materias").select("*").eq("id", idMateria).maybeSingle();
      checar(error, "Não foi possível ler a matéria.");
      return data ? materiaDe(data as LinhaMateria) : null;
    },
    async criar(nome: string): Promise<Materia> {
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
      const { data: pdfs, error: erroPdfs } = await supabase()
        .from("pdfs")
        .select("id, storage_path")
        .eq("materia_id", idMateria);
      checar(erroPdfs, "Não foi possível excluir a matéria.");
      const linhas = (pdfs ?? []) as { id: string; storage_path: string }[];
      const marcas = [
        ...(await caminhosDeMarcasDosPdfs(linhas.map((pdf) => pdf.id))),
        ...(await caminhosDeImagensDeCards(idMateria)),
      ];
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
      const { data, error } = await supabase().from("pdfs").select("*");
      checar(error, "Não foi possível ler os PDFs.");
      return ((data ?? []) as LinhaPdf[])
        .map((linha) => pdfDe(linha))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async listarPorMateria(materiaId: string): Promise<PdfDoc[]> {
      const { data, error } = await supabase().from("pdfs").select("*").eq("materia_id", materiaId);
      checar(error, "Não foi possível ler os PDFs.");
      return ((data ?? []) as LinhaPdf[])
        .map((linha) => pdfDe(linha))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async obter(pdfId: string, opcoes?: { arquivo?: boolean }): Promise<PdfDoc | null> {
      const { data, error } = await supabase().from("pdfs").select("*").eq("id", pdfId).maybeSingle();
      checar(error, "Não foi possível abrir o PDF.");
      if (!data) return null;
      const linha = data as LinhaPdf;
      if (!opcoes?.arquivo) return pdfDe(linha);
      const blob = await baixar("pdfs", linha.storage_path, cachePdf, "Não foi possível abrir o PDF.");
      return pdfDe(linha, blob);
    },
    async criar(entrada: { materiaId: string; nome: string; blob: Blob; numPages: number }): Promise<PdfDoc> {
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
      const limpo = exigirNome(nome, "O PDF precisa de um nome.");
      const { data, error } = await supabase().from("pdfs").update({ nome: limpo }).eq("id", pdfId).select("id");
      checar(error, "Não foi possível renomear o PDF.");
      if (!data?.length) throw new ErroEstudo("PDF não encontrado.");
      avisarMudanca();
    },
    async registrarLeitura(pdfId: string, pagina: number) {
      const { data, error } = await supabase()
        .from("pdfs")
        .select("num_pages, maior_pagina")
        .eq("id", pdfId)
        .maybeSingle();
      checar(error, "Não foi possível guardar a página.");
      if (!data) return;
      const linha = data as { num_pages: number; maior_pagina: number | null };
      const ultima = limitar(Math.round(pagina), 1, linha.num_pages);
      const resposta = await supabase()
        .from("pdfs")
        .update({ ultima_pagina: ultima, maior_pagina: Math.max(linha.maior_pagina ?? 0, ultima) })
        .eq("id", pdfId);
      checar(resposta.error, "Não foi possível guardar a página.");
    },
    async remover(pdfId: string) {
      const { data, error: erroLeitura } = await supabase()
        .from("pdfs")
        .select("storage_path")
        .eq("id", pdfId)
        .maybeSingle();
      checar(erroLeitura, "Não foi possível excluir o PDF.");
      const marcas = await caminhosDeMarcasDosPdfs([pdfId]);
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
      // Os cards ficam, sem o PDF de origem: o banco troca pdf_id por nulo.
      const { error } = await supabase().from("pdfs").delete().eq("id", pdfId);
      checar(error, "Não foi possível excluir o PDF.");
      avisarMudanca();
    },
  },

  grifos: {
    async listarPorPdf(pdfId: string) {
      const { data, error } = await supabase().from("grifos").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os grifos.");
      const lista = await comImagens((data ?? []) as LinhaGrifo[]);
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: { pdfId: string; pagina: number; texto: string; cor: CorGrifo; rects: Rect[]; imagem?: Blob }) {
      const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Selecione um trecho de texto para grifar.");
      if (!entrada.rects.length) throw new ErroEstudo("Não consegui localizar o trecho selecionado.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const grifo: Grifo = {
        id: novoId(),
        pdfId: pdf.id,
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
      const { data, error } = await supabase().from("postits").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os post-its.");
      return ((data ?? []) as LinhaPostit[])
        .map(postitDe)
        .sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: { pdfId: string; pagina: number; texto: string; x: number; y: number }) {
      const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Escreva o post-it antes de fixar.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const postit: PostIt = {
        id: novoId(),
        pdfId: pdf.id,
        pagina: entrada.pagina,
        texto,
        x: limitar(entrada.x, 0.01, 0.98),
        y: limitar(entrada.y, 0.01, 0.98),
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("postits").insert({
        id: postit.id,
        pdf_id: postit.pdfId,
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
      const { error } = await supabase().from("postits").delete().eq("id", postitId);
      checar(error, "Não foi possível tirar o post-it.");
      avisarMudanca();
    },
  },

  questoes: {
    async listarPorPdf(pdfId: string) {
      const { data, error } = await supabase().from("questoes").select("*").eq("pdf_id", pdfId);
      checar(error, "Não foi possível ler os cards.");
      const lista = await cardsComImagens((data ?? []) as LinhaQuestao[]);
      return lista.sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0) || a.createdAt - b.createdAt);
    },
    async listarPorMateria(materiaId: string) {
      const { data, error } = await supabase().from("questoes").select("*").eq("materia_id", materiaId);
      checar(error, "Não foi possível ler os cards.");
      return ordenarCards(await cardsComImagens((data ?? []) as LinhaQuestao[]));
    },
    async listarTodas() {
      const { data, error } = await supabase().from("questoes").select("*");
      checar(error, "Não foi possível ler os cards.");
      return ordenarCards(await cardsComImagens((data ?? []) as LinhaQuestao[]));
    },
    async contarPorMateria(): Promise<Record<string, number>> {
      const { data, error } = await supabase().from("questoes").select("materia_id");
      checar(error, "Não foi possível contar os cards.");
      const contagem: Record<string, number> = {};
      for (const linha of (data ?? []) as { materia_id: string }[]) {
        contagem[linha.materia_id] = (contagem[linha.materia_id] ?? 0) + 1;
      }
      return contagem;
    },
    async contarVencidas(agora = Date.now()): Promise<number> {
      const { count, error } = await supabase()
        .from("questoes")
        .select("id", { count: "exact", head: true })
        .eq("suspensa", false)
        .or(`proxima_em.is.null,proxima_em.lte.${iso(agora)}`);
      checar(error, "Não foi possível contar os cards vencidos.");
      return count ?? 0;
    },
    async criar(entrada: {
      materiaId: string;
      pdfId?: string | null;
      pagina?: number | null;
      topicoId?: string | null;
      tipo?: TipoCard;
      enunciado: string;
      resposta: string;
      imagem?: Blob;
    }) {
      const tipo = entrada.tipo ?? "basico";
      const textos = prepararCard(tipo, entrada.enunciado, entrada.resposta, Boolean(entrada.imagem));
      const materia = await repoRemoto.materias.obter(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      if (entrada.pdfId) {
        const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
        if (!pdf || pdf.materiaId !== materia.id) throw new ErroEstudo("Este PDF não pertence a esta matéria.");
      }
      const agora = Date.now();
      const questao: Questao = {
        id: novoId(),
        materiaId: materia.id,
        pdfId: entrada.pdfId ?? null,
        pagina: entrada.pagina ?? null,
        topicoId: entrada.topicoId ?? null,
        tipo,
        enunciado: textos.enunciado,
        resposta: textos.resposta,
        ...(entrada.imagem ? { imagem: entrada.imagem } : {}),
        suspensa: false,
        statusRevisao: "nova",
        sequencia: 0,
        facilidade: 2.5,
        intervaloDias: 0,
        proximaEm: agora,
        createdAt: agora,
      };
      let imagemPath: string | null = null;
      if (entrada.imagem) {
        imagemPath = `card-${questao.id}.png`;
        const enviado = await supabase().storage.from("marcas").upload(imagemPath, entrada.imagem, {
          contentType: "image/png",
          upsert: false,
        });
        checar(enviado.error, "Não foi possível guardar a imagem do card.");
        cacheMarca.set(imagemPath, entrada.imagem);
      }
      const { error } = await supabase().from("questoes").insert({
        id: questao.id,
        materia_id: questao.materiaId,
        pdf_id: questao.pdfId,
        pagina: questao.pagina,
        topico_id: questao.topicoId,
        tipo: questao.tipo,
        enunciado: questao.enunciado,
        resposta: questao.resposta,
        imagem_path: imagemPath,
        suspensa: false,
        status_revisao: questao.statusRevisao,
        sequencia: 0,
        facilidade: 2.5,
        intervalo_dias: 0,
        proxima_em: iso(agora),
        created_at: iso(agora),
      });
      if (error) {
        if (imagemPath) await supabase().storage.from("marcas").remove([imagemPath]);
        checar(error, "Não foi possível guardar o card.");
      }
      avisarMudanca();
      return questao;
    },
    async atualizar(
      questaoId: string,
      entrada: { enunciado: string; resposta: string; topicoId?: string | null },
    ) {
      const { data: atual, error: erroLeitura } = await supabase()
        .from("questoes")
        .select("tipo, imagem_path")
        .eq("id", questaoId)
        .maybeSingle();
      checar(erroLeitura, "Não foi possível atualizar o card.");
      if (!atual) throw new ErroEstudo("Card não encontrado.");
      const linha = atual as { tipo: TipoCard; imagem_path: string | null };
      const textos = prepararCard(linha.tipo, entrada.enunciado, entrada.resposta, Boolean(linha.imagem_path));
      const { data, error } = await supabase()
        .from("questoes")
        .update({
          ...textos,
          ...(entrada.topicoId !== undefined ? { topico_id: entrada.topicoId } : {}),
        })
        .eq("id", questaoId)
        .select("id");
      checar(error, "Não foi possível atualizar o card.");
      if (!data?.length) throw new ErroEstudo("Card não encontrado.");
      avisarMudanca();
    },
    async definirSuspensa(questaoId: string, suspensa: boolean) {
      const { data, error } = await supabase()
        .from("questoes")
        .update({ suspensa })
        .eq("id", questaoId)
        .select("id");
      checar(error, "Não foi possível suspender o card.");
      if (!data?.length) throw new ErroEstudo("Card não encontrado.");
      avisarMudanca();
    },
    async registrarJulgamento(
      questaoId: string,
      entrada: AgendaCard,
      tentativa: Omit<Tentativa, "questaoId" | "em">,
    ) {
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
      if (!data?.length) throw new ErroEstudo("Card não encontrado.");
      const { error: erroTentativa } = await supabase().from("tentativas").upsert({
        id: tentativa.id,
        questao_id: questaoId,
        materia_id: tentativa.materiaId,
        pdf_id: tentativa.pdfId,
        topico_id: tentativa.topicoId,
        pagina: tentativa.pagina,
        acertou: tentativa.acertou,
        nota: tentativa.nota ?? null,
        confianca: tentativa.confianca ?? null,
        motivo: tentativa.motivo ?? null,
        em: iso(Date.now()),
      });
      checar(erroTentativa, "Não foi possível guardar o resultado.");
      avisarMudanca();
    },
    async desfazerJulgamento(questaoId: string, anterior: AgendaCard, tentativaId: string) {
      const { data, error } = await supabase()
        .from("questoes")
        .update({
          sequencia: anterior.sequencia,
          facilidade: anterior.facilidade,
          intervalo_dias: anterior.intervaloDias,
          proxima_em: iso(anterior.proximaEm),
          status_revisao: anterior.statusRevisao,
        })
        .eq("id", questaoId)
        .select("id");
      checar(error, "Não foi possível desfazer a nota.");
      if (!data?.length) throw new ErroEstudo("Card não encontrado.");
      const apagada = await supabase().from("tentativas").delete().eq("id", tentativaId);
      checar(apagada.error, "Não foi possível desfazer a nota.");
      avisarMudanca();
    },
    async remover(questaoId: string) {
      const { data, error: erroLeitura } = await supabase()
        .from("questoes")
        .select("imagem_path")
        .eq("id", questaoId)
        .maybeSingle();
      checar(erroLeitura, "Não foi possível excluir o card.");
      const caminho = (data as { imagem_path: string | null } | null)?.imagem_path;
      const { error } = await supabase().from("questoes").delete().eq("id", questaoId);
      checar(error, "Não foi possível excluir o card.");
      if (caminho) {
        cacheMarca.delete(caminho);
        await supabase().storage.from("marcas").remove([caminho]);
      }
      avisarMudanca();
    },
  },

  tentativas: {
    async listar(): Promise<Tentativa[]> {
      const { data, error } = await supabase().from("tentativas").select("*");
      checar(error, "Não foi possível ler os resultados.");
      return ((data ?? []) as LinhaTentativa[]).map(tentativaDe);
    },
  },

  editais: {
    async listar(): Promise<Edital[]> {
      const { data, error } = await supabase().from("editais").select("*");
      checar(error, "Não foi possível ler os editais.");
      return porNome(((data ?? []) as LinhaEdital[]).map(editalDe));
    },
    async obter(editalId: string): Promise<Edital | null> {
      const { data, error } = await supabase().from("editais").select("*").eq("id", editalId).maybeSingle();
      checar(error, "Não foi possível ler o edital.");
      return data ? editalDe(data as LinhaEdital) : null;
    },
    async criar(entrada: { nome: string; orgao: string; dataProva?: number | null }) {
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
      // Os tópicos saem junto; os cards deles ficam, sem tópico (o banco cuida disso).
      const { error } = await supabase().from("editais").delete().eq("id", editalId);
      checar(error, "Não foi possível excluir o edital.");
      avisarMudanca();
    },
    async vinculos(): Promise<EditalMateria[]> {
      const { data, error } = await supabase().from("edital_materias").select("*");
      checar(error, "Não foi possível ler os vínculos dos editais.");
      return ((data ?? []) as LinhaVinculo[]).map(vinculoDe);
    },
    async materias(editalId: string): Promise<string[]> {
      const { data, error } = await supabase()
        .from("edital_materias")
        .select("materia_id")
        .eq("edital_id", editalId);
      checar(error, "Não foi possível ler as matérias do edital.");
      return ((data ?? []) as { materia_id: string }[]).map((vinculo) => vinculo.materia_id);
    },
    async daMateria(materiaId: string): Promise<Edital[]> {
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
      const { data, error } = await supabase().from("edital_topicos").select("*");
      checar(error, "Não foi possível ler os tópicos.");
      return ((data ?? []) as LinhaTopico[]).map(topicoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorEdital(editalId: string): Promise<EditalTopico[]> {
      const { data, error } = await supabase().from("edital_topicos").select("*").eq("edital_id", editalId);
      checar(error, "Não foi possível ler os tópicos.");
      return ((data ?? []) as LinhaTopico[]).map(topicoDe).sort((a, b) => a.createdAt - b.createdAt);
    },
    async criar(entrada: { editalId: string; materiaId: string | null; nome: string; peso: number }) {
      const edital = await repoRemoto.editais.obter(entrada.editalId);
      if (!edital) throw new ErroEstudo("Edital não encontrado.");
      const topico: EditalTopico = {
        id: novoId(),
        editalId: edital.id,
        materiaId: entrada.materiaId,
        nome: exigirNome(entrada.nome, "Dê um nome ao tópico."),
        peso: limitarPeso(entrada.peso),
        pdfId: null,
        paginaInicio: null,
        paginaFim: null,
        feito: false,
        createdAt: Date.now(),
      };
      const { error } = await supabase().from("edital_topicos").insert({
        id: topico.id,
        edital_id: topico.editalId,
        materia_id: topico.materiaId,
        nome: topico.nome,
        peso: topico.peso,
        feito: false,
        created_at: iso(topico.createdAt),
      });
      checar(error, "Não foi possível guardar o tópico.");
      avisarMudanca();
      return topico;
    },
    async atualizar(
      topicoId: string,
      entrada: Partial<
        Pick<EditalTopico, "nome" | "peso" | "materiaId" | "pdfId" | "paginaInicio" | "paginaFim" | "feito">
      >,
    ) {
      const mudanca: Record<string, unknown> = {};
      if (entrada.nome !== undefined) mudanca.nome = exigirNome(entrada.nome, "Dê um nome ao tópico.");
      if (entrada.peso !== undefined) mudanca.peso = limitarPeso(entrada.peso);
      if (entrada.materiaId !== undefined) mudanca.materia_id = entrada.materiaId;
      if (entrada.feito !== undefined) mudanca.feito = entrada.feito;
      if (entrada.pdfId !== undefined) mudanca.pdf_id = entrada.pdfId;
      if (entrada.pdfId === null) {
        mudanca.pagina_inicio = null;
        mudanca.pagina_fim = null;
      }
      if (entrada.paginaInicio !== undefined) mudanca.pagina_inicio = entrada.paginaInicio;
      if (entrada.paginaFim !== undefined) mudanca.pagina_fim = entrada.paginaFim;
      if (entrada.pdfId && entrada.paginaInicio != null && entrada.paginaFim != null) {
        const pdf = await repoRemoto.pdfs.obter(entrada.pdfId);
        if (!pdf) throw new ErroEstudo("PDF não encontrado.");
        const erro = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
        if (erro) throw new ErroEstudo(erro);
      }
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
      const { error } = await supabase().from("edital_topicos").delete().eq("id", topicoId);
      checar(error, "Não foi possível excluir o tópico.");
      avisarMudanca();
    },
  },

  lancamentos: {
    async listar(): Promise<Lancamento[]> {
      const { data, error } = await supabase().from("lancamentos").select("*");
      checar(error, "Não foi possível ler os lançamentos.");
      return ((data ?? []) as LinhaLancamento[]).map(lancamentoDe).sort((a, b) => b.em - a.em);
    },
    async criar(entrada: { materiaId: string; feitas: number; acertos: number; fonte: string }) {
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
      const { error } = await supabase().from("lancamentos").delete().eq("id", lancamentoId);
      checar(error, "Não foi possível excluir o lançamento.");
      avisarMudanca();
    },
  },

  estudos: {
    async listar(): Promise<Estudo[]> {
      const { data, error } = await supabase().from("estudos").select("*");
      checar(error, "Não foi possível ler o tempo de estudo.");
      return ((data ?? []) as LinhaEstudo[]).map(estudoDe);
    },
    async registrar(entrada: { materiaId: string | null; segundos: number; em?: number }) {
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
      const { error } = await supabase().from("estudos").delete().eq("id", estudoId);
      checar(error, "Não foi possível excluir a sessão.");
      avisarMudanca();
    },
  },
};
