"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { compararRevisao } from "@/lib/revisao";
import { caminhoBloco } from "@/lib/rotas";
import type { Questao, StatusRevisao } from "@/lib/types";
import { STATUS_REVISAO } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

type Cartao = Questao & {
  materiaNome: string;
  pdfNome: string;
  blocoTitulo: string;
  blocoId: string;
};

export function Banco() {
  const parametros = useSearchParams();
  const router = useRouter();
  const materiaId = parametros.get("materia") ?? "";
  const { dados: materias, pronto: materiasProntas } = useConsulta(() => repo.materias.listar(), [], []);

  function escolher(id: string) {
    router.push(id ? `/banco?materia=${id}` : "/banco");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Revisão</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Banco</h1>
      <p className="mt-3 max-w-xl text-muted">
        As questões entram aqui quando você as salva num bloco. A revisão fica por matéria.
      </p>
      <div className="mt-6">
        <label className="rotulo" htmlFor="filtro-materia">
          Matéria
        </label>
        <select
          id="filtro-materia"
          className="campo"
          value={materiasProntas ? materiaId : ""}
          onChange={(evento) => escolher(evento.target.value)}
        >
          <option value="">Todas as matérias</option>
          {materias.map((materia) => (
            <option key={materia.id} value={materia.id}>
              {materia.nome}
            </option>
          ))}
        </select>
      </div>
      <Baralho key={materiaId || "todas"} materiaId={materiaId} />
    </main>
  );
}

function Baralho({ materiaId }: { materiaId: string }) {
  const [indice, setIndice] = useState(0);
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const questoes = materiaId
      ? await repo.questoes.listarPorMateria(materiaId)
      : await repo.questoes.listarTodas();
    const materias = await repo.materias.listar();
    const blocos = await Promise.all(questoes.map((questao) => repo.blocos.obter(questao.blocoId)));
    const pdfIds = [...new Set(questoes.map((questao) => questao.pdfId))];
    const pdfs = await Promise.all(pdfIds.map((id) => repo.pdfs.obter(id)));
    return questoes
      .slice()
      .sort(compararRevisao)
      .map((questao) => {
        const bloco = blocos.find((item) => item?.id === questao.blocoId);
        const pdf = pdfs.find((item) => item?.id === questao.pdfId);
        const materia = materias.find((item) => item.id === questao.materiaId);
        if (!bloco || !pdf || !materia) return null;
        const cartao: Cartao = {
          ...questao,
          materiaNome: materia.nome,
          pdfNome: pdf.nome,
          blocoTitulo: bloco.titulo,
          blocoId: bloco.id,
        };
        return cartao;
      })
      .filter((cartao): cartao is Cartao => Boolean(cartao));
  }, [materiaId], []);

  if (!pronto) return <Abrindo texto="Abrindo as questões…" />;
  if (erroLeitura) return <div className="mt-6"><Aviso texto={erroLeitura} /></div>;
  if (dados.length === 0) {
    return (
      <p className="mt-8 text-muted">
        Nenhuma questão neste filtro. Elas aparecem aqui quando você salva uma questão num bloco.
      </p>
    );
  }

  const atual = dados[Math.min(indice, dados.length - 1)];

  async function marcar(status: StatusRevisao) {
    setErro(null);
    try {
      await repo.questoes.definirRevisao(atual.id, status);
      setMostrar(false);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível atualizar a revisão."));
    }
  }

  return (
    <div className="mt-8">
      {erro ? <div className="mb-4"><Aviso texto={erro} /></div> : null}
      <p className="text-sm text-muted">
        {Math.min(indice, dados.length - 1) + 1} de {dados.length}
      </p>
      <article className="mt-3 border border-line bg-sheet px-5 py-6" key={atual.id}>
        <p className="text-sm text-muted">
          {atual.materiaNome} · {atual.blocoTitulo}
        </p>
        <h2 className="mt-4 font-serif text-3xl leading-snug">{atual.enunciado}</h2>
        {mostrar ? (
          <p className="mt-6 border-t border-line pt-4 font-serif text-xl leading-relaxed">{atual.resposta}</p>
        ) : (
          <button type="button" className="btn mt-6" onClick={() => setMostrar(true)}>
            Mostrar resposta
          </button>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {STATUS_REVISAO.map((status) => (
            <button
              key={status.id}
              type="button"
              className={`btn ${atual.statusRevisao === status.id ? "btn-primario" : ""}`}
              aria-pressed={atual.statusRevisao === status.id}
              onClick={() => void marcar(status.id)}
            >
              {status.nome}
            </button>
          ))}
        </div>
        <Link
          href={caminhoBloco(atual.materiaId, atual.pdfId, atual.blocoId)}
          className="mt-4 inline-block text-sm text-pine no-underline hover:underline"
        >
          Abrir bloco
        </Link>
      </article>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setIndice((atualIndice) => Math.max(0, atualIndice - 1));
            setMostrar(false);
          }}
          disabled={indice <= 0}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setIndice((atualIndice) => Math.min(dados.length - 1, atualIndice + 1));
            setMostrar(false);
          }}
          disabled={indice >= dados.length - 1}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
