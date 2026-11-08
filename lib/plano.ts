import type { GrupoMateria } from "./desempenho";
import { porcentagem } from "./desempenho";
import type { EditalTopico, Materia } from "./types";

export type ItemPlano = {
  materiaId: string;
  nome: string;
  minutos: number;
  motivo: string;
};

const PASSO = 5;
const MINIMO = 10;

/**
 * Reparte o tempo do dia entre as matérias.
 * Pesa mais quem vale mais no edital, tem mais tópicos pendentes, está com a
 * taxa de acerto mais baixa e tem mais cards vencidos.
 */
export function montarPlano(entrada: {
  materias: Materia[];
  /** Quantos cards cada matéria tem, e quantos deles venceram. Dispensa carregar os cards. */
  cardsPorMateria: Record<string, number>;
  vencidasPorMateria: Record<string, number>;
  topicos: EditalTopico[];
  desempenho: GrupoMateria[];
  minutosDia: number;
}): ItemPlano[] {
  const forcaDe = new Map(entrada.desempenho.map((grupo) => [grupo.id, grupo]));

  const candidatos = entrada.materias
    .map((materia) => {
      const topicos = entrada.topicos.filter((topico) => topico.materiaId === materia.id);
      const totalDeCards = entrada.cardsPorMateria[materia.id] ?? 0;
      if (!topicos.length && !totalDeCards) return null;

      const pesoMedio = topicos.length ? topicos.reduce((total, topico) => total + topico.peso, 0) / topicos.length : 3;
      const pendentes = topicos.filter((topico) => !topico.feito).length;
      const pendencia = topicos.length ? pendentes / topicos.length : 1;
      const desempenho = forcaDe.get(materia.id);
      const forca = desempenho?.forca ?? 0.6;
      const vencidas = entrada.vencidasPorMateria[materia.id] ?? 0;

      const score =
        (pesoMedio / 3) * (0.4 + 0.6 * pendencia) * (1 + 2 * (1 - forca)) * (1 + Math.min(vencidas, 30) / 30);

      const partes: string[] = [];
      if (topicos.length) partes.push(`peso ${pesoMedio.toFixed(1).replace(".", ",")} no edital`);
      if (pendentes > 0) partes.push(`${pendentes} ${pendentes === 1 ? "tópico pendente" : "tópicos pendentes"}`);
      if (desempenho?.taxa != null) partes.push(`acerto em ${porcentagem(desempenho.taxa)}%`);
      if (vencidas > 0) partes.push(`${vencidas} ${vencidas === 1 ? "card vencido" : "cards vencidos"}`);
      return { materia, score, motivo: partes.join(" · ") || "sem dados ainda" };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score);

  if (!candidatos.length || entrada.minutosDia < MINIMO) return [];

  const maximoDeItens = Math.max(1, Math.floor(entrada.minutosDia / MINIMO));
  const escolhidos = candidatos.slice(0, maximoDeItens);
  const soma = escolhidos.reduce((total, item) => total + item.score, 0);

  const itens = escolhidos.map((item) => ({
    materiaId: item.materia.id,
    nome: item.materia.nome,
    minutos: Math.max(MINIMO, Math.round((entrada.minutosDia * item.score) / soma / PASSO) * PASSO),
    motivo: item.motivo,
  }));

  let total = itens.reduce((acc, item) => acc + item.minutos, 0);
  while (total > entrada.minutosDia) {
    const maior = itens.reduce((a, b) => (b.minutos > a.minutos ? b : a));
    if (maior.minutos - PASSO < MINIMO) {
      const cortado = itens.pop();
      if (!cortado) break;
      total -= cortado.minutos;
      continue;
    }
    maior.minutos -= PASSO;
    total -= PASSO;
  }
  while (total + PASSO <= entrada.minutosDia && itens.length) {
    itens[0].minutos += PASSO;
    total += PASSO;
  }
  return itens;
}

/** Plano que você mesmo montou (por exemplo, copiado do Guru Já): minutos por matéria. */
export function planoManual(materias: Materia[], minutos: Record<string, number>): ItemPlano[] {
  return materias
    .filter((materia) => (minutos[materia.id] ?? 0) > 0)
    .map((materia) => ({
      materiaId: materia.id,
      nome: materia.nome,
      minutos: Math.round(minutos[materia.id]),
      motivo: "plano que você definiu",
    }))
    .sort((a, b) => b.minutos - a.minutos);
}
