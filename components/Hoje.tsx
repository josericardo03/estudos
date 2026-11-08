"use client";

import Link from "next/link";
import { useState } from "react";
import { juntarCartoes } from "@/lib/cartoes";
import { formatarData, formatarDuracao } from "@/lib/datas";
import { montarDesempenho } from "@/lib/desempenho";
import { descreverProva, diasAteProva, diasAteProvaPorMateria } from "@/lib/edital";
import { resumirEstudo } from "@/lib/estudo";
import { montarPlano } from "@/lib/plano";
import { usePreferencia } from "@/lib/preferencias";
import { repo } from "@/lib/repo";
import { estaDevida, filaDeHoje, proximaData } from "@/lib/revisao";
import { caminhoBloco, caminhoMateria, caminhoPdf } from "@/lib/rotas";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";
import { RevisaoBloco } from "./RevisaoBloco";
import { SessaoRevisao } from "./SessaoRevisao";

const ADIANTADO = 15;

export function Hoje() {
  const [materiaFiltro, setMateriaFiltro] = useState("");
  const [sessao, setSessao] = useState<string[] | null>(null);
  const [metaMinutos] = usePreferencia<number>("foco.metaDiariaMin", 180);

  const { dados, pronto, erro } = useConsulta(async () => {
    const [materias, pdfs, blocos, questoes, tentativas, editais, vinculos, topicos, estudos, lancamentos] =
      await Promise.all([
        repo.materias.listar(),
        repo.pdfs.listarTodos(),
        repo.blocos.listarTodos(),
        repo.questoes.listarTodas(),
        repo.tentativas.listar(),
        repo.editais.listar(),
        repo.editais.vinculos(),
        repo.topicos.listarTodos(),
        repo.estudos.listar(),
        repo.lancamentos.listar(),
      ]);
    const agora = Date.now();
    const cartoes = juntarCartoes(questoes, materias, pdfs, blocos);
    const pdfPorId = new Map(pdfs.map((pdf) => [pdf.id, pdf]));
    const materiaPorId = new Map(materias.map((materia) => [materia.id, materia]));
    const desempenho = montarDesempenho({
      materias,
      pdfs,
      blocos,
      questoes,
      tentativas,
      lancamentos,
      agora,
      caminhoMateria,
      caminhoPdf: caminhoPdf,
      caminhoBloco,
    });
    const blocosParaRever = blocos
      .filter((bloco) => bloco.status === "finalizado" && bloco.proximaRevisaoEm && bloco.proximaRevisaoEm <= agora)
      .sort((a, b) => (a.proximaRevisaoEm ?? 0) - (b.proximaRevisaoEm ?? 0))
      .flatMap((bloco) => {
        const pdf = pdfPorId.get(bloco.pdfId);
        const materia = pdf ? materiaPorId.get(pdf.materiaId) : undefined;
        if (!pdf || !materia) return [];
        return [{ bloco, materiaId: materia.id, contexto: `${pdf.nome} · ${materia.nome}` }];
      });
    const provas = editais
      .filter((edital) => edital.dataProva && (diasAteProva(edital.dataProva, agora) ?? -1) >= 0)
      .sort((a, b) => (a.dataProva ?? 0) - (b.dataProva ?? 0));
    return {
      agora,
      materias,
      blocos,
      questoes,
      topicos,
      cartoes,
      tentativas,
      desempenho,
      blocosParaRever,
      provas,
      diasProva: diasAteProvaPorMateria(editais, vinculos, agora),
      estudo: resumirEstudo(estudos, agora),
      temAlgo: materias.length > 0,
    };
  }, [], null);

  if (!pronto) return <Abrindo texto="Abrindo o dia…" />;
  if (erro) return <div className="px-5 py-10"><Aviso texto={erro} /></div>;
  if (!dados) return null;

  const filtrados = dados.cartoes.filter((cartao) => !materiaFiltro || cartao.materiaId === materiaFiltro);
  const fila = filaDeHoje(filtrados, dados.tentativas, dados.agora);
  const totalVencidas = dados.cartoes.filter((cartao) => estaDevida(cartao, dados.agora)).length;
  const proxima = proximaData(filtrados, dados.agora);
  const adiantadas = filtrados
    .filter((cartao) => !estaDevida(cartao, dados.agora))
    .sort((a, b) => (a.proximaEm ?? 0) - (b.proximaEm ?? 0))
    .slice(0, ADIANTADO);
  const plano = montarPlano({
    materias: dados.materias,
    questoes: dados.questoes,
    topicos: dados.topicos,
    blocos: dados.blocos,
    desempenho: dados.desempenho.materias,
    minutosDia: metaMinutos,
    agora: dados.agora,
  });
  const hojeSegundos = dados.estudo.hoje;
  const metaSegundos = metaMinutos * 60;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Hoje</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight first-letter:uppercase">
        {formatarData(dados.agora, { weekday: "long", day: "numeric", month: "long" })}
      </h1>

      {dados.provas.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Provas marcadas">
          {dados.provas.slice(0, 3).map((edital) => (
            <li key={edital.id}>
              <Link
                href={`/editais/${edital.id}`}
                className="selo selo-pine rounded-full px-3 py-1 normal-case tracking-normal no-underline"
              >
                {edital.nome} · {descreverProva(edital.dataProva, dados.agora)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {sessao ? (
        <SessaoRevisao
          inicial={sessao}
          cartoes={dados.cartoes}
          tentativas={dados.tentativas}
          diasProva={dados.diasProva}
          onFechar={() => setSessao(null)}
        />
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <article className="cartao p-4">
              <p className="text-sm text-muted">Questões vencidas</p>
              <p className="mt-2 font-serif text-4xl">{totalVencidas}</p>
            </article>
            <article className="cartao p-4">
              <p className="text-sm text-muted">Blocos para reler</p>
              <p className="mt-2 font-serif text-4xl">{dados.blocosParaRever.length}</p>
            </article>
            <article className="cartao p-4">
              <p className="text-sm text-muted">Estudado hoje</p>
              <p className="mt-2 font-serif text-4xl">{formatarDuracao(hojeSegundos)}</p>
              <p className="mt-1 text-xs text-muted">meta {formatarDuracao(metaSegundos)}</p>
            </article>
            <article className="cartao p-4">
              <p className="text-sm text-muted">Sequência</p>
              <p className="mt-2 font-serif text-4xl">
                {dados.estudo.sequencia}
                <span className="text-2xl text-muted"> {dados.estudo.sequencia === 1 ? "dia" : "dias"}</span>
              </p>
            </article>
          </div>

          {!dados.temAlgo ? (
            <p className="mt-10 text-muted">
              Nada por aqui ainda. Comece criando uma matéria e enviando o PDF que você está estudando.{" "}
              <Link href="/" className="text-pine no-underline hover:underline">
                Ir para Matérias
              </Link>
            </p>
          ) : null}

          <section className="mt-10" aria-labelledby="titulo-revisao">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="titulo-revisao" className="font-serif text-3xl">
                Revisão do dia
              </h2>
              <div>
                <label className="sr-only" htmlFor="filtro-materia-hoje">
                  Matéria
                </label>
                <select
                  id="filtro-materia-hoje"
                  className="campo"
                  value={materiaFiltro}
                  onChange={(evento) => setMateriaFiltro(evento.target.value)}
                >
                  <option value="">Todas as matérias</option>
                  {dados.materias.map((materia) => (
                    <option key={materia.id} value={materia.id}>
                      {materia.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {fila.length > 0 ? (
              <>
                <p className="mt-3 text-muted">
                  {fila.length} {fila.length === 1 ? "questão venceu" : "questões venceram"}. As matérias se alternam
                  e quem você errou com certeza vem primeiro.
                </p>
                <button
                  type="button"
                  className="btn btn-primario mt-4"
                  onClick={() => setSessao(fila.map((cartao) => cartao.id))}
                >
                  Começar revisão ({fila.length})
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-muted">
                  {filtrados.length === 0
                    ? "Nenhuma questão aqui ainda. Elas entram quando você as salva num bloco."
                    : proxima
                      ? `Tudo em dia. A próxima revisão é ${formatarData(proxima, { weekday: "long", day: "numeric", month: "long" })}.`
                      : "Tudo em dia."}
                </p>
                {adiantadas.length > 0 ? (
                  <button
                    type="button"
                    className="btn mt-4"
                    onClick={() => setSessao(adiantadas.map((cartao) => cartao.id))}
                  >
                    Estudar adiantado ({adiantadas.length})
                  </button>
                ) : null}
              </>
            )}
          </section>

          {dados.blocosParaRever.length > 0 ? (
            <section className="mt-10" aria-labelledby="titulo-releitura">
              <h2 id="titulo-releitura" className="font-serif text-3xl">
                Blocos para reler
              </h2>
              <p className="mt-2 text-sm text-muted">
                Blocos finalizados voltam em 1, 7, 30 e 90 dias. Releia com as palavras-chave escondidas.
              </p>
              <ul className="cartao mt-4 divide-y divide-line px-4 py-4">
                {dados.blocosParaRever.map((item) => (
                  <RevisaoBloco key={item.bloco.id} bloco={item.bloco} materiaId={item.materiaId} contexto={item.contexto} />
                ))}
              </ul>
            </section>
          ) : null}

          {plano.length > 0 ? (
            <section className="mt-10" aria-labelledby="titulo-plano">
              <h2 id="titulo-plano" className="font-serif text-3xl">
                Plano de hoje
              </h2>
              <p className="mt-2 text-sm text-muted">
                {formatarDuracao(metaSegundos)} divididos pelo peso no edital, pelos tópicos pendentes, pela taxa de acerto
                e pelas questões vencidas.{" "}
                <Link href="/estudo" className="text-pine no-underline hover:underline">
                  Mudar a meta
                </Link>
              </p>
              <ul className="cartao mt-4 divide-y divide-line px-4 py-2">
                {plano.map((item) => (
                  <li key={item.materiaId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        href={caminhoMateria(item.materiaId)}
                        className="break-words font-medium text-ink no-underline hover:underline"
                      >
                        {item.nome}
                      </Link>
                      <p className="mt-1 text-sm text-muted">{item.motivo}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-serif text-2xl">{item.minutos} min</span>
                      <Link href={`/estudo?materia=${item.materiaId}`} className="btn">
                        Cronometrar
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {dados.blocos.length > 0 ? (
            <p className="mt-10 text-sm text-muted">
              Dica: ao finalizar um bloco você escreve um resumo e ele entra na agenda de releitura. Os grifos viram
              pergunta com o botão “Virar questão”.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
