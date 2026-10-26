"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErroEstudo, mensagemErro, mensagemUpload } from "@/lib/erros";
import { contarPaginas } from "@/lib/pdf";
import { repo } from "@/lib/repo";
import { caminhoBanco, caminhoCaderno, caminhoPdf } from "@/lib/rotas";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, NaoEncontrado } from "./ui";

export function MateriaDetalhe({ materiaId }: { materiaId: string }) {
  const router = useRouter();
  const [nome, setNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const materia = await repo.materias.obter(materiaId);
    if (!materia) return null;
    const [pdfs, editais, questoes] = await Promise.all([
      repo.pdfs.listarPorMateria(materia.id),
      repo.editais.daMateria(materia.id),
      repo.questoes.listarPorMateria(materia.id),
    ]);
    const comBlocos = await Promise.all(
      pdfs.map(async (pdf) => ({
        pdf,
        blocos: (await repo.blocos.listarPorPdf(pdf.id)).length,
      })),
    );
    return { materia, pdfs: comBlocos, editais, questoes: questoes.length };
  }, [materiaId], null);

  if (!pronto) return <Abrindo texto="Abrindo a matéria…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) {
    return (
      <NaoEncontrado
        titulo="Matéria não encontrada"
        detalhe="Ela pode ter sido apagada neste navegador."
      />
    );
  }

  const nomeAtual = nome ?? dados.materia.nome;

  async function renomear(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    try {
      await repo.materias.renomear(materiaId, nomeAtual);
      setNome(null);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível renomear a matéria."));
    }
  }

  async function enviar(arquivo: File) {
    setErro(null);
    setEnviando(arquivo.name);
    try {
      const parecePdf =
        arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf");
      if (!parecePdf) throw new ErroEstudo("Envie um arquivo PDF.");
      const bytes = await arquivo.arrayBuffer();
      const numPages = await contarPaginas(bytes.slice(0));
      await repo.pdfs.criar({
        materiaId,
        nome: arquivo.name,
        blob: arquivo,
        numPages,
      });
    } catch (falha) {
      setErro(mensagemUpload(falha));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Matéria</p>
      <form onSubmit={renomear} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="rotulo" htmlFor="nome-materia">
            Nome
          </label>
          <input
            id="nome-materia"
            className="campo font-serif text-3xl"
            value={nomeAtual}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn" type="submit" disabled={nomeAtual.trim() === dados.materia.nome}>
          Salvar nome
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <Link href={caminhoBanco(materiaId)} className="text-pine no-underline hover:underline">
          {dados.questoes} {dados.questoes === 1 ? "questão no banco" : "questões no banco"}
        </Link>
        <Confirmar
          rotulo="Excluir matéria"
          confirmar="Excluir matéria e PDFs"
          onConfirmar={async () => {
            await repo.materias.remover(materiaId);
            router.push("/");
          }}
        />
      </div>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-3xl">PDFs</h2>
          <label className={`btn btn-primario ${enviando ? "opacity-60" : ""}`}>
            {enviando ? `Guardando ${enviando}` : "Enviar PDF"}
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              disabled={Boolean(enviando)}
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0];
                evento.target.value = "";
                if (arquivo) void enviar(arquivo);
              }}
            />
          </label>
        </div>
        {dados.pdfs.length === 0 ? (
          <p className="mt-4 text-muted">Envie o primeiro PDF desta matéria.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {dados.pdfs.map(({ pdf, blocos }) => (
              <li key={pdf.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <Link href={caminhoPdf(materiaId, pdf.id)} className="break-words font-serif text-2xl text-ink no-underline hover:underline">
                    {pdf.nome}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {pdf.numPages} {pdf.numPages === 1 ? "página" : "páginas"}
                    {" · "}
                    {blocos} {blocos === 1 ? "bloco" : "blocos"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn" href={caminhoPdf(materiaId, pdf.id)}>
                    Ler
                  </Link>
                  <Link className="btn" href={caminhoCaderno(materiaId, pdf.id)}>
                    Cadernão
                  </Link>
                  <Confirmar
                    rotulo="Excluir"
                    confirmar="Excluir PDF"
                    onConfirmar={() => repo.pdfs.remover(pdf.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Editais</h2>
        {dados.editais.length === 0 ? (
          <p className="mt-3 text-muted">
            Esta matéria ainda não entrou em um edital.{" "}
            <Link href="/editais" className="text-pine no-underline hover:underline">
              Vincular em Editais
            </Link>
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {dados.editais.map((edital) => (
              <li key={edital.id}>
                <Link href={`/editais/${edital.id}`} className="text-ink no-underline hover:underline">
                  {edital.nome}
                  {edital.orgao ? <span className="text-muted"> · {edital.orgao}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
