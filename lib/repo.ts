// As telas só conversam com este módulo. A troca para o Supabase
// acontece aqui, no formato de supabase/migrations/001_init.sql.
// Enquanto as variáveis do Supabase estiverem vazias, os dados ficam
// no IndexedDB deste navegador (lib/db.ts).

import { getDb } from "./db";
import { ErroEstudo } from "./erros";
import { blocoDaPagina, conflitoDeFaixa, descreverFaixa, validarFaixa } from "./faixa";
import type {
  Bloco,
  Edital,
  Grifo,
  Materia,
  PdfDoc,
  PostIt,
  Prioridade,
  Questao,
  Rect,
  StatusBloco,
  StatusRevisao,
} from "./types";
import { MAX_QUESTOES } from "./types";

function id() {
  return crypto.randomUUID();
}

function exigirNome(nome: string, vazio: string) {
  const limpo = nome.trim();
  if (!limpo) throw new ErroEstudo(vazio);
  return limpo;
}

async function sincronizarAnotacoes(pdfId: string) {
  const db = getDb();
  const blocos = await db.blocos.where("pdfId").equals(pdfId).toArray();
  const grifos = await db.grifos.where("pdfId").equals(pdfId).toArray();
  const postits = await db.postits.where("pdfId").equals(pdfId).toArray();
  await db.transaction("rw", db.grifos, db.postits, async () => {
    for (const grifo of grifos) {
      const blocoId = blocoDaPagina(blocos, grifo.pagina)?.id ?? null;
      if (grifo.blocoId !== blocoId) await db.grifos.update(grifo.id, { blocoId });
    }
    for (const postit of postits) {
      const blocoId = blocoDaPagina(blocos, postit.pagina)?.id ?? null;
      if (postit.blocoId !== blocoId) await db.postits.update(postit.id, { blocoId });
    }
  });
}

function ordenarBlocos(lista: Bloco[]) {
  return lista.sort((a, b) => a.paginaInicio - b.paginaInicio || a.createdAt - b.createdAt);
}

export const repo = {
  materias: {
    async listar(): Promise<Materia[]> {
      const lista = await getDb().materias.toArray();
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async obter(idMateria: string): Promise<Materia | null> {
      return (await getDb().materias.get(idMateria)) ?? null;
    },
    async criar(nome: string): Promise<Materia> {
      const materia: Materia = {
        id: id(),
        nome: exigirNome(nome, "Dê um nome à matéria."),
        createdAt: Date.now(),
      };
      await getDb().materias.add(materia);
      return materia;
    },
    async renomear(idMateria: string, nome: string) {
      const limpo = exigirNome(nome, "Dê um nome à matéria.");
      const alteradas = await getDb().materias.update(idMateria, { nome: limpo });
      if (!alteradas) throw new ErroEstudo("Matéria não encontrada.");
    },
    async remover(idMateria: string) {
      const db = getDb();
      await db.transaction(
        "rw",
        [db.materias, db.pdfs, db.blocos, db.grifos, db.postits, db.questoes, db.editalMaterias],
        async () => {
          const pdfs = await db.pdfs.where("materiaId").equals(idMateria).toArray();
          for (const pdf of pdfs) {
            await db.grifos.where("pdfId").equals(pdf.id).delete();
            await db.postits.where("pdfId").equals(pdf.id).delete();
            await db.questoes.where("pdfId").equals(pdf.id).delete();
            await db.blocos.where("pdfId").equals(pdf.id).delete();
          }
          await db.pdfs.where("materiaId").equals(idMateria).delete();
          await db.questoes.where("materiaId").equals(idMateria).delete();
          await db.editalMaterias.where("materiaId").equals(idMateria).delete();
          await db.materias.delete(idMateria);
        },
      );
    },
  },

  pdfs: {
    async listarPorMateria(materiaId: string): Promise<PdfDoc[]> {
      const lista = await getDb().pdfs.where("materiaId").equals(materiaId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async obter(pdfId: string): Promise<PdfDoc | null> {
      return (await getDb().pdfs.get(pdfId)) ?? null;
    },
    async criar(entrada: {
      materiaId: string;
      nome: string;
      blob: Blob;
      numPages: number;
    }): Promise<PdfDoc> {
      const materia = await getDb().materias.get(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      if (entrada.numPages < 1) throw new ErroEstudo("Este PDF não tem páginas.");
      const pdf: PdfDoc = {
        id: id(),
        materiaId: entrada.materiaId,
        nome: exigirNome(entrada.nome, "O PDF precisa de um nome."),
        blob: entrada.blob,
        numPages: entrada.numPages,
        createdAt: Date.now(),
      };
      await getDb().pdfs.add(pdf);
      return pdf;
    },
    async remover(pdfId: string) {
      const db = getDb();
      await db.transaction("rw", db.pdfs, db.blocos, db.grifos, db.postits, db.questoes, async () => {
        await db.grifos.where("pdfId").equals(pdfId).delete();
        await db.postits.where("pdfId").equals(pdfId).delete();
        await db.questoes.where("pdfId").equals(pdfId).delete();
        await db.blocos.where("pdfId").equals(pdfId).delete();
        await db.pdfs.delete(pdfId);
      });
    },
  },

  blocos: {
    async listarPorPdf(pdfId: string) {
      return ordenarBlocos(await getDb().blocos.where("pdfId").equals(pdfId).toArray());
    },
    async obter(blocoId: string): Promise<Bloco | null> {
      return (await getDb().blocos.get(blocoId)) ?? null;
    },
    async criar(entrada: {
      pdfId: string;
      titulo: string;
      paginaInicio: number;
      paginaFim: number;
    }) {
      const db = getDb();
      const pdf = await db.pdfs.get(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const erroFaixa = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
      if (erroFaixa) throw new ErroEstudo(erroFaixa);
      const existentes = await db.blocos.where("pdfId").equals(pdf.id).toArray();
      const conflito = conflitoDeFaixa(existentes, entrada.paginaInicio, entrada.paginaFim);
      if (conflito) {
        throw new ErroEstudo(
          `Esta faixa cruza "${conflito.titulo}" (${descreverFaixa(conflito.paginaInicio, conflito.paginaFim)}).`,
        );
      }
      const titulo =
        entrada.titulo.trim() ||
        `Páginas ${entrada.paginaInicio}–${entrada.paginaFim}`;
      const bloco: Bloco = {
        id: id(),
        pdfId: pdf.id,
        titulo,
        paginaInicio: entrada.paginaInicio,
        paginaFim: entrada.paginaFim,
        status: "estudando",
        createdAt: Date.now(),
      };
      await db.blocos.add(bloco);
      await sincronizarAnotacoes(pdf.id);
      return bloco;
    },
    async atualizar(
      blocoId: string,
      entrada: { titulo: string; paginaInicio: number; paginaFim: number },
    ) {
      const db = getDb();
      const bloco = await db.blocos.get(blocoId);
      if (!bloco) throw new ErroEstudo("Bloco não encontrado.");
      const pdf = await db.pdfs.get(bloco.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const erroFaixa = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
      if (erroFaixa) throw new ErroEstudo(erroFaixa);
      const existentes = await db.blocos.where("pdfId").equals(pdf.id).toArray();
      const conflito = conflitoDeFaixa(
        existentes,
        entrada.paginaInicio,
        entrada.paginaFim,
        bloco.id,
      );
      if (conflito) {
        throw new ErroEstudo(
          `Esta faixa cruza "${conflito.titulo}" (${descreverFaixa(conflito.paginaInicio, conflito.paginaFim)}).`,
        );
      }
      await db.blocos.update(bloco.id, {
        titulo: exigirNome(entrada.titulo, "Dê um título ao bloco."),
        paginaInicio: entrada.paginaInicio,
        paginaFim: entrada.paginaFim,
      });
      await sincronizarAnotacoes(pdf.id);
    },
    async definirStatus(blocoId: string, status: StatusBloco) {
      const alterados = await getDb().blocos.update(blocoId, { status });
      if (!alterados) throw new ErroEstudo("Bloco não encontrado.");
    },
    async remover(blocoId: string) {
      const db = getDb();
      const bloco = await db.blocos.get(blocoId);
      if (!bloco) return;
      await db.transaction("rw", db.blocos, db.questoes, async () => {
        await db.questoes.where("blocoId").equals(blocoId).delete();
        await db.blocos.delete(blocoId);
      });
      await sincronizarAnotacoes(bloco.pdfId);
    },
  },

  grifos: {
    async listarPorPdf(pdfId: string) {
      const lista = await getDb().grifos.where("pdfId").equals(pdfId).toArray();
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async listarPorBloco(blocoId: string) {
      const lista = await getDb().grifos.where("blocoId").equals(blocoId).toArray();
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: {
      pdfId: string;
      pagina: number;
      texto: string;
      cor: Prioridade;
      rects: Rect[];
    }) {
      const db = getDb();
      const pdf = await db.pdfs.get(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Selecione um trecho de texto para grifar.");
      if (!entrada.rects.length) {
        throw new ErroEstudo("Não consegui localizar o trecho selecionado.");
      }
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const blocos = await db.blocos.where("pdfId").equals(pdf.id).toArray();
      const grifo: Grifo = {
        id: id(),
        pdfId: pdf.id,
        blocoId: blocoDaPagina(blocos, entrada.pagina)?.id ?? null,
        pagina: entrada.pagina,
        texto,
        cor: entrada.cor,
        rects: entrada.rects,
        createdAt: Date.now(),
      };
      await db.grifos.add(grifo);
      return grifo;
    },
    async remover(grifoId: string) {
      await getDb().grifos.delete(grifoId);
    },
  },

  postits: {
    async listarPorPdf(pdfId: string) {
      const lista = await getDb().postits.where("pdfId").equals(pdfId).toArray();
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async listarPorBloco(blocoId: string) {
      const lista = await getDb().postits.where("blocoId").equals(blocoId).toArray();
      return lista.sort((a, b) => a.pagina - b.pagina || a.createdAt - b.createdAt);
    },
    async criar(entrada: { pdfId: string; pagina: number; texto: string; x: number; y: number }) {
      const db = getDb();
      const pdf = await db.pdfs.get(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Escreva o post-it antes de fixar.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const blocos = await db.blocos.where("pdfId").equals(pdf.id).toArray();
      const postit: PostIt = {
        id: id(),
        pdfId: pdf.id,
        blocoId: blocoDaPagina(blocos, entrada.pagina)?.id ?? null,
        pagina: entrada.pagina,
        texto,
        x: limitar(entrada.x, 0.01, 0.98),
        y: limitar(entrada.y, 0.01, 0.98),
        createdAt: Date.now(),
      };
      await db.postits.add(postit);
      return postit;
    },
    async definirTexto(postitId: string, texto: string) {
      const limpo = exigirNome(texto, "O post-it precisa de um texto.");
      const alterados = await getDb().postits.update(postitId, { texto: limpo });
      if (!alterados) throw new ErroEstudo("Post-it não encontrado.");
    },
    async mover(postitId: string, x: number, y: number) {
      const alterados = await getDb().postits.update(postitId, {
        x: limitar(x, 0.01, 0.98),
        y: limitar(y, 0.01, 0.98),
      });
      if (!alterados) throw new ErroEstudo("Post-it não encontrado.");
    },
    async remover(postitId: string) {
      await getDb().postits.delete(postitId);
    },
  },

  questoes: {
    async listarPorBloco(blocoId: string) {
      const lista = await getDb().questoes.where("blocoId").equals(blocoId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorPdf(pdfId: string) {
      const lista = await getDb().questoes.where("pdfId").equals(pdfId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorMateria(materiaId: string) {
      const lista = await getDb().questoes.where("materiaId").equals(materiaId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarTodas() {
      const lista = await getDb().questoes.toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async criar(entrada: {
      blocoId: string;
      materiaId: string;
      enunciado: string;
      resposta: string;
    }) {
      const db = getDb();
      const enunciado = exigirNome(entrada.enunciado, "Escreva o enunciado.");
      const resposta = exigirNome(entrada.resposta, "Escreva a resposta.");
      const bloco = await db.blocos.get(entrada.blocoId);
      if (!bloco) throw new ErroEstudo("Bloco não encontrado.");
      const pdf = await db.pdfs.get(bloco.pdfId);
      if (!pdf || pdf.materiaId !== entrada.materiaId) {
        throw new ErroEstudo("Este bloco não pertence a esta matéria.");
      }
      const questao: Questao = {
        id: id(),
        blocoId: bloco.id,
        materiaId: pdf.materiaId,
        pdfId: pdf.id,
        enunciado,
        resposta,
        statusRevisao: "nova",
        createdAt: Date.now(),
      };
      await db.transaction("rw", db.questoes, async () => {
        const quantidade = await db.questoes.where("blocoId").equals(bloco.id).count();
        if (quantidade >= MAX_QUESTOES) {
          throw new ErroEstudo("Este bloco já tem 15 questões.");
        }
        await db.questoes.add(questao);
      });
      return questao;
    },
    async atualizar(questaoId: string, entrada: { enunciado: string; resposta: string }) {
      const enunciado = exigirNome(entrada.enunciado, "Escreva o enunciado.");
      const resposta = exigirNome(entrada.resposta, "Escreva a resposta.");
      const alteradas = await getDb().questoes.update(questaoId, { enunciado, resposta });
      if (!alteradas) throw new ErroEstudo("Questão não encontrada.");
    },
    async definirRevisao(questaoId: string, statusRevisao: StatusRevisao) {
      const alteradas = await getDb().questoes.update(questaoId, { statusRevisao });
      if (!alteradas) throw new ErroEstudo("Questão não encontrada.");
    },
    async remover(questaoId: string) {
      await getDb().questoes.delete(questaoId);
    },
  },

  editais: {
    async listar(): Promise<Edital[]> {
      const lista = await getDb().editais.toArray();
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async obter(editalId: string): Promise<Edital | null> {
      return (await getDb().editais.get(editalId)) ?? null;
    },
    async criar(entrada: { nome: string; orgao: string }) {
      const edital: Edital = {
        id: id(),
        nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
        orgao: entrada.orgao.trim(),
        createdAt: Date.now(),
      };
      await getDb().editais.add(edital);
      return edital;
    },
    async atualizar(editalId: string, entrada: { nome: string; orgao: string }) {
      const alterados = await getDb().editais.update(editalId, {
        nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
        orgao: entrada.orgao.trim(),
      });
      if (!alterados) throw new ErroEstudo("Edital não encontrado.");
    },
    async remover(editalId: string) {
      const db = getDb();
      await db.transaction("rw", db.editais, db.editalMaterias, async () => {
        await db.editalMaterias.where("editalId").equals(editalId).delete();
        await db.editais.delete(editalId);
      });
    },
    async materias(editalId: string): Promise<string[]> {
      const vinculos = await getDb().editalMaterias.where("editalId").equals(editalId).toArray();
      return vinculos.map((vinculo) => vinculo.materiaId);
    },
    async daMateria(materiaId: string): Promise<Edital[]> {
      const db = getDb();
      const vinculos = await db.editalMaterias.where("materiaId").equals(materiaId).toArray();
      const editais = await db.editais.bulkGet(vinculos.map((vinculo) => vinculo.editalId));
      return editais
        .filter((edital): edital is Edital => Boolean(edital))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async definirMaterias(editalId: string, materiaIds: string[]) {
      const db = getDb();
      const edital = await db.editais.get(editalId);
      if (!edital) throw new ErroEstudo("Edital não encontrado.");
      const unicos = [...new Set(materiaIds)];
      await db.transaction("rw", db.editalMaterias, async () => {
        await db.editalMaterias.where("editalId").equals(editalId).delete();
        if (unicos.length) {
          await db.editalMaterias.bulkAdd(
            unicos.map((materiaId) => ({
              id: id(),
              editalId,
              materiaId,
            })),
          );
        }
      });
    },
  },
};

function limitar(valor: number, minimo: number, maximo: number) {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}
