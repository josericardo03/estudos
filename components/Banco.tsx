"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { aplicarJulgamento, compararRevisao, descreverVolta, ehGargalo, limitarSimulado, proximaData, separarSimulado } from "@/lib/revisao";
import { caminhoBloco } from "@/lib/rotas";
import type { Materia, Questao, StatusRevisao, Tentativa } from "@/lib/types";
import { STATUS_REVISAO } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

type Cartao = Questao & {
  materiaNome: string;
  pdfNome: string;
  blocoTitulo: string;
  blocoId: string;
};

function embaralhar<T>(lista: T[]) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const atual = copia[i];
    copia[i] = copia[j];
    copia[j] = atual;
  }
  return copia;
}

async function carregarCartoes(materiaIds: string[]) {
  const listas = await Promise.all(materiaIds.map((id) => repo.questoes.listarPorMateria(id)));
  const questoes = listas.flat();
  const materias = await repo.materias.listar();
  const blocos = await Promise.all(questoes.map((questao) => repo.blocos.obter(questao.blocoId)));
  const pdfIds = [...new Set(questoes.map((questao) => questao.pdfId))];
  const pdfs = await Promise.all(pdfIds.map((id) => repo.pdfs.obter(id)));
  return questoes.flatMap((questao) => {
    const bloco = blocos.find((item) => item?.id === questao.blocoId);
    const pdf = pdfs.find((item) => item?.id === questao.pdfId);
    const materia = materias.find((item) => item.id === questao.materiaId);
    if (!bloco || !pdf || !materia) return [];
    const cartao: Cartao = {
      ...questao,
      materiaNome: materia.nome,
      pdfNome: pdf.nome,
      blocoTitulo: bloco.titulo,
      blocoId: bloco.id,
    };
    return [cartao];
  });
}

export function Banco() {
  const parametros = useSearchParams();
  const router = useRouter();
  const materiaId = parametros.get("materia") ?? "";
  const [modo, setModo] = useState<"revisao" | "simulado">("revisao");
  const { dados: materias, pronto: materiasProntas } = useConsulta(() => repo.materias.listar(), [], []);

  function escolher(id: string) {
    router.push(id ? `/banco?materia=${id}` : "/banco");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Revisão</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Banco</h1>
      <p className="mt-3 max-w-xl text-muted">
        As questões entram aqui quando você as salva num bloco. Revise uma a uma ou gere um simulado.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Modo do banco">
        <button type="button" className="btn btn-seletor" aria-pressed={modo === "revisao"} onClick={() => setModo("revisao")}>
          Revisão
        </button>
        <button type="button" className="btn btn-seletor" aria-pressed={modo === "simulado"} onClick={() => setModo("simulado")}>
          Simulado
        </button>
      </div>
      {modo === "revisao" ? (
        <>
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
        </>
      ) : (
        <Simulado materias={materias} />
      )}
    </main>
  );
}

function AvisoGargalo() {
  return (
    <p className="mt-3 text-sm text-alta">
      <span className="selo selo-alta mr-2">Gargalo</span>
      Três erros seguidos. Releia a teoria deste trecho antes de insistir na questão.
    </p>
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
  const { dados: tentativas } = useConsulta(() => repo.tentativas.listar(), [], [] as Tentativa[]);

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
        {ehGargalo(tentativas, atual.id) ? <AvisoGargalo /> : null}
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

function Simulado({ materias }: { materias: Materia[] }) {
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null);
  const [prova, setProva] = useState<Cartao[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [encerrado, setEncerrado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("20");
  const [deFora, setDeFora] = useState(0);
  const [sobraram, setSobraram] = useState(0);
  const [pedido, setPedido] = useState<number | null>(null);
  const [julgamentos, setJulgamentos] = useState<Record<string, { acertou: boolean; texto: string }>>({});
  const [historico, setHistorico] = useState<Tentativa[]>([]);
  const tentativasDaProva = useRef<Record<string, string>>({});
  const ids = escolhidas ?? materias.map((materia) => materia.id);
  const todas = materias.length > 0 && materias.every((materia) => ids.includes(materia.id));

  function alternar(id: string) {
    setEscolhidas(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  async function gerar() {
    setErro(null);
    if (!ids.length) {
      setErro("Escolha ao menos uma matéria.");
      return;
    }
    const pedidoNumero = Number(quantidade);
    if (!Number.isInteger(pedidoNumero) || pedidoNumero < 1) {
      setErro("Diga quantas questões, pelo menos 1.");
      return;
    }
    setGerando(true);
    try {
      const [cartoes, tentativas] = await Promise.all([carregarCartoes(ids), repo.tentativas.listar()]);
      if (!cartoes.length) {
        setErro("Nenhuma questão nessas matérias.");
        return;
      }
      const { entram, esperando } = separarSimulado(cartoes);
      if (!entram.length) {
        const quando = proximaData(esperando);
        const data = quando
          ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(quando)
          : "";
        setErro(
          data
            ? `Nada no banco para agora. As questões que você acertou voltam a partir de ${data}.`
            : "Nada no banco para agora.",
        );
        return;
      }
      const { prova: selecionadas, sobraram: restantes } = limitarSimulado(entram, pedidoNumero);
      setDeFora(esperando.length);
      setSobraram(restantes);
      setPedido(pedidoNumero);
      setJulgamentos({});
      setHistorico(tentativas);
      tentativasDaProva.current = {};
      setProva(embaralhar(selecionadas));
      setIndice(0);
      setRascunhos({});
      setEncerrado(false);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível gerar o simulado."));
    } finally {
      setGerando(false);
    }
  }

  async function julgar(questao: Cartao, acertou: boolean) {
    setErro(null);
    const agenda = aplicarJulgamento(questao, acertou);
    const idTentativa = tentativasDaProva.current[questao.id] ?? crypto.randomUUID();
    tentativasDaProva.current[questao.id] = idTentativa;
    try {
      await repo.questoes.registrarJulgamento(questao.id, agenda, {
        id: idTentativa,
        pdfId: questao.pdfId,
        materiaId: questao.materiaId,
        blocoId: questao.blocoId,
        acertou,
      });
      const registrada: Tentativa = {
        id: idTentativa,
        questaoId: questao.id,
        pdfId: questao.pdfId,
        materiaId: questao.materiaId,
        blocoId: questao.blocoId,
        acertou,
        em: Date.now(),
      };
      setHistorico((atuais) => [...atuais.filter((item) => item.id !== idTentativa), registrada]);
      setJulgamentos((atuais) => ({
        ...atuais,
        [questao.id]: { acertou, texto: descreverVolta(agenda.proximaEm) },
      }));
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível guardar o resultado."));
    }
  }

  if (!prova) {
    return (
      <form
        className="mt-6"
        onSubmit={(evento) => {
          evento.preventDefault();
          void gerar();
        }}
      >
        {erro ? <div className="mb-4"><Aviso texto={erro} /></div> : null}
        <fieldset>
          <legend className="rotulo">Matérias do simulado</legend>
          <p className="mb-3 text-sm text-muted">
            As vagas se dividem entre as matérias. Em cada uma, um quarto é erro, metade é questão nova e um quarto é dominada que já voltou. Se faltar alguma, a vaga passa adiante.
          </p>
          <label className="flex items-center gap-3 rounded-xl bg-sheet px-3 py-2">
            <input
              type="checkbox"
              checked={todas}
              onChange={() => setEscolhidas(todas ? [] : materias.map((materia) => materia.id))}
            />
            <span>Todas as matérias</span>
          </label>
          <ul className="mt-2 flex flex-col gap-2">
            {materias.map((materia) => (
              <li key={materia.id}>
                <label className="flex items-center gap-3 rounded-xl bg-sheet px-3 py-2">
                  <input type="checkbox" checked={ids.includes(materia.id)} onChange={() => alternar(materia.id)} />
                  <span>{materia.nome}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="mt-4 max-w-xs">
          <label className="rotulo" htmlFor="quantidade-simulado">
            Quantidade
          </label>
          <input
            id="quantidade-simulado"
            className="campo"
            type="number"
            min={1}
            inputMode="numeric"
            value={quantidade}
            onChange={(evento) => setQuantidade(evento.target.value)}
          />
          <p className="mt-2 text-sm text-muted">
            No máximo essas, entre as que já voltaram. Se houver menos, o simulado fica com as que tem.
          </p>
        </div>
        <button className="btn btn-primario mt-4" type="submit" disabled={gerando || materias.length === 0}>
          {gerando ? "Gerando…" : "Gerar simulado"}
        </button>
      </form>
    );
  }

  if (encerrado) {
    const respondidas = prova.filter((questao) => rascunhos[questao.id]?.trim()).length;
    return (
      <div className="mt-6">
        <p className="text-sm text-muted">
          {respondidas} de {prova.length} com resposta escrita. O acerto aumenta o intervalo. O erro devolve a questão ao próximo simulado.
        </p>
        {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
        <ol className="mt-4 flex flex-col gap-3">
          {prova.map((questao, posicao) => (
            <li key={questao.id} className="cartao p-4">
              <p className="text-sm text-muted">
                {posicao + 1}. {questao.materiaNome} · {questao.blocoTitulo}
              </p>
              <h2 className="mt-2 font-serif text-2xl leading-snug">{questao.enunciado}</h2>
              {ehGargalo(historico, questao.id) ? <AvisoGargalo /> : null}
              <p className="mt-4 text-sm text-muted">Sua resposta</p>
              <p className="mt-1">{rascunhos[questao.id]?.trim() || "Em branco"}</p>
              <p className="mt-4 text-sm text-muted">Gabarito</p>
              <p className="mt-1 font-serif text-xl leading-relaxed">{questao.resposta}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  aria-pressed={julgamentos[questao.id]?.acertou === true}
                  onClick={() => void julgar(questao, true)}
                >
                  Acertei
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={julgamentos[questao.id]?.acertou === false}
                  onClick={() => void julgar(questao, false)}
                >
                  Errei
                </button>
                {julgamentos[questao.id] ? <span className="text-sm text-pine">{julgamentos[questao.id].texto}</span> : null}
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn mt-4"
          onClick={() => {
            setProva(null);
            setEncerrado(false);
            setErro(null);
          }}
        >
          Novo simulado
        </button>
      </div>
    );
  }

  const atual = prova[Math.min(indice, prova.length - 1)];

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Questão {Math.min(indice, prova.length - 1) + 1} de {prova.length}. O gabarito aparece no fim.
        {pedido !== null && pedido > prova.length ? ` Você pediu ${pedido}. Há ${prova.length} no banco agora.` : ""}
        {sobraram > 0 ? ` ${sobraram} ${sobraram === 1 ? "continua" : "continuam"} no banco para o próximo simulado.` : ""}
        {deFora > 0 ? ` ${deFora} ${deFora === 1 ? "ficou" : "ficaram"} para depois, porque você acertou.` : ""}
      </p>
      <article className="cartao mt-3 p-5" key={atual.id}>
        <p className="text-sm text-muted">
          {atual.materiaNome} · {atual.blocoTitulo}
        </p>
        <h2 className="mt-4 font-serif text-3xl leading-snug">{atual.enunciado}</h2>
        {ehGargalo(historico, atual.id) ? <AvisoGargalo /> : null}
        <label className="rotulo mt-6" htmlFor="resposta-simulado">
          Sua resposta
        </label>
        <textarea
          id="resposta-simulado"
          className="campo min-h-28"
          value={rascunhos[atual.id] ?? ""}
          onChange={(evento) => setRascunhos((atuais) => ({ ...atuais, [atual.id]: evento.target.value }))}
          placeholder="Escreva a resposta sem consultar o gabarito."
        />
      </article>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => setIndice((atualIndice) => Math.max(0, atualIndice - 1))}
          disabled={indice <= 0}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setIndice((atualIndice) => Math.min(prova.length - 1, atualIndice + 1))}
          disabled={indice >= prova.length - 1}
        >
          Próxima
        </button>
        <button type="button" className="btn btn-primario" onClick={() => setEncerrado(true)}>
          Ver gabarito
        </button>
      </div>
    </div>
  );
}
