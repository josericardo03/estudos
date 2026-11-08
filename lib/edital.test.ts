import { describe, expect, it } from "vitest";
import { coberturaDe, descreverProva, diasAteProva, ritmoParaProva } from "./edital";

const AGORA = new Date(2026, 5, 10, 12, 0).getTime();
const emDias = (n: number) => new Date(2026, 5, 10 + n).getTime();
const topicos = (pendentes: number, feitos = 0) => [
  ...Array.from({ length: pendentes }, () => ({ feito: false })),
  ...Array.from({ length: feitos }, () => ({ feito: true })),
];

describe("ritmoParaProva", () => {
  it("sem data ou com prova passada, não há ritmo", () => {
    expect(ritmoParaProva(topicos(5), null, AGORA)).toBeNull();
    expect(ritmoParaProva(topicos(5), emDias(-1), AGORA)).toBeNull();
  });

  it("reserva até 14 dias para a revisão final e divide o resto por semana", () => {
    const ritmo = ritmoParaProva(topicos(28, 10), emDias(98), AGORA)!;
    expect(ritmo.pendentes).toBe(28);
    expect(ritmo.reserva).toBe(14);
    expect(ritmo.diasDeEstudo).toBe(84);
    expect(ritmo.porSemana).toBeCloseTo(28 / 12, 5);
    expect(ritmo.apertado).toBe(false);
  });

  it("prova perto reserva menos e avisa quando o ritmo passa de um tópico por dia", () => {
    const ritmo = ritmoParaProva(topicos(30), emDias(10), AGORA)!;
    expect(ritmo.reserva).toBe(2);
    expect(ritmo.apertado).toBe(true);
  });

  it("no dia da prova nunca divide por zero", () => {
    const ritmo = ritmoParaProva(topicos(3), emDias(0), AGORA)!;
    expect(ritmo.diasDeEstudo).toBe(1);
    expect(Number.isFinite(ritmo.porSemana)).toBe(true);
  });

  it("tudo estudado: ritmo zero", () => {
    expect(ritmoParaProva(topicos(0, 8), emDias(30), AGORA)!.porSemana).toBe(0);
  });
});

describe("edital", () => {
  it("descreve a prova e a cobertura pelo peso", () => {
    expect(diasAteProva(emDias(3), AGORA)).toBe(3);
    expect(descreverProva(emDias(1), AGORA)).toBe("A prova é amanhã");
    const base = { id: "", editalId: "", materiaId: null, nome: "", pdfId: null, paginaInicio: null, paginaFim: null, createdAt: 0 };
    const cobertura = coberturaDe([
      { ...base, peso: 5, feito: true },
      { ...base, peso: 5, feito: false },
    ]);
    expect(cobertura.fracao).toBe(0.5);
  });
});
