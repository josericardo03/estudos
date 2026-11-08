"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deCampoData, paraCampoData } from "@/lib/datas";
import { porcentagem } from "@/lib/desempenho";
import { coberturaDe, descreverProva } from "@/lib/edital";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { caminhoMateria, caminhoPdf } from "@/lib/rotas";
import type { EditalTopico, Materia, PdfDoc } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, NaoEncontrado } from "./ui";

export function EditalDetalhe({ editalId }: { editalId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const edital = await repo.editais.obter(editalId);
    if (!edital) return null;
    const [materias, ligadas, topicos, pdfs] = await Promise.all([
      repo.materias.listar(),
      repo.editais.materias(edital.id),
      repo.topicos.listarPorEdital(edital.id),
      repo.pdfs.listarTodos(),
    ]);
    return { edital, materias, ligadas, topicos, pdfs };
  }, [editalId], null);

  if (!pronto) return <Abrindo texto="Abrindo o edital…" />;
  if (erroLeitura) return <div className="px-5 py-10"><Aviso texto={erroLeitura} /></div>;
  if (!dados) {
    return (
      <NaoEncontrado titulo="Edital não encontrado" detalhe="Ele pode ter sido apagado neste navegador." />
    );
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    setErro(null);
    try {
      await repo.editais.atualizar(editalId, {
        nome: String(formulario.get("nome") ?? ""),
        orgao: String(formulario.get("orgao") ?? ""),
        dataProva: deCampoData(String(formulario.get("data") ?? "")),
      });
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar o edital."));
    }
  }

  const prova = descreverProva(dados.edital.dataProva);
  const cobertura = coberturaDe(dados.topicos);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">
        <Link href="/editais" className="text-pine no-underline hover:underline">
          Editais
        </Link>
      </p>
      <form onSubmit={salvar} className="mt-3 grid gap-3">
        <div>
          <label className="rotulo" htmlFor="editar-nome">
            Nome
          </label>
          <input
            id="editar-nome"
            name="nome"
            className="campo font-serif text-3xl"
            defaultValue={dados.edital.nome}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="editar-orgao">
              Órgão
            </label>
            <input
              id="editar-orgao"
              name="orgao"
              className="campo"
              defaultValue={dados.edital.orgao}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="editar-data">
              Data da prova
            </label>
            <input
              id="editar-data"
              name="data"
              className="campo"
              type="date"
              defaultValue={paraCampoData(dados.edital.dataProva)}
            />
          </div>
        </div>
        {prova ? <p className="text-pine">{prova}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primario" type="submit">
            Salvar edital
          </button>
          <Confirmar
            rotulo="Excluir edital"
            confirmar="Excluir edital"
            onConfirmar={async () => {
              await repo.editais.remover(editalId);
              router.push("/editais");
            }}
          />
        </div>
      </form>
      {erro ? <div className="mt-4"><Aviso texto={erro} /></div> : null}

      <section className="mt-10">
        <h2 className="font-serif text-3xl">Matérias deste edital</h2>
        {dados.materias.length === 0 ? (
          <p className="mt-3 text-muted">
            Crie uma matéria antes de vinculá-la.{" "}
            <Link href="/" className="text-pine no-underline hover:underline">
              Ir para matérias
            </Link>
          </p>
        ) : (
          <MateriasDoEdital
            editalId={editalId}
            materias={dados.materias}
            iniciais={dados.ligadas}
            onErro={setErro}
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="titulo-topicos">
        <h2 id="titulo-topicos" className="font-serif text-3xl">
          Tópicos do edital
        </h2>
        <p className="mt-2 text-sm text-muted">
          Cole aqui os tópicos do Guru Já ou do edital, com o peso de cada um (1 a 5). No leitor, cada card que você cria
          escolhe um tópico, e o Desempenho mostra em quais você mais erra. Marque o tópico como estudado quando terminar;
          se quiser, diga em qual PDF e páginas ele está.
        </p>
        {cobertura.fracao !== null ? (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-serif text-4xl">{porcentagem(cobertura.fracao)}%</p>
              <p className="text-sm text-muted">
                {cobertura.cobertos} de {cobertura.total} tópicos estudados, pelo peso
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-pine-bg" style={{ width: `${porcentagem(cobertura.fracao)}%` }} />
            </div>
          </div>
        ) : null}
        <NovosTopicos
          editalId={editalId}
          materias={dados.materias.filter((materia) => dados.ligadas.includes(materia.id))}
          onErro={setErro}
        />
        <Topicos topicos={dados.topicos} materias={dados.materias} pdfs={dados.pdfs} onErro={setErro} />
      </section>
    </main>
  );
}

function MateriasDoEdital({
  editalId,
  materias,
  iniciais,
  onErro,
}: {
  editalId: string;
  materias: Materia[];
  iniciais: string[];
  onErro: (texto: string | null) => void;
}) {
  const [ligadas, setLigadas] = useState(iniciais);

  async function alternar(materiaId: string) {
    const proxima = ligadas.includes(materiaId)
      ? ligadas.filter((id) => id !== materiaId)
      : [...ligadas, materiaId];
    setLigadas(proxima);
    onErro(null);
    try {
      await repo.editais.definirMaterias(editalId, proxima);
    } catch (falha) {
      setLigadas(ligadas);
      onErro(mensagemErro(falha, "Não foi possível vincular a matéria."));
    }
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {materias.map((materia) => (
        <li key={materia.id} className="flex items-center justify-between gap-3 border border-line bg-sheet px-3 py-2">
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <input
              className="shrink-0"
              type="checkbox"
              checked={ligadas.includes(materia.id)}
              onChange={() => void alternar(materia.id)}
            />
            <span className="min-w-0 break-words">{materia.nome}</span>
          </label>
          <Link href={caminhoMateria(materia.id)} className="text-sm text-pine no-underline hover:underline">
            Abrir
          </Link>
        </li>
      ))}
    </ul>
  );
}

function limparLinha(linha: string) {
  return linha.replace(/^\s*(?:[-–—•*·]+|\(?\d+(?:\.\d+)*[.)\-–]?)\s+/, "").trim();
}

function NovosTopicos({
  editalId,
  materias,
  onErro,
}: {
  editalId: string;
  materias: Materia[];
  onErro: (texto: string | null) => void;
}) {
  const [materiaId, setMateriaId] = useState("");
  const [peso, setPeso] = useState("3");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const escolhida = materias.some((materia) => materia.id === materiaId) ? materiaId : "";

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    const linhas = texto
      .split(/\r?\n/)
      .map(limparLinha)
      .filter(Boolean);
    if (!linhas.length) {
      onErro("Escreva ao menos um tópico.");
      return;
    }
    setGuardando(true);
    onErro(null);
    try {
      for (const nome of linhas) {
        await repo.topicos.criar({ editalId, materiaId: escolhida || null, nome, peso: Number(peso) });
      }
      setTexto("");
    } catch (falha) {
      onErro(mensagemErro(falha, "Não foi possível guardar os tópicos."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={adicionar} className="mt-6 grid gap-3">
      <div>
        <label className="rotulo" htmlFor="novos-topicos">
          Adicionar tópicos (um por linha; pode colar a lista inteira)
        </label>
        <textarea
          id="novos-topicos"
          className="campo min-h-24"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder={"1. Princípios da administração pública\n2. Atos administrativos\n3. Licitações e contratos"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div>
          <label className="rotulo" htmlFor="topicos-materia">
            Matéria
          </label>
          <select id="topicos-materia" className="campo" value={escolhida} onChange={(evento) => setMateriaId(evento.target.value)}>
            <option value="">Sem matéria</option>
            {materias.map((materia) => (
              <option key={materia.id} value={materia.id}>
                {materia.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="topicos-peso">
            Peso
          </label>
          <select id="topicos-peso" className="campo" value={peso} onChange={(evento) => setPeso(evento.target.value)}>
            {[1, 2, 3, 4, 5].map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primario" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Adicionar"}
        </button>
      </div>
      {materias.length === 0 ? (
        <p className="text-sm text-muted">Vincule matérias a este edital acima para poder escolher uma aqui.</p>
      ) : null}
    </form>
  );
}

function Topicos({
  topicos,
  materias,
  pdfs,
  onErro,
}: {
  topicos: EditalTopico[];
  materias: Materia[];
  pdfs: PdfDoc[];
  onErro: (texto: string | null) => void;
}) {
  if (topicos.length === 0) return <p className="mt-6 text-muted">Nenhum tópico ainda.</p>;
  const nomeDaMateria = new Map(materias.map((materia) => [materia.id, materia.nome]));
  const grupos = new Map<string, EditalTopico[]>();
  for (const topico of topicos) {
    const chave = topico.materiaId ?? "";
    const lista = grupos.get(chave);
    if (lista) lista.push(topico);
    else grupos.set(chave, [topico]);
  }

  return (
    <div className="mt-6 grid gap-6">
      {[...grupos.entries()].map(([materiaId, lista]) => (
        <div key={materiaId || "sem"}>
          <h3 className="font-serif text-xl">{materiaId ? (nomeDaMateria.get(materiaId) ?? "Matéria") : "Sem matéria"}</h3>
          <ul className="cartao mt-2 divide-y divide-line px-4 py-1">
            {lista.map((topico) => (
              <LinhaTopico
                key={topico.id}
                topico={topico}
                pdfsDoTopico={pdfs.filter((pdf) => !topico.materiaId || pdf.materiaId === topico.materiaId)}
                onErro={onErro}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LinhaTopico({
  topico,
  pdfsDoTopico,
  onErro,
}: {
  topico: EditalTopico;
  pdfsDoTopico: PdfDoc[];
  onErro: (texto: string | null) => void;
}) {
  const [inicio, setInicio] = useState(topico.paginaInicio ? String(topico.paginaInicio) : "");
  const [fim, setFim] = useState(topico.paginaFim ? String(topico.paginaFim) : "");
  const pdf = pdfsDoTopico.find((item) => item.id === topico.pdfId);

  async function mudar(
    mudanca: Partial<Pick<EditalTopico, "peso" | "feito" | "pdfId" | "paginaInicio" | "paginaFim">>,
  ) {
    onErro(null);
    try {
      await repo.topicos.atualizar(topico.id, mudanca);
    } catch (falha) {
      onErro(mensagemErro(falha, "Não foi possível atualizar o tópico."));
    }
  }

  function guardarPaginas() {
    if (!topico.pdfId) return;
    const de = Number(inicio);
    const ate = Number(fim || inicio);
    if (!inicio.trim()) {
      void mudar({ paginaInicio: null, paginaFim: null });
      return;
    }
    void mudar({ paginaInicio: de, paginaFim: ate });
  }

  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start gap-3">
        <input
          className="mt-1.5 shrink-0"
          type="checkbox"
          checked={topico.feito}
          aria-label={`Marcar “${topico.nome}” como estudado`}
          onChange={(evento) => void mudar({ feito: evento.target.checked })}
        />
        <div className="min-w-0 flex-1">
          <p className={`break-words ${topico.feito ? "text-muted line-through" : ""}`}>{topico.nome}</p>
          {pdf && topico.paginaInicio ? (
            <p className="mt-1 text-sm text-muted">
              <Link
                href={caminhoPdf(pdf.materiaId, pdf.id, topico.paginaInicio)}
                className="text-pine no-underline hover:underline"
              >
                Abrir no PDF
              </Link>{" "}
              · {pdf.nome}, p. {topico.paginaInicio}
              {topico.paginaFim && topico.paginaFim !== topico.paginaInicio ? `–${topico.paginaFim}` : ""}
            </p>
          ) : null}
        </div>
        <Confirmar rotulo="Excluir" confirmar="Excluir" onConfirmar={() => repo.topicos.remover(topico.id)} />
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-7">
        <label className="flex items-center gap-2 text-sm text-muted">
          Peso
          <select
            className="campo w-16 py-1"
            value={topico.peso}
            onChange={(evento) => void mudar({ peso: Number(evento.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          PDF
          <select
            className="campo min-w-0 max-w-56 py-1"
            value={topico.pdfId ?? ""}
            onChange={(evento) => {
              setInicio("");
              setFim("");
              void mudar({ pdfId: evento.target.value || null });
            }}
          >
            <option value="">Nenhum</option>
            {pdfsDoTopico.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        {topico.pdfId ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            Páginas
            <input
              className="campo w-16 py-1"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Página inicial"
              value={inicio}
              onChange={(evento) => setInicio(evento.target.value)}
              onBlur={guardarPaginas}
            />
            a
            <input
              className="campo w-16 py-1"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Página final"
              value={fim}
              onChange={(evento) => setFim(evento.target.value)}
              onBlur={guardarPaginas}
            />
          </span>
        ) : null}
      </div>
    </li>
  );
}
