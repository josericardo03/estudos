"use client";

import Link from "next/link";
import { useState } from "react";
import { juntarCartoes } from "@/lib/cartoes";
import { formatarData, formatarDuracao } from "@/lib/datas";
import { desempenhoDasMaterias } from "@/lib/desempenho";
import { DIAS_PARA_LEMBRAR, useUltimaCopia } from "@/lib/copias";
import { descreverProva, diasAteProva, diasAteProvaPorMateria } from "@/lib/edital";
import { resumirEstudo } from "@/lib/estudo";
import { montarPlano, planoManual, type ItemPlano } from "@/lib/plano";
import { gravarBruto, usePreferencia, useBruto } from "@/lib/preferencias";
import { repo } from "@/lib/repo";
import {
  filaDeHoje,
  LIMITE_NOVOS_PADRAO,
  LIMITE_REVISOES_PADRAO,
} from "@/lib/revisao";
import { caminhoMateria } from "@/lib/rotas";
import type { Materia } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";
import { SessaoRevisao } from "./SessaoRevisao";

const ADIANTADO = 15;
/** A tela Hoje só olha o histórico recente: o resto não muda o plano nem o desempenho por matéria. */
const JANELA_DIAS = 180;
const CHAVE_PLANO_MANUAL = "foco.planoManual";

function lerPlanoManual(bruto: string | null): Record<string, number> {
  if (!bruto) return {};
  try {
    const dado = JSON.parse(bruto) as Record<string, unknown>;
    const resultado: Record<string, number> = {};
    for (const [chave, valor] of Object.entries(dado)) {
      if (typeof valor === "number" && valor > 0) resultado[chave] = valor;
    }
    return resultado;
  } catch {
    return {};
  }
}

export function Hoje() {
  const [materiaFiltro, setMateriaFiltro] = useState("");
  const [sessao, setSessao] = useState<string[] | null>(null);
  const [metaMinutos] = usePreferencia<number>("foco.metaDiariaMin", 180);
  const [limiteNovos, definirLimiteNovos] = usePreferencia<number>("foco.limiteNovos", LIMITE_NOVOS_PADRAO);
  const [limiteRevisoes, definirLimiteRevisoes] = usePreferencia<number>("foco.limiteRevisoes", LIMITE_REVISOES_PADRAO);
  const [modoPlano, definirModoPlano] = usePreferencia<"auto" | "manual">("foco.planoModo", "auto");
  const planoManualBruto = useBruto(CHAVE_PLANO_MANUAL);
  const ultimaCopia = useUltimaCopia();

  const { dados, pronto, erro } = useConsulta(async () => {
    // Só o que a tela precisa: os cards vencidos e os próximos, contagens por matéria e o histórico recente.
    // Ler o banco inteiro a cada visita ficaria lento (e, no Supabase, cortado em 1000 linhas).
    const [materias, pdfs, vencidas, proximas, porMateria, tentativas, editais, vinculos, topicos, estudos, lancamentos] =
      await Promise.all([
        repo.materias.listar(),
        repo.pdfs.listarTodos(),
        repo.questoes.listarVencidas(),
        repo.questoes.listarProximas(ADIANTADO),
        repo.questoes.contarPorMateria(),
        repo.tentativas.listar({ desdeDias: JANELA_DIAS }),
        repo.editais.listar(),
        repo.editais.vinculos(),
        repo.topicos.listarTodos(),
        repo.estudos.listar(),
        repo.lancamentos.listar(),
      ]);
    const agora = Date.now();
    const cartoesVencidos = juntarCartoes(vencidas, materias, pdfs, topicos);
    const cartoesProximos = juntarCartoes(proximas, materias, pdfs, topicos);
    const vencidasPorMateria: Record<string, number> = {};
    for (const cartao of vencidas) vencidasPorMateria[cartao.materiaId] = (vencidasPorMateria[cartao.materiaId] ?? 0) + 1;
    const desempenho = desempenhoDasMaterias({ materias, tentativas, lancamentos, agora, caminhoMateria });
    const provas = editais
      .filter((edital) => edital.dataProva && (diasAteProva(edital.dataProva, agora) ?? -1) >= 0)
      .sort((a, b) => (a.dataProva ?? 0) - (b.dataProva ?? 0));
    return {
      agora,
      materias,
      topicos,
      cartoesVencidos,
      cartoesProximos,
      cardsPorMateria: porMateria,
      vencidasPorMateria,
      tentativas,
      desempenho,
      provas,
      diasProva: diasAteProvaPorMateria(editais, vinculos, agora),
      estudo: resumirEstudo(estudos, agora),
    };
  }, [], null, { pausado: sessao !== null });

  if (!pronto) return <Abrindo texto="Abrindo o dia…" />;
  if (erro) return <div className="px-5 py-10"><Aviso texto={erro} /></div>;
  if (!dados) return null;

  const dosFiltros = (cartao: { materiaId: string }) => !materiaFiltro || cartao.materiaId === materiaFiltro;
  const vencidosFiltrados = dados.cartoesVencidos.filter(dosFiltros);
  const adiantadas = dados.cartoesProximos.filter(dosFiltros);
  const dia = filaDeHoje(vencidosFiltrados, dados.tentativas, { agora: dados.agora, limiteNovos, limiteRevisoes });
  const totalVencidas = dados.cartoesVencidos.length;
  const proxima = adiantadas[0]?.proximaEm ?? null;
  const totalDeCards = materiaFiltro
    ? (dados.cardsPorMateria[materiaFiltro] ?? 0)
    : Object.values(dados.cardsPorMateria).reduce((soma, quantos) => soma + quantos, 0);
  const cartoesDaSessao = [...dados.cartoesVencidos, ...dados.cartoesProximos];
  const planoAutomatico = montarPlano({
    materias: dados.materias,
    cardsPorMateria: dados.cardsPorMateria,
    vencidasPorMateria: dados.vencidasPorMateria,
    topicos: dados.topicos,
    desempenho: dados.desempenho,
    minutosDia: metaMinutos,
  });
  const minutosManuais = lerPlanoManual(planoManualBruto);
  const plano = modoPlano === "manual" ? planoManual(dados.materias, minutosManuais) : planoAutomatico;
  const hojeSegundos = dados.estudo.hoje;
  const metaSegundos = metaMinutos * 60;
  const ficaram = dia.ficaramNovas + dia.ficaramRevisoes;
  const diasSemCopia = ultimaCopia ? Math.floor((dados.agora - ultimaCopia) / 86_400_000) : null;
  const lembrarDaCopia = totalDeCards >= 20 && (diasSemCopia === null || diasSemCopia >= DIAS_PARA_LEMBRAR);

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
          cartoes={cartoesDaSessao}
          diasProva={dados.diasProva}
          onFechar={() => setSessao(null)}
        />
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <article className="cartao p-4">
              <p className="text-sm text-muted">Cards vencidos</p>
              <p className="mt-2 font-serif text-4xl">{totalVencidas}</p>
            </article>
            <article className="cartao p-4">
              <p className="text-sm text-muted">Revisados hoje</p>
              <p className="mt-2 font-serif text-4xl">{dia.feitoHoje.novos + dia.feitoHoje.revisoes}</p>
              <p className="mt-1 text-xs text-muted">
                {dia.feitoHoje.novos} {dia.feitoHoje.novos === 1 ? "novo" : "novos"} · {dia.feitoHoje.revisoes}{" "}
                {dia.feitoHoje.revisoes === 1 ? "revisão" : "revisões"}
              </p>
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

          {lembrarDaCopia ? (
            <p className="mt-6 rounded-xl bg-[var(--campo-bg)] px-4 py-3 text-sm">
              {diasSemCopia === null
                ? "Você ainda não exportou uma cópia dos seus dados."
                : `Faz ${diasSemCopia} dias que você não exporta uma cópia dos seus dados.`}{" "}
              <Link href="/dados" className="text-pine underline">
                Fazer agora
              </Link>
            </p>
          ) : null}

          {dados.materias.length === 0 ? (
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
            {dia.fila.length > 0 ? (
              <>
                <p className="mt-3 text-muted">
                  {dia.revisoes} {dia.revisoes === 1 ? "revisão" : "revisões"} e {dia.novas}{" "}
                  {dia.novas === 1 ? "card novo" : "cards novos"}. As matérias se alternam, e o que você errou com
                  certeza vem primeiro.
                  {ficaram > 0
                    ? ` Mais ${ficaram} ${ficaram === 1 ? "fica" : "ficam"} para outro dia, pelo limite diário.`
                    : ""}
                </p>
                <button
                  type="button"
                  className="btn btn-primario mt-4"
                  onClick={() => setSessao(dia.fila.map((cartao) => cartao.id))}
                >
                  Começar revisão ({dia.fila.length})
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-muted">
                  {totalDeCards === 0
                    ? "Nenhum card aqui ainda. Selecione um trecho no leitor e crie o primeiro."
                    : ficaram > 0
                      ? "Você já bateu o limite de hoje. Aumente o limite abaixo se quiser continuar."
                      : proxima
                        ? `Tudo em dia. A próxima revisão é ${formatarData(proxima, { weekday: "long", day: "numeric", month: "long" })}.`
                        : "Tudo em dia."}
                </p>
                {adiantadas.length > 0 && ficaram === 0 ? (
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

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted">Limites por dia</summary>
              <div className="mt-3 flex flex-wrap gap-4">
                <div>
                  <label className="rotulo" htmlFor="limite-novos">
                    Cards novos
                  </label>
                  <input
                    id="limite-novos"
                    className="campo w-28"
                    type="number"
                    min={0}
                    max={500}
                    inputMode="numeric"
                    value={limiteNovos}
                    onChange={(evento) => {
                      const valor = Number(evento.target.value);
                      if (Number.isFinite(valor) && valor >= 0 && valor <= 500) definirLimiteNovos(Math.round(valor));
                    }}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="limite-revisoes">
                    Revisões
                  </label>
                  <input
                    id="limite-revisoes"
                    className="campo w-28"
                    type="number"
                    min={0}
                    max={2000}
                    inputMode="numeric"
                    value={limiteRevisoes}
                    onChange={(evento) => {
                      const valor = Number(evento.target.value);
                      if (Number.isFinite(valor) && valor >= 0 && valor <= 2000) definirLimiteRevisoes(Math.round(valor));
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Como no Anki: o que passa do limite fica para o dia seguinte e não se perde.
              </p>
            </details>
          </section>

          {dados.materias.length > 0 ? (
            <PlanoDoDia
              plano={plano}
              modo={modoPlano}
              onModo={definirModoPlano}
              materias={dados.materias}
              minutos={minutosManuais}
              metaSegundos={metaSegundos}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function PlanoDoDia({
  plano,
  modo,
  onModo,
  materias,
  minutos,
  metaSegundos,
}: {
  plano: ItemPlano[];
  modo: "auto" | "manual";
  onModo: (modo: "auto" | "manual") => void;
  materias: Materia[];
  minutos: Record<string, number>;
  metaSegundos: number;
}) {
  function mudarMinutos(materiaId: string, texto: string) {
    const valor = Number(texto);
    const proximos = { ...minutos };
    if (!texto.trim() || !Number.isFinite(valor) || valor <= 0) delete proximos[materiaId];
    else proximos[materiaId] = Math.min(720, Math.round(valor));
    gravarBruto(CHAVE_PLANO_MANUAL, JSON.stringify(proximos));
  }

  return (
    <section className="mt-10" aria-labelledby="titulo-plano">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="titulo-plano" className="font-serif text-3xl">
          Plano de hoje
        </h2>
        <div className="flex gap-2" role="group" aria-label="Como montar o plano">
          <button type="button" className="btn btn-seletor" aria-pressed={modo === "auto"} onClick={() => onModo("auto")}>
            Automático
          </button>
          <button type="button" className="btn btn-seletor" aria-pressed={modo === "manual"} onClick={() => onModo("manual")}>
            O meu (Guru Já)
          </button>
        </div>
      </div>
      {modo === "auto" ? (
        <p className="mt-2 text-sm text-muted">
          {formatarDuracao(metaSegundos)} divididos pelo peso no edital, pelos tópicos pendentes, pela taxa de acerto e
          pelos cards vencidos.{" "}
          <Link href="/estudo" className="text-pine no-underline hover:underline">
            Mudar a meta
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            Digite os minutos que o seu planejamento (por exemplo, o do Guru Já) manda estudar em cada matéria hoje.
            Fica guardado neste aparelho.
          </p>
          <ul className="mt-3 grid gap-2">
            {materias.map((materia) => (
              <li key={materia.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`min-${materia.id}`} className="min-w-0 break-words">
                  {materia.nome}
                </label>
                <span className="flex shrink-0 items-center gap-2">
                  <input
                    id={`min-${materia.id}`}
                    className="campo w-24"
                    type="number"
                    min={0}
                    max={720}
                    inputMode="numeric"
                    value={minutos[materia.id] ?? ""}
                    placeholder="0"
                    onChange={(evento) => mudarMinutos(materia.id, evento.target.value)}
                  />
                  <span className="text-sm text-muted">min</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {plano.length > 0 ? (
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
      ) : modo === "manual" ? (
        <p className="mt-4 text-sm text-muted">Preencha os minutos acima para ver o plano.</p>
      ) : null}
    </section>
  );
}
