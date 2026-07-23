import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, ehErroRls, type Role } from "./helpers";

/**
 * Subetapa 04.1 — `/juridico`.
 *
 * Cobre duas coisas que estavam DESCOBERTAS até aqui:
 *  1. a matriz RLS de `atendimentos_juridicos` (6 atores × 4 operações);
 *  2. as 4 células do trigger `fn_valida_atendimento_juridico` — o gate dos
 *     Direitos Individuais nunca tinha rodado contra dado real. O teste antigo
 *     (`rls.spec.ts`) inseria `{}` e falhava no NOT NULL antes de chegar ao
 *     trigger, então só provava permissão, nunca regra de negócio.
 *
 * Login: um por papel no `beforeAll` (orientacoes.md §7.4 — `signInWithPassword`
 * tem cota; logar dentro de cada `it()` estoura a janela).
 *
 * Fixtures: prefixo `04.1 teste —` e remoção no `afterAll` (orientacoes.md §7.3
 * — dado DEMO fica gravado; fixture de suíte automatizada, não).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

let bronzeId: string;
let prataAdimplenteId: string;
let prataInadimplenteId: string;
const atendimentosParaLimpar: string[] = [];
const faturasParaLimpar: string[] = [];
const trabalhadoresParaLimpar: string[] = [];

const PREFIXO = "04.1 teste —";

async function criarTrabalhador(
  nome: string,
  cpf: string,
  contribuicao: boolean,
  mensalidade: boolean,
): Promise<string> {
  const { data, error } = await clientes.admin
    .from("trabalhadores")
    .insert({
      cpf,
      nome: `${PREFIXO} ${nome}`,
      recolhe_contribuicao_sindical: contribuicao,
      recolhe_mensalidade_convenio: mensalidade,
      status_cadastro: "aprovado",
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture "${nome}": ${error.message}`);
  trabalhadoresParaLimpar.push(data.id as string);
  return data.id as string;
}

/** Registra um atendimento e guarda o id para limpeza. */
async function inserirAtendimento(
  c: SupabaseClient,
  trabalhadorId: string,
  tipo: string,
  status = "aberto",
) {
  const { data, error } = await c
    .from("atendimentos_juridicos")
    .insert({ trabalhador_id: trabalhadorId, tipo, status })
    .select("id");
  if (data?.[0]?.id) atendimentosParaLimpar.push(data[0].id as string);
  return { data, error };
}

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
  anon = clienteAnon();

  bronzeId = await criarTrabalhador("Bronze", "70400000001", false, false);
  prataAdimplenteId = await criarTrabalhador("Prata adimplente", "70400000002", true, false);
  prataInadimplenteId = await criarTrabalhador("Prata inadimplente", "70400000003", true, false);

  // Torna o terceiro inadimplente na CONTRIBUIÇÃO — é essa fatura que
  // `fn_titular_bloqueado` consulta para fechar os Direitos Individuais.
  const { data, error } = await clientes.admin
    .from("faturas")
    .insert({
      trabalhador_id: prataInadimplenteId,
      tipo: "contribuicao_sindical",
      competencia: "2026-01-01",
      valor: 81.0,
      data_vencimento: "2026-02-01",
      status: "inadimplente",
      observacoes: `${PREFIXO} fixture de bloqueio por inadimplência`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture fatura inadimplente: ${error.message}`);
  faturasParaLimpar.push(data.id as string);
}, 60_000);

afterAll(async () => {
  for (const id of atendimentosParaLimpar) {
    await clientes.admin.from("atendimentos_juridicos").delete().eq("id", id);
  }
  for (const id of faturasParaLimpar) {
    await clientes.admin.from("faturas").delete().eq("id", id);
  }
  for (const id of trabalhadoresParaLimpar) {
    await clientes.admin.from("trabalhadores").delete().eq("id", id);
  }
  for (const p of PAPEIS) await clientes[p]?.auth.signOut();
});

// ---------------------------------------------------------------------------
describe("RLS — atendimentos_juridicos (sql/03_rls.sql §13)", () => {
  it("SELECT: os 4 papéis internos leem; parceiro e anon não", async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as Role[]) {
      const { error } = await clientes[p]
        .from("atendimentos_juridicos")
        .select("id", { count: "exact", head: true });
      expect(error, `select/${p}`).toBeNull();
    }

    // Parceiro e anon: a policy não os inclui, então a leitura não ERRA —
    // ela devolve zero linhas (orientacoes.md §2.6d/§3.2: "200 + vazio" é o
    // modo de negação do SELECT sob RLS, não 42501).
    for (const c of [clientes.parceiro, anon]) {
      const { data, error } = await c.from("atendimentos_juridicos").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("INSERT: admin e jurídico registram; secretaria, presidente e parceiro são negados", async () => {
    for (const p of ["admin", "juridico"] as Role[]) {
      const { error } = await inserirAtendimento(clientes[p], prataAdimplenteId, "orientacao");
      expect(error, `insert permitido/${p}`).toBeNull();
    }

    // A Secretaria é LEITORA aqui — inverso do papel dela nas demais telas.
    for (const p of ["secretaria", "presidente", "parceiro"] as Role[]) {
      const { error } = await inserirAtendimento(clientes[p], prataAdimplenteId, "orientacao");
      expect(ehErroRls(error), `insert negado/${p}`).toBe(true);
    }
  });

  it("UPDATE: negado para secretaria/presidente afeta ZERO linhas (sem erro)", async () => {
    const { data: criado } = await inserirAtendimento(
      clientes.admin,
      prataAdimplenteId,
      "orientacao",
    );
    const id = criado?.[0]?.id as string;

    // admin/jurídico alteram de fato
    const { data: comoJuridico, error: erroJuridico } = await clientes.juridico
      .from("atendimentos_juridicos")
      .update({ status: "em_andamento" })
      .eq("id", id)
      .select();
    expect(erroJuridico).toBeNull();
    expect(comoJuridico).toHaveLength(1);

    // secretaria: a policy `USING` esconde a linha do UPDATE — não é violação,
    // é no-op. `error === null` NÃO significa que salvou (orientacoes.md §2.6d).
    const { data: comoSecretaria, error: erroSecretaria } = await clientes.secretaria
      .from("atendimentos_juridicos")
      .update({ status: "concluido" })
      .eq("id", id)
      .select();
    expect(erroSecretaria).toBeNull();
    expect(comoSecretaria).toEqual([]);

    // Efeito observável: o status continua o que o jurídico deixou.
    const { data: final } = await clientes.admin
      .from("atendimentos_juridicos")
      .select("status")
      .eq("id", id)
      .single();
    expect(final?.status).toBe("em_andamento");
  });

  it("DELETE: só o Admin remove; jurídico não afeta linha nenhuma", async () => {
    const { data: criado } = await inserirAtendimento(
      clientes.admin,
      prataAdimplenteId,
      "orientacao",
    );
    const id = criado?.[0]?.id as string;

    const { data: tentativa, error } = await clientes.juridico
      .from("atendimentos_juridicos")
      .delete()
      .eq("id", id)
      .select();
    expect(error).toBeNull();
    expect(tentativa).toEqual([]);

    const { data: removido } = await clientes.admin
      .from("atendimentos_juridicos")
      .delete()
      .eq("id", id)
      .select();
    expect(removido).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("Trigger fn_valida_atendimento_juridico — gate dos Direitos Individuais", () => {
  it("Bronze + orientação: ACEITO (exceção deliberada, FAQ 07)", async () => {
    const { error } = await inserirAtendimento(clientes.juridico, bronzeId, "orientacao");
    expect(error).toBeNull();
  });

  it("Bronze + homologação: RECUSADO com a razão de nível", async () => {
    const { error } = await inserirAtendimento(clientes.juridico, bronzeId, "homologacao");
    expect(error?.code).toBe("P0001");
    expect(error?.message).toContain("Bronze");
    expect(error?.message).toContain("Prata");
  });

  it("Prata adimplente + processo: ACEITO", async () => {
    const { error } = await inserirAtendimento(clientes.juridico, prataAdimplenteId, "processo");
    expect(error).toBeNull();
  });

  it("Prata inadimplente na contribuição + processo: RECUSADO por bloqueio", async () => {
    const { error } = await inserirAtendimento(clientes.juridico, prataInadimplenteId, "processo");
    expect(error?.code).toBe("P0001");
    expect(error?.message).toMatch(/inadimplente|bloquead/i);
  });

  it("Prata inadimplente + orientação: ACEITO — orientação nunca é bloqueada", async () => {
    const { error } = await inserirAtendimento(clientes.juridico, prataInadimplenteId, "orientacao");
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("chk_status_atendimento (sql/16_juridico.sql)", () => {
  it("aceita os 4 valores do vocabulário", async () => {
    for (const status of ["aberto", "em_andamento", "concluido", "arquivado"]) {
      const { error } = await inserirAtendimento(
        clientes.admin,
        prataAdimplenteId,
        "orientacao",
        status,
      );
      expect(error, `status ${status}`).toBeNull();
    }
  });

  it("recusa valor fora do vocabulário (23514)", async () => {
    const { error } = await inserirAtendimento(
      clientes.admin,
      prataAdimplenteId,
      "orientacao",
      "em_analise_pelo_juridico",
    );
    expect(error?.code).toBe("23514");
  });
});
