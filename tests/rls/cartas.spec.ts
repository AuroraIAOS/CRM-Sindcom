import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, type Role } from "./helpers";

/**
 * Subetapa 04.2 — `/cartas` (visão anual de cartas de oposição).
 *
 * Cobre:
 *  1. RLS de `v_cartas_ano_base` (security_invoker) por ator;
 *  2. a igualdade estrutural com o motor: a view e `fn_reclassificar_convencao`
 *     têm que enxergar o MESMO universo — se divergirem, a tela mente;
 *  3. a regra 5.2 no FRONTEND (decisão D3 de 2026-07-22): registrar carta de um
 *     Ouro NÃO rebaixa. Este é o teste que faltava para o bug latente
 *     encontrado no diagnóstico — antes da correção, `useRegistrarCarta`
 *     zerava as duas flags e cancelava o convênio no mesmo clique.
 *
 * Login: um por papel no `beforeAll` (orientacoes.md §7.4).
 * Fixtures: prefixo `04.2 teste —`, removidas no `afterAll` (§7.3).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

const PREFIXO = "04.2 teste —";
const trabalhadoresParaLimpar: string[] = [];

let ouroId: string;
let prataId: string;

async function criarTrabalhador(nome: string, cpf: string, ouro: boolean): Promise<string> {
  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf,
      nome: `${PREFIXO} ${nome}`,
      recolhe_contribuicao_sindical: true,
      recolhe_mensalidade_convenio: ouro,
      status_cadastro: "aprovado",
    })
    .select("id, nivel")
    .single();
  if (error) throw new Error(`fixture "${nome}": ${error.message}`);
  expect(data.nivel, `nível do fixture ${nome}`).toBe(ouro ? "ouro" : "prata");
  trabalhadoresParaLimpar.push(data.id as string);
  return data.id as string;
}

/** Replica o efeito de `useRegistrarCarta` (features/trabalhadores/api.ts):
 *  insere a carta e tenta zerar as flags EXCETO para quem é Ouro. */
async function registrarCartaComoOFrontend(trabalhadorId: string, anoBase: number) {
  const { error: erroCarta } = await clientes.admin.from("cartas_oposicao").insert({
    trabalhador_id: trabalhadorId,
    ano_base: anoBase,
    data_entrega: "2026-03-01",
    forma: "presencial",
  });
  if (erroCarta) throw erroCarta;

  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .update({ recolhe_contribuicao_sindical: false, recolhe_mensalidade_convenio: false })
    .eq("id", trabalhadorId)
    .neq("nivel", "ouro")
    .select("id");
  if (error) throw error;
  return { rebaixado: (data?.length ?? 0) > 0 };
}

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
  anon = clienteAnon();

  ouroId = await criarTrabalhador("Ouro com carta", "70500000001", true);
  prataId = await criarTrabalhador("Prata com carta", "70500000002", false);
}, 60_000);

afterAll(async () => {
  for (const id of trabalhadoresParaLimpar) {
    // cartas_oposicao tem ON DELETE CASCADE em trabalhador_id.
    await clientes.admin.from("trabalhadores").delete().eq("id", id);
  }
  for (const p of PAPEIS) await clientes[p]?.auth.signOut();
});

// ---------------------------------------------------------------------------
describe("RLS — v_cartas_ano_base (security_invoker)", () => {
  it("os 4 papéis internos leem a view; parceiro e anon não veem nada", async () => {
    let totalAdmin = 0;
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as Role[]) {
      const { data, error } = await clientes[p].from("v_cartas_ano_base").select("trabalhador_id");
      expect(error, `select/${p}`).toBeNull();
      expect((data ?? []).length, `linhas/${p}`).toBeGreaterThan(0);
      if (p === "admin") totalAdmin = (data ?? []).length;
    }
    expect(totalAdmin).toBeGreaterThan(0);

    // security_invoker NÃO nega: ela ZERA (orientacoes.md §2.6b).
    for (const c of [clientes.parceiro, anon]) {
      const { data, error } = await c.from("v_cartas_ano_base").select("trabalhador_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
describe("A view enxerga o mesmo universo que o motor de reclassificação", () => {
  it("v_cartas_ano_base × v_relatorio_convencao: mesmas pessoas por CCT", async () => {
    const { data: daView, error: e1 } = await clientes.admin
      .from("v_cartas_ano_base")
      .select("convencao_id, trabalhador_id");
    expect(e1).toBeNull();

    const { data: doRelatorio, error: e2 } = await clientes.admin
      .from("v_relatorio_convencao")
      .select("convencao_id, trabalhador_id");
    expect(e2).toBeNull();

    // Compara CONJUNTOS de pares (cct, trabalhador), não contagens de linha:
    // as duas views são por vínculo, e contar linha crua infla (§2.2).
    const chave = (r: { convencao_id: string | null; trabalhador_id: string | null }) =>
      `${r.convencao_id}::${r.trabalhador_id}`;
    const setView = new Set((daView ?? []).map(chave));
    const setRelatorio = new Set((doRelatorio ?? []).map(chave));

    expect(setView.size).toBeGreaterThan(0);
    expect([...setView].sort()).toEqual([...setRelatorio].sort());
  });

  it("os 4 baldes do cenário DEMO Kabum batem com a simulação do motor", async () => {
    const { data, error } = await clientes.admin
      .from("v_cartas_ano_base")
      .select("trabalhador_id, nivel, carta_id, convencao")
      .eq("convencao", "DEMO — CCT Lojas do Kabum 2026");
    expect(error).toBeNull();

    // Deduplica por trabalhador antes de contar — a view é por vínculo (§2.2).
    const porPessoa = new Map<string, { nivel: string | null; temCarta: boolean }>();
    for (const l of data ?? []) {
      if (!l.trabalhador_id) continue;
      if (!porPessoa.has(l.trabalhador_id)) {
        porPessoa.set(l.trabalhador_id, { nivel: l.nivel, temCarta: l.carta_id !== null });
      }
    }

    const baldes = { regride: 0, prata: 0, ouroSemCarta: 0, ouroComCarta: 0 };
    for (const p of porPessoa.values()) {
      if (p.nivel === "ouro") p.temCarta ? baldes.ouroComCarta++ : baldes.ouroSemCarta++;
      else p.temCarta ? baldes.regride++ : baldes.prata++;
    }

    // Números do cenário semeado em 2026-07-22 (docs/plano_cartas_juridico.md §7).
    expect(baldes).toEqual({
      regride: 17,
      prata: 68,
      ouroSemCarta: 12,
      ouroComCarta: 3,
    });
    expect(porPessoa.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
describe("Regra 5.2 no frontend — carta de Ouro NÃO rebaixa (decisão D3)", () => {
  it("Prata que entrega carta vira Bronze", async () => {
    const { rebaixado } = await registrarCartaComoOFrontend(prataId, 2026);
    expect(rebaixado).toBe(true);

    const { data } = await clientes.admin
      .from("trabalhadores")
      .select("nivel, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio")
      .eq("id", prataId)
      .single();
    expect(data?.nivel).toBe("bronze");
  });

  it("Ouro que entrega carta MANTÉM Ouro — e a carta fica registrada", async () => {
    const { rebaixado } = await registrarCartaComoOFrontend(ouroId, 2026);
    expect(rebaixado, "Ouro não pode ser rebaixado pelo registro da carta").toBe(false);

    const { data } = await clientes.admin
      .from("trabalhadores")
      .select("nivel, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio")
      .eq("id", ouroId)
      .single();
    // O que protege o titular (benefícios) e o Sindcom (mensalidade):
    expect(data?.nivel).toBe("ouro");
    expect(data?.recolhe_contribuicao_sindical).toBe(true);
    expect(data?.recolhe_mensalidade_convenio).toBe(true);

    // A carta é fato ocorrido com prazo legal — nunca se perde.
    const { data: cartas } = await clientes.admin
      .from("cartas_oposicao")
      .select("id")
      .eq("trabalhador_id", ouroId)
      .eq("ano_base", 2026);
    expect(cartas).toHaveLength(1);
  });
});
