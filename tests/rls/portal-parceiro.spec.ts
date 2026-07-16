import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, type Role } from "./helpers";

/**
 * Subetapa 02.3 — portal do parceiro: `v_fila_parceiro` (escopo + sem CPF) e
 * confirmação em lote (contra-referência mensal) guardada por
 * `fn_guarda_parceiro_solicitacao`.
 *
 * O usuário de teste "parceiro" (`.env.test`) já está vinculado ao único
 * parceiro semeado no projeto (mesmo usado pela suíte de RLS geral e pelos
 * dados `DEMO —`) — daí buscarmos `anaParceiroId` do mesmo jeito que
 * `rls.spec.ts` faz, em vez de assumir um id fixo.
 */

const clientes: Record<Role, SupabaseClient> = {} as never;
let anaParceiroId: string;
let outroParceiroId: string;
let titularId: string;
let beneficioId: string;

const solicitacoesParaLimpar: string[] = [];

function cpfFicticio(): string {
  return String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
}

async function novaSolicitacao(parceiroId: string, status: "solicitada" | "pendente_confirmacao") {
  const { data, error } = await clientes.secretaria
    .from("solicitacoes_servico")
    .insert({
      trabalhador_id: titularId,
      parceiro_id: parceiroId,
      beneficio_id: beneficioId,
      data_agendada: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) throw new Error(`novaSolicitacao: ${error.message}`);
  const id = data!.id as string;
  solicitacoesParaLimpar.push(id);
  if (status === "pendente_confirmacao") {
    await clientes.admin.from("solicitacoes_servico").update({ status }).eq("id", id);
  }
  return id;
}

beforeAll(async () => {
  for (const p of ["admin", "secretaria", "parceiro"] as Role[]) {
    const { client } = await loginComo(p);
    clientes[p] = client;
  }

  const { data: parceiro, error } = await clientes.admin.from("parceiros").select("id").limit(1).single();
  if (error) throw new Error(`Não obteve parceiro de teste: ${error.message}`);
  anaParceiroId = parceiro.id as string;

  // Segundo parceiro só para provar o escopo (fn_parceiro_id()) — apagado no afterAll.
  const { data: outro, error: erroOutro } = await clientes.admin
    .from("parceiros")
    .insert({ nome: "02.3 teste — parceiro concorrente" })
    .select("id")
    .single();
  if (erroOutro) throw new Error(`criar parceiro concorrente: ${erroOutro.message}`);
  outroParceiroId = outro!.id as string;

  const { data: t, error: erroT } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf: cpfFicticio(),
      nome: "02.3 teste — titular",
      recolhe_contribuicao_sindical: true,
      recolhe_mensalidade_convenio: true,
      status_cadastro: "aprovado",
    })
    .select("id")
    .single();
  if (erroT) throw new Error(`criar trabalhador: ${erroT.message}`);
  titularId = t!.id as string;

  const { data: b, error: erroB } = await clientes.admin
    .from("beneficios")
    .insert({ parceiro_id: anaParceiroId, nome: "02.3 teste — benefício", nivel_minimo: "ouro" })
    .select("id")
    .single();
  if (erroB) throw new Error(`criar benefício: ${erroB.message}`);
  beneficioId = b!.id as string;
});

afterAll(async () => {
  for (const id of solicitacoesParaLimpar) {
    await clientes.admin.from("solicitacoes_servico").delete().eq("id", id);
  }
  if (beneficioId) await clientes.admin.from("beneficios").delete().eq("id", beneficioId);
  if (titularId) await clientes.admin.from("trabalhadores").delete().eq("id", titularId);
  if (outroParceiroId) await clientes.admin.from("parceiros").delete().eq("id", outroParceiroId);
});

// ---------------------------------------------------------------------------
describe("v_fila_parceiro — escopo por fn_parceiro_id() e sem CPF", () => {
  it("parceiro vê a própria solicitação e não vê a de outro parceiro", async () => {
    const idPropria = await novaSolicitacao(anaParceiroId, "solicitada");
    const idAlheia = await novaSolicitacao(outroParceiroId, "solicitada");

    const { data: propria, error: e1 } = await clientes.parceiro
      .from("v_fila_parceiro")
      .select("*")
      .eq("id", idPropria)
      .maybeSingle();
    expect(e1, e1?.message).toBeNull();
    expect(propria).not.toBeNull();
    // A view não seleciona CPF em nenhuma coluna — a única forma de vazar
    // seria via um join que a própria definição de v_fila_parceiro não faz.
    expect(Object.keys(propria ?? {})).not.toContain("cpf");
    expect(propria?.interessado).toBe("02.3 teste — titular");

    const { data: alheia } = await clientes.parceiro
      .from("v_fila_parceiro")
      .select("*")
      .eq("id", idAlheia)
      .maybeSingle();
    expect(alheia).toBeNull();
  });

  it("secretária/admin veem ambas (sem o filtro de fn_parceiro_id())", async () => {
    const idA = await novaSolicitacao(anaParceiroId, "solicitada");
    const idB = await novaSolicitacao(outroParceiroId, "solicitada");
    const { data } = await clientes.admin.from("solicitacoes_servico").select("id").in("id", [idA, idB]);
    expect((data ?? []).map((l) => l.id).sort()).toEqual([idA, idB].sort());
  });
});

// ---------------------------------------------------------------------------
describe("Confirmação em lote — fn_guarda_parceiro_solicitacao", () => {
  it("parceiro confirma em lote (pendente_confirmacao → executada) e o trigger carimba confirmada_por/em", async () => {
    const id1 = await novaSolicitacao(anaParceiroId, "pendente_confirmacao");
    const id2 = await novaSolicitacao(anaParceiroId, "pendente_confirmacao");

    const { error } = await clientes.parceiro
      .from("solicitacoes_servico")
      .update({ status: "executada" })
      .in("id", [id1, id2]);
    expect(error, error?.message).toBeNull();

    const { data } = await clientes.admin
      .from("solicitacoes_servico")
      .select("id, status, confirmada_por, confirmada_em")
      .in("id", [id1, id2]);
    for (const linha of data ?? []) {
      expect(linha.status).toBe("executada");
      expect(linha.confirmada_por).toBeTruthy();
      expect(linha.confirmada_em).toBeTruthy();
    }
  });

  it("parceiro recusa em lote registrando motivo_rejeicao", async () => {
    const id = await novaSolicitacao(anaParceiroId, "pendente_confirmacao");
    const { error } = await clientes.parceiro
      .from("solicitacoes_servico")
      .update({ status: "rejeitada", motivo_rejeicao: "Não compareceu (lote)" })
      .in("id", [id]);
    expect(error, error?.message).toBeNull();

    const { data } = await clientes.admin
      .from("solicitacoes_servico")
      .select("status, motivo_rejeicao")
      .eq("id", id)
      .single();
    expect(data!.status).toBe("rejeitada");
    expect(data!.motivo_rejeicao).toBe("Não compareceu (lote)");
  });

  it("parceiro NÃO pode alterar campos além de status/motivo (guarda rejeita)", async () => {
    const id = await novaSolicitacao(anaParceiroId, "pendente_confirmacao");
    const { error } = await clientes.parceiro
      .from("solicitacoes_servico")
      .update({ status: "executada", valor_convenio: 1 })
      .eq("id", id);
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/só pode alterar o status e o motivo/i);
  });

  it("parceiro NÃO pode reprocessar guia já executada", async () => {
    const id = await novaSolicitacao(anaParceiroId, "pendente_confirmacao");
    await clientes.parceiro.from("solicitacoes_servico").update({ status: "executada" }).eq("id", id);

    const { error } = await clientes.parceiro
      .from("solicitacoes_servico")
      .update({ status: "rejeitada" })
      .eq("id", id);
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/só pode evoluir solicitações abertas/i);
  });

  it("parceiro NÃO confirma solicitação de outro parceiro (RLS de UPDATE, não só a guarda)", async () => {
    const id = await novaSolicitacao(outroParceiroId, "pendente_confirmacao");
    const { data, error } = await clientes.parceiro
      .from("solicitacoes_servico")
      .update({ status: "executada" })
      .eq("id", id)
      .select();
    // pol_solic_update: sem match de linha para este ator => 0 linhas afetadas,
    // não um erro — a policy simplesmente não encontra a linha para o parceiro.
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const { data: intacta } = await clientes.admin
      .from("solicitacoes_servico")
      .select("status")
      .eq("id", id)
      .single();
    expect(intacta!.status).toBe("pendente_confirmacao");
  });
});
