"use client";

import Link from "next/link";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

export function EditaisHome() {
  const [nome, setNome] = useState("");
  const [orgao, setOrgao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const editais = await repo.editais.listar();
    return Promise.all(
      editais.map(async (edital) => ({
        edital,
        materias: (await repo.editais.materias(edital.id)).length,
      })),
    );
  }, [], []);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErro(null);
    try {
      await repo.editais.criar({ nome, orgao });
      setNome("");
      setOrgao("");
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
        Um edital reúne as matérias que você está estudando para aquela prova. O PDF continua na matéria.
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
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
