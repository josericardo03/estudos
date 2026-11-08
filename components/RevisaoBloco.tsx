"use client";

import Link from "next/link";
import { useState } from "react";
import { lacunar } from "@/lib/cloze";
import { mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { proximaReleitura } from "@/lib/revisao";
import { caminhoBloco } from "@/lib/rotas";
import type { Bloco, Grifo } from "@/lib/types";
import { useConsulta } from "@/lib/useConsulta";
import { Aviso, MarcaPrioridade, RecorteGrifo } from "./ui";

function TrechoLacunado({ grifo, tudo }: { grifo: Grifo; tudo: boolean }) {
  const partes = lacunar(grifo.texto);
  const [reveladas, setReveladas] = useState<number[]>([]);
  return (
    <p className="leading-relaxed">
      {partes.map((parte, indice) =>
        parte.oculto ? (
          <button
            key={indice}
            type="button"
            className="lacuna"
            aria-pressed={tudo || reveladas.includes(indice)}
            aria-label={tudo || reveladas.includes(indice) ? parte.texto : "Lacuna. Toque para revelar"}
            onClick={() => setReveladas((atuais) => (atuais.includes(indice) ? atuais : [...atuais, indice]))}
          >
            {parte.texto}
          </button>
        ) : (
          <span key={indice}>{parte.texto}</span>
        ),
      )}
    </p>
  );
}

/**
 * Releitura ativa: o resumo que você escreveu e os grifos do bloco com as
 * palavras-chave escondidas. Tente lembrar a lacuna antes de revelar.
 */
export function RevisaoBloco({
  bloco,
  materiaId,
  contexto,
}: {
  bloco: Bloco;
  materiaId: string;
  contexto: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [tudo, setTudo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const href = caminhoBloco(materiaId, bloco.pdfId, bloco.id);

  async function concluir() {
    setGuardando(true);
    setErro(null);
    try {
      const feitas = (bloco.revisoes ?? 0) + 1;
      await repo.blocos.registrarRevisao(bloco.id, { revisoes: feitas, proximaRevisaoEm: proximaReleitura(feitas) });
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível registrar a releitura."));
      setGuardando(false);
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="break-words font-medium text-ink no-underline hover:underline">
            {bloco.titulo}
          </Link>
          <p className="mt-1 text-sm text-muted">{contexto}</p>
        </div>
        <button type="button" className="btn" aria-expanded={aberto} onClick={() => setAberto((valor) => !valor)}>
          {aberto ? "Fechar" : "Reler agora"}
        </button>
      </div>
      {aberto ? (
        <PainelReleitura
          blocoId={bloco.id}
          resumo={bloco.resumo}
          tudo={tudo}
          onTudo={() => setTudo(true)}
          guardando={guardando}
          erro={erro}
          onConcluir={() => void concluir()}
        />
      ) : null}
    </li>
  );
}

function PainelReleitura({
  blocoId,
  resumo,
  tudo,
  onTudo,
  guardando,
  erro,
  onConcluir,
}: {
  blocoId: string;
  resumo?: string;
  tudo: boolean;
  onTudo: () => void;
  guardando: boolean;
  erro: string | null;
  onConcluir: () => void;
}) {
  const { dados: grifos, pronto, erro: erroLeitura } = useConsulta(
    () => repo.grifos.listarPorBloco(blocoId),
    [blocoId],
    [] as Grifo[],
  );
  const importantes = grifos.filter((grifo) => grifo.cor === "importante");
  const demais = grifos.filter((grifo) => grifo.cor !== "importante");
  const ordenados = [...importantes, ...demais];

  return (
    <div className="mt-4 grid gap-4">
      {resumo ? (
        <div className="rounded-xl bg-pine-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-pine">Seu resumo</p>
          <p className="mt-1 whitespace-pre-wrap">{resumo}</p>
        </div>
      ) : null}
      {erroLeitura ? <Aviso texto={erroLeitura} /> : null}
      {!pronto ? (
        <p className="text-sm text-muted">Abrindo os grifos…</p>
      ) : ordenados.length === 0 ? (
        <p className="text-sm text-muted">Este bloco não tem grifos. Reveja o resumo e releia o trecho no PDF.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Tente lembrar cada palavra escondida antes de tocar nela.{" "}
            <button type="button" className="text-pine underline" onClick={onTudo}>
              Mostrar tudo
            </button>
          </p>
          <ul className="grid gap-3">
            {ordenados.map((grifo) => (
              <li key={grifo.id} className="citacao font-serif" data-prioridade={grifo.cor}>
                <div className="mb-1 font-sans">
                  <MarcaPrioridade cor={grifo.cor} />
                </div>
                {grifo.imagem ? <RecorteGrifo imagem={grifo.imagem} texto={grifo.texto} /> : null}
                <TrechoLacunado key={tudo ? "tudo" : "oculto"} grifo={grifo} tudo={tudo} />
              </li>
            ))}
          </ul>
        </>
      )}
      {erro ? <Aviso texto={erro} /> : null}
      <button type="button" className="btn btn-primario justify-self-start" disabled={guardando} onClick={onConcluir}>
        {guardando ? "Registrando…" : "Concluí a releitura"}
      </button>
    </div>
  );
}
