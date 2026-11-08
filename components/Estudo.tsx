"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  formatarRelogio,
  iniciarCronometro,
  limparCronometro,
  segundosDaFase,
  useAgora,
  useCronometro,
} from "@/lib/cronometro";
import { formatarData, formatarDuracao } from "@/lib/datas";
import { mensagemErro } from "@/lib/erros";
import { resumirEstudo } from "@/lib/estudo";
import { usePreferencia } from "@/lib/preferencias";
import { repo } from "@/lib/repo";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar } from "./ui";

const MODOS = [
  { id: "25", nome: "Pomodoro 25 + 5", duracaoS: 25 * 60 },
  { id: "50", nome: "Bloco 50 + 10", duracaoS: 50 * 60 },
  { id: "livre", nome: "Livre", duracaoS: 0 },
] as const;

function nivelDoDia(segundos: number, metaSegundos: number) {
  if (segundos <= 0) return 0;
  const fracao = segundos / Math.max(1, metaSegundos);
  if (fracao < 0.25) return 1;
  if (fracao < 0.5) return 2;
  if (fracao < 1) return 3;
  return 4;
}

export function Estudo() {
  const parametros = useSearchParams();
  const materiaDaUrl = parametros.get("materia") ?? "";
  const [materiaId, setMateriaId] = useState(materiaDaUrl);
  const [modo, setModo] = useState<(typeof MODOS)[number]["id"]>("25");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [minutosManual, setMinutosManual] = useState("");
  const [metaMinutos, definirMeta] = usePreferencia<number>("foco.metaDiariaMin", 180);
  const [permissao, setPermissao] = useState(() =>
    typeof Notification === "undefined" ? "indisponivel" : Notification.permission,
  );
  const cronometro = useCronometro();
  const agora = useAgora(true);

  const { dados, pronto, erro: erroLeitura } = useConsulta(
    async () => {
      const [materias, estudos] = await Promise.all([repo.materias.listar(), repo.estudos.listar()]);
      return { materias, estudos, resumo: resumirEstudo(estudos, Date.now()) };
    },
    [],
    null,
  );

  if (!pronto) return <Abrindo texto="Abrindo o estudo…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) return null;

  const nomeDaMateria = new Map(dados.materias.map((materia) => [materia.id, materia.nome]));
  const metaSegundos = metaMinutos * 60;
  const resumo = dados.resumo;
  const idEscolhido = nomeDaMateria.has(materiaId) ? materiaId : "";

  function comecar() {
    setErro(null);
    setAviso(null);
    const escolhido = MODOS.find((item) => item.id === modo) ?? MODOS[0];
    iniciarCronometro({ materiaId: idEscolhido || null, fase: "foco", duracaoS: escolhido.duracaoS });
  }

  async function parar() {
    if (!cronometro) return;
    const segundos = segundosDaFase(cronometro);
    const fase = cronometro.fase;
    const materia = cronometro.materiaId;
    const inicio = cronometro.inicio;
    limparCronometro();
    if (fase === "pausa") return;
    if (segundos < 60) {
      setAviso("Menos de um minuto: a sessão não foi registrada.");
      return;
    }
    try {
      await repo.estudos.registrar({ materiaId: materia, segundos, em: inicio });
      setAviso(`Sessão de ${formatarDuracao(segundos)} registrada.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível registrar a sessão."));
    }
  }

  async function registrarManual(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    const minutos = Number(minutosManual);
    if (!Number.isFinite(minutos) || minutos < 1 || minutos > 720) {
      setErro("Informe os minutos, de 1 a 720.");
      return;
    }
    try {
      await repo.estudos.registrar({ materiaId: idEscolhido || null, segundos: Math.round(minutos * 60) });
      setMinutosManual("");
      setAviso(`${formatarDuracao(minutos * 60)} registrados.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível registrar o tempo."));
    }
  }

  async function pedirAviso() {
    if (typeof Notification === "undefined") return;
    setPermissao(await Notification.requestPermission());
  }

  const passados = cronometro && agora !== 0 ? segundosDaFase(cronometro, agora) : 0;
  const mostrado = cronometro && cronometro.duracaoS > 0 ? cronometro.duracaoS - passados : passados;
  const semanaPorMateria = [...resumo.porMateriaSemana.entries()]
    .map(([id, segundos]) => ({ id, nome: id ? (nomeDaMateria.get(id) ?? "Matéria apagada") : "Sem matéria", segundos }))
    .sort((a, b) => b.segundos - a.segundos);
  const recentes = dados.estudos.slice().sort((a, b) => b.em - a.em).slice(0, 8);
  const maiorSemana = Math.max(1, ...semanaPorMateria.map((item) => item.segundos));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Tempo</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Estudo</h1>
      <p className="mt-3 max-w-xl text-muted">
        Cronometre o estudo, veja a constância e ajuste a meta do dia. O plano de Hoje usa a meta para dividir o tempo.
      </p>

      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}
      {aviso ? <p className="mt-4 text-sm text-pine" role="status">{aviso}</p> : null}

      <section className="cartao mt-8 p-5" aria-labelledby="titulo-cronometro">
        <h2 id="titulo-cronometro" className="font-serif text-2xl">
          Cronômetro
        </h2>
        {cronometro ? (
          <div className="mt-4">
            <p className="text-sm text-muted">
              {cronometro.fase === "foco" ? "Estudando" : "Pausa"}
              {cronometro.materiaId ? ` · ${nomeDaMateria.get(cronometro.materiaId) ?? ""}` : ""}
            </p>
            <p className="mt-1 font-serif text-6xl tabular-nums" role="timer" aria-live="off">
              {formatarRelogio(mostrado)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primario" onClick={() => void parar()}>
                {cronometro.fase === "foco" ? "Parar e registrar" : "Pular a pausa"}
              </button>
              <Confirmar rotulo="Descartar" confirmar="Descartar sessão" onConfirmar={() => limparCronometro()} />
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            <div>
              <label className="rotulo" htmlFor="materia-cronometro">
                Matéria
              </label>
              <select
                id="materia-cronometro"
                className="campo"
                value={idEscolhido}
                onChange={(evento) => setMateriaId(evento.target.value)}
              >
                <option value="">Sem matéria</option>
                {dados.materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Duração">
              {MODOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn btn-seletor"
                  aria-pressed={modo === item.id}
                  onClick={() => setModo(item.id)}
                >
                  {item.nome}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primario" onClick={comecar}>
                Começar
              </button>
              {permissao === "default" ? (
                <button type="button" className="btn" onClick={() => void pedirAviso()}>
                  Avisar quando acabar
                </button>
              ) : null}
            </div>
            <form onSubmit={registrarManual} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <div>
                <label className="rotulo" htmlFor="minutos-manual">
                  Esqueceu de ligar? Registre os minutos
                </label>
                <input
                  id="minutos-manual"
                  className="campo w-32"
                  type="number"
                  min={1}
                  max={720}
                  inputMode="numeric"
                  value={minutosManual}
                  onChange={(evento) => setMinutosManual(evento.target.value)}
                />
              </div>
              <button type="submit" className="btn">
                Registrar
              </button>
            </form>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <article className="cartao p-4">
          <p className="text-sm text-muted">Hoje</p>
          <p className="mt-2 font-serif text-4xl">{formatarDuracao(resumo.hoje)}</p>
          <p className="mt-1 text-xs text-muted">meta {formatarDuracao(metaSegundos)}</p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Últimos 7 dias</p>
          <p className="mt-2 font-serif text-4xl">{formatarDuracao(resumo.semana)}</p>
          <p className="mt-1 text-xs text-muted">meta {formatarDuracao(metaSegundos * 7)}</p>
        </article>
        <article className="cartao p-4">
          <p className="text-sm text-muted">Sequência</p>
          <p className="mt-2 font-serif text-4xl">
            {resumo.sequencia}
            <span className="text-2xl text-muted"> {resumo.sequencia === 1 ? "dia" : "dias"}</span>
          </p>
          <p className="mt-1 text-xs text-muted">dias com 10 min ou mais</p>
        </article>
      </div>

      <section className="mt-8" aria-labelledby="titulo-meta">
        <h2 id="titulo-meta" className="font-serif text-2xl">
          Meta diária
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="meta-diaria">
            Minutos por dia
          </label>
          <input
            id="meta-diaria"
            className="campo w-28"
            type="number"
            min={10}
            max={720}
            step={10}
            inputMode="numeric"
            value={metaMinutos}
            onChange={(evento) => {
              const valor = Number(evento.target.value);
              if (Number.isFinite(valor) && valor >= 10 && valor <= 720) definirMeta(Math.round(valor));
            }}
          />
          <span className="text-sm text-muted">minutos por dia ({formatarDuracao(metaSegundos)})</span>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="titulo-calor">
        <h2 id="titulo-calor" className="font-serif text-2xl">
          Últimas 4 semanas
        </h2>
        <div className="mt-3 grid grid-cols-7 gap-1.5" role="img" aria-label="Tempo estudado em cada um dos últimos 28 dias">
          {resumo.grade.map((dia, posicao) => (
            <div
              key={dia.chave}
              className="celula-calor"
              data-nivel={nivelDoDia(dia.segundos, metaSegundos)}
              data-hoje={posicao === resumo.grade.length - 1}
              title={`${formatarData(dia.inicio, { day: "numeric", month: "short" })}: ${formatarDuracao(dia.segundos)}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Quanto mais escuro, mais perto da meta. O quadrado com borda é hoje.</p>
      </section>

      {semanaPorMateria.length > 0 ? (
        <section className="mt-8" aria-labelledby="titulo-semana">
          <h2 id="titulo-semana" className="font-serif text-2xl">
            Por matéria, nos últimos 7 dias
          </h2>
          <ul className="mt-3 grid gap-3">
            {semanaPorMateria.map((item) => (
              <li key={item.id || "sem"}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{item.nome}</span>
                  <span className="shrink-0 text-muted">{formatarDuracao(item.segundos)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-pine-bg" style={{ width: `${(item.segundos / maiorSemana) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recentes.length > 0 ? (
        <section className="mt-8" aria-labelledby="titulo-recentes">
          <h2 id="titulo-recentes" className="font-serif text-2xl">
            Sessões recentes
          </h2>
          <ul className="cartao mt-3 divide-y divide-line px-4 py-1">
            {recentes.map((sessao) => (
              <li key={sessao.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  {formatarData(sessao.em, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {sessao.materiaId ? (nomeDaMateria.get(sessao.materiaId) ?? "Matéria apagada") : "Sem matéria"}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">{formatarDuracao(sessao.segundos)}</span>
                  <Confirmar rotulo="Apagar" confirmar="Apagar" onConfirmar={() => repo.estudos.remover(sessao.id)} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
