"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { descreverFaixa } from "@/lib/faixa";
import { repo } from "@/lib/repo";
import { caminhoCaderno, caminhoMateria, caminhoPdf } from "@/lib/rotas";
import type { PostIt, Questao } from "@/lib/types";
import { MAX_QUESTOES, STATUS_REVISAO } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, MarcaPrioridade, NaoEncontrado, RecorteGrifo } from "./ui";

export function BlocoDetalhe({
  materiaId,
  pdfId,
  blocoId,
}: {
  materiaId: string;
  pdfId: string;
  blocoId: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enunciado, setEnunciado] = useState("");
  const [resposta, setResposta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const materia = await repo.materias.obter(materiaId);
    const pdf = await repo.pdfs.obter(pdfId);
    const bloco = await repo.blocos.obter(blocoId);
    if (!materia || !pdf || !bloco) return null;
    if (pdf.materiaId !== materia.id || bloco.pdfId !== pdf.id) return null;
    const [grifos, postits, questoes] = await Promise.all([
      repo.grifos.listarPorBloco(bloco.id),
      repo.postits.listarPorBloco(bloco.id),
      repo.questoes.listarPorBloco(bloco.id),
    ]);
    return { materia, pdf, bloco, grifos, postits, questoes };
  }, [materiaId, pdfId, blocoId], null);

  if (!pronto) return <Abrindo texto="Abrindo o bloco…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) {
    return <NaoEncontrado titulo="Bloco não encontrado" detalhe="Essa faixa não está neste PDF." />;
  }

  const { bloco, pdf, materia, grifos, postits, questoes } = dados;
  const finalizado = bloco.status === "finalizado";

  async function criarQuestao(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErro(null);
    try {
      await repo.questoes.criar({ blocoId, materiaId, enunciado, resposta });
      setEnunciado("");
      setResposta("");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar a questão."));
    } finally {
      setGuardando(false);
    }
  }

  async function salvarFaixa(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    setErro(null);
    try {
      await repo.blocos.atualizar(blocoId, {
        titulo: String(formulario.get("titulo") ?? ""),
        paginaInicio: Number(formulario.get("inicio")),
        paginaFim: Number(formulario.get("fim")),
      });
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível ajustar a faixa."));
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">
        <Link href={caminhoMateria(materiaId)} className="text-pine no-underline hover:underline">
          {materia.nome}
        </Link>
        {" · "}
        <Link href={caminhoPdf(materiaId, pdfId, bloco.paginaInicio)} className="text-pine no-underline hover:underline">
          {pdf.nome}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-5xl tracking-tight">{bloco.titulo}</h1>
        <span className={finalizado ? "selo selo-pine" : "selo"}>
          {finalizado ? "Finalizado" : "Em estudo"}
        </span>
      </div>
      <p className="mt-2 text-muted">{descreverFaixa(bloco.paginaInicio, bloco.paginaFim)}</p>

      <section className="mt-6 border border-line bg-sheet px-4 py-4">
        <h2 className="font-serif text-2xl">Pacote do bloco</h2>
        <p className="mt-1">
          {questoes.length} {questoes.length === 1 ? "questão" : "questões"}
          {" · "}
          {grifos.length} {grifos.length === 1 ? "grifo" : "grifos"}
          {" · "}
          {postits.length} {postits.length === 1 ? "post-it" : "post-its"}
        </p>
        {questoes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Este bloco ainda não tem questões.</p>
        ) : null}
        <div className="mt-3">
          {finalizado ? (
            <button
              type="button"
              className="btn"
              onClick={() => void repo.blocos.definirStatus(bloco.id, "estudando").catch((falha) => {
                setErro(mensagemErro(falha, "Não foi possível reabrir o bloco."));
              })}
            >
              Reabrir bloco
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primario"
              onClick={() => void repo.blocos.definirStatus(bloco.id, "finalizado").catch((falha) => {
                setErro(mensagemErro(falha, "Não foi possível finalizar o bloco."));
              })}
            >
              Finalizar bloco
            </button>
          )}
        </div>
      </section>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}

      <section className="mt-10">
        <h2 className="font-serif text-3xl">
          Questões · {questoes.length}/{MAX_QUESTOES}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Você escreve as questões. Ao salvar, elas entram no banco de {materia.nome}.
        </p>
        {questoes.length >= MAX_QUESTOES ? (
          <p className="mt-3 text-sm">Este bloco já tem 15 questões.</p>
        ) : (
          <form onSubmit={criarQuestao} className="mt-4 grid gap-3">
            <div>
              <label className="rotulo" htmlFor="enunciado">
                Enunciado
              </label>
              <textarea
                id="enunciado"
                className="campo min-h-24"
                value={enunciado}
                onChange={(evento) => setEnunciado(evento.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="resposta">
                Resposta
              </label>
              <textarea
                id="resposta"
                className="campo min-h-20"
                value={resposta}
                onChange={(evento) => setResposta(evento.target.value)}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primario justify-self-start" type="submit" disabled={guardando}>
              {guardando ? "Salvando…" : "Salvar questão"}
            </button>
          </form>
        )}
        <div className="mt-6 flex flex-col gap-4">
          {questoes.map((questao, indice) => (
            <QuestaoEditor key={questao.id} questao={questao} indice={indice + 1} onErro={setErro} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Grifos</h2>
        {grifos.length === 0 ? (
          <p className="mt-3 text-muted">
            Nenhum grifo nesta faixa. Selecione um trecho no leitor e escolha a prioridade.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {grifos.map((grifo) => (
              <article key={grifo.id}>
                <div className="mb-1 flex items-center justify-between">
                  <MarcaPrioridade cor={grifo.cor} />
                  <Link
                    href={caminhoPdf(materiaId, pdfId, grifo.pagina, grifo.id)}
                    className="text-sm text-muted no-underline hover:underline"
                  >
                    p. {grifo.pagina}
                  </Link>
                </div>
                <blockquote className="citacao font-serif" data-prioridade={grifo.cor}>
                  {grifo.imagem ? <RecorteGrifo imagem={grifo.imagem} texto={grifo.texto} /> : null}
                  {grifo.texto}
                </blockquote>
                <Confirmar
                  rotulo="Apagar grifo"
                  confirmar="Apagar"
                  onConfirmar={() => repo.grifos.remover(grifo.id)}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Post-its</h2>
        {postits.length === 0 ? (
          <p className="mt-3 text-muted">Nenhum post-it nesta faixa. Eles são opcionais.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {postits.map((postit) => (
              <PostItBloco key={postit.id} postit={postit} materiaId={materiaId} pdfId={pdfId} onErro={setErro} />
            ))}
          </div>
        )}
      </section>

      <details className="mt-12 border-t border-line pt-6">
        <summary className="cursor-pointer font-serif text-2xl">Ajustar faixa</summary>
        <p className="mt-2 text-sm text-muted">
          Grifos e post-its acompanham a página. Se a página sair da faixa, eles ficam no cadernão em sem bloco.
        </p>
        <form onSubmit={salvarFaixa} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="rotulo" htmlFor="titulo-bloco">
              Título
            </label>
            <input id="titulo-bloco" name="titulo" className="campo" defaultValue={bloco.titulo} autoComplete="off" />
          </div>
          <div>
            <label className="rotulo" htmlFor="inicio-bloco">
              Página inicial
            </label>
            <input
              id="inicio-bloco"
              name="inicio"
              className="campo"
              type="number"
              min={1}
              max={pdf.numPages}
              defaultValue={bloco.paginaInicio}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="fim-bloco">
              Página final
            </label>
            <input
              id="fim-bloco"
              name="fim"
              className="campo"
              type="number"
              min={1}
              max={pdf.numPages}
              defaultValue={bloco.paginaFim}
            />
          </div>
          <button className="btn self-end" type="submit">
            Salvar faixa
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Excluir o bloco apaga as questões dele. Grifos e post-its continuam no PDF.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Confirmar
            rotulo="Excluir bloco"
            confirmar="Excluir bloco e questões"
            onConfirmar={async () => {
              await repo.blocos.remover(bloco.id);
              router.push(caminhoCaderno(materiaId, pdfId));
            }}
          />
          <Link className="btn" href={caminhoCaderno(materiaId, pdfId)}>
            Ver cadernão
          </Link>
        </div>
      </details>
    </main>
  );
}

function QuestaoEditor({
  questao,
  indice,
  onErro,
}: {
  questao: Questao;
  indice: number;
  onErro: (texto: string | null) => void;
}) {
  const [enunciado, setEnunciado] = useState(questao.enunciado);
  const [resposta, setResposta] = useState(questao.resposta);
  const [visto, setVisto] = useState(`${questao.enunciado}\n${questao.resposta}`);
  const atual = `${questao.enunciado}\n${questao.resposta}`;
  if (atual !== visto) {
    setVisto(atual);
    setEnunciado(questao.enunciado);
    setResposta(questao.resposta);
  }
  const sujo = enunciado !== questao.enunciado || resposta !== questao.resposta;

  return (
    <form
      className="grid gap-2 border border-line bg-sheet p-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        void repo.questoes
          .atualizar(questao.id, { enunciado, resposta })
          .catch((falha) => onErro(mensagemErro(falha, "Não foi possível salvar a questão.")));
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Questão {indice}</h3>
        <span className="selo">
          {STATUS_REVISAO.find((status) => status.id === questao.statusRevisao)?.nome}
        </span>
      </div>
      <textarea className="campo min-h-20" value={enunciado} onChange={(evento) => setEnunciado(evento.target.value)} />
      <textarea className="campo min-h-16" value={resposta} onChange={(evento) => setResposta(evento.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={!sujo}>
          Salvar alterações
        </button>
        <Confirmar
          rotulo="Excluir questão"
          confirmar="Excluir"
          onConfirmar={() => repo.questoes.remover(questao.id)}
        />
      </div>
    </form>
  );
}

function PostItBloco({
  postit,
  materiaId,
  pdfId,
  onErro,
}: {
  postit: PostIt;
  materiaId: string;
  pdfId: string;
  onErro: (texto: string | null) => void;
}) {
  const [texto, setTexto] = useState(postit.texto);
  const [visto, setVisto] = useState(postit.texto);
  if (postit.texto !== visto) {
    setVisto(postit.texto);
    setTexto(postit.texto);
  }
  return (
    <article className="nota">
      <Link href={caminhoPdf(materiaId, pdfId, postit.pagina, postit.id)} className="text-xs uppercase tracking-wider no-underline hover:underline">
        p. {postit.pagina}
      </Link>
      <textarea
        className="campo mt-2 min-h-20 bg-transparent"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={texto.trim() === postit.texto}
          onClick={() => {
            void repo.postits.definirTexto(postit.id, texto).catch((falha) => {
              onErro(mensagemErro(falha, "Não foi possível salvar o post-it."));
            });
          }}
        >
          Salvar post-it
        </button>
        <Confirmar rotulo="Tirar" confirmar="Tirar" onConfirmar={() => repo.postits.remover(postit.id)} />
      </div>
    </article>
  );
}
