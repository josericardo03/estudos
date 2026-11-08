// As telas só conversam com este módulo. Com URL e chave no .env.local,
// os dados vão para o Supabase. Sem essas variáveis, ficam no IndexedDB.

import { getDb } from "./db";
import { repoRemoto } from "./repoRemoto";
import { supabaseConfigurado } from "./supabase";
import { ErroEstudo } from "./erros";
import { blocoDaPagina, conflitoDeFaixa, descreverFaixa, validarFaixa } from "./faixa";
import { somarDias } from "./datas";
import type {
  Bloco,
  CorGrifo,
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
  Rect,
  StatusBloco,
  StatusRevisao,
  Tentativa,
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

const repoLocal = {
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
        [
          db.materias,
          db.pdfs,
          db.blocos,
          db.grifos,
          db.postits,
          db.questoes,
          db.tentativas,
          db.editalMaterias,
          db.editalTopicos,
          db.lancamentos,
          db.estudos,
        ],
        async () => {
          const pdfs = await db.pdfs.where("materiaId").equals(idMateria).toArray();
          for (const pdf of pdfs) {
            await db.grifos.where("pdfId").equals(pdf.id).delete();
            await db.postits.where("pdfId").equals(pdf.id).delete();
            await db.questoes.where("pdfId").equals(pdf.id).delete();
            await db.tentativas.where("pdfId").equals(pdf.id).delete();
            await db.blocos.where("pdfId").equals(pdf.id).delete();
          }
          await db.pdfs.where("materiaId").equals(idMateria).delete();
          await db.questoes.where("materiaId").equals(idMateria).delete();
          await db.tentativas.where("materiaId").equals(idMateria).delete();
          await db.editalMaterias.where("materiaId").equals(idMateria).delete();
          await db.editalTopicos.where("materiaId").equals(idMateria).modify({ materiaId: null, blocoId: null });
          await db.lancamentos.where("materiaId").equals(idMateria).delete();
          await db.estudos.where("materiaId").equals(idMateria).modify({ materiaId: null });
          await db.materias.delete(idMateria);
        },
      );
    },
  },

  pdfs: {
    async listarTodos(): Promise<PdfDoc[]> {
      const lista = await getDb().pdfs.toArray();
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
    async listarPorMateria(materiaId: string): Promise<PdfDoc[]> {
      const lista = await getDb().pdfs.where("materiaId").equals(materiaId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    // O segundo parâmetro existe só para casar com o repositório remoto, que baixa o arquivo sob demanda.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async obter(pdfId: string, _opcoes?: { arquivo?: boolean }): Promise<PdfDoc | null> {
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
    async renomear(pdfId: string, nome: string) {
      const limpo = exigirNome(nome, "O PDF precisa de um nome.");
      const alterados = await getDb().pdfs.update(pdfId, { nome: limpo });
      if (!alterados) throw new ErroEstudo("PDF não encontrado.");
    },
    async remover(pdfId: string) {
      const db = getDb();
      await db.transaction("rw", [db.pdfs, db.blocos, db.grifos, db.postits, db.questoes, db.tentativas], async () => {
        await db.grifos.where("pdfId").equals(pdfId).delete();
        await db.postits.where("pdfId").equals(pdfId).delete();
        await db.questoes.where("pdfId").equals(pdfId).delete();
        await db.tentativas.where("pdfId").equals(pdfId).delete();
        await db.blocos.where("pdfId").equals(pdfId).delete();
        await db.pdfs.delete(pdfId);
      });
    },
  },

  blocos: {
    async listarTodos() {
      return ordenarBlocos(await getDb().blocos.toArray());
    },
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
    async salvarResumo(blocoId: string, resumo: string) {
      const alterados = await getDb().blocos.update(blocoId, { resumo: resumo.trim() });
      if (!alterados) throw new ErroEstudo("Bloco não encontrado.");
    },
    async finalizar(blocoId: string, resumo: string) {
      const limpo = exigirNome(resumo, "Resuma o bloco com as suas palavras antes de finalizar.");
      const alterados = await getDb().blocos.update(blocoId, {
        status: "finalizado",
        resumo: limpo,
        revisoes: 0,
        proximaRevisaoEm: somarDias(Date.now(), 1),
      });
      if (!alterados) throw new ErroEstudo("Bloco não encontrado.");
    },
    async registrarRevisao(blocoId: string, entrada: { revisoes: number; proximaRevisaoEm: number }) {
      const alterados = await getDb().blocos.update(blocoId, entrada);
      if (!alterados) throw new ErroEstudo("Bloco não encontrado.");
    },
    async remover(blocoId: string) {
      const db = getDb();
      const bloco = await db.blocos.get(blocoId);
      if (!bloco) return;
      await db.transaction("rw", db.blocos, db.questoes, db.tentativas, async () => {
        await db.questoes.where("blocoId").equals(blocoId).delete();
        await db.tentativas.where("blocoId").equals(blocoId).delete();
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
      cor: CorGrifo;
      rects: Rect[];
      imagem?: Blob;
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
        ...(entrada.imagem ? { imagem: entrada.imagem } : {}),
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
    async contarVencidas(agora = Date.now()): Promise<number> {
      return getDb().questoes.filter((questao) => (questao.proximaEm ?? 0) <= agora).count();
    },
    async contarPorMateria(): Promise<Record<string, number>> {
      const contagem: Record<string, number> = {};
      await getDb().questoes.each((questao) => {
        contagem[questao.materiaId] = (contagem[questao.materiaId] ?? 0) + 1;
      });
      return contagem;
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
        sequencia: 0,
        facilidade: 2.5,
        intervaloDias: 0,
        proximaEm: Date.now(),
        createdAt: Date.now(),
      };
      await db.transaction("rw", db.questoes, async () => {
        const quantidade = await db.questoes.where("blocoId").equals(bloco.id).count();
        if (quantidade >= MAX_QUESTOES) {
          throw new ErroEstudo(`Este bloco já tem ${MAX_QUESTOES} questões.`);
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
      const db = getDb();
      await db.transaction("rw", db.questoes, db.tentativas, async () => {
        const alteradas = await db.questoes.update(questaoId, entrada);
        if (!alteradas) throw new ErroEstudo("Questão não encontrada.");
        await db.tentativas.put({ ...tentativa, questaoId, em: Date.now() });
      });
    },
    async remover(questaoId: string) {
      const db = getDb();
      await db.transaction("rw", db.questoes, db.tentativas, async () => {
        await db.tentativas.where("questaoId").equals(questaoId).delete();
        await db.questoes.delete(questaoId);
      });
    },
  },

  tentativas: {
    async listar(): Promise<Tentativa[]> {
      return getDb().tentativas.toArray();
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
    async criar(entrada: { nome: string; orgao: string; dataProva?: number | null }) {
      const edital: Edital = {
        id: id(),
        nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
        orgao: entrada.orgao.trim(),
        dataProva: entrada.dataProva ?? null,
        createdAt: Date.now(),
      };
      await getDb().editais.add(edital);
      return edital;
    },
    async atualizar(editalId: string, entrada: { nome: string; orgao: string; dataProva?: number | null }) {
      const alterados = await getDb().editais.update(editalId, {
        nome: exigirNome(entrada.nome, "Dê um nome ao edital."),
        orgao: entrada.orgao.trim(),
        dataProva: entrada.dataProva ?? null,
      });
      if (!alterados) throw new ErroEstudo("Edital não encontrado.");
    },
    async remover(editalId: string) {
      const db = getDb();
      await db.transaction("rw", db.editais, db.editalMaterias, db.editalTopicos, async () => {
        await db.editalMaterias.where("editalId").equals(editalId).delete();
        await db.editalTopicos.where("editalId").equals(editalId).delete();
        await db.editais.delete(editalId);
      });
    },
    async vinculos(): Promise<EditalMateria[]> {
      return getDb().editalMaterias.toArray();
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

  topicos: {
    async listarTodos(): Promise<EditalTopico[]> {
      const lista = await getDb().editalTopicos.toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarPorEdital(editalId: string): Promise<EditalTopico[]> {
      const lista = await getDb().editalTopicos.where("editalId").equals(editalId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async criar(entrada: { editalId: string; materiaId: string | null; nome: string; peso: number }) {
      const db = getDb();
      const edital = await db.editais.get(entrada.editalId);
      if (!edital) throw new ErroEstudo("Edital não encontrado.");
      const topico: EditalTopico = {
        id: id(),
        editalId: edital.id,
        materiaId: entrada.materiaId,
        nome: exigirNome(entrada.nome, "Dê um nome ao tópico."),
        peso: limitarPeso(entrada.peso),
        blocoId: null,
        feito: false,
        createdAt: Date.now(),
      };
      await db.editalTopicos.add(topico);
      return topico;
    },
    async atualizar(
      topicoId: string,
      entrada: Partial<Pick<EditalTopico, "nome" | "peso" | "materiaId" | "blocoId" | "feito">>,
    ) {
      const mudanca: Partial<EditalTopico> = { ...entrada };
      if (entrada.nome !== undefined) mudanca.nome = exigirNome(entrada.nome, "Dê um nome ao tópico.");
      if (entrada.peso !== undefined) mudanca.peso = limitarPeso(entrada.peso);
      const alterados = await getDb().editalTopicos.update(topicoId, mudanca);
      if (!alterados) throw new ErroEstudo("Tópico não encontrado.");
    },
    async remover(topicoId: string) {
      await getDb().editalTopicos.delete(topicoId);
    },
  },

  lancamentos: {
    async listar(): Promise<Lancamento[]> {
      const lista = await getDb().lancamentos.toArray();
      return lista.sort((a, b) => b.em - a.em);
    },
    async criar(entrada: { materiaId: string; feitas: number; acertos: number; fonte: string }) {
      const db = getDb();
      validarLancamento(entrada.feitas, entrada.acertos);
      const materia = await db.materias.get(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      const lancamento: Lancamento = {
        id: id(),
        materiaId: materia.id,
        feitas: entrada.feitas,
        acertos: entrada.acertos,
        fonte: entrada.fonte.trim(),
        em: Date.now(),
      };
      await db.lancamentos.add(lancamento);
      return lancamento;
    },
    async remover(lancamentoId: string) {
      await getDb().lancamentos.delete(lancamentoId);
    },
  },

  estudos: {
    async listar(): Promise<Estudo[]> {
      return getDb().estudos.toArray();
    },
    async registrar(entrada: { materiaId: string | null; segundos: number; em?: number }) {
      const segundos = Math.round(entrada.segundos);
      if (!Number.isFinite(segundos) || segundos < 1) throw new ErroEstudo("A sessão ficou curta demais para registrar.");
      const estudo: Estudo = {
        id: id(),
        materiaId: entrada.materiaId,
        segundos,
        em: entrada.em ?? Date.now(),
      };
      await getDb().estudos.add(estudo);
      return estudo;
    },
    async remover(estudoId: string) {
      await getDb().estudos.delete(estudoId);
    },
  },
};

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

function limitar(valor: number, minimo: number, maximo: number) {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

function escolherRepo() {
  return supabaseConfigurado() ? repoRemoto : repoLocal;
}

export const repo = escolherRepo();
