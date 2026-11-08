import { describe, expect, it } from "vitest";
import { paginar } from "./repoRemoto";

/** Imita o Supabase: nunca devolve mais de 1000 linhas por pedido, qualquer que seja o intervalo pedido. */
function bancoFalso(total: number, falharNaPagina?: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos: Array<[number, number]> = [];
  const montar = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    if (falharNaPagina !== undefined && pedidos.length === falharNaPagina) {
      return { data: null, error: { message: "boom" } };
    }
    return { data: linhas.slice(de, Math.min(ate + 1, de + 1000)), error: null };
  };
  return { montar, pedidos };
}

describe("paginar", () => {
  it("lê todas as linhas quando há mais de 1000 (o limite do Supabase)", async () => {
    const { montar, pedidos } = bancoFalso(2500);
    const lidas = await paginar<{ id: number }>(montar, "erro");
    expect(lidas).toHaveLength(2500);
    expect(lidas[0].id).toBe(0);
    expect(lidas[2499].id).toBe(2499);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("não repete nenhuma linha entre as páginas", async () => {
    const { montar } = bancoFalso(2100);
    const lidas = await paginar<{ id: number }>(montar, "erro");
    expect(new Set(lidas.map((l) => l.id)).size).toBe(2100);
  });

  it("para na primeira página quando cabe tudo", async () => {
    const { montar, pedidos } = bancoFalso(40);
    expect(await paginar(montar, "erro")).toHaveLength(40);
    expect(pedidos).toHaveLength(1);
  });

  it("tabela vazia devolve lista vazia", async () => {
    const { montar } = bancoFalso(0);
    expect(await paginar(montar, "erro")).toEqual([]);
  });

  it("um erro no meio interrompe com a mensagem do chamador", async () => {
    const { montar } = bancoFalso(3000, 2);
    await expect(paginar(montar, "Não foi possível ler os cards.")).rejects.toThrow("Não foi possível ler os cards.");
  });
});
