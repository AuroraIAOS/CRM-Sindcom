import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, type Role } from "./helpers";

/**
 * Subetapa 02.4 — faturas excepcionais + guias de pagamento.
 * `faturas`/`repasses` já têm RLS full-CRUD para admin/secretaria (sql/03_rls.sql
 * §12) — cobrimos aqui o que é NOVO desta subetapa: unicidade traduzida como
 * erro amigável (mensagemErro pega o P0001/23505 genérico do banco, então o
 * teste confirma o SQLSTATE, não o texto exato da UI), presidente sem escrita,
 * e a conciliação guia × Σ faturas.
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
let titularId: string;

const faturasParaLimpar: string[] = [];
const repassesParaLimpar: string[] = [];

function cpfFicticio(): string {
  return String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
}

beforeAll(async () => {
  for (const p of ["admin", "secretaria", "presidente"] as Role[]) {
    const { client } = await loginComo(p);
    clientes[p] = client;
  }

  const { data: t, error } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf: cpfFicticio(),
      nome: "02.4 teste — titular",
      recolhe_contribuicao_sindical: true,
      recolhe_mensalidade_convenio: true,
      status_cadastro: "aprovado",
    })
    .select("id")
    .single();
  if (error) throw new Error(`criar trabalhador: ${error.message}`);
  titularId = t!.id as string;
});

afterAll(async () => {
  for (const id of faturasParaLimpar) {
    await clientes.admin.from("faturas").delete().eq("id", id);
  }
  for (const id of repassesParaLimpar) {
    await clientes.admin.from("repasses").delete().eq("id", id);
  }
  if (titularId) await clientes.admin.from("trabalhadores").delete().eq("id", titularId);
});

// ---------------------------------------------------------------------------
describe("Faturas excepcionais", () => {
  it("secretária cria multa/acordo/taxa_adicional direto (sem fila-admin)", async () => {
    const { data, error } = await clientes.secretaria
      .from("faturas")
      .insert({
        trabalhador_id: titularId,
        tipo: "multa",
        competencia: "2026-07-01",
        valor: 150,
        forma_cobranca: "holerite",
      })
      .select("id, status")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.status).toBe("aberta");
    faturasParaLimpar.push(data!.id as string);
  });

  it("unicidade (trabalhador_id, tipo, competencia) é respeitada", async () => {
    const payload = {
      trabalhador_id: titularId,
      tipo: "acordo" as const,
      competencia: "2026-08-01",
      valor: 80,
      forma_cobranca: "holerite" as const,
    };
    const { data: primeira, error: e1 } = await clientes.secretaria
      .from("faturas")
      .insert(payload)
      .select("id")
      .single();
    expect(e1, e1?.message).toBeNull();
    faturasParaLimpar.push(primeira!.id as string);

    const { error: e2 } = await clientes.secretaria.from("faturas").insert(payload);
    expect(e2).toBeTruthy();
    expect(e2!.code).toBe("23505");
  });

  it("baixa manual: marcar como paga carimba data_pagamento e origem_baixa", async () => {
    const { data: fatura } = await clientes.secretaria
      .from("faturas")
      .insert({
        trabalhador_id: titularId,
        tipo: "taxa_adicional",
        competencia: "2026-09-01",
        valor: 40,
        forma_cobranca: "holerite",
      })
      .select("id")
      .single();
    faturasParaLimpar.push(fatura!.id as string);

    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await clientes.secretaria
      .from("faturas")
      .update({ status: "paga", data_pagamento: hoje, origem_baixa: "manual" })
      .eq("id", fatura!.id);
    expect(error, error?.message).toBeNull();

    const { data: linha } = await clientes.admin
      .from("faturas")
      .select("status, data_pagamento, origem_baixa")
      .eq("id", fatura!.id)
      .single();
    expect(linha!.status).toBe("paga");
    expect(linha!.data_pagamento).toBe(hoje);
    expect(linha!.origem_baixa).toBe("manual");
  });

  it("presidente não insere (RLS 42501) mas lê", async () => {
    const { error } = await clientes.presidente.from("faturas").insert({
      trabalhador_id: titularId,
      tipo: "multa",
      competencia: "2026-10-01",
      valor: 10,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe("42501");

    const { error: erroLeitura } = await clientes.presidente
      .from("faturas")
      .select("id", { count: "exact", head: true });
    expect(erroLeitura).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Guias de pagamento — conciliação", () => {
  it("Σ faturas vinculadas bate com o valor_total da guia", async () => {
    const { data: empresa } = await clientes.admin.from("empresas").select("cnpj_basico").limit(1).maybeSingle();
    if (!empresa) {
      // Base de teste sem empresas semeadas — não é o alvo deste teste.
      return;
    }

    const { data: repasse, error: erroRepasse } = await clientes.secretaria
      .from("repasses")
      .insert({
        cnpj_basico: empresa.cnpj_basico,
        tipo: "multa",
        competencia: "2026-11-01",
        valor_total: 100,
      })
      .select("id")
      .single();
    expect(erroRepasse, erroRepasse?.message).toBeNull();
    repassesParaLimpar.push(repasse!.id as string);

    const { data: f1 } = await clientes.secretaria
      .from("faturas")
      .insert({
        trabalhador_id: titularId,
        tipo: "multa",
        competencia: "2026-11-02",
        valor: 60,
        repasse_id: repasse!.id,
      })
      .select("id")
      .single();
    faturasParaLimpar.push(f1!.id as string);

    const { data: f2 } = await clientes.secretaria
      .from("faturas")
      .insert({
        trabalhador_id: titularId,
        tipo: "acordo",
        competencia: "2026-11-03",
        valor: 40,
        repasse_id: repasse!.id,
      })
      .select("id")
      .single();
    faturasParaLimpar.push(f2!.id as string);

    const { data: vinculadas } = await clientes.admin
      .from("faturas")
      .select("valor")
      .eq("repasse_id", repasse!.id);
    const soma = (vinculadas ?? []).reduce((acc, f) => acc + Number(f.valor), 0);
    expect(soma).toBe(100);
  });

  it("ciclo previsto → enviado → recebido; recebido carimba recebido_em", async () => {
    const { data: empresa } = await clientes.admin.from("empresas").select("cnpj_basico").limit(1).maybeSingle();
    if (!empresa) return;

    const { data: repasse } = await clientes.secretaria
      .from("repasses")
      .insert({ cnpj_basico: empresa.cnpj_basico, tipo: "acordo", competencia: "2026-12-01", valor_total: 10 })
      .select("id, status")
      .single();
    repassesParaLimpar.push(repasse!.id as string);
    expect(repasse!.status).toBe("previsto");

    await clientes.secretaria.from("repasses").update({ status: "enviado" }).eq("id", repasse!.id);
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await clientes.secretaria
      .from("repasses")
      .update({ status: "recebido", recebido_em: hoje })
      .eq("id", repasse!.id);
    expect(error, error?.message).toBeNull();

    const { data: linha } = await clientes.admin
      .from("repasses")
      .select("status, recebido_em")
      .eq("id", repasse!.id)
      .single();
    expect(linha!.status).toBe("recebido");
    expect(linha!.recebido_em).toBe(hoje);
  });
});
