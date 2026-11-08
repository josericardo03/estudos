"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { partesDaLacuna } from "@/lib/cards";
import type { Cartao } from "@/lib/cartoes";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { calcularAgenda, ehGargalo, limiteDaProva, previsaoDasNotas, type Agenda } from "@/lib/revisao";
import { caminhoPdf } from "@/lib/rotas";
import type { Confianca, MotivoErro, Nota } from "@/lib/types";
import { CONFIANCAS, MOTIVOS_ERRO, NOTAS } from "@/lib/types";
import { Aviso, Confirmar, RecorteGrifo } from "./ui";

type Fase = "pergunta" | "resposta" | "motivo";

type Desfazer = {
  questaoId: string;
  anterior: Agenda;
  tentativaId: string;
  indiceAntes: number;
  reenfileirou: boolean;
  acertou: boolean;
};

function emCampoDeTexto(alvo: EventTarget | null) {
  return (
    alvo instanceof HTMLElement &&
    (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)
  );
}

function agendaAtual(cartao: Cartao): Agenda {
  return {
    sequencia: cartao.sequencia ?? 0,
    facilidade: cartao.facilidade ?? 2.5,
    intervaloDias: cartao.intervaloDias ?? 0,
    proximaEm: cartao.proximaEm ?? 0,
    statusRevisao: cartao.statusRevisao,
    errosSeguidos: cartao.errosSeguidos ?? 0,
    erroComCerteza: Boolean(cartao.erroComCerteza),
    julgadaEm: cartao.julgadaEm ?? null,
  };
}

function FrenteDoCard({ cartao, revelado }: { cartao: Cartao; revelado: boolean }) {
  if (cartao.tipo === "lacuna") {
    return (
      <p className="mt-4 whitespace-pre-wrap font-serif text-3xl leading-snug">
        {partesDaLacuna(cartao.enunciado).map((parte, indice) =>
          parte.oculto ? (
            <span key={indice} className={revelado ? "lacuna-aberta" : "lacuna-fechada"}>
              {parte.texto}
            </span>
          ) : (
            <span key={indice}>{parte.texto}</span>
          ),
        )}
      </p>
    );
  }
  return (
    <>
      {cartao.enunciado ? (
        <h2 className="mt-4 whitespace-pre-wrap font-serif text-3xl leading-snug">{cartao.enunciado}</h2>
      ) : null}
    </>
  );
}

/**
 * Uma sessão de revisão, no estilo do Anki: lembrar antes de ver, avaliar com quatro
 * notas, e poder editar, suspender, excluir ou desfazer sem sair. A fila é fixada ao
 * começar, então marcar um card não muda a ordem dos outros. Quem erra volta uma vez.
 */
export function SessaoRevisao({
  inicial,
  cartoes,
  diasProva,
  onFechar,
}: {
  inicial: string[];
  cartoes: Cartao[];
  diasProva: Map<string, number>;
  onFechar: () => void;
}) {
  const [fila, setFila] = useState(inicial);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>("pergunta");
  const [resposta, setResposta] = useState("");
  const [confianca, setConfianca] = useState<Confianca | null>(null);
  const [locais, setLocais] = useState<Record<string, Agenda>>({});
  const [editados, setEditados] = useState<Record<string, { enunciado: string; resposta: string }>>({});
  const [pulados, setPulados] = useState<string[]>([]);
  const [placar, setPlacar] = useState({ feitas: 0, acertos: 0 });
  const [historico, setHistorico] = useState<Desfazer[]>([]);
  const [editando, setEditando] = useState(false);
  const [rascunhoFrente, setRascunhoFrente] = useState("");
  const [rascunhoVerso, setRascunhoVerso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reenfileiradas = useRef(new Set<string>());

  const porId = useMemo(() => new Map(cartoes.map((cartao) => [cartao.id, cartao])), [cartoes]);

  const atualId = fila[indice];
  const base = atualId ? porId.get(atualId) : undefined;
  const atual = base
    ? { ...base, ...locais[base.id], ...(editados[base.id] ?? {}) }
    : undefined;
  const terminou = indice >= fila.length;
  const pulado = atualId ? pulados.includes(atualId) : false;

  function limparCartao() {
    setFase("pergunta");
    setResposta("");
    setConfianca(null);
    setEditando(false);
  }

  async function registrar(nota: Nota, motivo?: MotivoErro) {
    if (!atual || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const anterior = agendaAtual(atual);
      const agenda = calcularAgenda(atual, nota, {
        limiteDias: limiteDaProva(diasProva.get(atual.materiaId)),
        confianca,
      });
      const tentativaId = crypto.randomUUID();
      await repo.questoes.registrarJulgamento(atual.id, agenda, {
        id: tentativaId,
        materiaId: atual.materiaId,
        pdfId: atual.pdfId,
        topicoId: atual.topicoId,
        pagina: atual.pagina,
        acertou: nota >= 2,
        nova: atual.julgadaEm == null,
        nota,
        ...(confianca ? { confianca } : {}),
        ...(motivo ? { motivo } : {}),
      });
      const reenfileirou = nota === 1 && !reenfileiradas.current.has(atual.id);
      if (reenfileirou) {
        reenfileiradas.current.add(atual.id);
        setFila((anteriorFila) => [...anteriorFila, atual.id]);
      }
      setLocais((anteriores) => ({ ...anteriores, [atual.id]: agenda }));
      setPlacar((anteriorPlacar) => ({
        feitas: anteriorPlacar.feitas + 1,
        acertos: anteriorPlacar.acertos + (nota >= 2 ? 1 : 0),
      }));
      setHistorico((anteriorHistorico) => [
        ...anteriorHistorico,
        { questaoId: atual.id, anterior, tentativaId, indiceAntes: indice, reenfileirou, acertou: nota >= 2 },
      ]);
      setIndice((anteriorIndice) => anteriorIndice + 1);
      limparCartao();
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível guardar o resultado."));
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer() {
    const ultimo = historico[historico.length - 1];
    if (!ultimo || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await repo.questoes.desfazerJulgamento(ultimo.questaoId, ultimo.anterior, ultimo.tentativaId);
      if (ultimo.reenfileirou) {
        reenfileiradas.current.delete(ultimo.questaoId);
        setFila((anteriorFila) => anteriorFila.slice(0, -1));
      }
      setLocais((anteriores) => ({ ...anteriores, [ultimo.questaoId]: ultimo.anterior }));
      setPlacar((anteriorPlacar) => ({
        feitas: Math.max(0, anteriorPlacar.feitas - 1),
        acertos: Math.max(0, anteriorPlacar.acertos - (ultimo.acertou ? 1 : 0)),
      }));
      setHistorico((anteriorHistorico) => anteriorHistorico.slice(0, -1));
      setIndice(ultimo.indiceAntes);
      limparCartao();
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível desfazer a nota."));
    } finally {
      setSalvando(false);
    }
  }

  async function suspender() {
    if (!atual || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await repo.questoes.definirSuspensa(atual.id, true);
      setPulados((anteriores) => [...anteriores, atual.id]);
      setIndice((anteriorIndice) => anteriorIndice + 1);
      limparCartao();
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível suspender o card."));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!atual) return;
    await repo.questoes.remover(atual.id);
    setPulados((anteriores) => [...anteriores, atual.id]);
    setIndice((anteriorIndice) => anteriorIndice + 1);
    limparCartao();
  }

  function abrirEdicao() {
    if (!atual) return;
    setRascunhoFrente(atual.enunciado);
    setRascunhoVerso(atual.resposta);
    setEditando(true);
  }

  async function salvarEdicao(evento: React.FormEvent) {
    evento.preventDefault();
    if (!atual) return;
    setSalvando(true);
    setErro(null);
    try {
      await repo.questoes.atualizar(atual.id, { enunciado: rascunhoFrente, resposta: rascunhoVerso });
      setEditados((anteriores) => ({
        ...anteriores,
        [atual.id]: { enunciado: rascunhoFrente.trim(), resposta: rascunhoVerso.trim() },
      }));
      setEditando(false);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar o card."));
    } finally {
      setSalvando(false);
    }
  }

  function julgar(nota: Nota) {
    if (nota === 1) {
      setFase("motivo");
      return;
    }
    void registrar(nota);
  }

  const acoesRef = useRef({ registrar, desfazer, suspender, abrirEdicao });
  useEffect(() => {
    acoesRef.current = { registrar, desfazer, suspender, abrirEdicao };
  });

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (emCampoDeTexto(evento.target)) return;
      const tecla = evento.key;
      if (tecla.toLowerCase() === "u") {
        evento.preventDefault();
        void acoesRef.current.desfazer();
        return;
      }
      if (tecla.toLowerCase() === "e") {
        evento.preventDefault();
        acoesRef.current.abrirEdicao();
        return;
      }
      if (tecla.toLowerCase() === "s" && fase !== "motivo") {
        evento.preventDefault();
        void acoesRef.current.suspender();
        return;
      }
      if (fase === "pergunta") {
        if (tecla === " " || tecla === "Enter") {
          evento.preventDefault();
          setFase("resposta");
        } else if (tecla === "1" || tecla === "2" || tecla === "3") {
          setConfianca(Number(tecla) as Confianca);
        }
      } else if (fase === "resposta") {
        if (tecla === "1" || tecla === "2" || tecla === "3" || tecla === "4") {
          evento.preventDefault();
          const nota = Number(tecla) as Nota;
          if (nota === 1) setFase("motivo");
          else void acoesRef.current.registrar(nota);
        }
      } else if (fase === "motivo") {
        if (tecla === "Escape" || tecla === "0") {
          evento.preventDefault();
          void acoesRef.current.registrar(1);
        } else if (tecla >= "1" && tecla <= String(MOTIVOS_ERRO.length)) {
          evento.preventDefault();
          void acoesRef.current.registrar(1, MOTIVOS_ERRO[Number(tecla) - 1].id);
        }
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fase]);

  if (terminou) {
    const taxa = placar.feitas ? Math.round((placar.acertos / placar.feitas) * 100) : null;
    return (
      <section className="cartao mt-6 p-6" aria-live="polite">
        <h2 className="font-serif text-3xl">Sessão concluída</h2>
        <p className="mt-3 text-muted">
          {placar.feitas} {placar.feitas === 1 ? "card revisado" : "cards revisados"}
          {taxa !== null ? `, ${taxa}% de acerto.` : "."} As próximas datas já estão agendadas.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primario" onClick={onFechar}>
            Voltar para Hoje
          </button>
          {historico.length > 0 ? (
            <button type="button" className="btn" disabled={salvando} onClick={() => void desfazer()}>
              Desfazer a última nota <span className="kbd">U</span>
            </button>
          ) : null}
        </div>
        {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
      </section>
    );
  }

  if (!atual || pulado) {
    return (
      <section className="cartao mt-6 p-6">
        <p className="text-muted">Este card foi apagado ou suspenso.</p>
        <button type="button" className="btn mt-4" onClick={() => setIndice((anterior) => anterior + 1)}>
          Pular
        </button>
      </section>
    );
  }

  const previsao = previsaoDasNotas(atual, { limiteDias: limiteDaProva(diasProva.get(atual.materiaId)) });
  const origem = [atual.materiaNome, atual.topicoNome, atual.pdfNome ? `${atual.pdfNome}${atual.pagina ? ` · p. ${atual.pagina}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-6" aria-label="Sessão de revisão">
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <p>
          {Math.min(indice + 1, fila.length)} de {fila.length}
        </p>
        <div className="flex gap-2">
          {historico.length > 0 ? (
            <button type="button" className="btn" disabled={salvando} onClick={() => void desfazer()}>
              Desfazer <span className="kbd">U</span>
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onFechar}>
            Encerrar sessão
          </button>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-pine-bg" style={{ width: `${(indice / fila.length) * 100}%` }} />
      </div>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}

      <article className="cartao mt-4 p-5" key={atual.id}>
        <p className="text-sm text-muted">
          {origem}
          {atual.statusRevisao === "revisar" ? <span className="selo selo-alta ml-2">Errou da última vez</span> : null}
        </p>

        {editando ? (
          <form onSubmit={salvarEdicao} className="mt-4 grid gap-3">
            <div>
              <label className="rotulo" htmlFor="edit-frente">
                {atual.tipo === "lacuna" ? "Texto (use {{ }} nas lacunas)" : "Frente"}
              </label>
              <textarea
                id="edit-frente"
                className="campo min-h-24"
                value={rascunhoFrente}
                onChange={(evento) => setRascunhoFrente(evento.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="edit-verso">
                {atual.tipo === "lacuna" ? "Comentário (opcional)" : "Verso"}
              </label>
              <textarea
                id="edit-verso"
                className="campo min-h-20"
                value={rascunhoVerso}
                onChange={(evento) => setRascunhoVerso(evento.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primario" disabled={salvando}>
                Salvar
              </button>
              <button type="button" className="btn" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <FrenteDoCard cartao={atual} revelado={fase !== "pergunta"} />
            {atual.imagem ? (
              <div className="mt-4 max-w-md">
                <RecorteGrifo imagem={atual.imagem} texto="Figura do card" />
              </div>
            ) : null}
            {ehGargalo(atual) ? (
              <p className="mt-3 text-sm text-alta">
                <span className="selo selo-alta mr-2">Gargalo</span>
                Três erros seguidos. Releia a teoria deste trecho antes de insistir no card.{" "}
                {atual.pdfId ? (
                  <Link
                    href={caminhoPdf(atual.materiaId, atual.pdfId, atual.pagina ?? undefined)}
                    className="text-pine underline"
                  >
                    Abrir no PDF
                  </Link>
                ) : null}
              </p>
            ) : null}

            {fase === "pergunta" ? (
              <>
                {atual.tipo === "basico" ? (
                  <>
                    <label className="rotulo mt-6" htmlFor="resposta-sessao">
                      Responda de cabeça antes de ver o verso (opcional)
                    </label>
                    <textarea
                      id="resposta-sessao"
                      className="campo min-h-24"
                      value={resposta}
                      onChange={(evento) => setResposta(evento.target.value)}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
                          evento.preventDefault();
                          setFase("resposta");
                        }
                      }}
                      placeholder="Escrever a resposta fixa mais do que só pensar nela."
                    />
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted">Tente lembrar o que falta em cada lacuna antes de revelar.</p>
                )}
                <fieldset className="mt-4">
                  <legend className="rotulo">Quanta certeza você tem?</legend>
                  <div className="flex flex-wrap gap-2">
                    {CONFIANCAS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="btn btn-cor"
                        aria-pressed={confianca === item.id}
                        onClick={() => setConfianca(confianca === item.id ? null : item.id)}
                      >
                        <span className="kbd">{item.id}</span>
                        {item.nome}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button type="button" className="btn btn-primario mt-6" onClick={() => setFase("resposta")}>
                  Mostrar resposta <span className="kbd">Espaço</span>
                </button>
              </>
            ) : (
              <>
                {atual.tipo === "basico" && resposta.trim() ? (
                  <>
                    <p className="mt-6 text-sm text-muted">Sua resposta</p>
                    <p className="mt-1 whitespace-pre-wrap">{resposta.trim()}</p>
                  </>
                ) : null}
                {atual.resposta ? (
                  <>
                    <p className="mt-6 text-sm text-muted">{atual.tipo === "lacuna" ? "Comentário" : "Verso"}</p>
                    <p className="mt-1 whitespace-pre-wrap border-t border-line pt-3 font-serif text-xl leading-relaxed">
                      {atual.resposta}
                    </p>
                  </>
                ) : null}

                {fase === "resposta" ? (
                  <div className="mt-6">
                    <p className="rotulo">Como foi?</p>
                    <div className="flex flex-wrap gap-2">
                      {NOTAS.map((nota) => (
                        <button
                          key={nota.id}
                          type="button"
                          className={`btn btn-nota btn-nota-${nota.id}`}
                          disabled={salvando}
                          onClick={() => julgar(nota.id)}
                        >
                          <span>
                            <span className="kbd mr-1">{nota.id}</span>
                            {nota.nome}
                          </span>
                          <small>{previsao[nota.id].texto}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="rotulo">Por que errou? Isso vira estatística no Desempenho.</p>
                    <div className="flex flex-wrap gap-2">
                      {MOTIVOS_ERRO.map((motivo, posicao) => (
                        <button
                          key={motivo.id}
                          type="button"
                          className="btn btn-cor"
                          disabled={salvando}
                          onClick={() => void registrar(1, motivo.id)}
                        >
                          <span className="kbd">{posicao + 1}</span>
                          {motivo.nome}
                        </button>
                      ))}
                      <button type="button" className="btn" disabled={salvando} onClick={() => void registrar(1)}>
                        Pular <span className="kbd">Esc</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
              <button type="button" className="btn" onClick={abrirEdicao}>
                Editar <span className="kbd">E</span>
              </button>
              <button type="button" className="btn" disabled={salvando} onClick={() => void suspender()}>
                Suspender <span className="kbd">S</span>
              </button>
              <Confirmar rotulo="Excluir" confirmar="Excluir card" onConfirmar={excluir} />
              {atual.pdfId ? (
                <Link
                  href={caminhoPdf(atual.materiaId, atual.pdfId, atual.pagina ?? undefined)}
                  className="ml-auto text-pine no-underline hover:underline"
                >
                  Abrir no PDF
                </Link>
              ) : null}
            </div>
          </>
        )}
      </article>
    </section>
  );
}
