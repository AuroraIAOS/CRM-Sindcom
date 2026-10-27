// Exclusão de ciclo de boletos (SQL 34). Só no BENCH: cria e apaga de verdade.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteServico, ehProducao, loginComo } from "./helpers";
import { boletosDoCiclo, criarCicloESemear, limparMassaPossivel, semearMassa, type Massa } from "./fixtures/boletosDemo";

const bench = ehProducao() ? describe.skip : describe;

bench("BOLETOS — excluir ciclo (SQL 34)", () => {
  let admin: SupabaseClient;
  let secretaria: SupabaseClient;
  let massa: Massa;
  let ciclo = "";
  let boleto = "";

  beforeAll(async () => {
    admin = (await loginComo("admin")).client;
    secretaria = (await loginComo("secretaria")).client;
    massa = await semearMassa();
    ciclo = (await criarCicloESemear(admin, massa, "taf", [massa.convA])).cicloId;
    boleto = (await boletosDoCiclo(ciclo))[massa.estab.e1];
    const r = await secretaria.from("respostas_boleto").insert({ boleto_id: boleto, quantidade: 7, origem: "manual" });
    expect(r.error).toBeNull();
  });

  afterAll(async () => {
    await limparMassaPossivel(massa, [ciclo]);
  });

  it("secretaria não exclui (só Admin)", async () => {
    const { error } = await secretaria.rpc("fn_excluir_ciclo_boleto", { p_ciclo: ciclo });
    expect(error?.code).toBe("42501");
  });

  it("anônimo/DELETE direto continuam sem GRANT e a resposta segue imutável fora da função", async () => {
    const d = await admin.from("respostas_boleto").delete().eq("id", "00000000-0000-0000-0000-000000000000");
    expect(d.error?.code).toBe("42501");
    const u = await clienteServico().from("respostas_boleto").delete().eq("boleto_id", boleto);
    expect(u.error?.code).toBe("42501");
  });

  it("admin exclui o ciclo com boleto e resposta; nada sobra; as caixas ficam", async () => {
    const { data, error } = await admin.rpc("fn_excluir_ciclo_boleto", { p_ciclo: ciclo });
    expect(error).toBeNull();
    expect((data as any).respostas).toBe(1);
    const s = clienteServico();
    for (const [t, col] of [["ciclos_boleto", "id"], ["boletos", "ciclo_id"], ["ciclo_caixas", "ciclo_id"], ["ciclo_convencoes", "ciclo_id"]]) {
      const r = await s.from(t).select("*", { count: "exact", head: true }).eq(col, ciclo);
      expect(r.count, t).toBe(0);
    }
    const r = await s.from("respostas_boleto").select("*", { count: "exact", head: true }).eq("boleto_id", boleto);
    expect(r.count).toBe(0);
    const cx = await s.from("caixas_boleto").select("*", { count: "exact", head: true }).eq("email", massa.emailUm);
    expect(cx.count).toBe(1);
  });

  it("ciclo inexistente: 22023", async () => {
    const { error } = await admin.rpc("fn_excluir_ciclo_boleto", { p_ciclo: "00000000-0000-0000-0000-000000000000" });
    expect(error?.code).toBe("22023");
  });
});
