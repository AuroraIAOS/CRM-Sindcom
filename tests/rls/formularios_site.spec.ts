import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, clienteServico, ehErroRls, exigirBench, loginComo } from "./helpers";

/**
 * WP 2.1 do plano do site — sql/35_formularios_site.sql.
 *
 * SÓ RODA EM BENCH: semeia linhas com a service_role (que a Edge Function usa) e confere
 * o que cada ator consegue ver. Habilite com SITE_FORMS_APPLIED=1 DEPOIS de aplicar o
 * SQL 35 num projeto descartável (docs/formularios_site_bd.md). Em produção `exigirBench`
 * lança antes de qualquer escrita.
 *
 * Dado de teste: tudo com prefixo "DEMO —" e removido no afterAll (regra do CLAUDE.md).
 */
const habilitado = process.env.SITE_FORMS_APPLIED === "1";
const d = habilitado ? describe : describe.skip;

const TAG = "DEMO — teste RLS formulários";
let servico: SupabaseClient;
const ids: Record<string, string> = {};
const protocolos: string[] = [];

const COLUNAS_DENUNCIA =
  "id,protocolo,empresa_denunciada,cidade,tipos,relato,urgencia,identificar,nome,email,status";

d("formulários do site — acesso por ator", () => {
  beforeAll(async () => {
    exigirBench("semear formulários do site");
    servico = clienteServico();

    const c = await servico.from("site_contatos").insert({
      nome: TAG, email: "demo@exemplo.com", mensagem: "teste", consentimento: true,
    }).select("id").single();
    expect(c.error).toBeNull(); ids.contato = c.data!.id;

    const v = await servico.from("site_vagas").insert({
      empresa: TAG, cnpj: "23778277000145", contato_nome: "DEMO Fulano", telefone: "35999999999",
      email: "demo@exemplo.com", cargo: "DEMO — Vendedor", descricao: "descrição demo",
      requisitos: "requisitos demo", consentimento: true,
    }).select("id").single();
    expect(v.error).toBeNull(); ids.vaga = v.data!.id;

    const a = await servico.from("site_denuncias").insert({
      empresa_denunciada: TAG, cidade: "Passos", tipos: ["trabalhista"], relato: "relato demo sigiloso",
      urgencia: "alta", comunicada_autoridade: "nao_sei", identificar: false, consentimento: true,
    }).select("id,protocolo").single();
    expect(a.error).toBeNull(); ids.denuncia = a.data!.id; protocolos.push(a.data!.protocolo);
  }, 30_000);

  afterAll(async () => {
    if (!servico) return;
    await servico.from("site_contatos").delete().like("nome", "DEMO%");
    await servico.from("site_vagas").delete().like("empresa", "DEMO%");
    await servico.from("site_denuncias").delete().like("empresa_denunciada", "DEMO%");
  }, 30_000);

  it("protocolo da denúncia segue DEN-AAAA-NNNNNN", () => {
    expect(protocolos[0]).toMatch(/^DEN-\d{4}-\d{6,}$/);
  });

  it("anon não lê nenhuma tabela e não insere", async () => {
    const anon = clienteAnon();
    for (const t of ["site_contatos", "site_curriculos", "site_vagas", "site_denuncias", "site_limites"]) {
      const { data, error } = await anon.from(t).select("id");
      expect(error !== null || (data ?? []).length === 0, `${t} vazou para anon`).toBe(true);
    }
    const ins = await anon.from("site_contatos").insert({ nome: TAG, email: "x@y.com", mensagem: "m", consentimento: true });
    expect(ehErroRls(ins.error)).toBe(true);
  });

  it("denúncia: só Admin e Jurídico leem; Secretaria, Presidente e Parceiro veem zero linhas", async () => {
    for (const role of ["admin", "juridico"] as const) {
      const { client } = await loginComo(role);
      const { data, error } = await client.from("site_denuncias").select(COLUNAS_DENUNCIA).eq("id", ids.denuncia);
      expect(error, role).toBeNull();
      expect(data, role).toHaveLength(1);
    }
    for (const role of ["secretaria", "presidente", "parceiro"] as const) {
      const { client } = await loginComo(role);
      const { data } = await client.from("site_denuncias").select(COLUNAS_DENUNCIA).eq("id", ids.denuncia);
      expect(data ?? [], role).toHaveLength(0);
    }
  });

  it("contato e vaga: Admin e Secretaria leem; Jurídico não", async () => {
    for (const role of ["admin", "secretaria"] as const) {
      const { client } = await loginComo(role);
      const c = await client.from("site_contatos").select("id,nome").eq("id", ids.contato);
      const v = await client.from("site_vagas").select("id,empresa").eq("id", ids.vaga);
      expect(c.data, role).toHaveLength(1); expect(v.data, role).toHaveLength(1);
    }
    const { client } = await loginComo("juridico");
    const c = await client.from("site_contatos").select("id").eq("id", ids.contato);
    expect(c.data ?? []).toHaveLength(0);
  });

  it("select * falha: origem_ip_hash não tem GRANT para authenticated (frontend lista colunas)", async () => {
    const { client } = await loginComo("admin");
    const { error } = await client.from("site_contatos").select("*").limit(1);
    expect(ehErroRls(error)).toBe(true);
  });

  it("UPDATE sem permissão afeta zero linhas, sem erro (§2.6d); com permissão, muda", async () => {
    const sec = (await loginComo("secretaria")).client;
    const barrado = await sec.from("site_denuncias").update({ status: "encerrada" }).eq("id", ids.denuncia).select("id");
    expect(barrado.error).toBeNull(); expect(barrado.data).toEqual([]);

    const jur = (await loginComo("juridico")).client;
    const ok = await jur.from("site_denuncias").update({ status: "em_analise" }).eq("id", ids.denuncia).select("id");
    expect(ok.data).toHaveLength(1);
  });

  it("jurídico não consegue alterar o relato (só status e responsável têm GRANT de UPDATE)", async () => {
    const jur = (await loginComo("juridico")).client;
    const { error } = await jur.from("site_denuncias").update({ relato: "adulterado" }).eq("id", ids.denuncia).select("id");
    expect(ehErroRls(error)).toBe(true);
  });

  it("CHECK: denúncia anônima não aceita nome, e-mail nem hash de IP", async () => {
    for (const extra of [{ nome: "Fulano" }, { email: "a@b.com" }, { origem_ip_hash: "a".repeat(32) }]) {
      const { error } = await servico.from("site_denuncias").insert({
        empresa_denunciada: TAG, cidade: "Passos", tipos: ["outra"], relato: "r", urgencia: "baixa",
        comunicada_autoridade: "sim", identificar: false, consentimento: true, ...extra,
      });
      expect(error, JSON.stringify(extra)).not.toBeNull();
    }
  });

  it("responsável da denúncia precisa ser Admin/Jurídico ativo", async () => {
    const sec = await loginComo("secretaria");
    const { error } = await servico.from("site_denuncias").update({ responsavel_id: sec.uid }).eq("id", ids.denuncia);
    expect(error).not.toBeNull();
  });

  it("vitrine pública: anon vê só vaga aprovada e SEM empresa, CNPJ ou contato", async () => {
    const anon = clienteAnon();
    const antes = await anon.from("v_vagas_publicas").select("*").eq("id", ids.vaga);
    expect(antes.data ?? []).toHaveLength(0); // pendente não aparece

    await servico.from("site_vagas").update({ status_moderacao: "aprovada" }).eq("id", ids.vaga);
    const { data, error } = await anon.from("v_vagas_publicas").select("*").eq("id", ids.vaga);
    expect(error).toBeNull(); expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(["cargo", "descricao", "id", "publicada_em", "requisitos_resumo"]);
    expect(data![0].publicada_em).not.toBeNull();

    await servico.from("site_vagas").update({ status_moderacao: "pendente" }).eq("id", ids.vaga);
    const volta = await servico.from("site_vagas").select("publicada_em").eq("id", ids.vaga).single();
    expect(volta.data!.publicada_em).toBeNull(); // reverter despublica
  });

  it("fn_site_limite: anon e authenticated não executam; service_role aplica o teto", async () => {
    const anon = await clienteAnon().rpc("fn_site_limite", { p_tipo: "t", p_chave_hash: "a".repeat(32), p_janela: "1 hour", p_maximo: 1 });
    expect(ehErroRls(anon.error)).toBe(true);
    const adm = (await loginComo("admin")).client;
    const r = await adm.rpc("fn_site_limite", { p_tipo: "t", p_chave_hash: "a".repeat(32), p_janela: "1 hour", p_maximo: 1 });
    expect(ehErroRls(r.error)).toBe(true);

    const chave = "demo" + Date.now().toString().padStart(28, "0");
    const a = await servico.rpc("fn_site_limite", { p_tipo: "demo", p_chave_hash: chave, p_janela: "1 hour", p_maximo: 1 });
    const b = await servico.rpc("fn_site_limite", { p_tipo: "demo", p_chave_hash: chave, p_janela: "1 hour", p_maximo: 1 });
    expect(a.data).toBe(true); expect(b.data).toBe(false);
    await servico.from("site_limites").delete().eq("tipo", "demo");
  });
});
