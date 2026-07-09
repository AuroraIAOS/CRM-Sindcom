import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loginComo,
  clienteAnon,
  ehErroRls,
  ehErroConstraintOuTrigger,
  type Role,
} from "./helpers";

/**
 * Suíte de RLS — 6 atores (5 papéis + anon) × matriz de permissões (03_rls.sql).
 * Técnica: INSERT negado => SQLSTATE 42501; INSERT permitido-mas-inválido =>
 * erro de constraint/trigger (RLS passou). SELECT usa dados já semeados
 * (municipios=5570, perfis=5, parceiros=1). Nada persiste (exceto o fluxo
 * self-service de solicitacoes_admin, com limpeza via admin).
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
const uids: Record<Role, string> = {} as never;
let anon: SupabaseClient;
let anaParceiroId: string;
const paraLimpar: string[] = []; // ids de solicitacoes_admin

async function count(c: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await c.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`count(${table}) erro inesperado: ${error.message}`);
  return count ?? 0;
}

async function insertErr(c: SupabaseClient, table: string, payload: Record<string, unknown>) {
  const { error } = await c.from(table).insert(payload);
  return error;
}

beforeAll(async () => {
  const papeis: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
  for (const p of papeis) {
    const { client, uid } = await loginComo(p);
    clientes[p] = client;
    uids[p] = uid;
  }
  anon = clienteAnon();

  const { data, error } = await clientes.admin.from("parceiros").select("id").limit(1).single();
  if (error) throw new Error(`Não obteve parceiro de teste: ${error.message}`);
  anaParceiroId = data.id as string;
});

afterAll(async () => {
  for (const id of paraLimpar) {
    await clientes.admin.from("notificacoes").delete().eq("referencia_tabela", "solicitacoes_admin").eq("referencia_id", id);
    await clientes.admin.from("solicitacoes_admin").delete().eq("id", id);
  }
});

// ---------------------------------------------------------------------------
describe("SELECT — visibilidade por papel (dados semeados)", () => {
  it("municipios: 5 papéis veem 5.570; anon vê 0", async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico", "parceiro"] as Role[]) {
      expect(await count(clientes[p], "municipios"), `municipios/${p}`).toBe(5570);
    }
    expect(await count(anon, "municipios"), "municipios/anon").toBe(0);
  });

  it("perfis: admin vê todos (5); demais veem só o próprio (1); anon 0", async () => {
    expect(await count(clientes.admin, "perfis")).toBe(5);
    for (const p of ["presidente", "secretaria", "juridico", "parceiro"] as Role[]) {
      expect(await count(clientes[p], "perfis"), `perfis/${p}`).toBe(1);
    }
    expect(await count(anon, "perfis")).toBe(0);
  });

  it("parceiros: admin/presidente/secretaria e o próprio parceiro veem; jurídico e anon não", async () => {
    for (const p of ["admin", "presidente", "secretaria", "parceiro"] as Role[]) {
      expect(await count(clientes[p], "parceiros"), `parceiros/${p}`).toBe(1);
    }
    expect(await count(clientes.juridico, "parceiros"), "parceiros/juridico").toBe(0);
    expect(await count(anon, "parceiros"), "parceiros/anon").toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("Secretária — CRU (baixa): sem INSERT nas tabelas de cadastro", () => {
  it("INSERT negado (42501) em trabalhadores/empresas/parceiros/recepcionistas/beneficios/beneficiados/estabelecimentos", async () => {
    const c = clientes.secretaria;
    expect(ehErroRls(await insertErr(c, "trabalhadores", { cpf: "00000000000", nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "empresas", { cnpj_basico: "00000000", razao_social: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "parceiros", { nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "recepcionistas", { parceiro_id: anaParceiroId, nome: "RLS", pin_hash: "x" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "beneficios", { parceiro_id: anaParceiroId, nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "beneficiados", { titular_id: crypto.randomUUID(), cpf: "00000000000", nome: "RLS", tipo: "direto" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "estabelecimentos", { cnpj_basico: "00000000", cnpj_ordem: "0001", cnpj_dv: "00" }))).toBe(true);
  });

  it("INSERT permitido (RLS passa; falha só nos dados) em vinculos/faturas/repasses/convencoes/cartas/solicitacoes_servico", async () => {
    const c = clientes.secretaria;
    for (const t of ["vinculos_empregaticios", "faturas", "repasses", "convencoes_coletivas", "cartas_oposicao", "solicitacoes_servico"]) {
      const err = await insertErr(c, t, {});
      expect(err, `${t} deveria falhar por dados (não RLS)`).toBeTruthy();
      expect(ehErroRls(err), `${t} não deveria ser 42501`).toBe(false);
      expect(ehErroConstraintOuTrigger(err), `${t} deveria ser constraint/trigger`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe("Jurídico — só atendimentos jurídicos", () => {
  it("INSERT negado (42501) em trabalhadores/faturas/convencoes/solicitacoes_servico", async () => {
    const c = clientes.juridico;
    expect(ehErroRls(await insertErr(c, "trabalhadores", { cpf: "00000000000", nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "faturas", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "convencoes_coletivas", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "solicitacoes_servico", {}))).toBe(true);
  });

  it("INSERT permitido (não-RLS) em atendimentos_juridicos", async () => {
    const err = await insertErr(clientes.juridico, "atendimentos_juridicos", {});
    expect(err).toBeTruthy();
    expect(ehErroRls(err)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("Presidente — leitura ampla, sem escrita", () => {
  it("INSERT negado (42501) em trabalhadores/faturas/convencoes/atendimentos/solicitacoes_servico", async () => {
    const c = clientes.presidente;
    expect(ehErroRls(await insertErr(c, "trabalhadores", { cpf: "00000000000", nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "faturas", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "convencoes_coletivas", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "atendimentos_juridicos", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "solicitacoes_servico", {}))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Parceiro — sem escrita nas tabelas internas", () => {
  it("INSERT negado (42501) em solicitacoes_servico/trabalhadores/beneficios", async () => {
    const c = clientes.parceiro;
    expect(ehErroRls(await insertErr(c, "solicitacoes_servico", {}))).toBe(true);
    expect(ehErroRls(await insertErr(c, "trabalhadores", { cpf: "00000000000", nome: "RLS" }))).toBe(true);
    expect(ehErroRls(await insertErr(c, "beneficios", { parceiro_id: anaParceiroId, nome: "RLS" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Anon — negado no que exige autenticação", () => {
  it("INSERT em trabalhadores negado", async () => {
    expect(ehErroRls(await insertErr(anon, "trabalhadores", { cpf: "00000000000", nome: "RLS" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("RPCs — grants pós-hardening (Tarefa 3)", () => {
  it("anon NÃO executa fn_role nem fn_titular_bloqueado (revogados)", async () => {
    const r1 = await anon.rpc("fn_role");
    expect(r1.error, "anon fn_role deveria ser negado").toBeTruthy();
    const r2 = await anon.rpc("fn_titular_bloqueado", { p_trabalhador_id: crypto.randomUUID(), p_tipo: "contribuicao_sindical" });
    expect(r2.error, "anon fn_titular_bloqueado deveria ser negado").toBeTruthy();
  });

  it("authenticated executa fn_role (retorna o papel) e fn_titular_bloqueado", async () => {
    const r1 = await clientes.secretaria.rpc("fn_role");
    expect(r1.error).toBeNull();
    expect(r1.data).toBe("secretaria");
    const r2 = await clientes.secretaria.rpc("fn_titular_bloqueado", { p_trabalhador_id: crypto.randomUUID(), p_tipo: "contribuicao_sindical" });
    expect(r2.error).toBeNull();
    expect(r2.data).toBe(false);
  });

  it("anon executa a RPC pública do QR (fn_dados_guia_publica)", async () => {
    const { data, error } = await anon.rpc("fn_dados_guia_publica", { p_token: crypto.randomUUID() });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("solicitacoes_admin — fila self-service", () => {
  let solicId: string;

  it("secretária abre a própria solicitação (pendente)", async () => {
    const { data, error } = await clientes.secretaria
      .from("solicitacoes_admin")
      .insert({ solicitante: uids.secretaria, tabela_alvo: "trabalhadores", operacao: "INSERT", justificativa: "RLS suite", payload: { teste: true } })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    solicId = data!.id as string;
    paraLimpar.push(solicId);
  });

  it("secretária NÃO pode aprovar a própria (só admin) — WITH CHECK barra", async () => {
    const { error } = await clientes.secretaria.from("solicitacoes_admin").update({ status: "aprovada" }).eq("id", solicId);
    expect(ehErroRls(error)).toBe(true);
  });

  it("secretária cancela a própria enquanto pendente", async () => {
    const { error } = await clientes.secretaria.from("solicitacoes_admin").update({ status: "cancelada" }).eq("id", solicId);
    expect(error, error?.message).toBeNull();
  });

  it("jurídico não vê a solicitação alheia; admin vê", async () => {
    const jur = await clientes.juridico.from("solicitacoes_admin").select("*", { count: "exact", head: true }).eq("id", solicId);
    expect(jur.count).toBe(0);
    const adm = await clientes.admin.from("solicitacoes_admin").select("*", { count: "exact", head: true }).eq("id", solicId);
    expect(adm.count).toBe(1);
  });
});
