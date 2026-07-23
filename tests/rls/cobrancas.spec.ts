import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, ehErroRls, type Role } from "./helpers";

/**
 * Subetapa 02.6 — motor de geração de cobranças (sql/10_cobrancas.sql).
 * Cobre o item 7 da suíte contínua (plano_fases.md): idempotência, conciliação
 * guia = Σ faturas, vencimento geração+30 — mais a matriz de papéis e o pulo
 * de quem não tem base de cálculo.
 *
 * Fixtures têm prefixo "02.6 teste —" e são removidas no afterAll (os dados de
 * demonstração `DEMO —` são outra coisa, criados fora da suíte e preservados).
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

const ANO_BASE = 2098; // fora de qualquer CCT real — não colide com dados DEMO
const COMPETENCIA = `${ANO_BASE}-01-01`;
const PISO = 1500; // 5% = 75,00 — abaixo do teto de 100, então o teto não mascara o cálculo
const VALOR_ESPERADO = 75;

let convencaoId: string;
let estabelecimentoId: string;
let cnpjBasico: string;
let prataHoleriteId: string;
let ouroHoleriteId: string;
let prataBoletoId: string;
let semBaseId: string;
let bronzeId: string;

/** O banco só valida o formato (^\d{11}$), não o DV — e precisa ser único entre
 *  execuções, inclusive se uma rodada anterior tiver morrido no meio. */
function cpfFicticio(): string {
  return String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
}

async function criarTrabalhador(
  nome: string,
  contribuicao: boolean,
  convenio: boolean,
  forma: "holerite" | "boleto_direto",
) {
  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf: cpfFicticio(),
      nome,
      recolhe_contribuicao_sindical: contribuicao,
      recolhe_mensalidade_convenio: convenio,
      forma_pagamento_preferida: forma,
      status_cadastro: "aprovado",
    })
    .select("id, nivel")
    .single();
  if (error) throw new Error(`criarTrabalhador(${nome}): ${error.message}`);
  return data as { id: string; nivel: string };
}

async function criarVinculo(trabalhadorId: string, funcao: string) {
  const { error } = await clientes.admin.from("vinculos_empregaticios").insert({
    trabalhador_id: trabalhadorId,
    estabelecimento_id: estabelecimentoId,
    funcao,
    principal: true,
  });
  if (error) throw new Error(`criarVinculo: ${error.message}`);
}

async function faturasDaCompetencia() {
  const { data, error } = await clientes.admin
    .from("faturas")
    .select("id, trabalhador_id, valor, forma_cobranca, data_vencimento, repasse_id")
    .eq("tipo", "contribuicao_sindical")
    .eq("competencia", COMPETENCIA)
    .in("trabalhador_id", [prataHoleriteId, ouroHoleriteId, prataBoletoId, semBaseId, bronzeId]);
  if (error) throw new Error(`faturasDaCompetencia: ${error.message}`);
  return data ?? [];
}

beforeAll(async () => {
  for (const p of ["admin", "presidente", "secretaria", "juridico", "parceiro"] as Role[]) {
    const { client } = await loginComo(p);
    clientes[p] = client;
  }
  anon = clienteAnon();

  const sufixo = String(Math.floor(100_000 + Math.random() * 899_999));
  cnpjBasico = String(Math.floor(10_000_000 + Math.random() * 89_999_999));

  const { data: convencao, error: erroConvencao } = await clientes.admin
    .from("convencoes_coletivas")
    .insert({
      nome: `02.6 teste — CCT ${sufixo}`,
      ano_base: ANO_BASE,
      data_inicio_vigencia: `${ANO_BASE}-01-01`,
    })
    .select("id")
    .single();
  if (erroConvencao) throw new Error(`seed convenção: ${erroConvencao.message}`);
  convencaoId = convencao!.id as string;

  // Piso SÓ para "Balconista": quem tiver outra função fica sem base de cálculo
  // e deve ser pulado — é o caso que o teto indevido do least() mascarava.
  const { error: erroPiso } = await clientes.admin
    .from("pisos_convencao")
    .insert({ convencao_id: convencaoId, funcao: "Balconista", valor: PISO });
  if (erroPiso) throw new Error(`seed piso: ${erroPiso.message}`);

  const { error: erroEmpresa } = await clientes.admin
    .from("empresas")
    .insert({ cnpj_basico: cnpjBasico, razao_social: `02.6 teste — Empresa ${sufixo}` });
  if (erroEmpresa) throw new Error(`seed empresa: ${erroEmpresa.message}`);

  const { data: estab, error: erroEstab } = await clientes.admin
    .from("estabelecimentos")
    .insert({
      cnpj_basico: cnpjBasico,
      cnpj_ordem: "0001",
      cnpj_dv: "00",
      nome_fantasia: `02.6 teste — Estab ${sufixo}`,
      convencao_id: convencaoId,
    })
    .select("id")
    .single();
  if (erroEstab) throw new Error(`seed estabelecimento: ${erroEstab.message}`);
  estabelecimentoId = estab!.id as string;

  const prataHolerite = await criarTrabalhador("02.6 teste — prata holerite", true, false, "holerite");
  const ouroHolerite = await criarTrabalhador("02.6 teste — ouro holerite", true, true, "holerite");
  const prataBoleto = await criarTrabalhador("02.6 teste — prata boleto", true, false, "boleto_direto");
  const semBase = await criarTrabalhador("02.6 teste — sem piso da função", true, false, "holerite");
  const bronze = await criarTrabalhador("02.6 teste — bronze (não recolhe)", false, false, "holerite");

  expect(prataHolerite.nivel).toBe("prata");
  expect(ouroHolerite.nivel).toBe("ouro");
  expect(bronze.nivel).toBe("bronze");

  prataHoleriteId = prataHolerite.id;
  ouroHoleriteId = ouroHolerite.id;
  prataBoletoId = prataBoleto.id;
  semBaseId = semBase.id;
  bronzeId = bronze.id;

  await criarVinculo(prataHoleriteId, "Balconista");
  await criarVinculo(ouroHoleriteId, "Balconista");
  await criarVinculo(prataBoletoId, "Balconista");
  await criarVinculo(semBaseId, "Caixa"); // sem piso para esta função → sem base
  await criarVinculo(bronzeId, "Balconista");
});

afterAll(async () => {
  if (!clientes.admin) return;
  const ids = [prataHoleriteId, ouroHoleriteId, prataBoletoId, semBaseId, bronzeId].filter(Boolean);
  if (ids.length) {
    // Faturas antes dos repasses: faturas.repasse_id referencia repasses.
    await clientes.admin.from("faturas").delete().in("trabalhador_id", ids);
    await clientes.admin.from("vinculos_empregaticios").delete().in("trabalhador_id", ids);
    await clientes.admin.from("eventos_nivel").delete().in("trabalhador_id", ids);
    await clientes.admin.from("trabalhadores").delete().in("id", ids);
  }
  if (cnpjBasico) await clientes.admin.from("repasses").delete().eq("cnpj_basico", cnpjBasico);
  if (estabelecimentoId) await clientes.admin.from("estabelecimentos").delete().eq("id", estabelecimentoId);
  if (cnpjBasico) await clientes.admin.from("empresas").delete().eq("cnpj_basico", cnpjBasico);
  if (convencaoId) {
    await clientes.admin.from("pisos_convencao").delete().eq("convencao_id", convencaoId);
    await clientes.admin.from("convencoes_coletivas").delete().eq("id", convencaoId);
  }
});

describe("Subetapa 02.6 — matriz de papéis do motor de cobrança", () => {
  it("só o Admin executa as três funções de geração", async () => {
    for (const p of ["juridico", "secretaria", "presidente", "parceiro"] as Role[]) {
      const contribuicao = await clientes[p].rpc("fn_gerar_faturas_contribuicao", {
        p_convencao_id: convencaoId,
      });
      expect(contribuicao.error, `${p} não deveria gerar faturas de contribuição`).toBeTruthy();
      expect(contribuicao.error!.message).toContain("Rotina restrita ao Admin");

      const mensalidade = await clientes[p].rpc("fn_gerar_faturas_mensalidade", {
        p_competencia: COMPETENCIA,
      });
      expect(mensalidade.error, `${p} não deveria gerar mensalidades`).toBeTruthy();

      const guias = await clientes[p].rpc("fn_gerar_guias", {
        p_tipo: "contribuicao_sindical",
        p_competencia: COMPETENCIA,
      });
      expect(guias.error, `${p} não deveria gerar guias`).toBeTruthy();
    }

    // anon NÃO recebe "Rotina restrita ao Admin": fn_guarda_job só levanta com
    // auth.uid() not null. Quem barra o anônimo é o `revoke ... from public,
    // anon` (10_cobrancas.sql) → 42501. A asserção é de permissão, não da mensagem.
    const { error: erroAnon } = await anon.rpc("fn_gerar_faturas_contribuicao", {
      p_convencao_id: convencaoId,
    });
    expect(ehErroRls(erroAnon), `anon deveria ser negado pelo grant: ${erroAnon?.message}`).toBe(true);

    // Nenhuma tentativa negada pode ter criado fatura.
    expect((await faturasDaCompetencia()).length, "nenhuma fatura criada por papel sem permissão").toBe(0);
  });

  it("convenção inexistente é rejeitada", async () => {
    const { error } = await clientes.admin.rpc("fn_gerar_faturas_contribuicao", {
      p_convencao_id: crypto.randomUUID(),
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Convenção não encontrada");
  });
});

describe("Subetapa 02.6 — geração, idempotência e conciliação", () => {
  /**
   * Um único `it` sequencial de propósito: a geração "gasta" o estado (a 2ª
   * execução já retorna 0), então casos independentes viram dependentes da
   * ordem de execução e dão flake.
   */
  it("gera faturas, pula quem não tem base, concilia a guia e é idempotente", async () => {
    // --- 1ª geração de faturas ----------------------------------------------
    const { data, error } = await clientes.admin.rpc("fn_gerar_faturas_contribuicao", {
      p_convencao_id: convencaoId,
    });
    expect(error, error?.message).toBeNull();
    const geracao = (data as { geradas: number; puladas: number; pulados: unknown }[])[0];

    // Alvo = Prata e Ouro (Bronze entregou carta e não recolhe). Dos 4 alvos,
    // 3 têm piso da função e 1 não tem base de cálculo.
    expect(geracao.geradas, "3 com base de cálculo").toBe(3);
    expect(geracao.puladas, "1 sem piso para a função").toBe(1);

    const pulados = geracao.pulados as { trabalhador_id: string; nome: string }[];
    expect(pulados.length).toBe(1);
    expect(pulados[0].trabalhador_id, "o pulado é quem não tem piso da função").toBe(semBaseId);
    expect(pulados[0].nome).toContain("sem piso da função");

    // O Bronze não é alvo: não recolhe contribuição.
    const faturas = await faturasDaCompetencia();
    expect(faturas.length).toBe(3);
    expect(faturas.some((f) => f.trabalhador_id === bronzeId), "Bronze não é cobrado").toBe(false);
    expect(faturas.some((f) => f.trabalhador_id === semBaseId), "sem base não vira fatura").toBe(false);

    // Valor = 5% do piso (R$ 75), abaixo do teto de R$ 100.
    for (const f of faturas) expect(Number(f.valor)).toBe(VALOR_ESPERADO);

    // Vencimento = geração + 30 (config dias_vencimento_boleto).
    //
    // A data vem do `current_date` do Postgres, e o banco roda em **UTC** —
    // então a referência aqui tem que ser UTC também (`toISOString`), NÃO o
    // horário local (`toLocaleDateString('sv-SE')`). Entre 21h e meia-noite no
    // horário de Brasília (UTC-3) o banco já virou o dia e o local não: o teste
    // falhava por exatamente 1 dia, todas as noites, sem nada ter piorado.
    // (`sv-SE` continua correto no FRONTEND — lá a referência é o usuário.)
    const hojeUtc = new Date().toISOString().slice(0, 10);
    const esperado = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(faturas[0].data_vencimento, `hoje(UTC)=${hojeUtc}`).toBe(esperado);

    // --- Idempotência das faturas -------------------------------------------
    const { data: data2 } = await clientes.admin.rpc("fn_gerar_faturas_contribuicao", {
      p_convencao_id: convencaoId,
    });
    const geracao2 = (data2 as { geradas: number }[])[0];
    expect(geracao2.geradas, "2ª execução não duplica cobrança").toBe(0);
    expect((await faturasDaCompetencia()).length, "continua com 3 faturas").toBe(3);

    // --- Guias ---------------------------------------------------------------
    const { data: dataGuias, error: erroGuias } = await clientes.admin.rpc("fn_gerar_guias", {
      p_tipo: "contribuicao_sindical",
      p_competencia: COMPETENCIA,
    });
    expect(erroGuias, erroGuias?.message).toBeNull();
    const guias = (dataGuias as {
      guias_criadas: number;
      faturas_vinculadas: number;
      bloqueadas: number;
      valor_total: number;
    }[])[0];

    // Só as faturas `holerite` entram na guia da empresa; boleto_direto é
    // cobrança pessoal e fica de fora.
    expect(guias.guias_criadas, "uma guia para a empresa").toBe(1);
    expect(guias.faturas_vinculadas, "só as 2 de holerite").toBe(2);
    expect(guias.bloqueadas).toBe(0);

    const { data: repasses } = await clientes.admin
      .from("repasses")
      .select("id, valor_total, data_vencimento, status, numero_guia_pagamento")
      .eq("cnpj_basico", cnpjBasico)
      .eq("competencia", COMPETENCIA);
    expect(repasses!.length).toBe(1);
    const guia = repasses![0];

    // CONCILIAÇÃO EXATA: guia = Σ das faturas vinculadas.
    const { data: vinculadas } = await clientes.admin
      .from("faturas")
      .select("valor")
      .eq("repasse_id", guia.id);
    const soma = (vinculadas ?? []).reduce((acc, f) => acc + Number(f.valor), 0);
    expect(Number(guia.valor_total), "guia = Σ faturas").toBe(soma);
    expect(Number(guia.valor_total)).toBe(VALOR_ESPERADO * 2);
    expect(guia.status).toBe("previsto");
    expect(guia.numero_guia_pagamento).toMatch(/^GP-\d{4}-\d{6}$/);
    expect(guia.data_vencimento, "guia vence em geração + 30").toBe(esperado);

    // A fatura de boleto_direto continua sem guia — não é repasse da empresa.
    const boleto = (await faturasDaCompetencia()).find((f) => f.trabalhador_id === prataBoletoId);
    expect(boleto!.repasse_id, "boleto_direto não entra em guia").toBeNull();

    // --- Idempotência das guias ---------------------------------------------
    const { data: dataGuias2 } = await clientes.admin.rpc("fn_gerar_guias", {
      p_tipo: "contribuicao_sindical",
      p_competencia: COMPETENCIA,
    });
    const guias2 = (dataGuias2 as { guias_criadas: number; faturas_vinculadas: number; valor_total: number }[])[0];
    expect(guias2.guias_criadas, "2ª execução não duplica a guia").toBe(0);
    expect(guias2.faturas_vinculadas).toBe(0);
    expect(Number(guias2.valor_total), "total permanece conciliado").toBe(VALOR_ESPERADO * 2);

    // --- Guia já recebida não é inflada --------------------------------------
    // Cenário real: a empresa paga a guia e só depois aparece uma fatura nova
    // da mesma competência. Anexá-la mudaria um documento já quitado.
    await clientes.admin.from("repasses").update({ status: "recebido" }).eq("id", guia.id);
    await clientes.admin
      .from("faturas")
      .update({ forma_cobranca: "holerite" })
      .eq("trabalhador_id", prataBoletoId)
      .eq("competencia", COMPETENCIA);

    const { data: dataGuias3 } = await clientes.admin.rpc("fn_gerar_guias", {
      p_tipo: "contribuicao_sindical",
      p_competencia: COMPETENCIA,
    });
    const guias3 = (dataGuias3 as { faturas_vinculadas: number; bloqueadas: number }[])[0];
    expect(guias3.faturas_vinculadas, "não anexa a guia recebida").toBe(0);
    expect(guias3.bloqueadas, "a fatura nova é reportada, não escondida").toBe(1);

    const { data: guiaFinal } = await clientes.admin
      .from("repasses")
      .select("valor_total")
      .eq("id", guia.id)
      .single();
    expect(Number(guiaFinal!.valor_total), "guia recebida permanece intocada").toBe(VALOR_ESPERADO * 2);
  });
});
