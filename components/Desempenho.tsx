"use client";

import Link from "next/link";
import { montarDesempenho, porcentagem, type GrupoDesempenho } from "@/lib/desempenho";
import { repo } from "@/lib/repo";
import { caminhoBloco, caminhoBanco, caminhoPdf } from "@/lib/rotas";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

function corDaTaxa(taxa: number) {
  if (taxa >= 0.8) return "var(--pine)";
  if (taxa >= 0.5) return "var(--media)";
  return "var(--alta)";
}

function textoDaTaxa(taxa: number | null) {
  if (taxa === null) return "Sem tentativa";
  return `${porcentagem(taxa)}%`;
}

function LinhaGrupo({ grupo }: { grupo: GrupoDesempenho }) {
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <Link href={grupo.href} className="break-words font-medium text-ink no-underline hover:underline">
            {grupo.nome}
          </Link>
          <p className="mt-1 text-sm text-muted">{grupo.detalhe}</p>
        </div>
        <p className="shrink-0 font-serif text-2xl" style={{ color: grupo.taxa === null ? "var(--muted)" : corDaTaxa(grupo.taxa) }}>
          {textoDaTaxa(grupo.taxa)}
        </p>
      </div>
      {grupo.taxa === null ? (
        <p className="mt-2 text-sm text-muted">
          {grupo.questoes} {grupo.questoes === 1 ? "questão no banco" : "questões no banco"}, nenhuma julgada ainda.
        </p>
      ) : (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f3f0e8]" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${porcentagem(grupo.taxa)}%`, background: corDaTaxa(grupo.taxa) }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {grupo.acertos} {grupo.acertos === 1 ? "acerto" : "acertos"} · {grupo.erros} {grupo.erros === 1 ? "erro" : "erros"} ·{" "}
            {grupo.julgadas} de {grupo.questoes} {grupo.questoes === 1 ? "questão julgada" : "questões julgadas"}
          </p>
        </>
      )}
    </li>
  );
}

export function Desempenho() {
  const { dados, pronto, erro } = useConsulta(async () => {
    const [materias, pdfs, blocos, questoes, tentativas] = await Promise.all([
      repo.materias.listar(),
      repo.pdfs.listarTodos(),
      repo.blocos.listarTodos(),
      repo.questoes.listarTodas(),
      repo.tentativas.listar(),
    ]);
    return montarDesempenho({
      materias,
      pdfs: pdfs.map(({ id, nome, materiaId }) => ({ id, nome, materiaId })),
      blocos,
      questoes,
      tentativas,
      caminhoPdf,
      caminhoBloco,
    });
  }, [], null);

  if (!pronto) return <Abrindo texto="Abrindo o desempenho…" />;
  if (erro) return <div className="px-5 py-10"><Aviso texto={erro} /></div>;
  if (!dados) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Acompanhamento</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Desempenho</h1>
      <p className="mt-3 max-w-xl text-muted">
        A média sai das questões que você escreveu e marcou como Acertei ou Errei no simulado. As questões do Tec Concursos ficam lá.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <article className="cartao p-4">
          <p className="text-sm text-muted">Média de acerto</p>
          <p className="mt-2 font-serif text-4xl" style={{ color: dados.taxa === null ? "var(--muted)" : corDaTaxa(dados.taxa) }}>
            {dados.taxa === null ? "—" : `${porcentagem(dados.taxa)}%`}
          </p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Tentativas</p>
          <p className="mt-2 font-serif text-4xl">{dados.tentativas}</p>
          <p className="mt-1 text-sm text-muted">
            {dados.acertos} {dados.acertos === 1 ? "acerto" : "acertos"} · {dados.erros} {dados.erros === 1 ? "erro" : "erros"}
          </p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Questões julgadas</p>
          <p className="mt-2 font-serif text-4xl">
            {dados.julgadas}
            <span className="text-2xl text-muted">/{dados.questoesNoBanco}</span>
          </p>
        </article>
      </div>

      {dados.questoesNoBanco === 0 ? (
        <p className="mt-10 text-muted">
          Nenhuma questão no banco. Elas entram quando você salva uma questão num bloco.
        </p>
      ) : dados.tentativas === 0 ? (
        <p className="mt-8 text-muted">
          Ainda não há acerto nem erro registrado. No fim de um simulado, marque Acertei ou Errei em cada questão.{" "}
          <Link href={caminhoBanco()} className="text-pine no-underline hover:underline">
            Abrir o banco
          </Link>
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Por PDF</h2>
        <p className="mt-2 text-sm text-muted">Os mais fracos aparecem primeiro. Sem tentativa, a média ainda não existe.</p>
        {dados.pdfs.length === 0 ? (
          <p className="mt-4 text-muted">Nenhum PDF com questão.</p>
        ) : (
          <ul className="cartao mt-4 px-4 py-4">
            {dados.pdfs.map((grupo) => (
              <LinhaGrupo key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        )}
      </section>

      {dados.blocos.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-3xl">Blocos mais fracos</h2>
          <p className="mt-2 text-sm text-muted">A faixa de páginas em que a média está mais baixa.</p>
          <ul className="cartao mt-4 px-4 py-4">
            {dados.blocos.map((grupo) => (
              <LinhaGrupo key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        </section>
      ) : null}

      {dados.questoes.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-3xl">Questões que você mais erra</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {dados.questoes.map((questao) => (
              <li key={questao.id} className="cartao p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 break-words text-sm text-muted">{questao.detalhe}</p>
                  <p className="shrink-0 font-serif text-2xl" style={{ color: corDaTaxa(questao.taxa) }}>
                    {porcentagem(questao.taxa)}%
                  </p>
                </div>
                <p className="mt-2 font-serif text-xl leading-snug">{questao.enunciado}</p>
                <p className="mt-2 text-sm text-muted">
                  {questao.acertos} {questao.acertos === 1 ? "acerto" : "acertos"} · {questao.erros}{" "}
                  {questao.erros === 1 ? "erro" : "erros"}
                </p>
                <Link href={questao.href} className="mt-2 inline-block text-sm text-pine no-underline hover:underline">
                  Abrir bloco
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
