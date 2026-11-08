"use client";

import Link from "next/link";
import { useState } from "react";
import { deCampoData } from "@/lib/datas";
import { coberturaDe, descreverProva } from "@/lib/edital";
import { mensagemErro } from "@/lib/erros";
import { porcentagem } from "@/lib/desempenho";
import { repo } from "@/lib/repo";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

export function EditaisHome() {
  const [nome, setNome] = useState("");
  const [orgao, setOrgao] = useState("");
  const [dataProva, setDataProva] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const [editais, vinculos, topicos, blocos] = await Promise.all([
      repo.editais.listar(),
      repo.editais.vinculos(),
      repo.topicos.listarTodos(),
      repo.blocos.listarTodos(),
    ]);
    const agora = Date.now();
    return editais.map((edital) => {
      const daProva = topicos.filter((topico) => topico.editalId === edital.id);
      return {
        edital,
        materias: vinculos.filter((vinculo) => vinculo.editalId === edital.id).length,
        topicos: daProva.length,
        cobertura: coberturaDe(daProva, blocos),
        prova: descreverProva(edital.dataProva, agora),
      };
    });
  }, [], []);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErro(null);
    try {
      await repo.editais.criar({ nome, orgao, dataProva: deCampoData(dataProva) });
      setNome("");
      setOrgao("");
      setDataProva("");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível criar o edital."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Prova</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Editais</h1>
      <p className="mt-3 max-w-xl text-muted">
        Um edital reúne as matérias e os tópicos daquela prova. Com a data, o app limita os intervalos de revisão para
        que tudo volte antes do dia.
      </p>
      <form onSubmit={criar} className="mt-8 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="rotulo" htmlFor="nome-edital">
            Nome do edital
          </label>
          <input
            id="nome-edital"
            className="campo"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Analista judiciário"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="rotulo" htmlFor="orgao-edital">
            Órgão
          </label>
          <input
            id="orgao-edital"
            className="campo"
            value={orgao}
            onChange={(evento) => setOrgao(evento.target.value)}
            placeholder="TRF"
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="data-edital">
            Data da prova (opcional)
          </label>
          <input
            id="data-edital"
            className="campo"
            type="date"
            value={dataProva}
            onChange={(evento) => setDataProva(evento.target.value)}
          />
        </div>
        <button className="btn btn-primario" type="submit" disabled={guardando}>
          {guardando ? "Criando…" : "Criar edital"}
        </button>
      </form>
      {erro ? <div className="mt-3"><Aviso texto={erro} /></div> : null}
      {erroLeitura ? <div className="mt-3"><Aviso texto={erroLeitura} /></div> : null}

      {!pronto ? (
        <Abrindo texto="Abrindo os editais…" />
      ) : dados.length === 0 ? (
        <p className="mt-10 text-muted">Nenhum edital ainda.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {dados.map((item) => (
            <li key={item.edital.id}>
              <Link href={`/editais/${item.edital.id}`} className="block py-4 no-underline hover:bg-sheet">
                <span className="block font-serif text-2xl text-ink">{item.edital.nome}</span>
                <span className="mt-1 block text-sm text-muted">
                  {item.edital.orgao || "Órgão em branco"}
                  {" · "}
                  {item.materias} {item.materias === 1 ? "matéria" : "matérias"}
                  {item.prova ? ` · ${item.prova}` : ""}
                </span>
                {item.cobertura.fracao !== null ? (
                  <span className="mt-2 flex items-center gap-3 text-sm text-muted">
                    <span className="h-2 w-40 max-w-[50%] overflow-hidden rounded-full bg-line" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-pine-bg"
                        style={{ width: `${porcentagem(item.cobertura.fracao)}%` }}
                      />
                    </span>
                    {porcentagem(item.cobertura.fracao)}% coberto ({item.cobertura.cobertos}/{item.cobertura.total} tópicos)
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
