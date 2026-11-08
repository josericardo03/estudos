import { describe, expect, it } from "vitest";
import { inicioDoDia, somarDias } from "./datas";
import {
  calcularAgenda,
  descreverVolta,
  ehGargalo,
  estaDevida,
  filaDeHoje,
  intercalarPorMateria,
  limiteDaProva,
  previsaoDasNotas,
  resumoDoDia,
} from "./revisao";
import type { Questao } from "./types";

const AGORA = new Date(2026, 5, 10, 22, 30).getTime(); // 10/06/2026 22:30, hora local
const DIA = 86_400_000;

function card(sobrescrever: Partial<Questao> = {}): Questao {
  return {
    id: crypto.randomUUID(),
    materiaId: "m1",
    pdfId: null,
    pagina: null,
    topicoId: null,
    tipo: "basico",
    enunciado: "frente",
    resposta: "verso",
    statusRevisao: "nova",
    sequencia: 0,
    facilidade: 2.5,
    intervaloDias: 0,
    proximaEm: AGORA - 1000,
    julgadaEm: null,
    errosSeguidos: 0,
    erroComCerteza: false,
    createdAt: AGORA - 10 * DIA,
    ...sobrescrever,
  };
}

describe("calcularAgenda", () => {
  it("agenda 'amanhã' para a meia-noite do dia seguinte, não para 24 horas depois", () => {
    const agenda = calcularAgenda(card(), 3, { agora: AGORA });
    expect(agenda.proximaEm).toBe(somarDias(AGORA, 1));
    expect(new Date(agenda.proximaEm).getHours()).toBe(0);
    expect(agenda.proximaEm - AGORA).toBeLessThan(DIA);
  });

  it("sobe 1 dia, 3 dias e depois multiplica pela facilidade", () => {
    let atual = card();
    const dias: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const agenda = calcularAgenda(atual, 3, { agora: AGORA });
      dias.push(agenda.intervaloDias);
      atual = card({ ...atual, ...agenda });
    }
    expect(dias.slice(0, 3)).toEqual([1, 3, 8]);
    expect(dias[3]).toBeGreaterThan(dias[2]);
  });

  it("Fácil pula mais do que Bom, e Difícil encolhe a facilidade", () => {
    const bom = calcularAgenda(card(), 3, { agora: AGORA });
    const facil = calcularAgenda(card(), 4, { agora: AGORA });
    const dificil = calcularAgenda(card(), 2, { agora: AGORA });
    expect(facil.intervaloDias).toBeGreaterThan(bom.intervaloDias);
    expect(facil.facilidade).toBeGreaterThan(2.5);
    expect(dificil.facilidade).toBeLessThan(2.5);
  });

  it("Errei volta hoje, zera a sequência e acumula erros seguidos", () => {
    const primeiro = calcularAgenda(card({ sequencia: 4, intervaloDias: 14 }), 1, { agora: AGORA });
    expect(primeiro.sequencia).toBe(0);
    expect(primeiro.intervaloDias).toBe(0);
    expect(primeiro.proximaEm).toBe(AGORA);
    expect(primeiro.statusRevisao).toBe("revisar");
    expect(primeiro.errosSeguidos).toBe(1);

    const segundo = calcularAgenda(card({ ...primeiro }), 1, { agora: AGORA });
    expect(segundo.errosSeguidos).toBe(2);
  });

  it("um acerto zera os erros seguidos", () => {
    const agenda = calcularAgenda(card({ errosSeguidos: 2 }), 3, { agora: AGORA });
    expect(agenda.errosSeguidos).toBe(0);
  });

  it("marca erro com certeza só quando errou dizendo 'tenho certeza'", () => {
    expect(calcularAgenda(card(), 1, { agora: AGORA, confianca: 3 }).erroComCerteza).toBe(true);
    expect(calcularAgenda(card(), 1, { agora: AGORA, confianca: 1 }).erroComCerteza).toBe(false);
    expect(calcularAgenda(card(), 3, { agora: AGORA, confianca: 3 }).erroComCerteza).toBe(false);
  });

  it("guarda a data da primeira vez e não a troca depois", () => {
    const primeira = calcularAgenda(card(), 3, { agora: AGORA });
    expect(primeira.julgadaEm).toBe(AGORA);
    const depois = calcularAgenda(card({ julgadaEm: AGORA - 5 * DIA }), 3, { agora: AGORA });
    expect(depois.julgadaEm).toBe(AGORA - 5 * DIA);
  });

  it("não deixa a facilidade cair abaixo de 1,3", () => {
    const agenda = calcularAgenda(card({ facilidade: 1.31 }), 1, { agora: AGORA });
    expect(agenda.facilidade).toBe(1.3);
  });

  it("respeita o teto da prova", () => {
    const livre = calcularAgenda(card({ sequencia: 5, intervaloDias: 40 }), 4, { agora: AGORA });
    const limitada = calcularAgenda(card({ sequencia: 5, intervaloDias: 40 }), 4, { agora: AGORA, limiteDias: 7 });
    expect(livre.intervaloDias).toBeGreaterThan(7);
    expect(limitada.intervaloDias).toBe(7);
  });

  it("vira 'dominada' a partir de 21 dias", () => {
    const agenda = calcularAgenda(card({ sequencia: 4, intervaloDias: 14 }), 3, { agora: AGORA });
    expect(agenda.intervaloDias).toBeGreaterThanOrEqual(21);
    expect(agenda.statusRevisao).toBe("dominada");
  });

  it("a prévia dos botões bate com o que cada nota agenda", () => {
    const c = card();
    const previa = previsaoDasNotas(c, { agora: AGORA });
    for (const nota of [1, 2, 3, 4] as const) {
      expect(previa[nota].dias).toBe(calcularAgenda(c, nota, { agora: AGORA }).intervaloDias);
    }
  });
});

describe("limiteDaProva", () => {
  it("sem prova futura, não há teto", () => {
    expect(limiteDaProva(null)).toBeNull();
    expect(limiteDaProva(0)).toBeNull();
    expect(limiteDaProva(-3)).toBeNull();
  });

  it("usa 20% do tempo que falta, com mínimo de 1 dia", () => {
    expect(limiteDaProva(40)).toBe(8);
    expect(limiteDaProva(3)).toBe(1);
  });
});

describe("estaDevida e ehGargalo", () => {
  it("card suspenso nunca vence", () => {
    expect(estaDevida(card({ suspensa: true }), AGORA)).toBe(false);
    expect(estaDevida(card(), AGORA)).toBe(true);
    expect(estaDevida(card({ proximaEm: AGORA + DIA }), AGORA)).toBe(false);
  });

  it("três erros seguidos é gargalo", () => {
    expect(ehGargalo({ errosSeguidos: 2 })).toBe(false);
    expect(ehGargalo({ errosSeguidos: 3 })).toBe(true);
    expect(ehGargalo({})).toBe(false);
  });
});

describe("resumoDoDia", () => {
  it("conta só as tentativas de hoje, separando novas de revisões", () => {
    const hoje = inicioDoDia(AGORA) + 3_600_000;
    const resumo = resumoDoDia(
      [
        { em: hoje, nova: true },
        { em: hoje + 1000, nova: false },
        { em: hoje + 2000, nova: false },
        { em: hoje - 2 * DIA, nova: true },
        { em: hoje - 2 * DIA, nova: false },
      ],
      AGORA,
    );
    expect(resumo).toEqual({ novos: 1, revisoes: 2 });
  });
});

describe("filaDeHoje", () => {
  it("revisões vêm antes dos cards novos", () => {
    const revisao = card({ id: "rev", julgadaEm: AGORA - 5 * DIA, proximaEm: AGORA - DIA });
    const nova = card({ id: "nova" });
    const { fila } = filaDeHoje([nova, revisao], [], { agora: AGORA });
    expect(fila.map((c) => c.id)).toEqual(["rev", "nova"]);
  });

  it("respeita o limite de cards novos e conta o que sobrou", () => {
    const novas = Array.from({ length: 5 }, (_, i) => card({ id: `n${i}`, createdAt: i }));
    const resultado = filaDeHoje(novas, [], { agora: AGORA, limiteNovos: 2 });
    expect(resultado.novas).toBe(2);
    expect(resultado.ficaramNovas).toBe(3);
    expect(resultado.fila.map((c) => c.id)).toEqual(["n0", "n1"]);
  });

  it("desconta do limite o que já foi feito hoje", () => {
    const novas = Array.from({ length: 4 }, (_, i) => card({ id: `n${i}`, createdAt: i }));
    const hoje = inicioDoDia(AGORA) + 1000;
    const resultado = filaDeHoje(novas, [{ em: hoje, nova: true }], { agora: AGORA, limiteNovos: 3 });
    expect(resultado.novas).toBe(2);
  });

  it("respeita o limite de revisões", () => {
    const revisoes = Array.from({ length: 6 }, (_, i) =>
      card({ id: `r${i}`, julgadaEm: AGORA - 9 * DIA, proximaEm: AGORA - i * 1000 - 1000 }),
    );
    const resultado = filaDeHoje(revisoes, [], { agora: AGORA, limiteRevisoes: 4 });
    expect(resultado.revisoes).toBe(4);
    expect(resultado.ficaramRevisoes).toBe(2);
  });

  it("não inclui cards suspensos nem os que ainda não venceram", () => {
    const lista = [
      card({ id: "ok" }),
      card({ id: "suspenso", suspensa: true }),
      card({ id: "futuro", proximaEm: AGORA + DIA }),
    ];
    expect(filaDeHoje(lista, [], { agora: AGORA }).fila.map((c) => c.id)).toEqual(["ok"]);
  });

  it("entre as revisões, quem errou com certeza vem primeiro", () => {
    const comum = card({ id: "comum", julgadaEm: 1, proximaEm: AGORA - 5 * DIA });
    const certeza = card({ id: "certeza", julgadaEm: 1, proximaEm: AGORA - 1000, erroComCerteza: true });
    const { fila } = filaDeHoje([comum, certeza], [], { agora: AGORA });
    expect(fila[0].id).toBe("certeza");
  });
});

describe("intercalarPorMateria", () => {
  it("alterna as matérias mantendo a ordem dentro de cada uma", () => {
    const lista = [
      card({ id: "a1", materiaId: "A" }),
      card({ id: "a2", materiaId: "A" }),
      card({ id: "a3", materiaId: "A" }),
      card({ id: "b1", materiaId: "B" }),
    ];
    expect(intercalarPorMateria(lista).map((c) => c.id)).toEqual(["a1", "b1", "a2", "a3"]);
  });
});

describe("descreverVolta", () => {
  it("fala em amanhã, dias e meses", () => {
    expect(descreverVolta(somarDias(AGORA, 1), AGORA)).toBe("Volta amanhã");
    expect(descreverVolta(somarDias(AGORA, 5), AGORA)).toBe("Volta em 5 dias");
    expect(descreverVolta(somarDias(AGORA, 120), AGORA)).toMatch(/meses/);
    expect(descreverVolta(AGORA - 1, AGORA)).toBe("Continua no banco");
  });
});
