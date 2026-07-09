import { describe, it, expect } from "vitest";
import { homeDoRole, podeAcessar, NAV } from "@/app/nav";
import type { PapelUsuario } from "@/lib/supabase";

/**
 * Valida a lógica de redirecionamento pós-login e a matriz de acesso do menu
 * (frontend.md §2.2). É a contraparte "de UI" do portão da Fase 0: prova que
 * cada papel cai na sua home e enxerga apenas as rotas permitidas.
 */

describe("homeDoRole — redirecionamento pós-login por papel", () => {
  const casos: Array<[PapelUsuario, string]> = [
    ["admin", "/dashboard"],
    ["presidente", "/dashboard"],
    ["secretaria", "/dashboard"],
    ["juridico", "/juridico"],
    ["parceiro", "/portal"],
  ];
  it.each(casos)("%s → %s", (role, destino) => {
    expect(homeDoRole(role)).toBe(destino);
  });

  it("sem papel (null) cai no dashboard como padrão seguro", () => {
    expect(homeDoRole(null)).toBe("/dashboard");
  });
});

describe("NAV — visibilidade de rotas por papel", () => {
  it("parceiro vê o portal (+ fila-admin/notificações), nunca telas internas", () => {
    const doParceiro = NAV.filter((i) => i.roles.includes("parceiro"));
    // Vê as 3 telas do portal.
    expect(doParceiro.filter((i) => i.grupo === "portal").map((i) => i.path)).toEqual(
      expect.arrayContaining(["/portal", "/portal/beneficios", "/portal/recepcionistas"]),
    );
    // NUNCA vê telas de negócio internas (cadastros, financeiro).
    expect(doParceiro.some((i) => i.grupo === "principal" || i.grupo === "financeiro")).toBe(false);
    // As rotas fora do portal que ele vê são apenas as "de todos".
    const foraPortal = doParceiro.filter((i) => i.grupo !== "portal").map((i) => i.path);
    expect(foraPortal.sort()).toEqual(["/fila-admin", "/notificacoes"]);
  });

  it("a home de cada papel está entre as rotas que ele pode acessar", () => {
    const papeis: PapelUsuario[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
    for (const role of papeis) {
      const home = homeDoRole(role);
      const item = NAV.find((i) => i.path === home);
      expect(item, `home ${home} de ${role} deve existir no NAV`).toBeDefined();
      expect(podeAcessar(role, item!.roles), `${role} deve acessar sua home`).toBe(true);
    }
  });

  it("rotas exclusivas do admin (importação, configurações) são negadas aos demais", () => {
    const soAdmin = NAV.filter((i) => i.roles.length === 1 && i.roles[0] === "admin");
    expect(soAdmin.map((i) => i.path)).toEqual(expect.arrayContaining(["/importacao", "/configuracoes"]));
    for (const item of soAdmin) {
      expect(podeAcessar("secretaria", item.roles)).toBe(false);
      expect(podeAcessar("presidente", item.roles)).toBe(false);
    }
  });

  it("nenhum papel do menu inclui anon (null nunca acessa)", () => {
    for (const item of NAV) {
      expect(podeAcessar(null, item.roles)).toBe(false);
    }
  });
});
