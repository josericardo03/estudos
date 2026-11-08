"use client";

import { useState } from "react";
import { cardsParaCsv, lerCardsImportados, type ResultadoDaLeitura } from "@/lib/csv";
import { chaveDia } from "@/lib/datas";
import { ErroEstudo, mensagemErro } from "@/lib/erros";
import { repo } from "@/lib/repo";
import { useConsulta } from "@/lib/useConsulta";
import { Aviso } from "./ui";

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Leva os cards para uma planilha e traz de volta (ou do Anki), sem depender do Supabase. */
export function PlanilhaDeCards() {
  const { dados: materias } = useConsulta(() => repo.materias.listar(), [], []);
  const [padrao, setPadrao] = useState("");
  const [leitura, setLeitura] = useState<(ResultadoDaLeitura & { nome: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function exportar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const [cards, lista] = await Promise.all([repo.questoes.listarTodas(), repo.materias.listar()]);
      const nomes = new Map(lista.map((materia) => [materia.id, materia.nome]));
      const csv = cardsParaCsv(
        cards.map((card) => ({
          materiaNome: nomes.get(card.materiaId) ?? "",
          tipo: card.tipo,
          enunciado: card.enunciado,
          resposta: card.resposta,
        })),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `foco-cards-${chaveDia(Date.now())}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setAviso(`${cards.length} cards exportados. As figuras e o histórico de revisões não vão na planilha.`);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível exportar os cards."));
    } finally {
      setOcupado(false);
    }
  }

  async function ler(arquivo: File) {
    setErro(null);
    setAviso(null);
    try {
      const resultado = lerCardsImportados(await arquivo.text());
      if (!resultado.cards.length) {
        setLeitura(null);
        setErro("Não encontrei nenhum card válido neste arquivo.");
        return;
      }
      setLeitura({ ...resultado, nome: arquivo.name });
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível ler este arquivo."));
    }
  }

  async function importar() {
    if (!leitura) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const precisaDaPadrao = leitura.cards.some((card) => !card.materia);
      if (precisaDaPadrao && !padrao) {
        throw new ErroEstudo("Escolha a matéria para os cards que não dizem a deles.");
      }
      const porNome = new Map(materias.map((materia) => [semAcento(materia.nome), materia.id]));
      const entradas: { materiaId: string; tipo: "basico" | "lacuna"; enunciado: string; resposta: string }[] = [];
      for (const card of leitura.cards) {
        let materiaId = padrao;
        if (card.materia) {
          const chave = semAcento(card.materia);
          let existente = porNome.get(chave);
          if (!existente) {
            existente = (await repo.materias.criar(card.materia)).id;
            porNome.set(chave, existente);
          }
          materiaId = existente;
        }
        entradas.push({ materiaId, tipo: card.tipo, enunciado: card.frente, resposta: card.verso });
      }
      const total = await repo.questoes.criarVarios(entradas);
      setAviso(`${total} cards importados. Eles entram na revisão como novos.`);
      setLeitura(null);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível importar os cards."));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="titulo-planilha">
      <h2 id="titulo-planilha" className="font-serif text-3xl">
        Cards em planilha
      </h2>
      <p className="mt-2 text-muted">
        Exporte os cards para uma planilha (CSV) ou traga cards de outro lugar. O arquivo do Anki, exportado como texto
        com tabulação, também serve: as lacunas do Anki viram lacunas do Foco. Sem cabeçalho, as duas primeiras colunas
        são a frente e o verso.
      </p>
      {erro ? <div className="mt-3"><Aviso texto={erro} /></div> : null}
      {aviso ? <p className="mt-3 text-sm text-pine" role="status">{aviso}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={ocupado} onClick={() => void exportar()}>
          {ocupado ? "Trabalhando…" : "Exportar cards (CSV)"}
        </button>
        <label className={`btn ${ocupado ? "opacity-60" : ""}`}>
          Escolher arquivo para importar
          <input
            className="sr-only"
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            disabled={ocupado}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              evento.target.value = "";
              if (arquivo) void ler(arquivo);
            }}
          />
        </label>
      </div>

      {leitura ? (
        <div className="cartao mt-4 p-4">
          <p className="font-medium">
            {leitura.nome}: {leitura.cards.length} {leitura.cards.length === 1 ? "card pronto" : "cards prontos"}
            {leitura.ignoradas.length
              ? `, ${leitura.ignoradas.length} ${leitura.ignoradas.length === 1 ? "linha ignorada" : "linhas ignoradas"}`
              : ""}
            .
          </p>
          {leitura.ignoradas.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              {leitura.ignoradas.slice(0, 5).map((item) => (
                <li key={item.linha}>
                  Linha {item.linha}: {item.motivo}
                </li>
              ))}
              {leitura.ignoradas.length > 5 ? <li>e mais {leitura.ignoradas.length - 5}.</li> : null}
            </ul>
          ) : null}
          {leitura.cards.some((card) => !card.materia) ? (
            <div className="mt-3">
              <label className="rotulo" htmlFor="materia-importacao">
                Matéria dos cards sem matéria na planilha
              </label>
              <select id="materia-importacao" className="campo" value={padrao} onChange={(evento) => setPadrao(evento.target.value)}>
                <option value="">Escolha…</option>
                {materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-muted">
            Matérias que ainda não existem são criadas com o nome da planilha. Importar duas vezes cria os cards duas vezes.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-primario" disabled={ocupado} onClick={() => void importar()}>
              {ocupado ? "Importando…" : `Importar ${leitura.cards.length} cards`}
            </button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => setLeitura(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
