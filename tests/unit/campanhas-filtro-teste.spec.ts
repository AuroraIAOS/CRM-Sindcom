import { describe, it, expect } from "vitest";
import { ehCampanhaDeTeste } from "../../src/features/campanhas/api";

/**
 * Subetapa 9.2 — o filtro que tira a Onda 00 do painel de campanhas.
 *
 * POR QUE ISTO MERECE TESTE, sendo três linhas de regex: o modo de falha não é
 * simétrico. Deixar uma campanha de teste passar apenas suja o painel — chato,
 * visível, corrigível. **Casar com uma onda REAL esconde resultado de campanha
 * de verdade**, e esconde justamente o número sobre o qual a regra dos 2% de
 * rejeição decide se a onda seguinte sai. Um falso positivo aqui é uma decisão
 * de campanha tomada sobre dado que a tela deixou de mostrar.
 *
 * O casamento é por PREFIXO, nunca por "contém" — a limpeza da base de
 * 2026-09-09 já mostrou o preço de filtrar por conteúdo, quando `demo` pegou
 * `contabilidademontanari` e `diegomarademorais`, os dois reais
 * (orientacoes.md §7.3).
 */
describe("9.2 · ehCampanhaDeTeste — esconde a Onda 00 sem nunca esconder onda real", () => {
  it("reconhece os nomes reais das campanhas da Onda 00, como estão na Brevo", () => {
    // Exatamente os cinco nomes lidos no painel em 2026-09-11.
    for (const nome of [
      "Onda 00 - Trilha A",
      "Onda 00 - Trilha A_copy",
      "Onda 00 - Trilha B1",
      "Onda 00 - Trilha B2",
      "Onda 00 - Trilha B3",
    ]) {
      expect(ehCampanhaDeTeste(nome), `deveria ser teste: ${nome}`).toBe(true);
    }
  });

  it("tolera as variações de digitação que um nome escrito à mão produz", () => {
    for (const nome of ["onda 00 — trilha a", "ONDA 0 - piloto", "  Onda 00 · Trilha B1", "Onda 000 - x"]) {
      expect(ehCampanhaDeTeste(nome), `deveria ser teste: ${nome}`).toBe(true);
    }
  });

  /** O caso que importa: NENHUMA onda real pode ser confundida com teste. */
  it("NUNCA esconde uma onda real — nem a 01, nem as seguintes", () => {
    for (const nome of [
      "Onda 01 - Trilha A",
      "Onda 01 — Contabilidades grandes",
      "Onda 02 - Trilha A",
      "Onda 03",
      "Onda 04 - Trilha B1",
      "Onda 10 - Trilha A",
      "Coleta 2026 · Contabilidades grandes (20+)",
      "Segunda onda 00 de testes", // "onda 00" no MEIO não é prefixo
      "Redonda 00",
    ]) {
      expect(ehCampanhaDeTeste(nome), `NÃO deveria ser teste: ${nome}`).toBe(false);
    }
  });

  it("nome vazio ou sem número não é teste — na dúvida, a campanha aparece", () => {
    // A assimetria do modo de falha manda o default ser "mostrar".
    for (const nome of ["", "   ", "Onda", "Onda A", "Onda00"]) {
      expect(ehCampanhaDeTeste(nome), `NÃO deveria ser teste: ${JSON.stringify(nome)}`).toBe(false);
    }
  });
});
