import { describe, expect, it } from "vitest";
import { contarLacunas, ocultarLacunas, partesDaLacuna, prepararCard, resumoDoCard, textoRevelado } from "./cards";
import { sugerirLacunas } from "./cloze";
import { ErroEstudo } from "./erros";

describe("cards de lacuna", () => {
  const texto = "O prazo é de {{120 dias}} para o {{mandado de segurança}}.";

  it("separa as partes visíveis das escondidas", () => {
    const partes = partesDaLacuna(texto);
    expect(partes.filter((p) => p.oculto).map((p) => p.texto)).toEqual(["120 dias", "mandado de segurança"]);
    expect(partes.map((p) => p.texto).join("")).toBe("O prazo é de 120 dias para o mandado de segurança.");
  });

  it("conta, esconde e revela", () => {
    expect(contarLacunas(texto)).toBe(2);
    expect(ocultarLacunas(texto)).toBe("O prazo é de _____ para o _____.");
    expect(textoRevelado(texto)).toBe("O prazo é de 120 dias para o mandado de segurança.");
  });

  it("resumo de lista troca a lacuna por reticências e corta o texto longo", () => {
    expect(resumoDoCard("lacuna", texto)).toBe("O prazo é de […] para o […].");
    expect(resumoDoCard("basico", "x".repeat(500), 20)).toHaveLength(20);
  });
});

describe("prepararCard", () => {
  it("exige frente e verso num card básico", () => {
    expect(() => prepararCard("basico", "", "resposta")).toThrow(ErroEstudo);
    expect(() => prepararCard("basico", "pergunta", "  ")).toThrow(ErroEstudo);
    expect(prepararCard("basico", " pergunta ", " resposta ")).toEqual({ enunciado: "pergunta", resposta: "resposta" });
  });

  it("aceita frente vazia se houver figura", () => {
    expect(prepararCard("basico", "", "resposta", true)).toEqual({ enunciado: "", resposta: "resposta" });
  });

  it("card de lacuna precisa de ao menos uma lacuna e dispensa o verso", () => {
    expect(() => prepararCard("lacuna", "sem lacuna nenhuma", "")).toThrow(/lacuna/);
    expect(prepararCard("lacuna", "tem {{lacuna}}", "")).toEqual({ enunciado: "tem {{lacuna}}", resposta: "" });
  });
});

describe("sugerirLacunas", () => {
  it("põe {{ }} na palavra-chave e preserva o texto", () => {
    const sugestao = sugerirLacunas("O ato possui presunção de legitimidade e autoexecutoriedade quando previsto em lei");
    expect(contarLacunas(sugestao)).toBeGreaterThan(0);
    expect(textoRevelado(sugestao)).toBe("O ato possui presunção de legitimidade e autoexecutoriedade quando previsto em lei");
  });

  it("trechos curtos ganham uma lacuna só", () => {
    expect(contarLacunas(sugerirLacunas("Prazo de 120 dias."))).toBe(1);
  });

  it("texto vazio devolve vazio", () => {
    expect(sugerirLacunas("   ")).toBe("");
  });
});
