import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo } from "./helpers";

/**
 * Subetapa 03.2 — notificação da Secretaria quando um cadastro chega pelo
 * formulário do site (`fn_notifica_cadastro_site`,
 * sql/15_notificacao_formulario_site.sql).
 *
 * Este teste cobre a metade que dá para exercitar dentro do harness normal
 * (RLS + trigger). A OUTRA metade — Edge Function `formulario-filiacao`
 * recebendo o POST do Apps Script com service_role — não dá para testar por
 * aqui: exige o segredo `FORMULARIO_FILIACAO_SECRET` configurado no painel
 * do Supabase (fora deste repositório, ver docs/formulario-filiacao.md) e
 * roda com service_role, que o harness de teste não possui de propósito
 * (CLAUDE.md). A lógica de inserção que a Edge Function faz é a MESMA
 * exercitada aqui (insert em trabalhadores com origem_cadastro =
 * 'formulario_site'), então o trigger de notificação — a parte 100% dentro
 * do banco — está coberto de ponta a ponta.
 *
 * O registro usado aqui é DEMO fixo (CPF 000.111.222-33, nunca aleatório):
 * fica gravado no banco de propósito (CLAUDE.md — dados de demonstração
 * permanecem), e o teste é idempotente — se já existir de uma rodada
 * anterior, não tenta recriar, só confere que a notificação correspondente
 * existe.
 */

const CPF_DEMO = "00011122233";
let admin: SupabaseClient;

beforeAll(async () => {
  admin = (await loginComo("admin")).client;
}, 30_000);

describe("03.2 · notificação de cadastro vindo do formulário do site", () => {
  it("insert com origem_cadastro=formulario_site + status_cadastro=pendente gera notificação para a secretaria", async () => {
    const { data: existente } = await admin
      .from("trabalhadores")
      .select("id")
      .eq("cpf", CPF_DEMO)
      .maybeSingle();

    let trabalhadorId: string;

    if (existente) {
      trabalhadorId = existente.id;
    } else {
      const { data: novo, error } = await admin
        .from("trabalhadores")
        .insert({
          nome: "DEMO — Filiação via site (Subetapa 03.2)",
          cpf: CPF_DEMO,
          origem_cadastro: "formulario_site",
          status_cadastro: "pendente",
          recolhe_contribuicao_sindical: true,
          recolhe_mensalidade_convenio: false,
          observacoes:
            "[Formulário de Filiação — DEMO fixado por teste automatizado]\nEmpresa: DEMO Comércio LTDA (CNPJ 00.000.000/0001-00)",
        })
        .select("id")
        .single();
      expect(error, error?.message).toBeNull();
      trabalhadorId = novo!.id;
    }

    // Efeito observável (orientacoes.md §7.2): a notificação tem que
    // existir de verdade, referenciando este trabalhador — não basta o
    // insert ter passado sem erro.
    const { data: notificacoes, error: erroNotif } = await admin
      .from("notificacoes")
      .select("id, destinatario_role, titulo, tipo")
      .eq("referencia_tabela", "trabalhadores")
      .eq("referencia_id", trabalhadorId);

    expect(erroNotif).toBeNull();
    expect(notificacoes!.length).toBeGreaterThanOrEqual(1);
    expect(notificacoes![0].destinatario_role).toBe("secretaria");
    expect(notificacoes![0].tipo).toBe("cadastro_site_pendente");
    expect(notificacoes![0].titulo).toContain("DEMO — Filiação via site");
  });

  it("secretária enxerga a notificação (RLS por destinatario_role)", async () => {
    const { client: secretaria } = await loginComo("secretaria");
    const { data, error } = await secretaria
      .from("notificacoes")
      .select("id")
      .eq("tipo", "cadastro_site_pendente");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    await secretaria.auth.signOut();
  });

  it("origem_cadastro diferente de formulario_site NÃO gera esta notificação", async () => {
    const cpfManual = "00099988877";
    const { data: existente } = await admin
      .from("trabalhadores")
      .select("id")
      .eq("cpf", cpfManual)
      .maybeSingle();

    let id: string;
    if (existente) {
      id = existente.id;
    } else {
      const { data: novo, error } = await admin
        .from("trabalhadores")
        .insert({
          nome: "DEMO — Cadastro manual (controle negativo 03.2)",
          cpf: cpfManual,
          origem_cadastro: "manual",
          status_cadastro: "pendente",
        })
        .select("id")
        .single();
      expect(error, error?.message).toBeNull();
      id = novo!.id;
    }

    const { data: notificacoes } = await admin
      .from("notificacoes")
      .select("id")
      .eq("referencia_tabela", "trabalhadores")
      .eq("referencia_id", id)
      .eq("tipo", "cadastro_site_pendente");
    expect(notificacoes).toEqual([]);
  });
});
