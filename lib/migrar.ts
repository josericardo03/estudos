import { getDb } from "./db";
import { ErroEstudo } from "./erros";
import { supabase } from "./supabase";

const MARCA = "foco.supabase.migrado";

let pendente: Promise<void> | null = null;

export function garantirMigracao() {
  if (typeof window === "undefined") return Promise.resolve();
  if (!pendente) {
    pendente = migrar().catch((erro: unknown) => {
      pendente = null;
      throw erro;
    });
  }
  return pendente;
}

async function migrar() {
  if (localStorage.getItem(MARCA) === "1") return;
  if (typeof indexedDB === "undefined") return;

  const db = getDb();
  const [materias, pdfs, blocos, grifos, postits, questoes, tentativas, editais, vinculos] =
    await Promise.all([
      db.materias.toArray(),
      db.pdfs.toArray(),
      db.blocos.toArray(),
      db.grifos.toArray(),
      db.postits.toArray(),
      db.questoes.toArray(),
      db.tentativas.toArray(),
      db.editais.toArray(),
      db.editalMaterias.toArray(),
    ]);

  const vazio =
    materias.length +
      pdfs.length +
      blocos.length +
      grifos.length +
      postits.length +
      questoes.length +
      tentativas.length +
      editais.length +
      vinculos.length ===
    0;
  if (vazio) {
    localStorage.setItem(MARCA, "1");
    return;
  }

  const cliente = supabase();
  if (materias.length) {
    await gravar(
      cliente.from("materias").upsert(
        materias.map((materia) => ({
          id: materia.id,
          nome: materia.nome,
          created_at: iso(materia.createdAt),
        })),
      ),
      "Não foi possível enviar as matérias.",
    );
  }
  if (editais.length) {
    await gravar(
      cliente.from("editais").upsert(
        editais.map((edital) => ({
          id: edital.id,
          nome: edital.nome,
          orgao: edital.orgao,
          created_at: iso(edital.createdAt),
        })),
      ),
      "Não foi possível enviar os editais.",
    );
  }

  for (const pdf of pdfs) {
    if (!pdf.blob || pdf.blob.size < 1) {
      throw new ErroEstudo(`O PDF "${pdf.nome}" está sem arquivo neste navegador.`);
    }
    const { error } = await cliente.storage.from("pdfs").upload(`${pdf.id}.pdf`, pdf.blob, {
      contentType: "application/pdf",
      upsert: true,
    });
    checar(error, `Não foi possível enviar o PDF "${pdf.nome}".`);
  }
  if (pdfs.length) {
    await gravar(
      cliente.from("pdfs").upsert(
        pdfs.map((pdf) => ({
          id: pdf.id,
          materia_id: pdf.materiaId,
          nome: pdf.nome,
          storage_path: `${pdf.id}.pdf`,
          num_pages: pdf.numPages,
          created_at: iso(pdf.createdAt),
        })),
      ),
      "Não foi possível registrar os PDFs.",
    );
  }

  if (blocos.length) {
    await gravar(
      cliente.from("blocos").upsert(
        blocos.map((bloco) => ({
          id: bloco.id,
          pdf_id: bloco.pdfId,
          titulo: bloco.titulo,
          pagina_inicio: bloco.paginaInicio,
          pagina_fim: bloco.paginaFim,
          status: bloco.status,
          created_at: iso(bloco.createdAt),
        })),
      ),
      "Não foi possível enviar os blocos.",
    );
  }

  for (const grifo of grifos) {
    if (!grifo.imagem || grifo.imagem.size < 1) continue;
    const { error } = await cliente.storage.from("marcas").upload(`${grifo.id}.png`, grifo.imagem, {
      contentType: "image/png",
      upsert: true,
    });
    checar(error, "Não foi possível enviar uma marcação importante.");
  }
  if (grifos.length) {
    await gravar(
      cliente.from("grifos").upsert(
        grifos.map((grifo) => ({
          id: grifo.id,
          pdf_id: grifo.pdfId,
          bloco_id: grifo.blocoId,
          pagina: grifo.pagina,
          texto: grifo.texto,
          cor: grifo.cor,
          rects: grifo.rects,
          imagem_path: grifo.imagem && grifo.imagem.size > 0 ? `${grifo.id}.png` : null,
          created_at: iso(grifo.createdAt),
        })),
      ),
      "Não foi possível enviar os grifos.",
    );
  }
  if (postits.length) {
    await gravar(
      cliente.from("postits").upsert(
        postits.map((postit) => ({
          id: postit.id,
          pdf_id: postit.pdfId,
          bloco_id: postit.blocoId,
          pagina: postit.pagina,
          texto: postit.texto,
          x: postit.x,
          y: postit.y,
          created_at: iso(postit.createdAt),
        })),
      ),
      "Não foi possível enviar os post-its.",
    );
  }
  if (questoes.length) {
    await gravar(
      cliente.from("questoes").upsert(
        questoes.map((questao) => ({
          id: questao.id,
          bloco_id: questao.blocoId,
          materia_id: questao.materiaId,
          pdf_id: questao.pdfId,
          enunciado: questao.enunciado,
          resposta: questao.resposta,
          status_revisao: questao.statusRevisao,
          sequencia: questao.sequencia ?? 0,
          proxima_em: questao.proximaEm ? iso(questao.proximaEm) : null,
          created_at: iso(questao.createdAt),
        })),
      ),
      "Não foi possível enviar as questões.",
    );
  }
  if (tentativas.length) {
    await gravar(
      cliente.from("tentativas").upsert(
        tentativas.map((tentativa) => ({
          id: tentativa.id,
          questao_id: tentativa.questaoId,
          pdf_id: tentativa.pdfId,
          materia_id: tentativa.materiaId,
          bloco_id: tentativa.blocoId,
          acertou: tentativa.acertou,
          em: iso(tentativa.em),
        })),
      ),
      "Não foi possível enviar os resultados do simulado.",
    );
  }
  if (vinculos.length) {
    await gravar(
      cliente.from("edital_materias").upsert(
        vinculos.map((vinculo) => ({
          id: vinculo.id,
          edital_id: vinculo.editalId,
          materia_id: vinculo.materiaId,
        })),
      ),
      "Não foi possível enviar os vínculos dos editais.",
    );
  }

  localStorage.setItem(MARCA, "1");
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

type Resposta = PromiseLike<{ error: { message: string } | null }>;

async function gravar(consulta: Resposta, fallback: string) {
  const { error } = await consulta;
  checar(error, fallback);
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
