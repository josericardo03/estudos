"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { caminhoMateria } from "@/lib/rotas";
import type { Materia } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Abrindo, Aviso, Confirmar, NaoEncontrado } from "./ui";

export function EditalDetalhe({ editalId }: { editalId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const { dados, pronto, erro: erroLeitura } = useConsulta(async () => {
    const edital = await repo.editais.obter(editalId);
    if (!edital) return null;
    const [materias, ligadas] = await Promise.all([
      repo.materias.listar(),
      repo.editais.materias(edital.id),
    ]);
    return { edital, materias, ligadas };
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
      });
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível salvar o edital."));
    }
  }

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
