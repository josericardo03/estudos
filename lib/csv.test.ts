import { describe, expect, it } from "vitest";
import { cardsParaCsv, detectarSeparador, lerCardsImportados, lerCsv, limparTextoDoAnki } from "./csv";

describe("lerCsv", () => {
  it("lê aspas, separador dentro do campo e quebra de linha dentro das aspas", () => {
    const linhas = lerCsv('a;"b;c";"linha 1\nlinha 2"\r\nd;"diz ""oi""";e', ";");
    expect(linhas).toEqual([
      ["a", "b;c", "linha 1\nlinha 2"],
      ["d", 'diz "oi"', "e"],
    ]);
  });

  it("ignora linhas em branco e a BOM do Excel", () => {
    expect(lerCsv("﻿a;b\n\n;\nc;d\n", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("detecta tabulação, ponto e vírgula e vírgula", () => {
    expect(detectarSeparador("a\tb\tc")).toBe("\t");
    expect(detectarSeparador("a;b;c")).toBe(";");
    expect(detectarSeparador("a,b")).toBe(",");
  });
});

describe("limparTextoDoAnki", () => {
  it("tira o HTML e converte lacunas do Anki", () => {
    expect(limparTextoDoAnki("O prazo é de {{c1::120 dias}}<br>para o {{c2::MS::dica}}&nbsp;&amp; fim")).toBe(
      "O prazo é de {{120 dias}}\npara o {{MS}} & fim",
    );
  });
});

describe("lerCardsImportados", () => {
  it("entende o formato do Foco, com matéria e tipo", () => {
    const { cards, ignoradas } = lerCardsImportados(
      "materia;tipo;frente;verso\nDireito Administrativo;basico;O que é autotutela?;Controle dos próprios atos\n;lacuna;O prazo é {{5 anos}};\n",
    );
    expect(ignoradas).toEqual([]);
    expect(cards).toEqual([
      { materia: "Direito Administrativo", tipo: "basico", frente: "O que é autotutela?", verso: "Controle dos próprios atos" },
      { materia: "", tipo: "lacuna", frente: "O prazo é {{5 anos}}", verso: "" },
    ]);
  });

  it("sem cabeçalho lê frente e verso, como o texto exportado pelo Anki", () => {
    const { cards } = lerCardsImportados("#separator:tab\n#html:true\nPergunta<br>1\tResposta 1\nO prazo é {{c1::120 dias}}\t\n");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ tipo: "basico", frente: "Pergunta\n1", verso: "Resposta 1" });
    expect(cards[1]).toMatchObject({ tipo: "lacuna", frente: "O prazo é {{120 dias}}" });
  });

  it("pula as linhas inválidas e diz qual e por quê", () => {
    const { cards, ignoradas } = lerCardsImportados("frente;verso\nsó frente;\nok;ok\n;sem frente\n");
    expect(cards).toHaveLength(1);
    expect(ignoradas.map((i) => i.linha)).toEqual([2, 4]);
  });

  it("aceita nomes de coluna em inglês e com acento", () => {
    const { cards } = lerCardsImportados("Matéria,Front,Back\nPortuguês,casa,house\n");
    expect(cards).toEqual([{ materia: "Português", tipo: "basico", frente: "casa", verso: "house" }]);
  });
});

describe("cardsParaCsv", () => {
  it("exporta e relê o mesmo conteúdo, com aspas e quebras de linha", () => {
    const original = [
      { materiaNome: "Português", tipo: "basico" as const, enunciado: 'Diga "oi"; depois\ntchau', resposta: "ok" },
      { materiaNome: "Direito", tipo: "lacuna" as const, enunciado: "O prazo é {{5 anos}}", resposta: "" },
    ];
    const { cards, ignoradas } = lerCardsImportados(cardsParaCsv(original));
    expect(ignoradas).toEqual([]);
    expect(cards.map((c) => [c.materia, c.tipo, c.frente, c.verso])).toEqual(
      original.map((c) => [c.materiaNome, c.tipo, c.enunciado, c.resposta]),
    );
  });
});
