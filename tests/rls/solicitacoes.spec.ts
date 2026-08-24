import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, type Role } from "./helpers";

/**
 * Subetapa 02.2 — triggers de negócio + máquina de estados do check-in.
 * Cobre os itens 2 e 3 da suíte contínua (plano_fases.md): nível mínimo do
 * benefício, beneficiado≠titular, bloqueio por inadimplência, snapshot de
 * valores; e check-in a partir de `solicitada` e `pendente_confirmacao`, guia
 * já processada e PIN inválido.
 *
 * O check-in roda pelo cliente ANÔNIMO de propósito: é exatamente o que o
 * recepcionista do parceiro faz ao escanear o QR, sem login.
 *
 * Fixtures têm prefixo "02.2 teste —" e são removidas no afterAll (os dados de
 * demonstração `DEMO —` são outra coisa, criados fora da suíte e preservados).
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;
let parceiroId: string;

const PIN_VALIDO = "4721";
let recepcionistaId: string;
let titularOuroId: string;
let titularBronzeId: string;
let titularInadimplenteId: string;
let beneficiadoDoOuroId: string;
let beneficiadoDeOutroId: string;
let beneficioOuroId: string;
let beneficioBronzeId: string;

const solicitacoesParaLimpar: string[] = [];
const faturasParaLimpar: string[] = [];

/** O banco só valida o formato (^\d{11}$), não o DV — e precisa ser único
 *  entre execuções, inclusive se uma rodada anterior tiver morrido no meio. */
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

async function criarBeneficiado(titularId: string, nome: string) {
  const { data, error } = await clientes.admin
    .from("beneficiados")
    .insert({ titular_id: titularId, cpf: cpfFicticio(), nome, tipo: "direto", status_cadastro: "aprovado" })
    .select("id")
    .single();
  if (error) throw new Error(`criarBeneficiado(${nome}): ${error.message}`);
  return data!.id as string;
}

async function criarBeneficio(nome: string, nivel: "bronze" | "prata" | "ouro") {
  const { data, error } = await clientes.admin
    .from("beneficios")
    .insert({
      parceiro_id: parceiroId,
      nome,
      nivel_minimo: nivel,
      valor_particular: 200,
      valor_convenio: 120,
    })
    .select("id")
    .single();
  if (error) throw new Error(`criarBeneficio(${nome}): ${error.message}`);
  return data!.id as string;
}

/** Insere pela Secretária — é ela quem opera a tela /servicos no dia a dia. */
async function criarSolicitacao(campos: Record<string, unknown>) {
  const resultado = await clientes.secretaria
    .from("solicitacoes_servico")
    .insert({ data_agendada: new Date().toISOString().slice(0, 10), ...campos })
    .select("id, token_publico, numero_guia, valor_particular, valor_convenio, status")
    .single();
  if (resultado.data) solicitacoesParaLimpar.push(resultado.data.id as string);
  return resultado;
}

beforeAll(async () => {
  for (const p of ["admin", "secretaria"] as Role[]) {
    const { client } = await loginComo(p);
    clientes[p] = client;
  }
  anon = clienteAnon();

  const { data: parceiro, error } = await clientes.admin.from("parceiros").select("id").limit(1).single();
  if (error) throw new Error(`Não obteve parceiro de teste: ${error.message}`);
  parceiroId = parceiro.id as string;

  const ouro = await criarTrabalhador("02.2 teste — titular ouro", true, true);
  const bronze = await criarTrabalhador("02.2 teste — titular bronze", false, false);
  const inadimplente = await criarTrabalhador("02.2 teste — titular inadimplente", true, true);
  expect(ouro.nivel, "nível derivado das flags").toBe("ouro");
  expect(bronze.nivel).toBe("bronze");
  titularOuroId = ouro.id;
  titularBronzeId = bronze.id;
  titularInadimplenteId = inadimplente.id;

  beneficiadoDoOuroId = await criarBeneficiado(titularOuroId, "02.2 teste — filho do ouro");
  beneficiadoDeOutroId = await criarBeneficiado(titularBronzeId, "02.2 teste — filho do bronze");

  beneficioOuroId = await criarBeneficio("02.2 teste — benefício ouro", "ouro");
  beneficioBronzeId = await criarBeneficio("02.2 teste — benefício bronze", "bronze");

  const { data: recep, error: erroRecep } = await clientes.admin.rpc("fn_criar_recepcionista", {
    p_parceiro_id: parceiroId,
    p_nome: "02.2 teste — recepcionista",
    p_pin: PIN_VALIDO,
  });
  if (erroRecep) throw new Error(`fn_criar_recepcionista: ${erroRecep.message}`);
  recepcionistaId = recep as string;
});

afterAll(async () => {
  for (const id of solicitacoesParaLimpar) {
    await clientes.admin.from("solicitacoes_servico").delete().eq("id", id);
  }
  for (const id of faturasParaLimpar) {
    await clientes.admin.from("faturas").delete().eq("id", id);
  }
  if (recepcionistaId) await clientes.admin.from("recepcionistas").delete().eq("id", recepcionistaId);
  for (const id of [beneficioOuroId, beneficioBronzeId]) {
    if (id) await clientes.admin.from("beneficios").delete().eq("id", id);
  }
  for (const id of [beneficiadoDoOuroId, beneficiadoDeOutroId]) {
    if (id) await clientes.admin.from("beneficiados").delete().eq("id", id);
  }
  // Trabalhadores por último: beneficiados têm FK on delete cascade, mas a
  // ordem explícita deixa o rastro do teste legível se algo falhar.
  for (const id of [titularOuroId, titularBronzeId, titularInadimplenteId]) {
    if (id) await clientes.admin.from("trabalhadores").delete().eq("id", id);
  }
});

// ---------------------------------------------------------------------------
describe("Triggers de negócio — fn_valida_solicitacao", () => {
  it("bronze não acessa benefício de nível ouro (bloqueio por nível)", async () => {
    const { error } = await criarSolicitacao({
      trabalhador_id: titularBronzeId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    expect(error, "deveria ser rejeitada pelo trigger").toBeTruthy();
    expect(error!.code).toBe("P0001");
    expect(error!.message).toMatch(/não permite acessar este benefício/i);
  });

  it("ouro acessa benefício de nível ouro e o valor é snapshot do catálogo", async () => {
    const { data, error } = await criarSolicitacao({
      trabalhador_id: titularOuroId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    expect(error, error?.message).toBeNull();
    // Preço nunca vem do formulário — o trigger copia do benefício na emissão.
    expect(Number(data!.valor_particular)).toBe(200);
    expect(Number(data!.valor_convenio)).toBe(120);
    expect(data!.status).toBe("solicitada");
    expect(data!.numero_guia).toMatch(/^\d{4}-\d{6}$/);
  });

  it("beneficiado de outro titular é rejeitado", async () => {
    const { error } = await criarSolicitacao({
      trabalhador_id: titularOuroId,
      beneficiado_id: beneficiadoDeOutroId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe("P0001");
    expect(error!.message).toMatch(/Beneficiado não pertence ao titular/i);
  });

  it("beneficiado do próprio titular é aceito", async () => {
    const { error } = await criarSolicitacao({
      trabalhador_id: titularOuroId,
      beneficiado_id: beneficiadoDoOuroId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    expect(error, error?.message).toBeNull();
  });

  it("mensalidade inadimplente bloqueia o convênio (e fn_titular_bloqueado acusa)", async () => {
    const { data: fatura, error: erroFatura } = await clientes.admin
      .from("faturas")
      .insert({
        trabalhador_id: titularInadimplenteId,
        tipo: "mensalidade_convenio",
        competencia: "2026-01-01",
        valor: 50,
        status: "inadimplente",
        forma_cobranca: "boleto_direto",
      })
      .select("id")
      .single();
    expect(erroFatura, erroFatura?.message).toBeNull();
    faturasParaLimpar.push(fatura!.id as string);

    // A pré-validação que o formulário faz antes do submit.
    const { data: bloqueado } = await clientes.secretaria.rpc("fn_titular_bloqueado", {
      p_trabalhador_id: titularInadimplenteId,
      p_tipo: "mensalidade_convenio",
    });
    expect(bloqueado).toBe(true);

    const { error } = await criarSolicitacao({
      trabalhador_id: titularInadimplenteId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe("P0001");
    expect(error!.message).toMatch(/mensalidade do convênio inadimplente/i);
  });
});

// ---------------------------------------------------------------------------
describe("Página pública do QR — fn_dados_guia_publica (anon)", () => {
  it("anon lê os dados pelo token; o interessado é o beneficiado quando houver", async () => {
    const { data: criada } = await criarSolicitacao({
      trabalhador_id: titularOuroId,
      beneficiado_id: beneficiadoDoOuroId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });

    const { data, error } = await anon.rpc("fn_dados_guia_publica", {
      p_token: criada!.token_publico,
    });
    expect(error, error?.message).toBeNull();
    const guia = (data as Record<string, unknown>[])[0];
    expect(guia.numero_guia).toBe(criada!.numero_guia);
    expect(guia.interessado).toBe("02.2 teste — filho do ouro");
    expect(guia.servico).toBe("02.2 teste — benefício ouro");
    expect(guia.status).toBe("solicitada");
    expect(Number(guia.valor_convenio)).toBe(120);
  });

  it("anon NÃO alcança a tabela por trás da RPC (só a função é pública)", async () => {
    const { data } = await anon.from("solicitacoes_servico").select("*", { count: "exact", head: true });
    expect(data).toBeNull();
  });

  it("token inexistente devolve vazio (não vaza existência)", async () => {
    const { data, error } = await anon.rpc("fn_dados_guia_publica", { p_token: crypto.randomUUID() });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/**
 * Recusa do check-in, no contrato vigente desde sql/19_hardening_adversarial.sql.
 *
 * A função deixou de levantar exceção no caminho de recusa e passou a devolver
 * `{ ok: false, erro }`. Não foi preferência de estilo: o freio contra força
 * bruta do PIN precisa REGISTRAR cada tentativa, e `raise exception` desfazia
 * esse registro no rollback da própria transação — o contador nunca saía de
 * zero (medido na ETAPA 07). O `error` do supabase-js ficou reservado a falha
 * de transporte.
 */
function motivoDaRecusa(resposta: { data: unknown; error: { message?: string } | null }): string {
  if (resposta.error) return resposta.error.message ?? "";
  const r = (resposta.data ?? {}) as { ok?: boolean; erro?: string };
  if (r.ok === true) return "";
  return r.erro ?? "";
}

describe("Máquina de estados — fn_registrar_checkin (anon, como o recepcionista)", () => {
  async function novaGuia() {
    const { data } = await criarSolicitacao({
      trabalhador_id: titularOuroId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioOuroId,
    });
    return data!;
  }

  it("check-in a partir de 'solicitada' com PIN válido → executada", async () => {
    const guia = await novaGuia();
    const { data, error } = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    expect(error, error?.message).toBeNull();
    expect((data as Record<string, unknown>).resultado).toBe("executada");

    const { data: linha } = await clientes.admin
      .from("solicitacoes_servico")
      .select("status, checkin_em, checkin_por")
      .eq("id", guia.id)
      .single();
    expect(linha!.status).toBe("executada");
    expect(linha!.checkin_em).toBeTruthy();
    expect(linha!.checkin_por).toBe(recepcionistaId);
  });

  it("check-in a partir de 'pendente_confirmacao' também é aceito", async () => {
    const guia = await novaGuia();
    // Simula o cron diário (04_dashboard.sql): passou a data sem check-in.
    await clientes.admin
      .from("solicitacoes_servico")
      .update({ status: "pendente_confirmacao" })
      .eq("id", guia.id);

    const { data, error } = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    expect(error, error?.message).toBeNull();
    expect((data as Record<string, unknown>).resultado).toBe("executada");
  });

  it("recusa registra 'rejeitada' com o motivo", async () => {
    const guia = await novaGuia();
    const { data, error } = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: false,
      p_justificativa: "Não compareceu",
    });
    expect(error, error?.message).toBeNull();
    expect((data as Record<string, unknown>).resultado).toBe("rejeitada");

    const { data: linha } = await clientes.admin
      .from("solicitacoes_servico")
      .select("status, motivo_rejeicao")
      .eq("id", guia.id)
      .single();
    expect(linha!.status).toBe("rejeitada");
    expect(linha!.motivo_rejeicao).toBe("Não compareceu");
  });

  it("guia já processada é rejeitada no segundo check-in", async () => {
    const guia = await novaGuia();
    await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    const segunda = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    expect(motivoDaRecusa(segunda)).toMatch(/já processada/i);
  });

  it("PIN inválido é rejeitado e não altera o status", async () => {
    const guia = await novaGuia();
    const recusa = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: "0000",
      p_atendido: true,
    });
    expect(motivoDaRecusa(recusa)).toMatch(/Senha de recepcionamento inválida/i);

    const { data: linha } = await clientes.admin
      .from("solicitacoes_servico")
      .select("status")
      .eq("id", guia.id)
      .single();
    expect(linha!.status).toBe("solicitada");
  });

  it("guia inexistente devolve 'Guia não encontrada'", async () => {
    const recusa = await anon.rpc("fn_registrar_checkin", {
      p_token: crypto.randomUUID(),
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    expect(motivoDaRecusa(recusa)).toMatch(/Guia não encontrada/i);
  });

  it("solicitação cancelada não aceita check-in", async () => {
    const guia = await novaGuia();
    await clientes.secretaria
      .from("solicitacoes_servico")
      .update({ status: "cancelada" })
      .eq("id", guia.id);

    const recusa = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico,
      p_pin: PIN_VALIDO,
      p_atendido: true,
    });
    expect(motivoDaRecusa(recusa)).toMatch(/já processada/i);
  });
});
