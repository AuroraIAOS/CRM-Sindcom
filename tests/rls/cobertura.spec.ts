import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, ehErroRls, type Role } from "./helpers";

/**
 * Subetapa 08.11 — cobertura por contabilidade e revogação de token.
 *
 * O QUE ESTA SUÍTE PROVA
 *  1. `v_cobertura_contabilidades` (sql/22_cobertura_08_11.sql) devolve o
 *     MESMO universo que uma contagem independente por SQL cru — não é
 *     comparação com o número absoluto do dia da medição (§7.1b: o dado de
 *     demonstração cresce, então nunca fixe contagem, fixe o RECORTE).
 *  2. O recorte de papéis bate com a RLS das tabelas de origem — a view é
 *     `security_invoker = on`, então quem não pode ler `contabilidades`/
 *     `vinculos_empregaticios` não ganha nada por ler a view.
 *  3. `envios_campanha.token` continua fora de qualquer SELECT desta feature
 *     — string literal `.token` não aparece em `src/features/cobertura/`.
 *  4. A escrita de "revogar token" é mesmo restrita ao Admin — UPDATE barrado
 *     por RLS não dá erro, só devolve zero linhas (§2.6d).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
}, 60_000);

describe("08.11 · v_cobertura_contabilidades bate com uma contagem independente", () => {
  it("total de contabilidades e a soma de estabelecimentos batem com contagem crua", async () => {
    const { data: view, error } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("contabilidade_id, total_estabelecimentos, estabelecimentos_cobertos");
    expect(error).toBeNull();
    expect((view ?? []).length).toBeGreaterThan(0);

    const somaViewTotal = (view ?? []).reduce((s, l) => s + (l.total_estabelecimentos as number), 0);

    // Contagem independente: não pelo mesmo caminho que gravou a view.
    const { count: totalContabilidades } = await clientes.admin
      .from("contabilidades")
      .select("id", { count: "exact", head: true });
    const { count: totalVinculosContab } = await clientes.admin
      .from("contabilidade_estabelecimentos")
      .select("id", { count: "exact", head: true });

    expect((view ?? []).length).toBe(totalContabilidades);
    expect(somaViewTotal).toBe(totalVinculosContab);
  });

  it("estabelecimentos_cobertos nunca é maior que total_estabelecimentos, para nenhuma linha", async () => {
    const { data } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("total_estabelecimentos, estabelecimentos_cobertos");
    for (const l of data ?? []) {
      expect(l.estabelecimentos_cobertos as number).toBeLessThanOrEqual(l.total_estabelecimentos as number);
      expect(l.estabelecimentos_cobertos as number).toBeGreaterThanOrEqual(0);
    }
  });

  it("uma contabilidade com trabalhador vinculado real aparece com cobertos > 0", async () => {
    // Cruza com o CNPJ DEMO já usado em toda a ETAPA 08 (99999901...), que a
    // 08.10 vinculou a trabalhador de verdade — não é número mágico do dia da
    // medição, é a MESMA carteira DEMO que o resto da suíte usa.
    const { data: estab } = await clientes.admin
      .from("estabelecimentos")
      .select("id")
      .like("cnpj_basico", "999999%")
      .limit(1)
      .maybeSingle();
    if (!estab) return; // ambiente sem a semeadura DEMO — nada a cruzar aqui
    const { data: contabDoDemo } = await clientes.admin
      .from("contabilidade_estabelecimentos")
      .select("contabilidade_id")
      .eq("estabelecimento_id", estab.id as string)
      .maybeSingle();
    if (!contabDoDemo) return; // o estabelecimento DEMO pode ser empresa isolada
    const { data: linha } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("estabelecimentos_cobertos")
      .eq("contabilidade_id", contabDoDemo.contabilidade_id as string)
      .single();
    expect((linha?.estabelecimentos_cobertos as number) ?? 0).toBeGreaterThan(0);
  });
});

describe("08.11 · o recorte de papéis da view é o mesmo das tabelas de origem", () => {
  it("admin, presidente, secretaria e jurídico leem (mesmo recorte de contabilidades/vínculos)", async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as const) {
      const { data, error } = await clientes[p].from("v_cobertura_contabilidades").select("contabilidade_id");
      expect(error, `select/${p}`).toBeNull();
      expect((data ?? []).length, `linhas/${p}`).toBeGreaterThan(0);
    }
  });

  it("parceiro vê ZERO linhas — RLS de origem filtra, a view não concede nada a mais", async () => {
    const { data, error } = await clientes.parceiro.from("v_cobertura_contabilidades").select("contabilidade_id");
    expect(error).toBeNull(); // §2.6b: RLS zera a linha, não levanta exceção
    expect((data ?? []).length).toBe(0);
  });

  it("anon não alcança a view (revogada explicitamente no GRANT)", async () => {
    const anonUrl = `${process.env.VITE_SUPABASE_URL}/rest/v1/v_cobertura_contabilidades?select=contabilidade_id`;
    const r = await fetch(anonUrl, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string },
    });
    expect(r.status).toBe(401);
  });
});

describe("08.11 · o token nunca entra nesta feature", () => {
  it("nenhum arquivo de features/cobertura seleciona a coluna `token`", () => {
    const achados = execSync(
      'git grep -n -E "\\btoken\\b" -- src/features/cobertura/ || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados, `feature de cobertura tocando em 'token':\n${achados}`).toBe("");
  });
});

describe("08.11 · revogar token é restrito ao Admin (RLS, não só UI)", () => {
  let ativoDemo: { id: string } | null = null;

  beforeAll(async () => {
    const { data: contabDemo } = await clientes.admin
      .from("contabilidades")
      .select("id")
      .ilike("nome", "DEMO%")
      .limit(1)
      .maybeSingle();
    if (!contabDemo) return;
    const { data } = await clientes.admin
      .from("envios_campanha")
      .select("id")
      .eq("contabilidade_id", contabDemo.id as string)
      .is("token_revogado_em", null)
      .limit(1)
      .maybeSingle();
    ativoDemo = data ? { id: data.id as string } : null;
  });

  it("secretaria tentando revogar recebe zero linhas afetadas, sem erro (§2.6d)", async () => {
    if (!ativoDemo) return; // sem envio DEMO ativo no ambiente — nada a atacar
    const { data, error } = await clientes.secretaria
      .from("envios_campanha")
      .update({ token_revogado_em: new Date().toISOString() })
      .eq("id", ativoDemo.id)
      .select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("juridico e parceiro nem sequer enxergam a linha para tentar", async () => {
    if (!ativoDemo) return;
    for (const p of ["juridico", "parceiro"] as const) {
      const { data, error } = await clientes[p]
        .from("envios_campanha")
        .update({ token_revogado_em: new Date().toISOString() })
        .eq("id", ativoDemo.id)
        .select("id");
      expect(ehErroRls(error) || (data ?? []).length === 0).toBe(true);
    }
  });
});
