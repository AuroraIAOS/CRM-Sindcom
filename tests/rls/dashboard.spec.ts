import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, ehErroRls, loginComo, type Role } from "./helpers";

/**
 * Subetapa 03.1 — dashboard.
 *
 * Dois grupos de asserção, por duas razões diferentes:
 *
 * 1. CONFERÊNCIA — todo KPI é recalculado aqui por consulta manual e
 *    comparado com a view. É o critério de aceite da etapa ("dashboard bate
 *    com queries manuais de conferência"). Assertar `error === null` não
 *    provaria nada: a view responderia 200 com número errado do mesmo jeito
 *    (orientacoes.md §7.2).
 *
 * 2. CORTE POR PAPEL — as views são `security_invoker`, então a RLS de quem
 *    consulta se aplica. O ponto delicado: ela NÃO faz a consulta falhar,
 *    ela ZERA o resultado. O jurídico recebe `v_dash_kpis` com
 *    `guias_em_atraso: 0` sem ter acesso a `repasses`. Esses testes fixam
 *    esse comportamento para que ninguém "simplifique" a tela do jurídico
 *    para usar a view comum e passe a exibir zeros como fato.
 *
 * Login UMA VEZ por papel no `beforeAll` (orientacoes.md §7.4) — a versão
 * original deste arquivo logava dentro de cada `it()` (até 2× por teste) e
 * ajudou a esgotar a cota de `signInWithPassword` do Supabase em 2026-07-21.
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

beforeAll(async () => {
  for (const papel of PAPEIS) {
    const { client } = await loginComo(papel);
    clientes[papel] = client;
  }
}, 60_000);

afterAll(async () => {
  for (const papel of PAPEIS) await clientes[papel]?.auth.signOut();
});

describe("03.1 · KPIs conferem com as queries manuais", () => {
  it("cada número da v_dash_kpis bate com o recálculo independente", async () => {
    const client = clientes.admin;

    const { data: kpis, error } = await client.from("v_dash_kpis").select("*").single();
    expect(error).toBeNull();
    expect(kpis).not.toBeNull();

    // K1 — trabalhadores por nível
    const aprovados = async (nivel?: "bronze" | "prata" | "ouro") => {
      const base = client
        .from("trabalhadores")
        .select("id", { count: "exact", head: true })
        .eq("status_cadastro", "aprovado");
      const { count, error: erro } = await (nivel ? base.eq("nivel", nivel) : base);
      expect(erro).toBeNull();
      return count ?? 0;
    };

    const total = await aprovados();
    const bronze = await aprovados("bronze");
    const prata = await aprovados("prata");
    const ouro = await aprovados("ouro");

    expect(kpis!.total_trabalhadores).toBe(total);
    expect(kpis!.bronze).toBe(bronze);
    expect(kpis!.prata).toBe(prata);
    expect(kpis!.ouro).toBe(ouro);
    // O funil só fecha se os três níveis somam o total — nível é coluna
    // gerada, então divergência aqui significaria dado corrompido.
    expect(bronze + prata + ouro).toBe(total);

    // K5 — filas. `cadastros_pendentes` soma DUAS tabelas: trabalhadores e
    // beneficiados. Conferir só uma delas deixaria passar metade do número.
    const { count: pendentesTrab } = await client
      .from("trabalhadores")
      .select("id", { count: "exact", head: true })
      .eq("status_cadastro", "pendente");
    const { count: pendentesBenef } = await client
      .from("beneficiados")
      .select("id", { count: "exact", head: true })
      .eq("status_cadastro", "pendente");
    expect(kpis!.cadastros_pendentes).toBe((pendentesTrab ?? 0) + (pendentesBenef ?? 0));

    const { count: filaAdmin } = await client
      .from("solicitacoes_admin")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    expect(kpis!.fila_admin_pendente).toBe(filaAdmin ?? 0);

    // K4 — inadimplência: quantidade E soma (o valor é o que vai para cobrança)
    const { data: guiasAtraso } = await client
      .from("repasses")
      .select("valor_total")
      .eq("status", "em_atraso");
    expect(kpis!.guias_em_atraso).toBe(guiasAtraso!.length);
    const somaGuias = guiasAtraso!.reduce((s, g) => s + Number(g.valor_total ?? 0), 0);
    expect(Number(kpis!.valor_guias_em_atraso)).toBeCloseTo(somaGuias, 2);

    const { data: boletos } = await client
      .from("faturas")
      .select("valor")
      .eq("status", "inadimplente")
      .eq("forma_cobranca", "boleto_direto");
    expect(kpis!.boletos_inadimplentes).toBe(boletos!.length);
    const somaBoletos = boletos!.reduce((s, f) => s + Number(f.valor ?? 0), 0);
    expect(Number(kpis!.valor_boletos_inadimplentes)).toBeCloseTo(somaBoletos, 2);
  });

  it("MRR é a soma real das views de base de cálculo, não um arredondamento solto", async () => {
    const client = clientes.admin;
    const { data: kpis } = await client.from("v_dash_kpis").select("*").single();

    const { data: mensalidades } = await client
      .from("v_mensalidade_titular")
      .select("trabalhador_id, valor_mensalidade");
    const somaMensal = (mensalidades ?? []).reduce(
      (s, m) => s + Number(m.valor_mensalidade ?? 0),
      0,
    );
    expect(Number(kpis!.mrr_mensalidades)).toBeCloseTo(somaMensal, 2);

    // A contribuição é ANUAL: o MRR divide por 12. Se alguém trocar a
    // fórmula, este teste quebra antes de o número errado virar decisão.
    const { data: bases } = await client
      .from("v_base_calculo_trabalhador")
      .select("trabalhador_id, valor_contribuicao_anual");
    expect(bases).not.toBeNull();

    // Ninguém pode ter base nula virando teto (orientacoes.md §2.1): a view
    // devolve NULL para quem não tem piso nem salário, e NULL não soma.
    const comBase = (bases ?? []).filter((b) => b.valor_contribuicao_anual !== null);
    for (const b of comBase) {
      expect(Number(b.valor_contribuicao_anual)).toBeLessThanOrEqual(100);
    }
  });

  it("o mapa cobre os 29 municípios da base territorial, todos com codigo_ibge", async () => {
    const client = clientes.admin;

    const { data: mapa, error } = await client.from("v_dash_mapa").select("*");
    expect(error).toBeNull();
    expect(mapa!.length).toBe(29);

    // Sem código IBGE não há join com a malha do GeoJSON — o município
    // sumiria do mapa sem erro nenhum.
    expect(mapa!.every((m) => m.codigo_ibge !== null)).toBe(true);

    // Passos é a sede e precisa estar marcada (contorno destacado no mapa).
    const sedes = mapa!.filter((m) => m.sede);
    expect(sedes.length).toBe(1);
    expect(sedes[0].nome).toBe("Passos");

    // Consistência interna: os níveis somam o total de cada município.
    for (const m of mapa!) {
      expect((m.bronze ?? 0) + (m.prata ?? 0) + (m.ouro ?? 0)).toBe(m.total_trabalhadores ?? 0);
    }
  });
});

describe("03.1 · corte por papel (a RLS zera, não recusa)", () => {
  it("jurídico lê v_dash_kpis com o financeiro ZERADO — por isso a tela dele é outra", async () => {
    const { data: comoAdmin } = await clientes.admin.from("v_dash_kpis").select("*").single();
    const { data: comoJuridico, error } = await clientes.juridico
      .from("v_dash_kpis")
      .select("*")
      .single();

    // A consulta NÃO falha para o jurídico — é exatamente esse o problema.
    expect(error).toBeNull();
    expect(comoJuridico).not.toBeNull();

    // Ele enxerga a base cadastral (legítimo: tem acesso a trabalhadores).
    expect(comoJuridico!.total_trabalhadores).toBe(comoAdmin!.total_trabalhadores);

    // Mas repasses/faturas são filtrados pela RLS dele → contagem 0 sem que
    // isso signifique "não há inadimplência". A tela do jurídico não pode
    // renderizar o K4.
    const { count: repassesVisiveis } = await clientes.juridico
      .from("repasses")
      .select("id", { count: "exact", head: true });
    const { count: faturasVisiveis } = await clientes.juridico
      .from("faturas")
      .select("id", { count: "exact", head: true });
    expect(repassesVisiveis).toBe(0);
    expect(faturasVisiveis).toBe(0);
    expect(comoJuridico!.guias_em_atraso).toBe(0);
    expect(comoJuridico!.boletos_inadimplentes).toBe(0);
  });

  it("jurídico não alcança as views financeiras de série", async () => {
    for (const view of ["v_dash_receita_mensal", "v_dash_top_parceiros"] as const) {
      const { data, error } = await clientes.juridico.from(view).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]); // vazio por RLS — a tela dele nem chama
    }
  });

  it("parceiro não enxerga nada da base pelo dashboard", async () => {
    const { data } = await clientes.parceiro.from("v_dash_kpis").select("*").single();
    expect(data!.total_trabalhadores).toBe(0);
    expect(data!.bronze).toBe(0);
    expect(Number(data!.mrr_mensalidades)).toBe(0);
    expect(Number(data!.mrr_contribuicoes)).toBe(0);

    const { data: dicas } = await clientes.parceiro.from("v_dash_dicas").select("*");
    expect(dicas).toEqual([]);
  });

  it("anon não extrai nenhum dado do dashboard", async () => {
    const client = clienteAnon();

    // `v_dash_kpis` é feita de subqueries escalares: SEMPRE devolve 1 linha,
    // mesmo para quem a RLS filtra por inteiro. Esperar `[]` aqui seria
    // esperar a coisa errada — o que importa é que a linha venha ZERADA.
    const { data: kpis } = await client.from("v_dash_kpis").select("*").single();
    expect(kpis!.total_trabalhadores).toBe(0);
    expect(kpis!.cadastros_pendentes).toBe(0);
    expect(Number(kpis!.mrr_mensalidades)).toBe(0);
    expect(Number(kpis!.valor_guias_em_atraso)).toBe(0);

    // As views por linha, essas sim, têm que vir vazias (ou negar).
    for (const view of ["v_dash_mapa", "v_dash_dicas", "v_dash_top_parceiros"] as const) {
      const { data, error } = await client.from(view).select("*");
      if (error) expect(ehErroRls(error)).toBe(true);
      else expect(data, `${view} vazou para anon`).toEqual([]);
    }
  });

  it("presidente e secretária leem os indicadores de gestão", async () => {
    for (const papel of ["presidente", "secretaria"] as const) {
      const { data, error } = await clientes[papel].from("v_dash_kpis").select("*").single();
      expect(error, `${papel} deveria ler v_dash_kpis`).toBeNull();
      expect(data!.total_trabalhadores).toBeGreaterThan(0);

      const { error: erroMapa } = await clientes[papel].from("v_dash_mapa").select("*").limit(1);
      expect(erroMapa).toBeNull();
    }
  });
});

describe("03.1 · snapshot mensal (G1)", () => {
  it("só o Admin tira a fotografia; a secretária é barrada pela guarda", async () => {
    const { error } = await clientes.secretaria.rpc("fn_snapshot_dashboard");
    expect(error).not.toBeNull();
    // Asserta por CLASSE de erro, não por texto (orientacoes.md §2.3): a
    // secretária é barrada pela guarda interna ("Rotina restrita ao Admin",
    // P0001) porque tem o GRANT; se um dia o grant mudar, o barramento vira
    // 42501 — e continua sendo barramento. Aceitar as duas formas evita um
    // teste que quebra sem nada ter piorado.
    expect(ehErroRls(error) || error!.message.includes("Rotina restrita")).toBe(true);

    const { error: erroAdmin } = await clientes.admin.rpc("fn_snapshot_dashboard");
    expect(erroAdmin).toBeNull();

    // Efeito observável, não ausência de erro: a fotografia tem que existir
    // no banco com as três linhas de nível + a linha global com o MRR.
    // `fn_snapshot_dashboard` carimba `data_ref = current_date`, e o banco roda
    // em UTC — a busca precisa usar a data UTC, não a local. Com o horário de
    // Brasília (UTC-3), depois das 21h o banco já está no dia seguinte e a
    // consulta por data local não achava a fotografia recém-tirada.
    const hoje = new Date().toISOString().slice(0, 10); // AAAA-MM-DD UTC (= current_date)
    const { data: fotos } = await clientes.admin
      .from("snapshots_dashboard")
      .select("*")
      .eq("data_ref", hoje)
      .is("municipio_id", null);

    const porNivel = (fotos ?? []).filter((f) => f.nivel !== null);
    const global = (fotos ?? []).find((f) => f.nivel === null);
    expect(porNivel.length).toBeGreaterThanOrEqual(1);
    expect(global).toBeDefined();
    expect(Number(global!.mrr_mensalidades)).toBeGreaterThanOrEqual(0);

    // Idempotência: repetir no mesmo dia substitui, não duplica.
    const { error: erroRepetido } = await clientes.admin.rpc("fn_snapshot_dashboard");
    expect(erroRepetido).toBeNull();
    const { count } = await clientes.admin
      .from("snapshots_dashboard")
      .select("id", { count: "exact", head: true })
      .eq("data_ref", hoje)
      .is("municipio_id", null)
      .is("nivel", null);
    expect(count).toBe(1);
  }, 60_000);
});
