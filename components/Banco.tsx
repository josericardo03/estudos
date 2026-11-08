"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { carregarCartoes, type Cartao } from "@/lib/cartoes";
import { formatarData } from "@/lib/datas";
import { diasAteProvaPorMateria } from "@/lib/edital";
import { mensagemErro } from "@/lib/erros";
import { gravarBruto, useBruto } from "@/lib/preferencias";
import { repo } from "@/lib/repo";
import {
  calcularAgenda,
  descreverVolta,
  estaDevida,
  gargalos,
  limitarSimulado,
  limiteDaProva,
  notaDeAcerto,
  proximaData,
  separarSimulado,
} from "@/lib/revisao";
import { caminhoBloco } from "@/lib/rotas";
import type { Confianca, Materia, MotivoErro, Tentativa } from "@/lib/types";
import { CONFIANCAS, MOTIVOS_ERRO, STATUS_REVISAO } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

const CHAVE_SIMULADO = "foco.simulado";
const VALIDADE_SIMULADO = 3 * 86_400_000;

/** Relógio lido só em respostas a cliques, nunca durante a renderização. */
function instante() {
  return Date.now();
}

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

type Modo = "simulado" | "questoes";

export function Banco() {
  const parametros = useSearchParams();
  const router = useRouter();
  const materiaId = parametros.get("materia") ?? "";
  const [modo, setModo] = useState<Modo>(materiaId ? "questoes" : "simulado");
  const { dados: materias, pronto: materiasProntas } = useConsulta(() => repo.materias.listar(), [], []);

  function escolher(id: string) {
    router.push(id ? `/banco?materia=${id}` : "/banco");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Questões</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Banco</h1>
      <p className="mt-3 max-w-xl text-muted">
        As questões entram aqui quando você as salva num bloco. A revisão do dia fica em{" "}
        <Link href="/hoje" className="text-pine no-underline hover:underline">
          Hoje
        </Link>
        . Aqui você monta um simulado ou confere a agenda de cada questão.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Modo do banco">
        <button type="button" className="btn btn-seletor" aria-pressed={modo === "simulado"} onClick={() => setModo("simulado")}>
          Simulado
        </button>
        <button type="button" className="btn btn-seletor" aria-pressed={modo === "questoes"} onClick={() => setModo("questoes")}>
          Todas as questões
        </button>
      </div>
      {modo === "questoes" ? (
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
          <Lista key={materiaId || "todas"} materiaId={materiaId} />
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

function Lista({ materiaId }: { materiaId: string }) {
  const [somenteVencidas, setSomenteVencidas] = useState(false);
  const { dados, pronto, erro } = useConsulta(
    async () => {
      const [cartoes, tentativas] = await Promise.all([
        carregarCartoes(materiaId ? { materiaIds: [materiaId] } : {}),
        repo.tentativas.listar(),
      ]);
      const contagem = new Map<string, number>();
      for (const item of tentativas) contagem.set(item.questaoId, (contagem.get(item.questaoId) ?? 0) + 1);
      return { cartoes, contagem, agora: Date.now() };
    },
    [materiaId],
    null,
  );

  if (!pronto) return <Abrindo texto="Abrindo as questões…" />;
  if (erro) return <div className="mt-6"><Aviso texto={erro} /></div>;
  if (!dados || dados.cartoes.length === 0) {
    return (
      <p className="mt-8 text-muted">
        Nenhuma questão neste filtro. Elas aparecem aqui quando você salva uma questão num bloco.
      </p>
    );
  }

  const ordenadas = dados.cartoes
    .filter((cartao) => !somenteVencidas || estaDevida(cartao, dados.agora))
    .sort((a, b) => (a.proximaEm ?? 0) - (b.proximaEm ?? 0) || a.createdAt - b.createdAt);

  return (
    <div className="mt-6">
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={somenteVencidas} onChange={(evento) => setSomenteVencidas(evento.target.checked)} />
        Só as vencidas
      </label>
      <p className="mt-3 text-sm text-muted">
        {ordenadas.length} de {dados.cartoes.length} {dados.cartoes.length === 1 ? "questão" : "questões"}, da mais atrasada
        para a mais distante.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {ordenadas.map((cartao) => {
          const vencida = estaDevida(cartao, dados.agora);
          const status = STATUS_REVISAO.find((item) => item.id === cartao.statusRevisao)?.nome;
          return (
            <li key={cartao.id} className="cartao p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                <span>
                  {cartao.materiaNome} · {cartao.blocoTitulo}
                </span>
                <span className={vencida ? "selo selo-alta" : "selo"}>
                  {vencida ? "Vencida" : descreverVolta(cartao.proximaEm ?? 0, dados.agora)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap font-serif text-xl leading-snug">{cartao.enunciado}</p>
              <p className="mt-2 text-sm text-muted">
                {status} · {dados.contagem.get(cartao.id) ?? 0} {dados.contagem.get(cartao.id) === 1 ? "tentativa" : "tentativas"}
                {cartao.intervaloDias ? ` · intervalo de ${cartao.intervaloDias} dias` : ""}
              </p>
              <Link
                href={caminhoBloco(cartao.materiaId, cartao.pdfId, cartao.blocoId)}
                className="mt-2 inline-block text-sm text-pine no-underline hover:underline"
              >
                Abrir bloco
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Julgamento = { acertou: boolean; texto: string; motivo?: MotivoErro };

type SimuladoSalvo = {
  salvoEm: number;
  ids: string[];
  rascunhos: Record<string, string>;
  confiancas: Record<string, Confianca>;
  indice: number;
  encerrado: boolean;
  julgamentos: Record<string, Julgamento>;
  tentativas: Record<string, string>;
};

function lerSimuladoSalvo(bruto: string | null, agora: number): SimuladoSalvo | null {
  if (!bruto) return null;
  try {
    const dado = JSON.parse(bruto) as SimuladoSalvo;
    if (!Array.isArray(dado.ids) || !dado.ids.length) return null;
    if (agora - dado.salvoEm > VALIDADE_SIMULADO) return null;
    return dado;
  } catch {
    return null;
  }
}

function Simulado({ materias }: { materias: Materia[] }) {
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null);
  const [prova, setProva] = useState<Cartao[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [confiancas, setConfiancas] = useState<Record<string, Confianca>>({});
  const [encerrado, setEncerrado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("20");
  const [deFora, setDeFora] = useState(0);
  const [sobraram, setSobraram] = useState(0);
  const [pedido, setPedido] = useState<number | null>(null);
  const [julgamentos, setJulgamentos] = useState<Record<string, Julgamento>>({});
  const [historico, setHistorico] = useState<Tentativa[]>([]);
  const tentativasDaProva = useRef<Record<string, string>>({});
  const salvoBruto = useBruto(CHAVE_SIMULADO);
  const [aberturaEm] = useState(() => Date.now());
  const salvo = lerSimuladoSalvo(salvoBruto, aberturaEm);
  const ids = escolhidas ?? materias.map((materia) => materia.id);
  const todas = materias.length > 0 && materias.every((materia) => ids.includes(materia.id));
  const { dados: diasProva } = useConsulta(
    async () => {
      const [editais, vinculos] = await Promise.all([repo.editais.listar(), repo.editais.vinculos()]);
      return diasAteProvaPorMateria(editais, vinculos);
    },
    [],
    new Map<string, number>(),
  );
  const emGargalo = useMemo(() => gargalos(historico), [historico]);

  useEffect(() => {
    if (!prova) return;
    const estado: SimuladoSalvo = {
      salvoEm: Date.now(),
      ids: prova.map((questao) => questao.id),
      rascunhos,
      confiancas,
      indice,
      encerrado,
      julgamentos,
      tentativas: tentativasDaProva.current,
    };
    gravarBruto(CHAVE_SIMULADO, JSON.stringify(estado));
  }, [prova, rascunhos, confiancas, indice, encerrado, julgamentos]);

  function alternar(id: string) {
    setEscolhidas(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function esquecerSimulado() {
    gravarBruto(CHAVE_SIMULADO, null);
  }

  async function retomar() {
    if (!salvo) return;
    setErro(null);
    setGerando(true);
    try {
      const [cartoes, tentativas] = await Promise.all([carregarCartoes(), repo.tentativas.listar()]);
      const porId = new Map(cartoes.map((cartao) => [cartao.id, cartao]));
      const questoes = salvo.ids.flatMap((id) => {
        const cartao = porId.get(id);
        return cartao ? [cartao] : [];
      });
      if (!questoes.length) {
        esquecerSimulado();
        setErro("As questões desse simulado não existem mais.");
        return;
      }
      tentativasDaProva.current = salvo.tentativas ?? {};
      setHistorico(tentativas);
      setDeFora(0);
      setSobraram(0);
      setPedido(null);
      setRascunhos(salvo.rascunhos ?? {});
      setConfiancas(salvo.confiancas ?? {});
      setJulgamentos(salvo.julgamentos ?? {});
      setIndice(Math.min(salvo.indice ?? 0, questoes.length - 1));
      setEncerrado(Boolean(salvo.encerrado));
      setProva(questoes);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível retomar o simulado."));
    } finally {
      setGerando(false);
    }
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
      const [cartoes, tentativas] = await Promise.all([carregarCartoes({ materiaIds: ids }), repo.tentativas.listar()]);
      if (!cartoes.length) {
        setErro("Nenhuma questão nessas matérias.");
        return;
      }
      const { entram, esperando } = separarSimulado(cartoes);
      if (!entram.length) {
        const quando = proximaData(esperando);
        const data = quando ? formatarData(quando, { day: "numeric", month: "long" }) : "";
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
      setConfiancas({});
      setEncerrado(false);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível gerar o simulado."));
    } finally {
      setGerando(false);
    }
  }

  async function julgar(questao: Cartao, acertou: boolean, motivo?: MotivoErro) {
    setErro(null);
    const nota = notaDeAcerto(acertou);
    const agenda = calcularAgenda(questao, nota, { limiteDias: limiteDaProva(diasProva.get(questao.materiaId)) });
    const idTentativa = tentativasDaProva.current[questao.id] ?? crypto.randomUUID();
    tentativasDaProva.current[questao.id] = idTentativa;
    const confianca = confiancas[questao.id];
    try {
      await repo.questoes.registrarJulgamento(questao.id, agenda, {
        id: idTentativa,
        pdfId: questao.pdfId,
        materiaId: questao.materiaId,
        blocoId: questao.blocoId,
        acertou,
        nota,
        ...(confianca ? { confianca } : {}),
        ...(!acertou && motivo ? { motivo } : {}),
      });
      const registrada: Tentativa = {
        id: idTentativa,
        questaoId: questao.id,
        pdfId: questao.pdfId,
        materiaId: questao.materiaId,
        blocoId: questao.blocoId,
        acertou,
        nota,
        ...(confianca ? { confianca } : {}),
        ...(!acertou && motivo ? { motivo } : {}),
        em: instante(),
      };
      setHistorico((atuais) => [...atuais.filter((item) => item.id !== idTentativa), registrada]);
      setJulgamentos((atuais) => ({
        ...atuais,
        [questao.id]: { acertou, texto: descreverVolta(agenda.proximaEm), motivo: !acertou ? motivo : undefined },
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
        {salvo ? (
          <div className="cartao mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              Você tem um simulado em andamento, com {salvo.ids.length} {salvo.ids.length === 1 ? "questão" : "questões"}.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primario" disabled={gerando} onClick={() => void retomar()}>
                Retomar
              </button>
              <button type="button" className="btn" onClick={esquecerSimulado}>
                Descartar
              </button>
            </div>
          </div>
        ) : null}
        <fieldset>
          <legend className="rotulo">Matérias do simulado</legend>
          <p className="mb-3 text-sm text-muted">
            As vagas se dividem entre as matérias. Em cada uma, um quarto é erro, metade é questão em aprendizado e um quarto é dominada que já voltou. Se faltar alguma, a vaga passa adiante.
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
    const julgadas = prova.filter((questao) => julgamentos[questao.id]).length;
    return (
      <div className="mt-6">
        <p className="text-sm text-muted">
          {respondidas} de {prova.length} com resposta escrita, {julgadas} julgadas. O acerto aumenta o intervalo. O erro devolve a questão ao próximo simulado.
        </p>
        {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
        <ol className="mt-4 flex flex-col gap-3">
          {prova.map((questao, posicao) => {
            const julgamento = julgamentos[questao.id];
            return (
              <li key={questao.id} className="cartao p-4">
                <p className="text-sm text-muted">
                  {posicao + 1}. {questao.materiaNome} · {questao.blocoTitulo}
                </p>
                <h2 className="mt-2 whitespace-pre-wrap font-serif text-2xl leading-snug">{questao.enunciado}</h2>
                {emGargalo.has(questao.id) ? <AvisoGargalo /> : null}
                <p className="mt-4 text-sm text-muted">Sua resposta</p>
                <p className="mt-1 whitespace-pre-wrap">{rascunhos[questao.id]?.trim() || "Em branco"}</p>
                <p className="mt-4 text-sm text-muted">Gabarito</p>
                <p className="mt-1 whitespace-pre-wrap font-serif text-xl leading-relaxed">{questao.resposta}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={julgamento?.acertou === true}
                    onClick={() => void julgar(questao, true)}
                  >
                    Acertei
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={julgamento?.acertou === false}
                    onClick={() => void julgar(questao, false, julgamento?.motivo)}
                  >
                    Errei
                  </button>
                  {julgamento ? <span className="text-sm text-pine">{julgamento.texto}</span> : null}
                </div>
                {julgamento && !julgamento.acertou ? (
                  <div className="mt-3">
                    <p className="text-sm text-muted">Por que errou?</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {MOTIVOS_ERRO.map((motivo) => (
                        <button
                          key={motivo.id}
                          type="button"
                          className="btn btn-cor"
                          aria-pressed={julgamento.motivo === motivo.id}
                          onClick={() => void julgar(questao, false, motivo.id)}
                        >
                          {motivo.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="btn mt-4"
          onClick={() => {
            esquecerSimulado();
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
        <h2 className="mt-4 whitespace-pre-wrap font-serif text-3xl leading-snug">{atual.enunciado}</h2>
        {emGargalo.has(atual.id) ? <AvisoGargalo /> : null}
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
        <fieldset className="mt-4">
          <legend className="rotulo">Quanta certeza você tem?</legend>
          <div className="flex flex-wrap gap-2">
            {CONFIANCAS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="btn btn-cor"
                aria-pressed={confiancas[atual.id] === item.id}
                onClick={() =>
                  setConfiancas((atuais) => {
                    const proximas = { ...atuais };
                    if (proximas[atual.id] === item.id) delete proximas[atual.id];
                    else proximas[atual.id] = item.id;
                    return proximas;
                  })
                }
              >
                {item.nome}
              </button>
            ))}
          </div>
        </fieldset>
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
