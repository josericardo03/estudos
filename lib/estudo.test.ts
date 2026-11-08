import { describe, expect, it } from "vitest";
import { resumirEstudo, revisoesPorDia } from "./estudo";
import type { Estudo } from "./types";

const AGORA = new Date(2026, 5, 10, 12, 0).getTime();
const DIA = 86_400_000;

const estudo = (diasAtras: number, segundos: number): Estudo => ({
  id: crypto.randomUUID(),
  materiaId: null,
  segundos,
  em: AGORA - diasAtras * DIA,
});

const revisoes = (diasAtras: number, quantas: number) =>
  Array.from({ length: quantas }, () => ({ em: AGORA - diasAtras * DIA }));

describe("sequência de dias", () => {
  it("conta dias seguidos de estudo cronometrado", () => {
    const estudos = [estudo(0, 900), estudo(1, 900), estudo(2, 900), estudo(4, 900)];
    expect(resumirEstudo(estudos, AGORA).sequencia).toBe(3);
  });

  it("conta também os dias só de revisão, sem cronômetro", () => {
    const porDia = revisoesPorDia([...revisoes(0, 12), ...revisoes(1, 10), ...revisoes(2, 3)]);
    expect(resumirEstudo([], AGORA, 28, porDia).sequencia).toBe(2);
  });

  it("mistura tempo e revisão", () => {
    const porDia = revisoesPorDia(revisoes(1, 15));
    expect(resumirEstudo([estudo(0, 700), estudo(2, 700)], AGORA, 28, porDia).sequencia).toBe(3);
  });

  it("a sequência segue viva se hoje ainda não bateu o mínimo mas ontem sim", () => {
    expect(resumirEstudo([estudo(0, 60), estudo(1, 900), estudo(2, 900)], AGORA).sequencia).toBe(2);
  });

  it("um dia em branco zera", () => {
    expect(resumirEstudo([estudo(2, 900), estudo(3, 900)], AGORA).sequencia).toBe(0);
  });
});
