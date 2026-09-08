import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, ehErroRls, type Role } from "./helpers";

/**
 * Subetapa 08.11 — cobertura por contabilidade e revogação de token.
 *
 * O QUE ESTA SUÍTE PROVA
 *  1. `v_cobertura_contabilidades` (sql/22_cobertura_08_11.sql) devolve o
 *     MESMO universo que uma contagem independente por SQL cru — não é
 *     comparação com o número absoluto do dia da medição (§7.1b: o dado de
 *     demonstração cresce, então nunca fixe contagem, fixe o RECORTE).
 *  2. O recorte de papéis bate com a RLS das tabelas de origem — a view é
 *     `security_invoker = on`, então quem não pode ler `contabilidades`/
 *     `vinculos_empregaticios` não ganha nada por ler a view.
 *  3. `envios_campanha.token` continua fora de qualquer SELECT desta feature
 *     — string literal `.token` não aparece em `src/features/cobertura/`.
 *  4. A escrita de "revogar token" é mesmo restrita ao Admin — UPDATE barrado
 *     por RLS não dá erro, só devolve zero linhas (§2.6d).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
}, 60_000);

describe("08.11 · v_cobertura_contabilidades bate com uma contagem independente", () => {
  it("total de contabilidades e a soma de estabelecimentos batem com contagem crua", async () => {
    const { data: view, error } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("contabilidade_id, total_estabelecimentos, estabelecimentos_cobertos");
    expect(error).toBeNull();
    expect((view ?? []).length).toBeGreaterThan(0);

    const somaViewTotal = (view ?? []).reduce((s, l) => s + (l.total_estabelecimentos as number), 0);

    // Contagem independente: não pelo mesmo caminho que gravou a view.
    const { count: totalContabilidades } = await clientes.admin
      .from("contabilidades")
      .select("id", { count: "exact", head: true });
    const { count: totalVinculosContab } = await clientes.admin
      .from("contabilidade_estabelecimentos")
      .select("id", { count: "exact", head: true });

    expect((view ?? []).length).toBe(totalContabilidades);
    expect(somaViewTotal).toBe(totalVinculosContab);
  });

  it("estabelecimentos_cobertos nunca é maior que total_estabelecimentos, para nenhuma linha", async () => {
    const { data } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("total_estabelecimentos, estabelecimentos_cobertos");
    for (const l of data ?? []) {
      expect(l.estabelecimentos_cobertos as number).toBeLessThanOrEqual(l.total_estabelecimentos as number);
      expect(l.estabelecimentos_cobertos as number).toBeGreaterThanOrEqual(0);
    }
  });

  it("uma contabilidade com trabalhador vinculado real aparece com cobertos > 0", async () => {
    /**
     * A versão anterior deste caso pegava "o primeiro estabelecimento
     * `999999%`" e presumia que ele tinha trabalhador. Isso quebrou sozinho na
     * 9.1, quando a semeadura da Onda 00 acrescentou 9 estabelecimentos DEMO
     * ainda sem ninguém vinculado: o `limit(1)` sem ordenação passou a sortear
     * um deles e o teste ficou vermelho sem nada ter piorado no código — é a
     * §7.1b/§7.9 outra vez (dado de demonstração cresce; teste não pode
     * depender de qual linha o banco devolve primeiro).
     *
     * Agora o caminho é o inverso e não depende de sorteio: parte de um
     * VÍNCULO que existe de fato, sobe até a contabilidade dele, e só então
     * cobra da view o que ela promete.
     */
    const { data: vinculos } = await clientes.admin
      .from("vinculos_empregaticios")
      .select("estabelecimento_id")
      .limit(200);
    const idsComTrabalhador = [...new Set((vinculos ?? []).map((v) => v.estabelecimento_id as string))];
    if (idsComTrabalhador.length === 0) return; // base sem nenhum vínculo — nada a cruzar

    const { data: vinculoContab } = await clientes.admin
      .from("contabilidade_estabelecimentos")
      .select("contabilidade_id")
      .in("estabelecimento_id", idsComTrabalhador)
      .limit(1)
      .maybeSingle();
    if (!vinculoContab) return; // todos os cobertos são empresa isolada, sem contabilidade

    const { data: linha } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("estabelecimentos_cobertos")
      .eq("contabilidade_id", vinculoContab.contabilidade_id as string)
      .single();
    expect((linha?.estabelecimentos_cobertos as number) ?? 0).toBeGreaterThan(0);
  });
});

describe("08.11 · o recorte de papéis da view é o mesmo das tabelas de origem", () => {
  it("admin, presidente, secretaria e jurídico leem (mesmo recorte de contabilidades/vínculos)", async () => {
    for (const p of ["admin", "presidente", "secretaria", "juridico"] as const) {
      const { data, error } = await clientes[p].from("v_cobertura_contabilidades").select("contabilidade_id");
      expect(error, `select/${p}`).toBeNull();
      expect((data ?? []).length, `linhas/${p}`).toBeGreaterThan(0);
    }
  });

  it("parceiro vê ZERO linhas — RLS de origem filtra, a view não concede nada a mais", async () => {
    const { data, error } = await clientes.parceiro.from("v_cobertura_contabilidades").select("contabilidade_id");
    expect(error).toBeNull(); // §2.6b: RLS zera a linha, não levanta exceção
    expect((data ?? []).length).toBe(0);
  });

  it("anon não alcança a view (revogada explicitamente no GRANT)", async () => {
    const anonUrl = `${process.env.VITE_SUPABASE_URL}/rest/v1/v_cobertura_contabilidades?select=contabilidade_id`;
    const r = await fetch(anonUrl, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string },
    });
    expect(r.status).toBe(401);
  });
});

describe("08.11 + 9.1 · a credencial só entra nesta feature pela view mascarada", () => {
  /**
   * A guarda MUDOU DE FORMA na 9.1, e a mudança é deliberada.
   *
   * Até aqui ela exigia que a feature não lesse o token de jeito nenhum. O
   * efeito medido em produção foi que "Revogar" virou uma ação sem saída: o
   * link antigo morria, o novo nascia por DEFAULT do banco e ninguém conseguia
   * vê-lo para reenviar — a contabilidade perdia o acesso.
   *
   * A leitura agora existe, mas com a regra no BANCO
   * (`v_envios_campanha_mascarada`, sql/25: `token` só para Admin, `null` para
   * os demais). O que esta guarda protege, então, é a fronteira que continua
   * valendo: nunca ler a credencial da TABELA CRUA, onde não há mascaramento
   * nenhum e Presidente/Secretaria a receberiam em claro.
   */
  it("nenhum arquivo de features/cobertura lê o token de envios_campanha (tabela crua)", () => {
    const arquivos = execSync("git ls-files src/features/cobertura/", { encoding: "utf-8" })
      .split("\n")
      .filter(Boolean);

    const infratores: string[] = [];
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, "utf-8");
      // Cada `.from("...")` abre um bloco que vai até o próximo `.from(` — é
      // dentro dele que o `.select(...)` correspondente vive.
      const blocos = conteudo.split(/\.from\(/).slice(1);
      for (const bloco of blocos) {
        const tabela = bloco.match(/^"([^"]+)"/)?.[1] ?? "";
        if (tabela !== "envios_campanha") continue; // a view mascarada pode ler
        const select = bloco.match(/\.select\(([^)]*)\)/)?.[1] ?? "";
        if (/\btoken\b/.test(select)) infratores.push(`${arquivo}: .from("${tabela}")${select}`);
      }
    }
    expect(
      infratores.join("\n"),
      `leitura da credencial na tabela crua (sem mascaramento):\n${infratores.join("\n")}`,
    ).toBe("");
  });

  it("a leitura do token acontece, e só pela view mascarada", () => {
    // O contrapositivo do caso acima: se ninguém mais lê o token em lugar
    // nenhum, a reemissão voltou a ser uma ação sem saída — e a guarda de cima
    // continuaria verde, porque ela só sabe negar.
    const achados = execSync(
      'git grep -n "v_envios_campanha_mascarada" -- src/features/cobertura/ || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados, "a feature deixou de ler o link novo — revogar volta a ser ação sem saída").not.toBe("");
  });
});

describe("08.11 · revogar token é restrito ao Admin (RLS, não só UI)", () => {
  let ativoDemo: { id: string } | null = null;

  beforeAll(async () => {
    const { data: contabDemo } = await clientes.admin
      .from("contabilidades")
      .select("id")
      .ilike("nome", "DEMO%")
      .limit(1)
      .maybeSingle();
    if (!contabDemo) return;
    const { data } = await clientes.admin
      .from("envios_campanha")
      .select("id")
      .eq("contabilidade_id", contabDemo.id as string)
      .is("token_revogado_em", null)
      .limit(1)
      .maybeSingle();
    ativoDemo = data ? { id: data.id as string } : null;
  });

  it("secretaria tentando revogar recebe zero linhas afetadas, sem erro (§2.6d)", async () => {
    if (!ativoDemo) return; // sem envio DEMO ativo no ambiente — nada a atacar
    const { data, error } = await clientes.secretaria
      .from("envios_campanha")
      .update({ token_revogado_em: new Date().toISOString() })
      .eq("id", ativoDemo.id)
      .select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("juridico e parceiro nem sequer enxergam a linha para tentar", async () => {
    if (!ativoDemo) return;
    for (const p of ["juridico", "parceiro"] as const) {
      const { data, error } = await clientes[p]
        .from("envios_campanha")
        .update({ token_revogado_em: new Date().toISOString() })
        .eq("id", ativoDemo.id)
        .select("id");
      expect(ehErroRls(error) || (data ?? []).length === 0).toBe(true);
    }
  });
});

/**
 * Subetapa 9.1 — REEMISSÃO: revogar tem de deixar um link novo NA MÃO de quem
 * vai reenviá-lo.
 *
 * O relato foi "revogar não gera token novo". A medição em produção mostrou o
 * contrário: gerava, sempre. O que não existia era a leitura do link novo, e o
 * efeito prático era o mesmo — a contabilidade ficava sem caminho de envio.
 * Por isso estes casos afirmam as DUAS metades: que nasce um substituto ativo,
 * e que o Admin consegue lê-lo (e a Secretaria, não).
 *
 * Fixture própria, com prefixo de subetapa e limpeza no `afterAll`
 * (orientacoes.md §7.3): revogar o envio DEMO da Onda 00 mataria o link que o
 * Maxwell está usando no teste ponta a ponta.
 */
describe("9.1 · revogar emite um substituto, e o Admin consegue entregá-lo", () => {
  const PREFIXO = "9.1 teste —";
  let campanhaId: string | null = null;
  let contabilidadeId: string | null = null;
  const enviosCriados: string[] = [];

  beforeAll(async () => {
    const { data: campanha } = await clientes.admin
      .from("campanhas")
      .insert({ nome: `${PREFIXO} reemissão de token`, eixo: "requisicao", onda: 0 })
      .select("id")
      .single();
    campanhaId = (campanha?.id as string) ?? null;
    if (!campanhaId) return;

    const { data: contab } = await clientes.admin
      .from("contabilidades")
      .insert({ nome: `${PREFIXO} Reemissão`, email: `reemissao.${Date.now()}@teste.local` })
      .select("id, email")
      .single();
    contabilidadeId = (contab?.id as string) ?? null;
    if (!contabilidadeId) return;

    const { data: envio } = await clientes.admin
      .from("envios_campanha")
      .insert({ campanha_id: campanhaId, contabilidade_id: contabilidadeId, email: contab!.email as string })
      .select("id")
      .single();
    if (envio) enviosCriados.push(envio.id as string);
  }, 30_000);

  afterAll(async () => {
    // Ordem de dependência: envios antes da campanha/contabilidade (FK restrict).
    const { data: todos } = await clientes.admin
      .from("envios_campanha")
      .select("id")
      .eq("campanha_id", campanhaId ?? "00000000-0000-0000-0000-000000000000");
    for (const e of todos ?? []) await clientes.admin.from("envios_campanha").delete().eq("id", e.id as string);
    if (contabilidadeId) await clientes.admin.from("contabilidades").delete().eq("id", contabilidadeId);
    if (campanhaId) await clientes.admin.from("campanhas").delete().eq("id", campanhaId);
  }, 30_000);

  it("depois de revogar sobra exatamente UM ativo, e com token diferente do revogado", async () => {
    if (!contabilidadeId) return;

    // Passo 1 e 2, exatamente como `useRevogarToken` faz.
    const { data: antes } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(antes, "fixture sem envio ativo").not.toBeNull();
    const tokenAntigo = antes!.token as string;

    await clientes.admin
      .from("envios_campanha")
      .update({ token_revogado_em: new Date().toISOString() })
      .eq("id", antes!.id as string);
    const { data: novo } = await clientes.admin
      .from("envios_campanha")
      .insert({
        campanha_id: campanhaId as string,
        contabilidade_id: contabilidadeId,
        email: `reemissao.${Date.now()}@teste.local`,
      })
      .select("id")
      .single();
    if (novo) enviosCriados.push(novo.id as string);

    // O efeito observável (§7.2), não a ausência de erro.
    const { data: ativos } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null);
    expect((ativos ?? []).length, "deveria haver exatamente um link ativo").toBe(1);
    expect(ativos![0].token as string).not.toBe(tokenAntigo);

    // E o antigo tem de estar inutilizável, não apagado — é histórico.
    const { data: revogado } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("token_revogado_em")
      .eq("id", antes!.id as string)
      .maybeSingle();
    expect(revogado?.token_revogado_em).not.toBeNull();
  }, 30_000);

  it("o Admin lê o token na view mascarada; a Secretaria lê a MESMA linha com token nulo", async () => {
    if (!contabilidadeId) return;

    const { data: comoAdmin, error: erroAdmin } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null)
      .maybeSingle();
    expect(erroAdmin).toBeNull();
    expect(typeof comoAdmin?.token).toBe("string");

    const { data: comoSecretaria, error: erroSecretaria } = await clientes.secretaria
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("id", comoAdmin!.id as string)
      .maybeSingle();
    // §2.6b: a view não NEGA — ela some com o valor. Esperar erro aqui seria
    // esperar a coisa errada.
    expect(erroSecretaria).toBeNull();
    expect(comoSecretaria?.id).toBe(comoAdmin!.id);
    expect(comoSecretaria?.token).toBeNull();
  }, 30_000);

  it("anon não alcança a view mascarada", async () => {
    const r = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/v_envios_campanha_mascarada?select=id`,
      { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string } },
    );
    expect(r.status).toBe(401);
  });
});
