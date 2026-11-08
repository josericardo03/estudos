// As telas só conversam com este módulo. Com URL e chave no .env.local,
// os dados vão para o Supabase. Sem essas variáveis, ficam no IndexedDB.

import { prepararCard } from "./cards";
import { getDb } from "./db";
import { ErroEstudo } from "./erros";
import { validarFaixa } from "./faixa";
import { repoRemoto } from "./repoRemoto";
import type {
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
  StatusRevisao,
  Tentativa,
  TipoCard,
} from "./types";

function id() {
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

type AgendaCard = {
  sequencia: number;
  proximaEm: number;
  statusRevisao: StatusRevisao;
  facilidade: number;
  intervaloDias: number;
  errosSeguidos: number;
  erroComCerteza: boolean;
  julgadaEm: number | null;
};

const DIA_MS = 86_400_000;

type EntradaCard = {
  materiaId: string;
  pdfId?: string | null;
  pagina?: number | null;
  topicoId?: string | null;
  tipo?: TipoCard;
  enunciado: string;
  resposta: string;
  imagem?: Blob;
};

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
          }
          await db.pdfs.where("materiaId").equals(idMateria).delete();
          await db.questoes.where("materiaId").equals(idMateria).delete();
          await db.tentativas.where("materiaId").equals(idMateria).delete();
          await db.editalMaterias.where("materiaId").equals(idMateria).delete();
          await db.editalTopicos.where("materiaId").equals(idMateria).modify({ materiaId: null, pdfId: null });
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
    async registrarLeitura(pdfId: string, pagina: number) {
      const db = getDb();
      await db.transaction("rw", db.pdfs, async () => {
        const pdf = await db.pdfs.get(pdfId);
        if (!pdf) return;
        const ultima = limitar(Math.round(pagina), 1, pdf.numPages);
        await db.pdfs.update(pdfId, { ultimaPagina: ultima, maiorPagina: Math.max(pdf.maiorPagina ?? 0, ultima) });
      });
    },
    async remover(pdfId: string) {
      const db = getDb();
      await db.transaction(
        "rw",
        [db.pdfs, db.grifos, db.postits, db.questoes, db.tentativas, db.editalTopicos],
        async () => {
          await db.grifos.where("pdfId").equals(pdfId).delete();
          await db.postits.where("pdfId").equals(pdfId).delete();
          // Os cards ficam: o estudo que você fez não some junto com o arquivo.
          await db.questoes.where("pdfId").equals(pdfId).modify({ pdfId: null });
          await db.tentativas.where("pdfId").equals(pdfId).modify({ pdfId: null });
          await db.editalTopicos
            .where("pdfId")
            .equals(pdfId)
            .modify({ pdfId: null, paginaInicio: null, paginaFim: null });
          await db.pdfs.delete(pdfId);
        },
      );
    },
  },

  grifos: {
    async listarPorPdf(pdfId: string) {
      const lista = await getDb().grifos.where("pdfId").equals(pdfId).toArray();
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
      const grifo: Grifo = {
        id: id(),
        pdfId: pdf.id,
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
    async criar(entrada: { pdfId: string; pagina: number; texto: string; x: number; y: number }) {
      const db = getDb();
      const pdf = await db.pdfs.get(entrada.pdfId);
      if (!pdf) throw new ErroEstudo("PDF não encontrado.");
      const texto = entrada.texto.trim();
      if (!texto) throw new ErroEstudo("Escreva o post-it antes de fixar.");
      if (entrada.pagina < 1 || entrada.pagina > pdf.numPages) {
        throw new ErroEstudo("Esta página não existe neste PDF.");
      }
      const postit: PostIt = {
        id: id(),
        pdfId: pdf.id,
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
    async listarPorPdf(pdfId: string) {
      const lista = await getDb().questoes.where("pdfId").equals(pdfId).toArray();
      return lista.sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0) || a.createdAt - b.createdAt);
    },
    async listarPorMateria(materiaId: string) {
      const lista = await getDb().questoes.where("materiaId").equals(materiaId).toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    async listarTodas() {
      const lista = await getDb().questoes.toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    /** Mesma interface da nuvem: os cards sem o texto, para telas que só contam e agrupam. */
    async listarLeves() {
      const lista = await getDb().questoes.toArray();
      return lista
        .map((questao) => ({ ...questao, imagem: undefined, enunciado: "", resposta: "" }))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async obterVarias(ids: string[]) {
      const lista = await getDb().questoes.bulkGet(ids);
      return lista.filter((questao): questao is Questao => Boolean(questao));
    },
    async contarVencidas(agora = Date.now()): Promise<number> {
      return getDb()
        .questoes.filter((questao) => !questao.suspensa && (questao.proximaEm ?? 0) <= agora)
        .count();
    },
    /** Só o que venceu: é o que a revisão do dia precisa, sem carregar o banco inteiro. */
    async listarVencidas(agora = Date.now()) {
      const lista = await getDb()
        .questoes.filter((questao) => !questao.suspensa && (questao.proximaEm ?? 0) <= agora)
        .toArray();
      return lista.sort((a, b) => a.createdAt - b.createdAt);
    },
    /** Os próximos a vencer, para "estudar adiantado". */
    async listarProximas(quantidade: number, agora = Date.now()) {
      const lista = await getDb()
        .questoes.filter((questao) => !questao.suspensa && (questao.proximaEm ?? 0) > agora)
        .toArray();
      return lista.sort((a, b) => (a.proximaEm ?? 0) - (b.proximaEm ?? 0)).slice(0, quantidade);
    },
    async contarPorMateria(): Promise<Record<string, number>> {
      const contagem: Record<string, number> = {};
      await getDb().questoes.each((questao) => {
        contagem[questao.materiaId] = (contagem[questao.materiaId] ?? 0) + 1;
      });
      return contagem;
    },
    async criar(entrada: EntradaCard) {
      const db = getDb();
      const tipo = entrada.tipo ?? "basico";
      const textos = prepararCard(tipo, entrada.enunciado, entrada.resposta, Boolean(entrada.imagem));
      const materia = await db.materias.get(entrada.materiaId);
      if (!materia) throw new ErroEstudo("Matéria não encontrada.");
      if (entrada.pdfId) {
        const pdf = await db.pdfs.get(entrada.pdfId);
        if (!pdf || pdf.materiaId !== materia.id) throw new ErroEstudo("Este PDF não pertence a esta matéria.");
      }
      const agora = Date.now();
      const questao: Questao = {
        id: id(),
        materiaId: materia.id,
        pdfId: entrada.pdfId ?? null,
        pagina: entrada.pagina ?? null,
        topicoId: entrada.topicoId ?? null,
        tipo,
        enunciado: textos.enunciado,
        resposta: textos.resposta,
        ...(entrada.imagem ? { imagem: entrada.imagem } : {}),
        suspensa: false,
        julgadaEm: null,
        errosSeguidos: 0,
        erroComCerteza: false,
        statusRevisao: "nova",
        sequencia: 0,
        facilidade: 2.5,
        intervaloDias: 0,
        proximaEm: agora,
        createdAt: agora,
      };
      await db.questoes.add(questao);
      return questao;
    },
    /** Cria muitos cards de uma vez (importação). Tudo ou nada. */
    async criarVarios(entradas: { materiaId: string; tipo: TipoCard; enunciado: string; resposta: string }[]) {
      const db = getDb();
      const materias = new Set((await db.materias.toArray()).map((materia) => materia.id));
      const agora = Date.now();
      const cards: Questao[] = entradas.map((entrada, indice) => {
        if (!materias.has(entrada.materiaId)) throw new ErroEstudo("Matéria não encontrada.");
        const textos = prepararCard(entrada.tipo, entrada.enunciado, entrada.resposta);
        return {
          id: id(),
          materiaId: entrada.materiaId,
          pdfId: null,
          pagina: null,
          topicoId: null,
          tipo: entrada.tipo,
          ...textos,
          suspensa: false,
          julgadaEm: null,
          errosSeguidos: 0,
          erroComCerteza: false,
          statusRevisao: "nova",
          sequencia: 0,
          facilidade: 2.5,
          intervaloDias: 0,
          proximaEm: agora,
          createdAt: agora + indice,
        };
      });
      await db.questoes.bulkAdd(cards);
      return cards.length;
    },
    async atualizar(
      questaoId: string,
      entrada: { enunciado: string; resposta: string; topicoId?: string | null },
    ) {
      const db = getDb();
      const atual = await db.questoes.get(questaoId);
      if (!atual) throw new ErroEstudo("Questão não encontrada.");
      const textos = prepararCard(atual.tipo, entrada.enunciado, entrada.resposta, Boolean(atual.imagem));
      await db.questoes.update(questaoId, {
        ...textos,
        ...(entrada.topicoId !== undefined ? { topicoId: entrada.topicoId } : {}),
      });
    },
    async definirSuspensa(questaoId: string, suspensa: boolean) {
      const alteradas = await getDb().questoes.update(questaoId, { suspensa });
      if (!alteradas) throw new ErroEstudo("Questão não encontrada.");
    },
    async registrarJulgamento(
      questaoId: string,
      entrada: AgendaCard,
      tentativa: Omit<Tentativa, "questaoId" | "em">,
    ) {
      const db = getDb();
      await db.transaction("rw", db.questoes, db.tentativas, async () => {
        const alteradas = await db.questoes.update(questaoId, entrada);
        if (!alteradas) throw new ErroEstudo("Questão não encontrada.");
        await db.tentativas.put({ ...tentativa, questaoId, em: Date.now() });
      });
    },
    async desfazerJulgamento(questaoId: string, anterior: AgendaCard, tentativaId: string) {
      const db = getDb();
      await db.transaction("rw", db.questoes, db.tentativas, async () => {
        await db.questoes.update(questaoId, anterior);
        await db.tentativas.delete(tentativaId);
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
    /** Sem janela, devolve todo o histórico. Com `desdeDias`, só o período recente. */
    async listar(opcoes: { desdeDias?: number } = {}): Promise<Tentativa[]> {
      const tabela = getDb().tentativas;
      if (opcoes.desdeDias == null) return tabela.toArray();
      return tabela
        .where("em")
        .aboveOrEqual(Date.now() - opcoes.desdeDias * DIA_MS)
        .toArray();
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
      await db.transaction("rw", db.editais, db.editalMaterias, db.editalTopicos, db.questoes, async () => {
        const topicos = await db.editalTopicos.where("editalId").equals(editalId).toArray();
        for (const topico of topicos) {
          await db.questoes.where("topicoId").equals(topico.id).modify({ topicoId: null });
        }
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
        pdfId: null,
        paginaInicio: null,
        paginaFim: null,
        feito: false,
        createdAt: Date.now(),
      };
      await db.editalTopicos.add(topico);
      return topico;
    },
    async atualizar(
      topicoId: string,
      entrada: Partial<
        Pick<EditalTopico, "nome" | "peso" | "materiaId" | "pdfId" | "paginaInicio" | "paginaFim" | "feito">
      >,
    ) {
      const db = getDb();
      const mudanca: Partial<EditalTopico> = { ...entrada };
      if (entrada.nome !== undefined) mudanca.nome = exigirNome(entrada.nome, "Dê um nome ao tópico.");
      if (entrada.peso !== undefined) mudanca.peso = limitarPeso(entrada.peso);
      if (entrada.pdfId === null) {
        mudanca.paginaInicio = null;
        mudanca.paginaFim = null;
      }
      if (entrada.pdfId && entrada.paginaInicio != null && entrada.paginaFim != null) {
        const pdf = await db.pdfs.get(entrada.pdfId);
        if (!pdf) throw new ErroEstudo("PDF não encontrado.");
        const erro = validarFaixa(entrada.paginaInicio, entrada.paginaFim, pdf.numPages);
        if (erro) throw new ErroEstudo(erro);
      }
      const alterados = await db.editalTopicos.update(topicoId, mudanca);
      if (!alterados) throw new ErroEstudo("Tópico não encontrado.");
    },
    async remover(topicoId: string) {
      const db = getDb();
      await db.transaction("rw", db.editalTopicos, db.questoes, async () => {
        await db.questoes.where("topicoId").equals(topicoId).modify({ topicoId: null });
        await db.editalTopicos.delete(topicoId);
      });
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

// As variáveis NEXT_PUBLIC_* viram texto fixo no build. Com a condição escrita aqui, no mesmo
// arquivo da escolha, o empacotador resolve o ternário e descarta o repositório que não vale
// (e, com ele, o Dexie na versão da nuvem).
const NA_NUVEM = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? true
    : false
  : false;

export const repo = NA_NUVEM ? repoRemoto : repoLocal;
