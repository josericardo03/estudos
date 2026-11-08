import { describe, expect, it } from "vitest";
import type { GrupoMateria } from "./desempenho";
import { montarPlano, planoManual } from "./plano";
import type { EditalTopico, Materia } from "./types";

const materias: Materia[] = [
  { id: "a", nome: "Administrativo", createdAt: 0 },
  { id: "b", nome: "Constitucional", createdAt: 0 },
  { id: "c", nome: "Português", createdAt: 0 },
];

function topico(materiaId: string, peso: number, feito = false): EditalTopico {
  return { id: crypto.randomUUID(), editalId: "e", materiaId, nome: "t", peso, pdfId: null, paginaInicio: null, paginaFim: null, feito, createdAt: 0 };
}

function grupo(id: string, forca: number, taxa: number | null): GrupoMateria {
  return { id, nome: id, href: "", internas: 0, internasAcertos: 0, externas: 0, externasAcertos: 0, total: 0, acertos: 0, taxa, forca };
}

describe("montarPlano", () => {
  const base = {
    materias,
    cardsPorMateria: { a: 10, b: 10, c: 10 },
    vencidasPorMateria: {},
    topicos: [topico("a", 5), topico("b", 5), topico("c", 5)],
    desempenho: [grupo("a", 0.5, 0.5), grupo("b", 0.5, 0.5), grupo("c", 0.5, 0.5)],
  };

  it("nunca passa do tempo disponível e cada item tem pelo menos 10 minutos", () => {
    for (const minutosDia of [30, 60, 120, 180, 300]) {
      const plano = montarPlano({ ...base, minutosDia });
      const total = plano.reduce((soma, item) => soma + item.minutos, 0);
      expect(total).toBeLessThanOrEqual(minutosDia);
      expect(plano.every((item) => item.minutos >= 10)).toBe(true);
    }
  });

  it("dá mais tempo a quem está mais fraco", () => {
    const plano = montarPlano({
      ...base,
      desempenho: [grupo("a", 0.9, 0.9), grupo("b", 0.3, 0.3), grupo("c", 0.9, 0.9)],
      minutosDia: 180,
    });
    expect(plano[0].materiaId).toBe("b");
  });

  it("dá mais tempo a quem tem mais cards vencidos", () => {
    const plano = montarPlano({ ...base, vencidasPorMateria: { c: 30 }, minutosDia: 180 });
    expect(plano[0].materiaId).toBe("c");
  });

  it("ignora matéria sem cards e sem tópicos", () => {
    const plano = montarPlano({ ...base, cardsPorMateria: { a: 5 }, topicos: [topico("a", 3)], minutosDia: 120 });
    expect(plano.map((item) => item.materiaId)).toEqual(["a"]);
  });

  it("sem tempo suficiente devolve plano vazio", () => {
    expect(montarPlano({ ...base, minutosDia: 5 })).toEqual([]);
  });
});

describe("planoManual", () => {
  it("lista só as matérias com minutos, da maior para a menor", () => {
    const plano = planoManual(materias, { a: 30, b: 0, c: 90 });
    expect(plano.map((item) => [item.materiaId, item.minutos])).toEqual([
      ["c", 90],
      ["a", 30],
    ]);
  });
});
