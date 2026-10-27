import { describe, expect, it } from "vitest";
import { ROTULO_TIPO, TAG, PROXIMO_ESTADO, ESTADO_ANTERIOR, rotuloTipo } from "@/features/boletos/rotulos";
import { gerarCsvEmails } from "@/features/boletos/csvEmails";

describe("rótulos por tipo de boleto", () => {
  it("diz o que cada tipo pergunta à empresa", () => {
    expect(ROTULO_TIPO.taf.campo).toBe("trabalhadores que irão trabalhar no feriado");
    expect(ROTULO_TIPO.ca.campo).toBe("não-opositores (anual)");
    expect(ROTULO_TIPO.cn.campo).toBe("não-opositores (mensal)");
    expect(ROTULO_TIPO.pamed.campo).toBe("total de trabalhadores");
  });

  it("só TAF e PAMED têm valor calculado pelo banco", () => {
    expect(Object.entries(ROTULO_TIPO).filter(([, v]) => v.calculado).map(([k]) => k).sort()).toEqual(["pamed", "taf"]);
  });

  it("rotuloTipo devolve a sigla e tolera valor desconhecido", () => {
    expect(rotuloTipo("pamed")).toBe("PAMED");
    expect(rotuloTipo("xyz")).toBe("xyz");
    expect(rotuloTipo(null)).toBe("—");
  });

  it("atrasado tem tom de erro e pago de ok", () => {
    expect(TAG.atrasado.tom).toBe("erro");
    expect(TAG.pago.tom).toBe("ok");
  });

  it("a máquina avança e volta um passo por vez", () => {
    expect(PROXIMO_ESTADO.fazer).toBe("enviar");
    expect(PROXIMO_ESTADO.pago).toBeUndefined();
    expect(ESTADO_ANTERIOR.enviado).toBe("enviar");
    expect(ESTADO_ANTERIOR.fazer).toBeUndefined();
  });
});

describe("CSV da lista de e-mails", () => {
  const base = { nome: "Contab Ltda", email: "a@b.com", link: "https://x/responder/1", convencoes: "CCT A", nCnpj: 3 };

  it("tem cabeçalho fixo e ponto e vírgula", () => {
    const [cab, linha] = gerarCsvEmails([base]).split("\r\n");
    expect(cab).toBe('"nome";"email";"link";"convencoes";"n_cnpj"');
    expect(linha).toBe('"Contab Ltda";"a@b.com";"https://x/responder/1";"CCT A";"3"');
  });

  it("neutraliza fórmula no início de qualquer campo de texto", () => {
    for (const c of ["=1+1", "+1", "-1", "@SOMA(A1)"]) {
      const csv = gerarCsvEmails([{ ...base, nome: c }]);
      expect(csv).toContain(`"'${c}"`);
    }
  });

  it("escapa aspas e preserva vírgula e ponto e vírgula dentro do campo", () => {
    const csv = gerarCsvEmails([{ ...base, nome: 'Casa "Bela", Ltda; filial' }]);
    expect(csv).toContain('"Casa ""Bela"", Ltda; filial"');
  });

  it("lista vazia gera só o cabeçalho", () => {
    expect(gerarCsvEmails([])).toBe("");
  });
});
