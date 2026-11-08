import { describe, expect, it } from "vitest";
import { desempenhoDasMaterias, montarDesempenho } from "./desempenho";
import type { Lancamento, Materia, Questao, Tentativa } from "./types";

const AGORA = new Date(2026, 5, 10, 12, 0).getTime();
const DIA = 86_400_000;

const materias: Materia[] = [
  { id: "m1", nome: "Administrativo", createdAt: 0 },
  { id: "m2", nome: "Constitucional", createdAt: 0 },
];

function tentativa(sobrescrever: Partial<Tentativa> = {}): Tentativa {
  return {
    id: crypto.randomUUID(),
    questaoId: "q1",
    materiaId: "m1",
    pdfId: null,
    topicoId: null,
    pagina: null,
    acertou: true,
    em: AGORA - DIA,
    ...sobrescrever,
  };
}

const rotas = {
  caminhoMateria: (id: string) => `/materias/${id}`,
  caminhoPdf: (m: string, p: string, pagina?: number) => `/materias/${m}/pdfs/${p}${pagina ? `?pagina=${pagina}` : ""}`,
  caminhoTopico: (id: string) => `/editais/${id}`,
};

describe("desempenhoDasMaterias", () => {
  it("matéria sem tentativa fica sem taxa e vai para o fim", () => {
    const lista = desempenhoDasMaterias({
      materias,
      tentativas: [tentativa({ materiaId: "m2", acertou: false })],
      agora: AGORA,
      caminhoMateria: rotas.caminhoMateria,
    });
    expect(lista.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(lista[1].taxa).toBeNull();
  });

  it("ordena da mais fraca para a mais forte", () => {
    const tentativas = [
      ...Array.from({ length: 10 }, () => tentativa({ materiaId: "m1", acertou: true })),
      ...Array.from({ length: 10 }, () => tentativa({ materiaId: "m2", acertou: false })),
    ];
    const lista = desempenhoDasMaterias({ materias, tentativas, agora: AGORA, caminhoMateria: rotas.caminhoMateria });
    expect(lista[0].id).toBe("m2");
    expect(lista[0].forca).toBeLessThan(lista[1].forca);
  });

  it("um único erro não zera a força (suavização)", () => {
    const [umErro] = desempenhoDasMaterias({
      materias: [materias[0]],
      tentativas: [tentativa({ acertou: false })],
      agora: AGORA,
      caminhoMateria: rotas.caminhoMateria,
    });
    const [dezErros] = desempenhoDasMaterias({
      materias: [materias[0]],
      tentativas: Array.from({ length: 10 }, () => tentativa({ acertou: false })),
      agora: AGORA,
      caminhoMateria: rotas.caminhoMateria,
    });
    expect(umErro.forca).toBeGreaterThan(0.3);
    expect(umErro.forca).toBeGreaterThan(dezErros.forca);
  });

  it("erros recentes pesam mais do que erros antigos", () => {
    const antigos = [
      ...Array.from({ length: 5 }, () => tentativa({ acertou: false, em: AGORA - 150 * DIA })),
      ...Array.from({ length: 5 }, () => tentativa({ acertou: true, em: AGORA - DIA })),
    ];
    const recentes = [
      ...Array.from({ length: 5 }, () => tentativa({ acertou: false, em: AGORA - DIA })),
      ...Array.from({ length: 5 }, () => tentativa({ acertou: true, em: AGORA - 150 * DIA })),
    ];
    const args = { materias: [materias[0]], agora: AGORA, caminhoMateria: rotas.caminhoMateria };
    const [comAntigos] = desempenhoDasMaterias({ ...args, tentativas: antigos });
    const [comRecentes] = desempenhoDasMaterias({ ...args, tentativas: recentes });
    expect(comRecentes.forca).toBeLessThan(comAntigos.forca);
    expect(comAntigos.taxa).toBe(comRecentes.taxa);
  });

  it("soma as questões feitas fora do app", () => {
    const lancamentos: Lancamento[] = [{ id: "l", materiaId: "m1", feitas: 30, acertos: 21, fonte: "", em: AGORA }];
    const [m] = desempenhoDasMaterias({
      materias: [materias[0]],
      tentativas: [tentativa({ acertou: true }), tentativa({ acertou: false })],
      lancamentos,
      agora: AGORA,
      caminhoMateria: rotas.caminhoMateria,
    });
    expect(m.total).toBe(32);
    expect(m.acertos).toBe(22);
  });
});

describe("montarDesempenho", () => {
  const questoes: Questao[] = [
    {
      id: "q1",
      materiaId: "m1",
      pdfId: "p1",
      pagina: 12,
      topicoId: "t1",
      tipo: "lacuna",
      enunciado: "O prazo é de {{120 dias}}.",
      resposta: "",
      statusRevisao: "nova",
      createdAt: 0,
    },
  ];

  it("agrupa por tópico e por trecho de 10 páginas, e lista os motivos de erro", () => {
    const resumo = montarDesempenho({
      materias,
      pdfs: [{ id: "p1", nome: "Resumo.pdf", materiaId: "m1" }],
      topicos: [{ id: "t1", editalId: "e1", materiaId: "m1", nome: "Atos", peso: 5, pdfId: null, paginaInicio: null, paginaFim: null, feito: false, createdAt: 0 }],
      questoes,
      tentativas: [
        tentativa({ pdfId: "p1", topicoId: "t1", pagina: 12, acertou: false, motivo: "confundi", confianca: 3 }),
        tentativa({ pdfId: "p1", topicoId: "t1", pagina: 12, acertou: true, confianca: 3 }),
      ],
      agora: AGORA,
      ...rotas,
    });
    expect(resumo.topicos[0].nome).toBe("Atos");
    expect(resumo.trechos[0].nome).toContain("p. 11–20");
    expect(resumo.motivos).toEqual([{ motivo: "confundi", nome: "Confundi conceitos", total: 1 }]);
    expect(resumo.calibracao[0]).toMatchObject({ nivel: 3, tentativas: 2, taxa: 0.5 });
    expect(resumo.pontosCegos[0].certezaErrada).toBe(1);
    expect(resumo.questoes[0].enunciado).toContain("[…]");
  });
});
