// ============================================================================
// boletos.spec.ts — RLS, GRANTs, triggers e RPCs do módulo BOLETOS (ETAPA 10 · SQL 33)
//
// Só roda no BENCH: o SQL 33 não está em produção, e o teste escreve de verdade
// (ciclos, boletos, respostas). Rode com SINDCOM_ALVO=bench.
//
// Os casos espelham o `teste33a.sql` (85 verificações dentro de uma transação com
// rollback) — aqui pela via que o app usa: PostgREST com a sessão de cada papel.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, clienteServico, ehProducao, loginComo, type Role } from "./helpers";
import { boletosDoCiclo, criarCicloESemear, limparMassaPossivel, semearMassa, type Massa } from "./fixtures/boletosDemo";

const bench = ehProducao() ? describe.skip : describe;

const c = {} as Record<Role, SupabaseClient>;
let massa: Massa;
let taf = "";
let ca = "";
const ciclosCriados: string[] = [];
let bol: Record<string, string> = {}; // estabelecimento_id → boleto (ciclo TAF)
let bolCa: Record<string, string> = {};
let b1 = "";
let b2 = "";
let b3 = "";
let b4 = "";
let caixaUm = "";

async function linhas(cli: SupabaseClient, tabela: string, filtro?: (q: any) => any) {
  let q = cli.from(tabela).select("*");
  if (filtro) q = filtro(q);
  const { data, error } = await q;
  return { data: (data ?? []) as Record<string, any>[], error };
}

async function boleto(id: string) {
  const { data, error } = await clienteServico().from("boletos").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

bench("BOLETOS — SQL 33", () => {
  beforeAll(async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico", "parceiro"] as Role[]) {
      c[p] = (await loginComo(p)).client;
    }
    massa = await semearMassa();
    const r = await criarCicloESemear(c.admin, massa, "taf", [massa.convA, massa.convB]);
    taf = r.cicloId;
    ciclosCriados.push(taf);
    bol = await boletosDoCiclo(taf);
    [b1, b2, b3, b4] = [bol[massa.estab.e1], bol[massa.estab.e2], bol[massa.estab.e3], bol[massa.estab.e4]];
    const cx = await clienteServico().from("caixas_boleto").select("id").eq("email", massa.emailUm).single();
    caixaUm = cx.data?.id as string;
  }, 120_000);

  afterAll(async () => {
    await limparMassaPossivel(massa ?? null, ciclosCriados);
  }, 60_000);

  // ------------------------------------------------------------------ semeadura
  describe("semeadura", () => {
    it("alvo 5, criados 5, sem e-mail 1, e-mail inválido 1 (baixada e CNAE fora ficam de fora)", async () => {
      const { data } = await c.admin.rpc("fn_semear_ciclo_boleto", { p_ciclo: taf });
      // a 1ª semeadura já aconteceu no beforeAll; esta é a 2ª (idempotente)
      expect(data).toMatchObject({ alvo: 5, criados: 0, ja_existiam: 5, sem_email: 1, email_invalido: 1 });
      expect(Object.keys(bol)).toHaveLength(5);
      expect(bol[massa.estab.e6]).toBeUndefined();
      expect(bol[massa.estab.e7]).toBeUndefined();
    });

    it("e-mail normalizado: e1 (maiúscula e espaços) e e2 dividem UMA caixa", async () => {
      const { data } = await clienteServico().from("boletos").select("caixa_id").in("id", [b1, b2]);
      expect(new Set((data ?? []).map((x) => x.caixa_id)).size).toBe(1);
      expect((data ?? [])[0].caixa_id).toBe(caixaUm);
    });

    it("sem e-mail e malformado ficam sem caixa", async () => {
      const { data } = await clienteServico().from("boletos").select("caixa_id").in("id", [b4, bol[massa.estab.e5]]);
      expect((data ?? []).every((x) => x.caixa_id === null)).toBe(true);
    });

    it("boleto nasce aguardando_dados, sem valor, com o vencimento do ciclo", async () => {
      const b = await boleto(b1);
      expect(b.estado).toBe("aguardando_dados");
      expect(b.valor).toBeNull();
      expect(b.vencimento).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------ matriz de leitura
  describe("matriz de leitura por papel", () => {
    const TABELAS = ["ciclos_boleto", "boletos", "caixas_boleto", "respostas_boleto", "v_boletos_status", "v_boletos_caixas", "v_ciclos_funil"];

    it.each(["admin", "secretaria", "presidente"] as Role[])("%s lê o acompanhamento", async (papel) => {
      for (const t of TABELAS) {
        const { data, error } = await linhas(c[papel], t);
        expect(error, `${papel} → ${t}`).toBeNull();
        if (t !== "respostas_boleto") expect(data.length, `${papel} → ${t}`).toBeGreaterThan(0);
      }
    });

    it.each(["juridico", "parceiro"] as Role[])("%s não vê nenhuma linha de boletos", async (papel) => {
      for (const t of [...TABELAS, "tokens_boleto", "v_boletos_links", "v_boletos_envio"]) {
        const { data } = await linhas(c[papel], t);
        expect(data.length, `${papel} → ${t}`).toBe(0);
      }
    });

    it.each(["admin", "secretaria"] as Role[])("%s lê token e links", async (papel) => {
      expect((await linhas(c[papel], "tokens_boleto")).data.length).toBeGreaterThan(0);
      expect((await linhas(c[papel], "v_boletos_links")).data.length).toBeGreaterThan(0);
      expect((await linhas(c[papel], "v_boletos_envio")).data.length).toBeGreaterThan(0);
    });

    it("Presidente NUNCA vê token: tokens_boleto, v_boletos_links e v_boletos_envio vazios", async () => {
      for (const t of ["tokens_boleto", "v_boletos_links", "v_boletos_envio"]) {
        expect((await linhas(c.presidente, t)).data, t).toHaveLength(0);
      }
    });

    it("anônimo: 42501 (GRANT) em toda tabela e view do módulo, não só conjunto vazio", async () => {
      const todas = [...TABELAS, "tokens_boleto", "ciclo_caixas", "ciclo_convencoes", "tentativas_boleto", "v_boletos_links", "v_boletos_envio", "v_ciclos_sem_valor_base"];
      for (const t of todas) {
        const { error } = await clienteAnon().from(t).select("*").limit(1);
        expect(error?.code, t).toBe("42501");
      }
    });

    it("tentativas_boleto não tem GRANT para ninguém logado (só a Edge Function)", async () => {
      for (const p of ["admin", "secretaria", "presidente"] as Role[]) {
        const { error } = await c[p].from("tentativas_boleto").select("*").limit(1);
        expect(error?.code, p).toBe("42501");
      }
    });
  });

  // ------------------------------------------------------------------ cálculo TAF
  describe("TAF: valor-base × quantidade, calculado no banco", () => {
    it("10 trabalhadores × 12,50 = 125,00; estado vira fazer", async () => {
      const { error } = await c.secretaria.from("respostas_boleto").insert({ boleto_id: b1, quantidade: 10, origem: "manual" });
      expect(error).toBeNull();
      const b = await boleto(b1);
      expect(b).toMatchObject({ estado: "fazer", quantidade: 10 });
      expect(Number(b.valor)).toBe(125);
      expect(Number(b.valor_base)).toBe(12.5);
      expect(b.dados_recebidos_em).not.toBeNull();
    });

    it("quantidade 0 → valor 0,00 (não NULL) e estado fazer", async () => {
      await c.secretaria.from("respostas_boleto").insert({ boleto_id: b2, quantidade: 0, origem: "manual" });
      const b = await boleto(b2);
      expect(b.estado).toBe("fazer");
      expect(Number(b.valor)).toBe(0);
    });

    it("reenvio vale a última resposta (20 × 12,50 = 250,00) e cria nova linha", async () => {
      await c.secretaria.from("respostas_boleto").insert({ boleto_id: b1, quantidade: 20, origem: "manual" });
      expect(Number((await boleto(b1)).valor)).toBe(250);
      const { data } = await clienteServico().from("respostas_boleto").select("id").eq("boleto_id", b1);
      expect(data).toHaveLength(2);
    });

    it("convenção SEM valor-base: valor e valor_base NULL (nunca padrão nem teto) e a view acende sem_valor_base", async () => {
      await c.secretaria.from("respostas_boleto").insert({ boleto_id: b3, quantidade: 5, origem: "manual" });
      const b = await boleto(b3);
      expect(b.valor).toBeNull();
      expect(b.valor_base).toBeNull();
      const v = await linhas(c.admin, "v_boletos_status", (q) => q.eq("boleto_id", b3));
      expect(v.data[0].sem_valor_base).toBe(true);
      const ok1 = await linhas(c.admin, "v_boletos_status", (q) => q.eq("boleto_id", b1));
      expect(ok1.data[0].sem_valor_base).toBe(false);
      const sb = await linhas(c.admin, "v_ciclos_sem_valor_base", (q) => q.eq("ciclo_id", taf));
      expect(sb.data.map((x) => x.convencao_id)).toEqual([massa.convB]);
    });

    it("edição direta de valor em TAF é revertida (o banco calcula)", async () => {
      await c.admin.from("boletos").update({ valor: 999 }).eq("id", b1);
      expect(Number((await boleto(b1)).valor)).toBe(250);
    });

    it("mudar a taxa NÃO recalcula sozinho; 'recalcular' refaz só aguardando/fazer com quantidade", async () => {
      const s = clienteServico();
      await s.from("taxas_convencao").update({ valor: 15 }).eq("convencao_id", massa.convA).eq("tipo_boleto", "taf");
      await s.from("taxas_convencao").insert({ convencao_id: massa.convB, nome: "DEMO TAF", valor: 8, tipo_boleto: "taf" });
      expect(Number((await boleto(b1)).valor)).toBe(250);
      const { data, error } = await c.secretaria.rpc("fn_recalcular_valores_ciclo_boleto", { p_ciclo: taf });
      expect(error).toBeNull();
      expect(data).toBe(3);
      expect(Number((await boleto(b1)).valor)).toBe(300);
      expect(Number((await boleto(b3)).valor)).toBe(40);
      expect(Number((await boleto(b2)).valor)).toBe(0);
    });
  });

  // ------------------------------------------------------------------ GRANTs de coluna
  describe("GRANTs de coluna e RLS de escrita", () => {
    it.each([
      ["quantidade", { quantidade: 99 }],
      ["convencao_id", { convencao_id: "00000000-0000-0000-0000-000000000000" }],
      ["pago_em", { pago_em: new Date().toISOString() }],
      ["estabelecimento_id", { estabelecimento_id: "00000000-0000-0000-0000-000000000000" }],
    ])("UPDATE boletos.%s negado (42501) até para Admin", async (_n, patch) => {
      const { error } = await c.admin.from("boletos").update(patch).eq("id", b1);
      expect(error?.code).toBe("42501");
    });

    it("resposta com origem 'link' por usuário logado é recusada (só a Edge Function grava 'link')", async () => {
      const { error } = await c.admin.from("respostas_boleto").insert({ boleto_id: b1, quantidade: 1, origem: "link" });
      expect(error?.code).toBe("42501");
    });

    it("INSERT em tokens_boleto e UPDATE no tipo do ciclo: negados", async () => {
      const t = await c.admin.from("tokens_boleto").insert({ caixa_id: caixaUm });
      expect(t.error?.code).toBe("42501");
      const u = await c.admin.from("ciclos_boleto").update({ tipo: "ca" }).eq("id", taf);
      expect(u.error?.code).toBe("42501");
    });

    it("DELETE em boletos, respostas e tokens: sem GRANT", async () => {
      for (const [t, col] of [["boletos", "id"], ["respostas_boleto", "id"], ["tokens_boleto", "caixa_id"], ["caixas_boleto", "id"]]) {
        const { error } = await c.admin.from(t).delete().eq(col, "00000000-0000-0000-0000-000000000000");
        expect(error?.code, t).toBe("42501");
      }
    });

    it("valor negativo recusado pelo CHECK (testado em CA, onde a edição de valor vale)", async () => {
      const r = await criarCicloESemear(c.admin, massa, "ca", [massa.convA]);
      ca = r.cicloId;
      ciclosCriados.push(ca);
      bolCa = await boletosDoCiclo(ca);
      const { error } = await c.admin.from("boletos").update({ valor: -5 }).eq("id", bolCa[massa.estab.e2]);
      expect(error?.code).toBe("23514");
    });
  });

  // ------------------------------------------------------------------ máquina de estados
  describe("máquina de estados", () => {
    const estado = async (id: string, patch: Record<string, unknown>) =>
      (await c.secretaria.from("boletos").update(patch).eq("id", id)).error;

    it("salto fazer → enviado recusado (22023)", async () => {
      expect((await estado(b1, { estado: "enviado" }))?.code).toBe("22023");
    });
    it("sem quantidade não sai de aguardando_dados", async () => {
      expect((await estado(b4, { estado: "fazer" }))?.code).toBe("22023");
    });
    it("cancelar sem motivo recusado; com motivo funciona; cancelado → pago recusado; reativar limpa o motivo", async () => {
      expect((await estado(b4, { estado: "cancelado" }))?.code).toBe("22023");
      expect(await estado(b4, { estado: "cancelado", motivo_cancelamento: "DEMO — empresa fechou" })).toBeNull();
      expect((await boleto(b4)).estado).toBe("cancelado");
      expect((await estado(b4, { estado: "pago" }))?.code).toBe("22023");
      expect(await estado(b4, { estado: "aguardando_dados" })).toBeNull();
      const b = await boleto(b4);
      expect(b.estado).toBe("aguardando_dados");
      expect(b.motivo_cancelamento).toBeNull();
    });

    it("fazer → enviar carimba boleto_feito_em e CONGELA o valor", async () => {
      expect(await estado(b1, { estado: "enviar" })).toBeNull();
      const b = await boleto(b1);
      expect(b.boleto_feito_em).not.toBeNull();
      await c.admin.from("boletos").update({ valor: 1 }).eq("id", b1);
      expect(Number((await boleto(b1)).valor)).toBe(300);
    });

    it("resposta em boleto que já foi feito é recusada (22023)", async () => {
      const { error } = await c.secretaria.from("respostas_boleto").insert({ boleto_id: b1, quantidade: 3, origem: "manual" });
      expect(error?.code).toBe("22023");
    });

    it("voltar um passo limpa o carimbo; enviado carimba boleto_enviado_em", async () => {
      expect(await estado(b1, { estado: "fazer" })).toBeNull();
      expect((await boleto(b1)).boleto_feito_em).toBeNull();
      expect(await estado(b1, { estado: "enviar" })).toBeNull();
      expect(await estado(b1, { estado: "enviado", numero_boleto: "DEMO-0001" })).toBeNull();
      expect((await boleto(b1)).boleto_enviado_em).not.toBeNull();
    });

    it("enviado + vencimento passado → tag 'atrasado' na view (o estado segue 'enviado')", async () => {
      const ontem = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
      expect(await estado(b1, { vencimento: ontem })).toBeNull();
      const v = await linhas(c.admin, "v_boletos_status", (q) => q.eq("boleto_id", b1));
      expect(v.data[0]).toMatchObject({ estado: "enviado", tag: "atrasado" });
      const f = await linhas(c.admin, "v_ciclos_funil", (q) => q.eq("ciclo_id", taf));
      expect(f.data[0].atrasado).toBe(1);
    });

    it("pago carimba pago_em e some do atrasado; pago não cancela; voltar para enviado limpa pago_em", async () => {
      expect(await estado(b1, { estado: "pago" })).toBeNull();
      const b = await boleto(b1);
      expect(b.pago_em).not.toBeNull();
      const v = await linhas(c.admin, "v_boletos_status", (q) => q.eq("boleto_id", b1));
      expect(v.data[0].tag).toBe("pago");
      expect((await estado(b1, { estado: "cancelado", motivo_cancelamento: "x" }))?.code).toBe("22023");
      expect(await estado(b1, { estado: "enviado" })).toBeNull();
      expect((await boleto(b1)).pago_em).toBeNull();
    });
  });

  // ------------------------------------------------------------------ imutabilidade
  describe("respostas são imutáveis", () => {
    it("UPDATE e DELETE por Admin: negados no GRANT (42501)", async () => {
      const u = await c.admin.from("respostas_boleto").update({ quantidade: 1 }).eq("boleto_id", b1);
      expect(u.error?.code).toBe("42501");
      const d = await c.admin.from("respostas_boleto").delete().eq("boleto_id", b1);
      expect(d.error?.code).toBe("42501");
    });

    it("mesmo a service_role é barrada pelo trigger (42501), em UPDATE e DELETE", async () => {
      const s = clienteServico();
      const u = await s.from("respostas_boleto").update({ quantidade: 1 }).eq("boleto_id", b1);
      expect(u.error?.code).toBe("42501");
      const d = await s.from("respostas_boleto").delete().eq("boleto_id", b1);
      expect(d.error?.code).toBe("42501");
      const { data } = await s.from("respostas_boleto").select("id").eq("boleto_id", b1);
      expect((data ?? []).length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------ CA / CN
  describe("CA: o operador digita o valor", () => {
    it("resposta move para fazer, mas valor fica NULL; a view acende sem_valor (e não sem_valor_base)", async () => {
      const id = bolCa[massa.estab.e1];
      await c.secretaria.from("respostas_boleto").insert({ boleto_id: id, quantidade: 7, origem: "manual" });
      const b = await boleto(id);
      expect(b).toMatchObject({ estado: "fazer", quantidade: 7, valor: null, valor_base: null });
      const v = await linhas(c.admin, "v_boletos_status", (q) => q.eq("boleto_id", id));
      expect(v.data[0]).toMatchObject({ sem_valor: true, sem_valor_base: false, valor_manual: true });
    });

    it("valor digitado fica, recálculo em lote não toca (0), e congela em enviar", async () => {
      const id = bolCa[massa.estab.e1];
      expect((await c.secretaria.from("boletos").update({ valor: 345.67 }).eq("id", id)).error).toBeNull();
      expect(Number((await boleto(id)).valor)).toBe(345.67);
      const r = await c.secretaria.rpc("fn_recalcular_valores_ciclo_boleto", { p_ciclo: ca });
      expect(r.data).toBe(0);
      expect(Number((await boleto(id)).valor)).toBe(345.67);
      await c.secretaria.from("boletos").update({ estado: "enviar" }).eq("id", id);
      await c.secretaria.from("boletos").update({ valor: 1 }).eq("id", id);
      expect(Number((await boleto(id)).valor)).toBe(345.67);
    });

    it("2º ciclo reaproveita as caixas (o e-mail é a chave)", async () => {
      const { data } = await clienteServico().from("caixas_boleto").select("id").like("email", `%.${massa.sufixo}@exemplo.invalido`);
      expect(data).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------ Presidente só lê
  describe("Presidente lê o acompanhamento e não escreve", () => {
    it("UPDATE em boletos afeta 0 linhas (RLS), nada muda", async () => {
      const { data } = await c.presidente.from("boletos").update({ numero_boleto: "HACK" }).eq("id", b4).select("id");
      expect(data ?? []).toHaveLength(0);
      expect((await boleto(b4)).numero_boleto).toBeNull();
    });

    it("RPCs de escrita recusadas (42501); criar ciclo recusado", async () => {
      for (const [fn, arg] of [
        ["fn_semear_ciclo_boleto", { p_ciclo: taf }],
        ["fn_recalcular_valores_ciclo_boleto", { p_ciclo: taf }],
        ["fn_reemitir_token_boleto", { p_caixa: caixaUm }],
        ["fn_renovar_token_boleto", { p_caixa: caixaUm }],
      ] as const) {
        const { error } = await c.presidente.rpc(fn, arg);
        expect(error?.code, fn).toBe("42501");
      }
      const { error } = await c.presidente.from("ciclos_boleto").insert({ nome: "DEMO — BOL x", tipo: "cn", data_vencimento: "2030-01-01" });
      expect(error?.code).toBe("42501");
    });
  });

  describe("Jurídico e Parceiro: RPCs recusadas", () => {
    it.each(["juridico", "parceiro"] as Role[])("%s", async (papel) => {
      const { error } = await c[papel].rpc("fn_reemitir_token_boleto", { p_caixa: caixaUm });
      expect(error?.code).toBe("42501");
      const e2 = await c[papel].rpc("fn_semear_ciclo_boleto", { p_ciclo: taf });
      expect(e2.error?.code).toBe("42501");
    });
  });

  describe("anônimo: RPCs recusadas", () => {
    it("as 4 RPCs devolvem 42501", async () => {
      for (const [fn, arg] of [
        ["fn_semear_ciclo_boleto", { p_ciclo: taf }],
        ["fn_recalcular_valores_ciclo_boleto", { p_ciclo: taf }],
        ["fn_reemitir_token_boleto", { p_caixa: caixaUm }],
        ["fn_renovar_token_boleto", { p_caixa: caixaUm }],
      ] as const) {
        const { error } = await clienteAnon().rpc(fn, arg);
        expect(error?.code, fn).toBe("42501");
      }
    });
  });

  // ------------------------------------------------------------------ token permanente
  describe("token permanente", () => {
    let tokenAntes = "";
    const tokenDe = async () =>
      (await clienteServico().from("tokens_boleto").select("token, token_expira_em").eq("caixa_id", caixaUm).single()).data as {
        token: string;
        token_expira_em: string;
      };

    it("encerrar o ciclo NÃO revoga o token; resposta e semeadura em ciclo encerrado são recusadas", async () => {
      tokenAntes = (await tokenDe()).token;
      expect((await c.secretaria.from("ciclos_boleto").update({ encerrado_em: new Date().toISOString() }).eq("id", taf)).error).toBeNull();
      expect((await tokenDe()).token).toBe(tokenAntes);
      const r = await c.secretaria.from("respostas_boleto").insert({ boleto_id: b2, quantidade: 4, origem: "manual" });
      expect(r.error?.code).toBe("22023");
      const s = await c.secretaria.rpc("fn_semear_ciclo_boleto", { p_ciclo: taf });
      expect(s.error?.code).toBe("22023");
    });

    it("reemitir: token novo, antigo some, brevo_pendente acende e apaga com 'Brevo atualizada'", async () => {
      expect((await c.secretaria.rpc("fn_reemitir_token_boleto", { p_caixa: caixaUm })).error).toBeNull();
      const novo = (await tokenDe()).token;
      expect(novo).not.toBe(tokenAntes);
      const velho = await clienteServico().from("tokens_boleto").select("caixa_id").eq("token", tokenAntes);
      expect(velho.data).toHaveLength(0);

      const cx = await linhas(c.admin, "v_boletos_caixas", (q) => q.eq("caixa_id", caixaUm).eq("ciclo_id", ca));
      expect(cx.data[0].brevo_pendente).toBe(true);
      const lk = await linhas(c.admin, "v_boletos_links", (q) => q.eq("caixa_id", caixaUm));
      expect(lk.data[0].brevo_pendente).toBe(true);

      expect((await c.secretaria.from("caixas_boleto").update({ brevo_atualizada_em: new Date().toISOString() }).eq("id", caixaUm)).error).toBeNull();
      const dp = await linhas(c.admin, "v_boletos_caixas", (q) => q.eq("caixa_id", caixaUm).eq("ciclo_id", ca));
      expect(dp.data[0].brevo_pendente).toBe(false);
    });

    it("a auditoria registra a troca SEM nenhum token (antigo ou novo)", async () => {
      const novo = (await tokenDe()).token;
      const { data } = await clienteServico().from("auditoria").select("*").eq("tabela", "tokens_boleto").eq("registro_id", caixaUm);
      const linhasAud = data ?? [];
      expect(linhasAud.some((a) => (a.dados_depois as any)?.acao === "token_reemitido")).toBe(true);
      const texto = JSON.stringify(linhasAud);
      expect(texto).not.toContain(tokenAntes);
      expect(texto).not.toContain(novo);
      const geral = await clienteServico().from("auditoria").select("dados_antes, dados_depois").in("tabela", ["caixas_boleto", "boletos", "tokens_boleto"]);
      const t2 = JSON.stringify(geral.data ?? []);
      expect(t2).not.toContain(tokenAntes);
      expect(t2).not.toContain(novo);
    });

    it("renovar estende a validade sem trocar o token; expira_em_breve acende a 10 dias e apaga", async () => {
      const s = clienteServico();
      const antes = (await tokenDe()).token;
      await s.from("tokens_boleto").update({ token_expira_em: new Date(Date.now() + 10 * 86400_000).toISOString() }).eq("caixa_id", caixaUm);
      let lk = await linhas(c.admin, "v_boletos_links", (q) => q.eq("caixa_id", caixaUm));
      expect(lk.data[0].expira_em_breve).toBe(true);
      expect((await c.secretaria.rpc("fn_renovar_token_boleto", { p_caixa: caixaUm })).error).toBeNull();
      lk = await linhas(c.admin, "v_boletos_links", (q) => q.eq("caixa_id", caixaUm));
      expect(lk.data[0].token).toBe(antes);
      expect(lk.data[0].expira_em_breve).toBe(false);
      expect(new Date(lk.data[0].token_expira_em).getTime()).toBeGreaterThan(Date.now() + 700 * 86400_000);
    });
  });
});
