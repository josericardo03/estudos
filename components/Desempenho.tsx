"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarData } from "@/lib/datas";
import { montarDesempenho, porcentagem, type GrupoDesempenho, type GrupoMateria } from "@/lib/desempenho";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { caminhoBanco, caminhoMateria, caminhoPdf } from "@/lib/rotas";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar } from "./ui";

function corDaTaxa(taxa: number) {
  if (taxa >= 0.8) return "var(--pine)";
  if (taxa >= 0.5) return "var(--media)";
  return "var(--alta)";
}

function textoDaTaxa(taxa: number | null) {
  if (taxa === null) return "Sem tentativa";
  return `${porcentagem(taxa)}%`;
}

function Barra({ taxa }: { taxa: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${porcentagem(taxa)}%`, background: corDaTaxa(taxa) }} />
    </div>
  );
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
          <Barra taxa={grupo.taxa} />
          <p className="mt-2 text-sm text-muted">
            {grupo.acertos} {grupo.acertos === 1 ? "acerto" : "acertos"} · {grupo.erros} {grupo.erros === 1 ? "erro" : "erros"} ·{" "}
            {grupo.julgadas} de {grupo.questoes} {grupo.questoes === 1 ? "questão julgada" : "questões julgadas"}
          </p>
        </>
      )}
    </li>
  );
}

function LinhaMateria({ grupo }: { grupo: GrupoMateria }) {
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={grupo.href} className="min-w-0 break-words font-medium text-ink no-underline hover:underline">
          {grupo.nome}
        </Link>
        <p className="shrink-0 font-serif text-2xl" style={{ color: grupo.taxa === null ? "var(--muted)" : corDaTaxa(grupo.taxa) }}>
          {textoDaTaxa(grupo.taxa)}
        </p>
      </div>
      {grupo.taxa === null ? (
        <p className="mt-2 text-sm text-muted">Nenhum card revisado ainda.</p>
      ) : (
        <>
          <Barra taxa={grupo.taxa} />
          <p className="mt-2 text-sm text-muted">
            {grupo.internas} no app ({grupo.internasAcertos} certas) · {grupo.externas} fora ({grupo.externasAcertos} certas)
          </p>
        </>
      )}
    </li>
  );
}

function leituraDaCalibracao(calibracao: { nivel: number; tentativas: number; taxa: number }[]) {
  const certeza = calibracao.find((item) => item.nivel === 3);
  const chute = calibracao.find((item) => item.nivel === 1);
  const frases: string[] = [];
  if (certeza && certeza.tentativas >= 5) {
    if (certeza.taxa < 0.8) {
      frases.push(
        `Quando você tem certeza, acerta ${porcentagem(certeza.taxa)}%. Você se superestima: revise os erros marcados como “certeza” primeiro.`,
      );
    } else {
      frases.push(`Quando você tem certeza, acerta ${porcentagem(certeza.taxa)}%. Sua certeza é confiável.`);
    }
  }
  if (chute && chute.tentativas >= 5 && chute.taxa >= 0.5) {
    frases.push(`Nos chutes você acerta ${porcentagem(chute.taxa)}%: você sabe mais do que acha.`);
  }
  return frases;
}

export function Desempenho() {
  const [erro, setErro] = useState<string | null>(null);
  const [materiaId, setMateriaId] = useState("");
  const [feitas, setFeitas] = useState("");
  const [acertos, setAcertos] = useState("");
  const [fonte, setFonte] = useState("Tec Concursos");
  const [guardando, setGuardando] = useState(false);

  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const [materias, pdfs, topicos, questoes, tentativas, lancamentos] = await Promise.all([
      repo.materias.listar(),
      repo.pdfs.listarTodos(),
      repo.topicos.listarTodos(),
      repo.questoes.listarTodas(),
      repo.tentativas.listar(),
      repo.lancamentos.listar(),
    ]);
    return {
      materias,
      lancamentos,
      resumo: montarDesempenho({
        materias,
        pdfs: pdfs.map(({ id, nome, materiaId: dono }) => ({ id, nome, materiaId: dono })),
        topicos,
        questoes,
        tentativas,
        lancamentos,
        caminhoMateria,
        caminhoPdf,
        caminhoTopico: (editalId: string) => `/editais/${editalId}`,
      }),
    };
  }, [], null);

  if (!pronto) return <Abrindo texto="Abrindo o desempenho…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) return null;
  const { resumo, materias, lancamentos } = dados;
  const nomeDaMateria = new Map(materias.map((materia) => [materia.id, materia.nome]));
  const escolhida = nomeDaMateria.has(materiaId) ? materiaId : (materias[0]?.id ?? "");
  const frasesDeCalibracao = leituraDaCalibracao(resumo.calibracao);
  const totalMotivos = resumo.motivos.reduce((total, item) => total + item.total, 0);

  async function lancar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setGuardando(true);
    try {
      await repo.lancamentos.criar({
        materiaId: escolhida,
        feitas: Number(feitas),
        acertos: Number(acertos),
        fonte,
      });
      setFeitas("");
      setAcertos("");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível guardar o lançamento."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Acompanhamento</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Desempenho</h1>
      <p className="mt-3 max-w-xl text-muted">
        A média sai dos cards que você revisou aqui e das questões que você lança de fora, como as do Tec
        Concursos. Tentativas recentes pesam mais que as antigas na ordem dos mais fracos.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <article className="cartao p-4">
          <p className="text-sm text-muted">Média geral</p>
          <p className="mt-2 font-serif text-4xl" style={{ color: resumo.geral.taxa === null ? "var(--muted)" : corDaTaxa(resumo.geral.taxa) }}>
            {resumo.geral.taxa === null ? "—" : `${porcentagem(resumo.geral.taxa)}%`}
          </p>
          <p className="mt-1 text-sm text-muted">{resumo.geral.feitas} questões feitas</p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Últimos 7 dias</p>
          <p className="mt-2 font-serif text-4xl" style={{ color: resumo.semana.taxa === null ? "var(--muted)" : corDaTaxa(resumo.semana.taxa) }}>
            {resumo.semana.taxa === null ? "—" : `${porcentagem(resumo.semana.taxa)}%`}
          </p>
          <p className="mt-1 text-sm text-muted">{resumo.semana.tentativas} no app</p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Cards revisados no app</p>
          <p className="mt-2 font-serif text-4xl">
            {resumo.julgadas}
            <span className="text-2xl text-muted">/{resumo.questoesNoBanco}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {resumo.acertos} {resumo.acertos === 1 ? "acerto" : "acertos"} · {resumo.erros} {resumo.erros === 1 ? "erro" : "erros"}
          </p>
        </article>
      </div>

      {resumo.questoesNoBanco === 0 && resumo.externas.feitas === 0 ? (
        <p className="mt-10 text-muted">
          Nenhum card ainda. Eles nascem no leitor, a partir de um trecho que você seleciona.
        </p>
      ) : resumo.tentativas === 0 ? (
        <p className="mt-8 text-muted">
          Ainda não há acerto nem erro registrado no app. Faça a revisão do dia ou um simulado.{" "}
          <Link href="/hoje" className="text-pine no-underline hover:underline">
            Abrir Hoje
          </Link>{" "}
          ·{" "}
          <Link href={caminhoBanco()} className="text-pine no-underline hover:underline">
            Abrir o banco
          </Link>
        </p>
      ) : null}

      <section className="mt-10" aria-labelledby="titulo-materias">
        <h2 id="titulo-materias" className="font-serif text-3xl">
          Por matéria
        </h2>
        <p className="mt-2 text-sm text-muted">Soma do app com as questões lançadas de fora. As mais fracas vêm primeiro.</p>
        {resumo.materias.length === 0 ? (
          <p className="mt-4 text-muted">Nenhuma matéria.</p>
        ) : (
          <ul className="cartao mt-4 px-4 py-4">
            {resumo.materias.map((grupo) => (
              <LinhaMateria key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="titulo-lancar">
        <h2 id="titulo-lancar" className="font-serif text-3xl">
          Questões feitas fora do app
        </h2>
        <p className="mt-2 text-sm text-muted">
          Terminou uma lista no Tec Concursos? Lance quantas fez e quantas acertou. Entra na média da matéria.
        </p>
        {materias.length === 0 ? (
          <p className="mt-3 text-muted">Crie uma matéria antes de lançar.</p>
        ) : (
          <form onSubmit={lancar} className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_auto] sm:items-end">
            <div>
              <label className="rotulo" htmlFor="lanc-materia">
                Matéria
              </label>
              <select id="lanc-materia" className="campo" value={escolhida} onChange={(evento) => setMateriaId(evento.target.value)}>
                {materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="lanc-feitas">
                Feitas
              </label>
              <input
                id="lanc-feitas"
                className="campo"
                type="number"
                min={1}
                inputMode="numeric"
                value={feitas}
                onChange={(evento) => setFeitas(evento.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="lanc-acertos">
                Acertos
              </label>
              <input
                id="lanc-acertos"
                className="campo"
                type="number"
                min={0}
                inputMode="numeric"
                value={acertos}
                onChange={(evento) => setAcertos(evento.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="lanc-fonte">
                Fonte
              </label>
              <input id="lanc-fonte" className="campo" value={fonte} onChange={(evento) => setFonte(evento.target.value)} autoComplete="off" />
            </div>
            <button className="btn btn-primario" type="submit" disabled={guardando}>
              {guardando ? "Lançando…" : "Lançar"}
            </button>
          </form>
        )}
        {erro ? <div className="mt-3"><Aviso texto={erro} /></div> : null}
        {lancamentos.length > 0 ? (
          <ul className="cartao mt-4 divide-y divide-line px-4 py-1">
            {lancamentos.slice(0, 6).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="min-w-0">
                  {formatarData(item.em, { day: "numeric", month: "short" })} · {nomeDaMateria.get(item.materiaId) ?? "Matéria"}
                  {item.fonte ? <span className="text-muted"> · {item.fonte}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span>
                    {item.acertos}/{item.feitas} <span className="text-muted">({porcentagem(item.acertos / item.feitas)}%)</span>
                  </span>
                  <Confirmar rotulo="Apagar" confirmar="Apagar" onConfirmar={() => repo.lancamentos.remover(item.id)} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {resumo.motivos.length > 0 ? (
        <section className="mt-10" aria-labelledby="titulo-motivos">
          <h2 id="titulo-motivos" className="font-serif text-3xl">
            Por que você erra
          </h2>
          <p className="mt-2 text-sm text-muted">
            Erro por não saber pede teoria. Erro por confusão pede comparar os conceitos. Distração pede mais calma na leitura.
          </p>
          <ul className="cartao mt-4 grid gap-3 px-4 py-4">
            {resumo.motivos.map((item) => (
              <li key={item.motivo}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{item.nome}</span>
                  <span className="text-muted">
                    {item.total} ({porcentagem(item.total / totalMotivos)}%)
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-alta" style={{ width: `${(item.total / totalMotivos) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resumo.calibracao.length > 0 ? (
        <section className="mt-10" aria-labelledby="titulo-calibracao">
          <h2 id="titulo-calibracao" className="font-serif text-3xl">
            Certeza × acerto
          </h2>
          <p className="mt-2 text-sm text-muted">
            O quanto a sua sensação de saber combina com o resultado. É o melhor antídoto contra a ilusão de que já aprendeu.
          </p>
          <ul className="cartao mt-4 divide-y divide-line px-4 py-2">
            {resumo.calibracao.map((item) => (
              <li key={item.nivel} className="flex items-baseline justify-between gap-3 py-3">
                <span>
                  {item.nome} <span className="text-sm text-muted">({item.tentativas})</span>
                </span>
                <span className="font-serif text-2xl" style={{ color: corDaTaxa(item.taxa) }}>
                  {porcentagem(item.taxa)}%
                </span>
              </li>
            ))}
          </ul>
          {frasesDeCalibracao.map((frase) => (
            <p key={frase} className="mt-3 text-sm">
              {frase}
            </p>
          ))}
        </section>
      ) : null}

      {resumo.pontosCegos.length > 0 ? (
        <section className="mt-10" aria-labelledby="titulo-cegos">
          <h2 id="titulo-cegos" className="font-serif text-3xl">
            Pontos cegos
          </h2>
          <p className="mt-2 text-sm text-muted">Questões que você errou com certeza. Corrigidas, são as que mais fixam.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {resumo.pontosCegos.map((questao) => (
              <li key={questao.id} className="cartao p-4">
                <p className="text-sm text-muted">{questao.detalhe}</p>
                <p className="mt-2 font-serif text-xl leading-snug">{questao.enunciado}</p>
                <p className="mt-2 text-sm text-muted">
                  Errou com certeza {questao.certezaErrada} {questao.certezaErrada === 1 ? "vez" : "vezes"}.
                </p>
                <Link href={questao.href} className="mt-2 inline-block text-sm text-pine no-underline hover:underline">
                  Abrir no material
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Por PDF</h2>
        <p className="mt-2 text-sm text-muted">Os mais fracos aparecem primeiro. Sem tentativa, a média ainda não existe.</p>
        {resumo.pdfs.length === 0 ? (
          <p className="mt-4 text-muted">Nenhum PDF com questão.</p>
        ) : (
          <ul className="cartao mt-4 px-4 py-4">
            {resumo.pdfs.map((grupo) => (
              <LinhaGrupo key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        )}
      </section>

      {resumo.topicos.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-3xl">Tópicos do edital</h2>
          <p className="mt-2 text-sm text-muted">
            Onde você mais erra, na ordem da prova. É o que leva direto de volta ao seu planejamento.
          </p>
          <ul className="cartao mt-4 px-4 py-4">
            {resumo.topicos.map((grupo) => (
              <LinhaGrupo key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        </section>
      ) : null}

      {resumo.trechos.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-3xl">Trechos do PDF</h2>
          <p className="mt-2 text-sm text-muted">
            Faixas de 10 páginas em que a média está mais baixa. Clique para reler o trecho.
          </p>
          <ul className="cartao mt-4 px-4 py-4">
            {resumo.trechos.map((grupo) => (
              <LinhaGrupo key={grupo.id} grupo={grupo} />
            ))}
          </ul>
        </section>
      ) : null}

      {resumo.questoes.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-3xl">Questões que você mais erra</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {resumo.questoes.map((questao) => (
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
                  Abrir no material
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
