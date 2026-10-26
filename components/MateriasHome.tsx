"use client";

import Link from "next/link";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { caminhoBanco, caminhoMateria } from "@/lib/rotas";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso } from "./ui";

export function MateriasHome() {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const materias = await repo.materias.listar();
    return Promise.all(
      materias.map(async (materia) => {
        const [pdfs, questoes, editais] = await Promise.all([
          repo.pdfs.listarPorMateria(materia.id),
          repo.questoes.listarPorMateria(materia.id),
          repo.editais.daMateria(materia.id),
        ]);
        return {
          materia,
          pdfs: pdfs.length,
          questoes: questoes.length,
          editais: editais.length,
        };
      }),
    );
  }, [], []);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setErro(null);
    try {
      await repo.materias.criar(nome);
      setNome("");
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível criar a matéria."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="olho">Estúdio</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Matérias</h1>
      <p className="mt-3 max-w-xl text-muted">
        Cada matéria guarda os PDFs, os blocos de páginas e as questões daquele assunto.
      </p>

      <form onSubmit={criar} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="rotulo" htmlFor="nova-materia">
            Nova matéria
          </label>
          <input
            id="nova-materia"
            className="campo"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Direito Administrativo"
            autoComplete="off"
          />
        </div>
        <button className="btn btn-primario sm:self-end" type="submit" disabled={guardando}>
          {guardando ? "Abrindo…" : "Criar matéria"}
        </button>
      </form>
      {erro ? <div className="mt-3"><Aviso texto={erro} /></div> : null}
      {erroLeitura ? <div className="mt-3"><Aviso texto={erroLeitura} /></div> : null}

      {!pronto ? (
        <Abrindo texto="Abrindo as matérias…" />
      ) : dados.length === 0 ? (
        <p className="mt-10 text-muted">Nenhuma matéria ainda. A primeira pode ser a do edital que você está estudando.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {dados.map((item, indice) => (
            <li key={item.materia.id}>
              <Link
                href={caminhoMateria(item.materia.id)}
                className="flex items-baseline gap-4 py-4 no-underline hover:bg-sheet"
              >
                <span className="w-8 font-serif text-lg text-muted">
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-2xl text-ink">{item.materia.nome}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {item.pdfs} {item.pdfs === 1 ? "PDF" : "PDFs"}
                    {" · "}
                    {item.questoes} {item.questoes === 1 ? "questão" : "questões"}
                    {" · "}
                    {item.editais} {item.editais === 1 ? "edital" : "editais"}
                  </span>
                </span>
              </Link>
              {item.questoes > 0 ? (
                <div className="-mt-2 pb-3 pl-12">
                  <Link href={caminhoBanco(item.materia.id)} className="text-sm text-pine no-underline hover:underline">
                    Revisar questões
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
