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
 *  3. as QUATRO situações que a tela mostra (não duas), inclusive a que mais
 *     custa errar: Ouro COM carta não regride;
 *  4. a regra 5.2 no FRONTEND (decisão D3 de 2026-07-22): registrar carta de um
 *     Ouro NÃO rebaixa.
 *
 * ---------------------------------------------------------------------------
 * REESCRITA EM 2026-09-01, e o motivo importa mais que a reescrita.
 *
 * Estes três casos falhavam desde a ETAPA 07, e a leitura preguiçosa era "são
 * falhas de dado, não de segurança". A investigação achou DUAS causas, e a
 * primeira era um defeito de verdade:
 *
 *  (a) `v_relatorio_convencao` devolvia ZERO linhas em produção — não por falta
 *      de trabalhador, mas porque os DOIS únicos estabelecimentos com
 *      trabalhador vinculado eram justamente os dois (de 17.302) sem
 *      `convencao_id`. A view exige `estabelecimentos.convencao_id`, então 100%
 *      da base de pessoas ficava fora de TODO relatório por convenção — e a
 *      tela `/cartas` aparecia vazia sem dizer por quê. Corrigido no dado.
 *
 *  (b) O caso dos "4 baldes" fixava os números do cenário DEMO Kabum semeado em
 *      2026-07-22 (17/68/12/3, 100 pessoas). Esse cenário foi APAGADO em algum
 *      momento entre julho e agosto — a `auditoria` registra 519 DELETEs em
 *      `trabalhadores`. O teste continuou cobrando um cenário que não existe
 *      mais: é o §7.1b em sua forma mais cara, porque a contagem fixa escondeu
 *      o defeito (a) atrás de um vermelho que todo mundo já esperava.
 *
 * A reescrita elimina a dependência de dado ambiente: cada caso cria as pessoas
 * de que precisa, com vínculo a um estabelecimento que TEM convenção, e afirma
 * o INVARIANTE em vez da contagem. Se a base de demonstração crescer, encolher
 * ou for repovoada, estes casos continuam significando a mesma coisa.
 * ---------------------------------------------------------------------------
 *
 * Login: um por papel no `beforeAll` (orientacoes.md §7.4).
 * Fixtures: prefixo `04.2 teste —`, removidas no `afterAll` (§7.3).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

const PREFIXO = "04.2 teste —";
/** Estabelecimento DEMO de Passos — precisa ter `convencao_id`, senão o
 *  trabalhador vinculado a ele não aparece em relatório de convenção nenhum. */
const CNPJ_DEMO = "99999901000191";
const ANO = 2026;

const trabalhadoresParaLimpar: string[] = [];
let estabelecimentoId: string;
let convencaoNome: string;

let ouroId: string;
let prataId: string;

/** Cria o trabalhador E o vínculo — os dois, sempre. Sem vínculo a pessoa não
 *  entra em `v_relatorio_convencao` nem em `v_cartas_ano_base`, e um teste que
 *  a criasse sem vínculo estaria medindo o vazio. */
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

  const { error: erroVinculo } = await clientes.admin.from("vinculos_empregaticios").insert({
    trabalhador_id: data.id,
    estabelecimento_id: estabelecimentoId,
    principal: true,
  });
  if (erroVinculo) throw new Error(`vínculo do fixture "${nome}": ${erroVinculo.message}`);

  return data.id as string;
}

async function registrarCarta(trabalhadorId: string, anoBase: number) {
  const { error } = await clientes.admin.from("cartas_oposicao").insert({
    trabalhador_id: trabalhadorId,
    ano_base: anoBase,
    data_entrega: `${anoBase}-03-01`,
    forma: "presencial",
  });
  if (error) throw error;
}

/** Replica o efeito de `useRegistrarCarta` (features/trabalhadores/api.ts):
 *  insere a carta e tenta zerar as flags EXCETO para quem é Ouro. */
async function registrarCartaComoOFrontend(trabalhadorId: string, anoBase: number) {
  await registrarCarta(trabalhadorId, anoBase);

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

  const { data: estab, error } = await clientes.admin
    .from("estabelecimentos")
    .select("id, convencao_id, convencoes_coletivas(nome)")
    .eq("cnpj_completo", CNPJ_DEMO)
    .single();
  if (error || !estab) throw new Error(`estabelecimento DEMO ${CNPJ_DEMO} não encontrado: ${error?.message}`);
  expect(
    estab.convencao_id,
    `o estabelecimento DEMO ${CNPJ_DEMO} está sem convenção — quem estiver vinculado a ele fica fora ` +
      `de TODO relatório por CCT, e a tela /cartas aparece vazia sem explicar por quê`,
  ).not.toBeNull();
  estabelecimentoId = estab.id as string;
  // O embed do PostgREST devolve array quando o relacionamento não é inferido
  // como "para um" — normaliza antes de ler o nome.
  const cct = estab.convencoes_coletivas as unknown as { nome: string } | { nome: string }[] | null;
  convencaoNome = (Array.isArray(cct) ? cct[0] : cct)!.nome;

  ouroId = await criarTrabalhador("Ouro com carta", "70500000001", true);
  prataId = await criarTrabalhador("Prata com carta", "70500000002", false);
}, 60_000);

afterAll(async () => {
  for (const id of trabalhadoresParaLimpar) {
    // cartas_oposicao e vinculos_empregaticios têm ON DELETE CASCADE.
    await clientes.admin.from("trabalhadores").delete().eq("id", id);
  }
  for (const p of PAPEIS) await clientes[p]?.auth.signOut();
});

// ---------------------------------------------------------------------------
describe("RLS — v_cartas_ano_base (security_invoker)", () => {
  it("os 4 papéis internos leem a MESMA coisa; parceiro e anon não veem nada", async () => {
    // O invariante não é "há linhas" (isso dependeria da base), e sim: os quatro
    // papéis internos enxergam exatamente o mesmo conjunto — e as fixtures deste
    // arquivo estão nele, o que garante que o conjunto não é vazio por acidente.
    const conjuntos: Record<string, Set<string>> = {};
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as Role[]) {
      const { data, error } = await clientes[p].from("v_cartas_ano_base").select("trabalhador_id");
      expect(error, `select/${p}`).toBeNull();
      conjuntos[p] = new Set((data ?? []).map((l) => l.trabalhador_id as string));
    }

    for (const id of [ouroId, prataId]) {
      expect(conjuntos.admin.has(id), "a fixture não apareceu na view — o vínculo ou a CCT falhou").toBe(true);
    }
    for (const p of ["presidente", "secretaria", "juridico"]) {
      expect([...conjuntos[p]].sort(), `${p} enxerga recorte diferente do Admin`).toEqual([...conjuntos.admin].sort());
    }

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

    // Não é ausência de dado: as fixtures deste arquivo estão nos dois lados.
    expect(setView.size, "as duas views vieram vazias — a fixture não chegou nelas").toBeGreaterThan(0);
    expect([...setView].sort()).toEqual([...setRelatorio].sort());
  });

  it("as QUATRO situações da tela, cada uma com a sua pessoa", async () => {
    // A tela mostra 4 situações, não 2 (docs/plano_cartas_juridico.md). Este caso
    // cria uma pessoa por situação e confere que a view classifica cada uma no
    // balde certo. Substitui a antiga contagem fixa do cenário DEMO Kabum, que
    // foi apagado da base — contagem fixa sobre dado de demonstração é o §7.1b.
    const bronze = await criarTrabalhador("Balde regride", "70500000003", false);
    const prata = await criarTrabalhador("Balde prata", "70500000004", false);
    const ouroSem = await criarTrabalhador("Balde ouro sem carta", "70500000005", true);
    const ouroCom = await criarTrabalhador("Balde ouro com carta", "70500000006", true);

    await registrarCarta(bronze, ANO);
    await registrarCarta(ouroCom, ANO);

    const alvos = new Set([bronze, prata, ouroSem, ouroCom]);
    const { data, error } = await clientes.admin
      .from("v_cartas_ano_base")
      .select("trabalhador_id, nivel, carta_id, convencao");
    expect(error).toBeNull();

    // Deduplica por trabalhador antes de contar — a view é por vínculo (§2.2).
    const porPessoa = new Map<string, { nivel: string | null; temCarta: boolean }>();
    for (const l of data ?? []) {
      const id = l.trabalhador_id as string | null;
      if (!id || !alvos.has(id)) continue;
      if (!porPessoa.has(id)) porPessoa.set(id, { nivel: l.nivel, temCarta: l.carta_id !== null });
    }
    expect(porPessoa.size, "as 4 pessoas do teste deveriam estar na view").toBe(4);

    const baldes = { regride: 0, prata: 0, ouroSemCarta: 0, ouroComCarta: 0 };
    for (const p of porPessoa.values()) {
      if (p.nivel === "ouro") p.temCarta ? baldes.ouroComCarta++ : baldes.ouroSemCarta++;
      else p.temCarta ? baldes.regride++ : baldes.prata++;
    }

    // Uma pessoa em cada balde: os 4 são mutuamente exclusivos e exaustivos.
    expect(baldes).toEqual({ regride: 1, prata: 1, ouroSemCarta: 1, ouroComCarta: 1 });

    // O balde que mais custa errar: o Ouro COM carta é o único que a tela mostra
    // como "não regride — pendente de cancelamento da adesão". Se ele caísse em
    // `regride`, a Denise cancelaria o convênio de quem paga mensalidade.
    expect(porPessoa.get(ouroCom)).toEqual({ nivel: "ouro", temCarta: true });

    // E a CCT chega preenchida na view — sem ela a tela não agrupa por convenção.
    const linhasDoAlvo = (data ?? []).filter((l) => alvos.has(l.trabalhador_id as string));
    for (const l of linhasDoAlvo) expect(l.convencao).toBe(convencaoNome);
  });
});

// ---------------------------------------------------------------------------
describe("Regra 5.2 no frontend — carta de Ouro NÃO rebaixa (decisão D3)", () => {
  it("Prata que entrega carta vira Bronze", async () => {
    const { rebaixado } = await registrarCartaComoOFrontend(prataId, ANO);
    expect(rebaixado).toBe(true);

    const { data } = await clientes.admin
      .from("trabalhadores")
      .select("nivel, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio")
      .eq("id", prataId)
      .single();
    expect(data?.nivel).toBe("bronze");
  });

  it("Ouro que entrega carta MANTÉM Ouro — e a carta fica registrada", async () => {
    const { rebaixado } = await registrarCartaComoOFrontend(ouroId, ANO);
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
      .eq("ano_base", ANO);
    expect(cartas).toHaveLength(1);
  });
});
