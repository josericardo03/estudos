import { describe, expect, it } from "vitest";
import { combinaComBusca, normalizar, palavrasDaBusca } from "./busca";

describe("busca", () => {
  it("ignora acento e maiúscula", () => {
    expect(normalizar("Ação Civil Pública")).toBe("acao civil publica");
  });

  it("exige todas as palavras, em qualquer ordem", () => {
    const texto = normalizar("Prazo do mandado de segurança: 120 dias");
    expect(combinaComBusca(texto, palavrasDaBusca("seguranca prazo"))).toBe(true);
    expect(combinaComBusca(texto, palavrasDaBusca("prazo habeas"))).toBe(false);
  });

  it("busca vazia combina com tudo", () => {
    expect(combinaComBusca("qualquer coisa", palavrasDaBusca("   "))).toBe(true);
  });
});
