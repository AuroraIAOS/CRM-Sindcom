import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, ehErroRls, type Role } from "./helpers";

/**
 * Subetapa 02.5 — organização interna da CCT (`fn_reclassificar_convencao`).
 * Cobre as regras 5.1/5.2/5.3 do fluxo de convenções, a matriz de papéis, a
 * origem dos eventos e a idempotência que a spec exige como evidência.
 *
 * Fixtures têm prefixo "02.5 teste —" e são removidas no afterAll (os dados de
 * demonstração `DEMO —` são outra coisa, criados fora da suíte e preservados).
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

let convencaoId: string;
let estabelecimentoId: string;
let cnpjBasico: string;
let ouroComCartaId: string;
let comCartaId: string;
let semCartaId: string;

const ANO_BASE = 2099; // fora de qualquer CCT real — não colide com dados DEMO

/** O banco só valida o formato (^\d{11}$), não o DV — e precisa ser único entre
 *  execuções, inclusive se uma rodada anterior tiver morrido no meio. */
function cpfFicticio(): string {
  return String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
}

async function criarTrabalhador(nome: string, contribuicao: boolean, convenio: boolean) {
  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf: cpfFicticio(),
      nome,
      recolhe_contribuicao_sindical: contribuicao,
      recolhe_mensalidade_convenio: convenio,
      status_cadastro: "aprovado",
    })
    .select("id, nivel")
    .single();
  if (error) throw new Error(`criarTrabalhador(${nome}): ${error.message}`);
  return data as { id: string; nivel: string };
}

async function nivelDe(id: string): Promise<string> {
  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .select("nivel")
    .eq("id", id)
    .single();
  if (error) throw new Error(`nivelDe: ${error.message}`);
  return data!.nivel as string;
}

/**
 * Eventos gerados pela organização interna.
 *
 * Filtra por `origem` porque o cadastro do trabalhador já gera um evento de
 * criação (`nivel_anterior: null`, `origem: 'manual'`) — contar todos misturaria
 * o seed com o que a RPC fez.
 *
 * eventos_nivel só é legível por admin/presidente/secretaria: a evidência tem de
 * ser coletada como Admin (o Jurídico não lê esta tabela).
 */
async function eventosReclassificacaoDe(id: string) {
  const { data, error } = await clientes.admin
    .from("eventos_nivel")
    .select("nivel_anterior, nivel_novo, origem")
    .eq("trabalhador_id", id)
    .eq("origem", "reclassificacao_anual")
    .order("id");
  if (error) throw new Error(`eventosReclassificacaoDe: ${error.message}`);
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
      nome: `02.5 teste — CCT ${sufixo}`,
      ano_base: ANO_BASE,
      data_inicio_vigencia: `${ANO_BASE}-01-01`,
      data_limite_oposicao: `${ANO_BASE}-03-31`,
    })
    .select("id")
    .single();
  if (erroConvencao) throw new Error(`seed convenção: ${erroConvencao.message}`);
  convencaoId = convencao!.id as string;

  const { error: erroEmpresa } = await clientes.admin
    .from("empresas")
    .insert({ cnpj_basico: cnpjBasico, razao_social: `02.5 teste — Empresa ${sufixo}` });
  if (erroEmpresa) throw new Error(`seed empresa: ${erroEmpresa.message}`);

  const { data: estabelecimento, error: erroEstab } = await clientes.admin
    .from("estabelecimentos")
    .insert({
      cnpj_basico: cnpjBasico,
      cnpj_ordem: "0001",
      cnpj_dv: "00",
      nome_fantasia: `02.5 teste — Estab ${sufixo}`,
      convencao_id: convencaoId,
    })
    .select("id")
    .single();
  if (erroEstab) throw new Error(`seed estabelecimento: ${erroEstab.message}`);
  estabelecimentoId = estabelecimento!.id as string;

  // Ouro = contribuição + convênio (a constraint chk_convenio_exige_contribuicao
  // impede convênio sem contribuição). Bronze/Prata saem só da contribuição.
  const ouro = await criarTrabalhador("02.5 teste — ouro com carta", true, true);
  const comCarta = await criarTrabalhador("02.5 teste — prata com carta", true, false);
  const semCarta = await criarTrabalhador("02.5 teste — bronze sem carta", false, false);
  expect(ouro.nivel, "nível derivado das flags").toBe("ouro");
  expect(comCarta.nivel).toBe("prata");
  expect(semCarta.nivel).toBe("bronze");
  ouroComCartaId = ouro.id;
  comCartaId = comCarta.id;
  semCartaId = semCarta.id;

  for (const trabalhadorId of [ouroComCartaId, comCartaId, semCartaId]) {
    const { error } = await clientes.admin
      .from("vinculos_empregaticios")
      .insert({ trabalhador_id: trabalhadorId, estabelecimento_id: estabelecimentoId, principal: true });
    if (error) throw new Error(`seed vínculo: ${error.message}`);
  }

  for (const trabalhadorId of [ouroComCartaId, comCartaId]) {
    const { error } = await clientes.admin
      .from("cartas_oposicao")
      .insert({ trabalhador_id: trabalhadorId, ano_base: ANO_BASE, data_entrega: `${ANO_BASE}-02-01` });
    if (error) throw new Error(`seed carta: ${error.message}`);
  }
});

afterAll(async () => {
  if (!clientes.admin) return;
  const ids = [ouroComCartaId, comCartaId, semCartaId].filter(Boolean);
  if (ids.length) {
    await clientes.admin.from("cartas_oposicao").delete().in("trabalhador_id", ids);
    await clientes.admin.from("vinculos_empregaticios").delete().in("trabalhador_id", ids);
    await clientes.admin.from("eventos_nivel").delete().in("trabalhador_id", ids);
    await clientes.admin.from("trabalhadores").delete().in("id", ids);
  }
  if (estabelecimentoId) await clientes.admin.from("estabelecimentos").delete().eq("id", estabelecimentoId);
  if (cnpjBasico) await clientes.admin.from("empresas").delete().eq("cnpj_basico", cnpjBasico);
  if (convencaoId) {
    await clientes.admin
      .from("notificacoes")
      .delete()
      .eq("referencia_tabela", "convencoes_coletivas")
      .eq("referencia_id", convencaoId);
    await clientes.admin.from("convencoes_coletivas").delete().eq("id", convencaoId);
  }
});

describe("Subetapa 02.5 — v_relatorio_convencao", () => {
  it("os 4 papéis internos leem o relatório; o parceiro não vê a CCT de teste", async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as Role[]) {
      const { data, error } = await clientes[p]
        .from("v_relatorio_convencao")
        .select("trabalhador_id")
        .eq("convencao_id", convencaoId);
      expect(error, `${p} deveria ler o relatório: ${error?.message}`).toBeNull();
      expect(data!.length, `${p} deveria ver os 3 trabalhadores`).toBe(3);
    }

    const { data: doParceiro } = await clientes.parceiro
      .from("v_relatorio_convencao")
      .select("trabalhador_id")
      .eq("convencao_id", convencaoId);
    expect(doParceiro ?? [], "parceiro não tem negócio com o cadastro da CCT").toEqual([]);
  });
});

describe("Subetapa 02.5 — fn_reclassificar_convencao", () => {
  /**
   * Um único `it` sequencial de propósito: a RPC "gasta" o delta (a 2ª execução
   * já retorna 0,0), então casos independentes viram dependentes da ordem de
   * execução e dão flake.
   */
  it("matriz de papéis, regras 5.1–5.3, origem do evento e idempotência", async () => {
    // --- Matriz: só o Admin executa -----------------------------------------
    for (const p of ["juridico", "secretaria", "presidente", "parceiro"] as Role[]) {
      const { error } = await clientes[p].rpc("fn_reclassificar_convencao", {
        p_convencao_id: convencaoId,
      });
      expect(error, `${p} não deveria executar a organização interna`).toBeTruthy();
      expect(error!.message).toContain("Rotina restrita ao Admin");
    }

    // anon NÃO recebe "Rotina restrita ao Admin": fn_guarda_job só levanta com
    // auth.uid() not null. Quem barra o anônimo é o `revoke ... from public,
    // anon` do 05_hardening.sql → 42501. Por isso a asserção é de erro de
    // permissão, não da mensagem.
    const { error: erroAnon } = await anon.rpc("fn_reclassificar_convencao", {
      p_convencao_id: convencaoId,
    });
    expect(ehErroRls(erroAnon), `anon deveria ser negado pelo grant: ${erroAnon?.message}`).toBe(true);

    // Nenhuma tentativa negada pode ter mexido em ninguém.
    expect(await nivelDe(ouroComCartaId)).toBe("ouro");
    expect(await nivelDe(comCartaId)).toBe("prata");
    expect(await nivelDe(semCartaId)).toBe("bronze");

    // --- 1ª execução: o Admin organiza --------------------------------------
    const { data, error } = await clientes.admin.rpc("fn_reclassificar_convencao", {
      p_convencao_id: convencaoId,
    });
    expect(error, error?.message).toBeNull();
    const resultado = (data as { para_bronze: number; para_prata: number }[])[0];

    // Deltas, não totais: só o "com carta" (prata→bronze) e o "sem carta"
    // (bronze→prata) mudam. O Ouro está fora do alvo (filtro nivel <> 'ouro').
    expect(resultado.para_bronze, "regra 5.1: com carta → Bronze").toBe(1);
    expect(resultado.para_prata, "regra 5.3: sem carta → Prata").toBe(1);

    // 5.2 — Ouro permanece Ouro mesmo tendo entregado carta (fidelidade de 1 ano
    // do convênio: precisa cancelar a adesão antes de regredir).
    expect(await nivelDe(ouroComCartaId), "regra 5.2: Ouro intocado").toBe("ouro");
    expect(await nivelDe(comCartaId), "regra 5.1").toBe("bronze");
    expect(await nivelDe(semCartaId), "regra 5.3").toBe("prata");

    // --- Origem do evento ----------------------------------------------------
    const eventosOuro = await eventosReclassificacaoDe(ouroComCartaId);
    expect(eventosOuro, "Ouro não deveria gerar evento de reclassificação").toEqual([]);

    const eventosComCarta = await eventosReclassificacaoDe(comCartaId);
    expect(eventosComCarta.length).toBe(1);
    expect(eventosComCarta[0]).toMatchObject({
      nivel_anterior: "prata",
      nivel_novo: "bronze",
      origem: "reclassificacao_anual",
    });

    const eventosSemCarta = await eventosReclassificacaoDe(semCartaId);
    expect(eventosSemCarta.length).toBe(1);
    expect(eventosSemCarta[0]).toMatchObject({
      nivel_anterior: "bronze",
      nivel_novo: "prata",
      origem: "reclassificacao_anual",
    });

    // reclassificada_em carimbado → some a dica R11 do dashboard.
    const { data: cct } = await clientes.admin
      .from("convencoes_coletivas")
      .select("reclassificada_em")
      .eq("id", convencaoId)
      .single();
    expect(cct!.reclassificada_em, "reclassificada_em carimbado").not.toBeNull();

    // --- 2ª execução: idempotência ------------------------------------------
    const { data: data2, error: erro2 } = await clientes.admin.rpc("fn_reclassificar_convencao", {
      p_convencao_id: convencaoId,
    });
    expect(erro2, erro2?.message).toBeNull();
    const resultado2 = (data2 as { para_bronze: number; para_prata: number }[])[0];

    // 0,0 é SUCESSO: ninguém estava com a flag divergente. É a prova de
    // idempotência que a spec pede como evidência da subetapa.
    expect(resultado2.para_bronze).toBe(0);
    expect(resultado2.para_prata).toBe(0);

    // E, mais importante que os deltas: nenhum evento novo.
    expect(
      (await eventosReclassificacaoDe(comCartaId)).length,
      "2ª execução não duplica eventos",
    ).toBe(1);
    expect(
      (await eventosReclassificacaoDe(semCartaId)).length,
      "2ª execução não duplica eventos",
    ).toBe(1);
    expect(
      (await eventosReclassificacaoDe(ouroComCartaId)).length,
      "Ouro segue sem evento de reclassificação",
    ).toBe(0);
    expect(await nivelDe(ouroComCartaId)).toBe("ouro");
    expect(await nivelDe(comCartaId)).toBe("bronze");
    expect(await nivelDe(semCartaId)).toBe("prata");
  });

  it("convenção inexistente é rejeitada", async () => {
    const { error } = await clientes.admin.rpc("fn_reclassificar_convencao", {
      p_convencao_id: crypto.randomUUID(),
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Convenção não encontrada");
  });
});
