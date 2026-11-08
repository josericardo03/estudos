"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cartao } from "@/lib/cartoes";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { calcularAgenda, gargalos, limiteDaProva, previsaoDasNotas, type Agenda } from "@/lib/revisao";
import { caminhoBloco } from "@/lib/rotas";
import type { Confianca, MotivoErro, Nota, Tentativa } from "@/lib/types";
import { CONFIANCAS, MOTIVOS_ERRO, NOTAS } from "@/lib/types";
import { Aviso } from "./ui";

type Fase = "pergunta" | "resposta" | "motivo";

function emCampoDeTexto(alvo: EventTarget | null) {
  return (
    alvo instanceof HTMLElement &&
    (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)
  );
}

/**
 * Uma sessão de revisão: lembrar antes de ver, avaliar com quatro notas e deixar
 * o intervalo crescer. A fila é fixada ao começar, então marcar uma questão não
 * muda a ordem das outras. Quem erra volta uma vez ao fim da mesma sessão.
 */
export function SessaoRevisao({
  inicial,
  cartoes,
  tentativas,
  diasProva,
  onFechar,
}: {
  inicial: string[];
  cartoes: Cartao[];
  tentativas: Tentativa[];
  diasProva: Map<string, number>;
  onFechar: () => void;
}) {
  const [fila, setFila] = useState(inicial);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>("pergunta");
  const [resposta, setResposta] = useState("");
  const [confianca, setConfianca] = useState<Confianca | null>(null);
  const [locais, setLocais] = useState<Record<string, Agenda>>({});
  const [placar, setPlacar] = useState({ feitas: 0, acertos: 0 });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reenfileiradas = useRef(new Set<string>());

  const porId = useMemo(() => new Map(cartoes.map((cartao) => [cartao.id, cartao])), [cartoes]);
  const emGargalo = useMemo(() => gargalos(tentativas), [tentativas]);

  const atualId = fila[indice];
  const base = atualId ? porId.get(atualId) : undefined;
  const atual = base ? { ...base, ...locais[base.id] } : undefined;
  const terminou = indice >= fila.length;

  async function registrar(nota: Nota, motivo?: MotivoErro) {
    if (!atual || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const agenda = calcularAgenda(atual, nota, { limiteDias: limiteDaProva(diasProva.get(atual.materiaId)) });
      await repo.questoes.registrarJulgamento(atual.id, agenda, {
        id: crypto.randomUUID(),
        pdfId: atual.pdfId,
        materiaId: atual.materiaId,
        blocoId: atual.blocoId,
        acertou: nota >= 2,
        nota,
        ...(confianca ? { confianca } : {}),
        ...(motivo ? { motivo } : {}),
      });
      setLocais((anteriores) => ({ ...anteriores, [atual.id]: agenda }));
      setPlacar((anterior) => ({ feitas: anterior.feitas + 1, acertos: anterior.acertos + (nota >= 2 ? 1 : 0) }));
      if (nota === 1 && !reenfileiradas.current.has(atual.id)) {
        reenfileiradas.current.add(atual.id);
        setFila((anterior) => [...anterior, atual.id]);
      }
      setIndice((anterior) => anterior + 1);
      setFase("pergunta");
      setResposta("");
      setConfianca(null);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível guardar o resultado."));
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

  const registrarRef = useRef(registrar);
  useEffect(() => {
    registrarRef.current = registrar;
  });

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (emCampoDeTexto(evento.target)) return;
      const tecla = evento.key;
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
          else void registrarRef.current(nota);
        }
      } else if (fase === "motivo") {
        if (tecla === "Escape" || tecla === "0") {
          evento.preventDefault();
          void registrarRef.current(1);
        } else if (tecla >= "1" && tecla <= String(MOTIVOS_ERRO.length)) {
          evento.preventDefault();
          void registrarRef.current(1, MOTIVOS_ERRO[Number(tecla) - 1].id);
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
          {placar.feitas} {placar.feitas === 1 ? "questão revisada" : "questões revisadas"}
          {taxa !== null ? `, ${taxa}% de acerto.` : "."} As próximas datas já estão agendadas.
        </p>
        <button type="button" className="btn btn-primario mt-5" onClick={onFechar}>
          Voltar para Hoje
        </button>
      </section>
    );
  }

  if (!atual) {
    return (
      <section className="cartao mt-6 p-6">
        <p className="text-muted">Esta questão foi apagada.</p>
        <button type="button" className="btn mt-4" onClick={() => setIndice((anterior) => anterior + 1)}>
          Pular
        </button>
      </section>
    );
  }

  const previsao = previsaoDasNotas(atual, { limiteDias: limiteDaProva(diasProva.get(atual.materiaId)) });

  return (
    <section className="mt-6" aria-label="Sessão de revisão">
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <p>
          {Math.min(indice + 1, fila.length)} de {fila.length}
        </p>
        <button type="button" className="btn" onClick={onFechar}>
          Encerrar sessão
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-pine-bg" style={{ width: `${(indice / fila.length) * 100}%` }} />
      </div>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}

      <article className="cartao mt-4 p-5" key={atual.id}>
        <p className="text-sm text-muted">
          {atual.materiaNome} · {atual.blocoTitulo}
          {atual.statusRevisao === "revisar" ? <span className="selo selo-alta ml-2">Errou da última vez</span> : null}
        </p>
        <h2 className="mt-4 whitespace-pre-wrap font-serif text-3xl leading-snug">{atual.enunciado}</h2>
        {emGargalo.has(atual.id) ? (
          <p className="mt-3 text-sm text-alta">
            <span className="selo selo-alta mr-2">Gargalo</span>
            Três erros seguidos. Releia a teoria deste trecho antes de insistir na questão.{" "}
            <Link
              href={caminhoBloco(atual.materiaId, atual.pdfId, atual.blocoId)}
              className="text-pine underline"
            >
              Abrir bloco
            </Link>
          </p>
        ) : null}

        {fase === "pergunta" ? (
          <>
            <label className="rotulo mt-6" htmlFor="resposta-sessao">
              Responda de cabeça antes de ver o gabarito (opcional)
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
            {resposta.trim() ? (
              <>
                <p className="mt-6 text-sm text-muted">Sua resposta</p>
                <p className="mt-1 whitespace-pre-wrap">{resposta.trim()}</p>
              </>
            ) : null}
            <p className="mt-6 text-sm text-muted">Gabarito</p>
            <p className="mt-1 whitespace-pre-wrap border-t border-line pt-3 font-serif text-xl leading-relaxed">
              {atual.resposta}
            </p>

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
      </article>
    </section>
  );
}
