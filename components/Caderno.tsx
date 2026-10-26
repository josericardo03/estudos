"use client";

import Link from "next/link";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { descreverFaixa } from "@/lib/faixa";
import { repo } from "@/lib/repo";
import { caminhoBloco, caminhoCaderno, caminhoMateria, caminhoPdf } from "@/lib/rotas";
import type { Grifo, PostIt, Prioridade, Rect } from "@/lib/types";
import { PRIORIDADES } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, MarcaPrioridade, NaoEncontrado } from "./ui";

function alturaDoGrifo(rects: Rect[]) {
  if (!rects.length) return 0;
  return Math.min(...rects.map((rect) => rect.y));
}

type Anotacao =
  | { tipo: "grifo"; pagina: number; y: number; grifo: Grifo }
  | { tipo: "postit"; pagina: number; y: number; postit: PostIt };

function ordenarAnotacoes(grifos: Grifo[], postits: PostIt[]): Anotacao[] {
  const itens: Anotacao[] = [
    ...grifos.map((grifo) => ({
      tipo: "grifo" as const,
      pagina: grifo.pagina,
      y: alturaDoGrifo(grifo.rects),
      grifo,
    })),
    ...postits.map((postit) => ({
      tipo: "postit" as const,
      pagina: postit.pagina,
      y: postit.y,
      postit,
    })),
  ];
  return itens.sort(
    (a, b) => a.pagina - b.pagina || a.y - b.y || a.tipo.localeCompare(b.tipo),
  );
}

export function Caderno({
  materiaId,
  pdfId,
  aoLado,
}: {
  materiaId: string;
  pdfId: string;
  aoLado?: (pagina: number) => void;
}) {
  const [filtro, setFiltro] = useState<Prioridade | "todas">("todas");
  const [erro, setErro] = useState<string | null>(null);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const [materia, pdf, blocos, grifos, postits] = await Promise.all([
      repo.materias.obter(materiaId),
      repo.pdfs.obter(pdfId),
      repo.blocos.listarPorPdf(pdfId),
      repo.grifos.listarPorPdf(pdfId),
      repo.postits.listarPorPdf(pdfId),
    ]);
    if (!materia || !pdf || pdf.materiaId !== materia.id) return null;
    return { materia, pdf, blocos, grifos, postits };
  }, [materiaId, pdfId], null);

  if (!pronto) return <Abrindo texto="Abrindo o cadernão…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) {
    return <NaoEncontrado titulo="Cadernão não encontrado" detalhe="O PDF não está nesta matéria." />;
  }

  const grifos = dados.grifos.filter((grifo) => filtro === "todas" || grifo.cor === filtro);
  const secoes = [
    ...dados.blocos.map((bloco) => ({
      id: bloco.id,
      titulo: bloco.titulo,
      detalhe: descreverFaixa(bloco.paginaInicio, bloco.paginaFim),
      href: caminhoBloco(materiaId, pdfId, bloco.id),
      pagina: bloco.paginaInicio,
      grifos: grifos.filter((grifo) => grifo.blocoId === bloco.id),
      postits: dados.postits.filter((postit) => postit.blocoId === bloco.id),
    })),
    {
      id: "soltos",
      titulo: "Sem bloco",
      detalhe: "Anotações em páginas que ainda não entraram numa faixa.",
      href: null as string | null,
      pagina: null as number | null,
      grifos: grifos.filter((grifo) => !grifo.blocoId),
      postits: dados.postits.filter((postit) => !postit.blocoId),
    },
  ].filter((secao) => secao.id !== "soltos" || secao.grifos.length > 0 || secao.postits.length > 0);

  async function apagarGrifo(id: string) {
    setErro(null);
    try {
      await repo.grifos.remover(id);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível apagar o grifo."));
    }
  }

  const filtros = (
    <>
      {aoLado ? null : (
        <Link className="btn" href={caminhoPdf(materiaId, pdfId)}>
          Voltar ao PDF
        </Link>
      )}
      <button
        type="button"
        className={`btn ${filtro === "todas" ? "btn-primario" : ""}`}
        onClick={() => setFiltro("todas")}
      >
        Todas
      </button>
      {PRIORIDADES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="btn btn-cor"
          aria-pressed={filtro === item.id}
          onClick={() => setFiltro(item.id)}
        >
          <span className={`ponto ponto-${item.id}`} aria-hidden />
          {item.nome}
        </button>
      ))}
    </>
  );

  const lista =
    secoes.length === 0 ? (
      <p className={aoLado ? "text-sm text-muted" : "mt-10 text-muted"}>
        Este PDF ainda não tem grifos nem post-its. Abra o leitor, selecione um trecho e escolha a prioridade.
      </p>
    ) : (
      <div className={aoLado ? "flex flex-col gap-5" : "mt-8 flex flex-col gap-8"}>
        {secoes.map((secao) => {
          const totalNotas = secao.grifos.length + secao.postits.length;
          return (
          <section key={secao.id} className={aoLado ? "" : "cartao px-4 py-5 sm:px-6"}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className={aoLado ? "font-serif text-2xl" : "font-serif text-3xl"}>{secao.titulo}</h2>
                <p className="mt-1 text-sm text-muted">
                  {secao.detalhe} · {totalNotas} {totalNotas === 1 ? "anotação registrada" : "anotações registradas"}
                </p>
              </div>
              {secao.href ? (
                <Link href={secao.href} className="text-sm text-pine no-underline hover:underline">
                  Abrir bloco
                </Link>
              ) : null}
            </div>
            {ordenarAnotacoes(secao.grifos, secao.postits).length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nenhum grifo nesta prioridade.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {ordenarAnotacoes(secao.grifos, secao.postits).map((item) =>
                  item.tipo === "grifo" ? (
                    <GrifoCaderno
                      key={item.grifo.id}
                      grifo={item.grifo}
                      href={caminhoPdf(materiaId, pdfId, item.grifo.pagina)}
                      aoLado={aoLado}
                      onApagar={() => apagarGrifo(item.grifo.id)}
                    />
                  ) : (
                    <PostItCaderno
                      key={item.postit.id}
                      postit={item.postit}
                      href={caminhoPdf(materiaId, pdfId, item.postit.pagina)}
                      aoLado={aoLado}
                      onErro={setErro}
                    />
                  ),
                )}
              </div>
            )}
          </section>
          );
        })}
      </div>
    );

  if (aoLado) {
    return (
      <div className="cartao flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-line px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-3xl">Cadernão</h2>
            <Link href={caminhoCaderno(materiaId, pdfId)} className="text-sm text-pine no-underline hover:underline">
              Página inteira
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{filtros}</div>
          {erro ? <div className="mt-3"><Aviso texto={erro} /></div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{lista}</div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">
        <Link href={caminhoMateria(materiaId)} className="text-pine no-underline hover:underline">
          {dados.materia.nome}
        </Link>
      </p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Cadernão</h1>
      <p className="mt-2 text-muted">{dados.pdf.nome}</p>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Os grifos e os post-its aparecem aqui agrupados pelo bloco. O post-it fica acima ou abaixo das marcações conforme o ponto em que foi fixado na página.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">{filtros}</div>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
      {lista}
    </main>
  );
}

function GrifoCaderno({
  grifo,
  href,
  aoLado,
  onApagar,
}: {
  grifo: Grifo;
  href: string;
  aoLado?: (pagina: number) => void;
  onApagar: () => void;
}) {
  return (
    <article>
      <div className="mb-1 flex items-center justify-between gap-3">
        <MarcaPrioridade cor={grifo.cor} />
        {aoLado ? (
          <button type="button" className="text-sm text-muted hover:underline" onClick={() => aoLado(grifo.pagina)}>
            p. {grifo.pagina}
          </button>
        ) : (
          <Link href={href} className="text-sm text-muted no-underline hover:underline">
            p. {grifo.pagina}
          </Link>
        )}
      </div>
      <blockquote className="citacao font-serif text-lg" data-prioridade={grifo.cor}>
        {grifo.texto}
      </blockquote>
      <div className="mt-1">
        <Confirmar rotulo="Apagar grifo" confirmar="Apagar" onConfirmar={onApagar} />
      </div>
    </article>
  );
}

function PostItCaderno({
  postit,
  href,
  aoLado,
  onErro,
}: {
  postit: PostIt;
  href: string;
  aoLado?: (pagina: number) => void;
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
      <div className="mb-2 flex justify-between text-xs uppercase tracking-wider">
        <span>Post-it</span>
        {aoLado ? (
          <button type="button" className="hover:underline" onClick={() => aoLado(postit.pagina)}>
            p. {postit.pagina}
          </button>
        ) : (
          <Link href={href} className="no-underline hover:underline">
            p. {postit.pagina}
          </Link>
        )}
      </div>
      <textarea
        className="campo min-h-20 bg-transparent"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        onBlur={() => {
          if (texto.trim() === postit.texto) return;
          void repo.postits.definirTexto(postit.id, texto).catch((falha) => {
            onErro(mensagemErro(falha, "Não foi possível salvar o post-it."));
          });
        }}
      />
      <div className="mt-2">
        <Confirmar
          rotulo="Tirar post-it"
          confirmar="Tirar"
          onConfirmar={() => repo.postits.remover(postit.id)}
        />
      </div>
    </article>
  );
}
