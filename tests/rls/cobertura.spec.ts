import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, ehErroRls, type Role } from "./helpers";
import { alterarEmailEReemitir } from "../../src/features/cobertura/api";

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
 *  4. A escrita de "revogar token" é restrita a Admin e Secretaria (Subetapa
 *     9.2 — antes era só Admin) — e UPDATE barrado por RLS não dá erro, só
 *     devolve zero linhas (§2.6d), então quem não pode é medido pelo NÚMERO de
 *     linhas afetadas, nunca por `expect(error).not.toBeNull()`.
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

/**
 * `montarLink` (features/cobertura/api.ts) usa `window.location.origin`, e isso
 * é DELIBERADO: o link copiado tem de apontar para o ambiente em que a tela
 * está aberta, nunca para uma URL cravada no código. A suíte roda em `node`,
 * onde `window` não existe.
 *
 * A saída é estabelecer a origem AQUI, no teste, em vez de pôr um fallback no
 * código de produção — um fallback silencioso devolveria um link com o domínio
 * errado no dia em que `window` faltasse por outro motivo, e um link errado é
 * pior que um erro, porque chega ao destinatário e ninguém consegue
 * diagnosticá-lo do outro lado da linha.
 */
if (typeof globalThis.window === "undefined") {
  (globalThis as { window?: unknown }).window = { location: { origin: "https://crm.teste.local" } };
}

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

/**
 * A matriz de permissão da ESCRITA mudou de lugar na Subetapa 9.2, e o motivo
 * é de método, não de estilo. Ela ficava aqui apoiada numa contabilidade
 * `DEMO%` já existente na base — e a limpeza de 2026-09-09 levou as três que
 * existiam. Sem fixture, os casos caíam no `if (!ativoDemo) return` e passavam
 * sem medir nada: verde por ausência de dado, que é o falso verde do §7.2.
 * Agora vivem no describe da 9.1 logo abaixo, que semeia o próprio envio e o
 * remove no `afterAll`.
 */

/**
 * Subetapa 9.1 — REEMISSÃO: revogar tem de deixar um link novo NA MÃO de quem
 * vai reenviá-lo.
 *
 * O relato foi "revogar não gera token novo". A medição em produção mostrou o
 * contrário: gerava, sempre. O que não existia era a leitura do link novo, e o
 * efeito prático era o mesmo — a contabilidade ficava sem caminho de envio.
 * Por isso estes casos afirmam as DUAS metades: que nasce um substituto ativo,
 * e que quem vai reenviá-lo consegue lê-lo — o Admin desde a 9.1, a Secretaria
 * desde a 9.2 (sql/28), o Presidente nunca.
 *
 * Fixture própria, com prefixo de subetapa e limpeza no `afterAll`: revogar um
 * envio da campanha viva mataria um link real de contabilidade.
 */
describe("9.1 + 9.2 · revogar emite um substituto, e quem atende consegue entregá-lo", () => {
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

  it("Admin e Secretaria leem o token na view; o Presidente lê a MESMA linha com token nulo", async () => {
    if (!contabilidadeId) return;

    const { data: comoAdmin, error: erroAdmin } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null)
      .maybeSingle();
    expect(erroAdmin).toBeNull();
    expect(typeof comoAdmin?.token).toBe("string");

    // Subetapa 9.2: a Secretaria passou a enxergar o token — é o que torna
    // "Link ativo" e "Revogar token" úteis para ela.
    const { data: comoSecretaria, error: erroSecretaria } = await clientes.secretaria
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("id", comoAdmin!.id as string)
      .maybeSingle();
    expect(erroSecretaria).toBeNull();
    expect(comoSecretaria?.id).toBe(comoAdmin!.id);
    expect(comoSecretaria?.token).toBe(comoAdmin!.token);

    // E o mascaramento continua existindo para quem não é nenhum dos dois —
    // sem este caso, a view teria virado um espelho sem função.
    const { data: comoPresidente, error: erroPresidente } = await clientes.presidente
      .from("v_envios_campanha_mascarada")
      .select("id, token")
      .eq("id", comoAdmin!.id as string)
      .maybeSingle();
    // §2.6b: a view não NEGA — ela some com o valor. Esperar erro aqui seria
    // esperar a coisa errada.
    expect(erroPresidente).toBeNull();
    expect(comoPresidente?.id).toBe(comoAdmin!.id);
    expect(comoPresidente?.token).toBeNull();
  }, 30_000);

  /**
   * A matriz de ESCRITA, medida por linhas afetadas (§2.6d). Roda depois do
   * caso acima e opera sobre o envio ativo do momento, seja ele o semeado ou o
   * substituto emitido pelo primeiro caso — por isso relê o ativo em vez de
   * guardar um id.
   */
  async function ativoAtual(): Promise<string | null> {
    const { data } = await clientes.admin
      .from("v_envios_campanha_mascarada")
      .select("id")
      .eq("contabilidade_id", contabilidadeId as string)
      .is("token_revogado_em", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.id as string) ?? null;
  }

  it("9.2 · a Secretaria revoga de verdade — uma linha afetada, não zero", async () => {
    if (!contabilidadeId) return;
    const alvo = await ativoAtual();
    expect(alvo, "fixture sem envio ativo para revogar").not.toBeNull();

    const { data, error } = await clientes.secretaria
      .from("envios_campanha")
      .update({ token_revogado_em: new Date().toISOString() })
      .eq("id", alvo as string)
      .select("id");
    expect(error).toBeNull();
    expect((data ?? []).length, "a Secretaria deveria revogar desde a 9.2").toBe(1);

    // A segunda metade da ação: ela também precisa conseguir EMITIR o
    // substituto, senão revogar volta a ser ação sem saída (§4.11).
    const { data: novo, error: erroInsert } = await clientes.secretaria
      .from("envios_campanha")
      .insert({
        campanha_id: campanhaId as string,
        contabilidade_id: contabilidadeId,
        email: `reemissao.secretaria.${Date.now()}@teste.local`,
      })
      .select("id")
      .single();
    expect(erroInsert, `a Secretaria não conseguiu emitir o substituto: ${JSON.stringify(erroInsert)}`).toBeNull();
    if (novo) enviosCriados.push(novo.id as string);
  }, 30_000);

  it("9.2 · o Presidente lê mas NÃO revoga: zero linhas, sem erro (§2.6d)", async () => {
    if (!contabilidadeId) return;
    const alvo = await ativoAtual();
    if (!alvo) return;
    const { data, error } = await clientes.presidente
      .from("envios_campanha")
      .update({ token_revogado_em: new Date().toISOString() })
      .eq("id", alvo)
      .select("id");
    expect(error).toBeNull();
    expect((data ?? []).length, "o Presidente não deveria revogar").toBe(0);
  }, 30_000);

  /**
   * TROCAR O E-MAIL DA CONTABILIDADE E REEMITIR O LINK (Subetapa 9.2).
   *
   * A função testada é a REAL, a mesma que a tela chama — não uma
   * reimplementação. Se a tela e o teste divergirem, é porque alguém forkou, e é
   * isso que se quer impedir (mesmo critério de `importarTrabalhadores` em
   * remessas.spec.ts).
   */
  it("9.2 · trocar o e-mail atualiza o cadastro E emite link novo PARA O ENDEREÇO NOVO", async () => {
    if (!contabilidadeId) return;
    const novoEmail = `trocado.${Date.now()}@teste.local`;

    const link = await alterarEmailEReemitir(contabilidadeId, novoEmail, clientes.secretaria);
    expect(link.link, "a troca não devolveu o link substituto — reemitir sem entregar não é reemitir").toBeTruthy();
    if (link.envioId) enviosCriados.push(link.envioId);

    // Efeito observável nos DOIS lugares (§7.2): cadastro e envio.
    const { data: cadastro } = await clientes.admin
      .from("contabilidades")
      .select("email")
      .eq("id", contabilidadeId)
      .maybeSingle();
    expect(cadastro?.email, "o cadastro não foi atualizado").toBe(novoEmail);

    const { data: ativos } = await clientes.admin
      .from("envios_campanha")
      .select("email")
      .eq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null);
    expect((ativos ?? []).length, "deveria sobrar exatamente um link ativo").toBe(1);
    expect(
      ativos![0].email,
      "o link novo nasceu com o e-mail ANTIGO — o próximo disparo iria para a caixa que a contabilidade abandonou",
    ).toBe(novoEmail);
  }, 30_000);

  /**
   * A guarda que custou caro para ser aprendida (2026-09-10): a Brevo FUNDE
   * contato por e-mail na importação. Dois envios ativos com o mesmo endereço
   * viram um contato só e um dos links some — sem erro e sem aviso.
   */
  it("9.2 · recusa e-mail que já tem link ativo em OUTRO destinatário", async () => {
    if (!contabilidadeId) return;
    const { data: outro } = await clientes.admin
      .from("envios_campanha")
      .select("email")
      .neq("contabilidade_id", contabilidadeId)
      .is("token_revogado_em", null)
      .is("descadastrado_em", null)
      .limit(1)
      .maybeSingle();
    if (!outro) return; // base sem outro envio ativo — nada com que colidir

    await expect(
      alterarEmailEReemitir(contabilidadeId, outro.email as string, clientes.secretaria),
    ).rejects.toThrow(/já existe um link ativo/i);

    // E a recusa tem de ser TOTAL: nada pode ter sido gravado pelo caminho.
    const { data: cadastro } = await clientes.admin
      .from("contabilidades")
      .select("email")
      .eq("id", contabilidadeId)
      .maybeSingle();
    expect(cadastro?.email, "o cadastro foi alterado mesmo com a troca recusada").not.toBe(outro.email);
  }, 30_000);

  it("9.2 · e-mail malformado é recusado antes de tocar em qualquer tabela", async () => {
    if (!contabilidadeId) return;
    const { data: antes } = await clientes.admin
      .from("contabilidades")
      .select("email")
      .eq("id", contabilidadeId)
      .maybeSingle();

    await expect(alterarEmailEReemitir(contabilidadeId, "sem-arroba", clientes.secretaria)).rejects.toThrow(
      /inválido/i,
    );

    const { data: depois } = await clientes.admin
      .from("contabilidades")
      .select("email")
      .eq("id", contabilidadeId)
      .maybeSingle();
    expect(depois?.email).toBe(antes?.email);
  }, 30_000);

  it("9.2 · o Presidente não troca o e-mail — RLS, não só UI", async () => {
    if (!contabilidadeId) return;
    await expect(
      alterarEmailEReemitir(contabilidadeId, `presidente.${Date.now()}@teste.local`, clientes.presidente),
    ).rejects.toThrow(/sem permissão/i);
  }, 30_000);

  it("9.2 · jurídico e parceiro nem enxergam a linha para tentar", async () => {
    if (!contabilidadeId) return;
    const alvo = await ativoAtual();
    if (!alvo) return;
    for (const p of ["juridico", "parceiro"] as const) {
      const { data, error } = await clientes[p]
        .from("envios_campanha")
        .update({ token_revogado_em: new Date().toISOString() })
        .eq("id", alvo)
        .select("id");
      expect(ehErroRls(error) || (data ?? []).length === 0).toBe(true);
    }
  }, 30_000);

  it("anon não alcança a view mascarada", async () => {
    const r = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/v_envios_campanha_mascarada?select=id`,
      { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string } },
    );
    expect(r.status).toBe(401);
  });
});

/**
 * Subetapa 9.1 — cobertura por EMPRESA isolada (`v_cobertura_empresas`).
 *
 * São 8.238 empresas contra 953 contabilidades, e é esse número que faz a tela
 * paginar no servidor: o PostgREST trunca em 1000 sem avisar (§2.4). Aqui a
 * suíte cobre o que a tela não consegue provar sozinha — a granularidade da
 * view, o universo que ela cobre e o recorte de papéis.
 */
describe("9.1 · v_cobertura_empresas: uma linha por empresa, e o mesmo recorte da origem", () => {
  it("UMA linha por estabelecimento — revogar+reemitir não pode duplicar a empresa na tela", async () => {
    // A armadilha do §2.2 aplicada a esta view: um `join` simples com
    // `envios_campanha` devolveria uma linha por envio, e cada revogação cria um
    // envio novo. O `distinct on` é o que impede a tela de contar duas vezes a
    // mesma empresa — e a Onda 00 já tem casos com dois envios.
    const { data, error } = await clientes.admin
      .from("v_cobertura_empresas")
      .select("estabelecimento_id")
      .limit(1000);
    expect(error).toBeNull();
    const ids = (data ?? []).map((l) => l.estabelecimento_id as string);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size, "a view devolveu a mesma empresa mais de uma vez").toBe(ids.length);
  });

  it("o universo é o dos envios de empresa isolada, contado de forma independente", async () => {
    const { count: naView } = await clientes.admin
      .from("v_cobertura_empresas")
      .select("estabelecimento_id", { count: "exact", head: true });

    // Contagem por outro caminho: os envios cujo alvo é estabelecimento. Como
    // pode haver mais de um envio por empresa (revogação), o esperado é que a
    // view tenha no MÁXIMO esse número — e ao menos uma linha.
    const { count: enviosIsolados } = await clientes.admin
      .from("envios_campanha")
      .select("id", { count: "exact", head: true })
      .not("estabelecimento_id", "is", null);

    expect(naView ?? 0).toBeGreaterThan(0);
    expect(naView ?? 0).toBeLessThanOrEqual(enviosIsolados ?? 0);
  });

  it("a credencial não entra nesta view — nem para o Admin", async () => {
    // O link em claro tem UM caminho só (`v_envios_campanha_mascarada`). Se a
    // coluna aparecesse também aqui, a regra de exposição passaria a ter dois
    // lugares para ser conferida — e um deles seria esquecido.
    const { error } = await clientes.admin.from("v_cobertura_empresas").select("token").limit(1);
    expect(error, "v_cobertura_empresas não deveria expor o token").not.toBeNull();
  });

  it("admin, presidente e secretaria leem; jurídico e parceiro veem zero", async () => {
    for (const p of ["admin", "presidente", "secretaria"] as const) {
      const { data, error } = await clientes[p].from("v_cobertura_empresas").select("estabelecimento_id").limit(5);
      expect(error, `select/${p}`).toBeNull();
      expect((data ?? []).length, `linhas/${p}`).toBeGreaterThan(0);
    }
    for (const p of ["juridico", "parceiro"] as const) {
      const { data, error } = await clientes[p].from("v_cobertura_empresas").select("estabelecimento_id").limit(5);
      // §2.6b: a RLS de origem zera as linhas, não levanta exceção.
      expect(error, `select/${p}`).toBeNull();
      expect((data ?? []).length, `${p} não deveria enxergar envios`).toBe(0);
    }
  });

  it("anon não alcança a view", async () => {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/v_cobertura_empresas?select=estabelecimento_id`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string },
    });
    expect(r.status).toBe(401);
  });

  it("os filtros da tela funcionam no servidor — cobertura e descadastro", async () => {
    // A tela filtra no banco porque 8.238 linhas não cabem numa resposta. Se
    // esses filtros não recortarem de verdade, a lista fica errada sem avisar.
    const { data: semEnvio, error: e1 } = await clientes.admin
      .from("v_cobertura_empresas")
      .select("estabelecimento_id, coberta")
      .eq("coberta", false)
      .limit(20);
    expect(e1).toBeNull();
    for (const l of semEnvio ?? []) expect(l.coberta).toBe(false);

    const { data: descadastradas, error: e2 } = await clientes.admin
      .from("v_cobertura_empresas")
      .select("estabelecimento_id, descadastrado_em")
      .not("descadastrado_em", "is", null)
      .limit(20);
    expect(e2).toBeNull();
    for (const l of descadastradas ?? []) expect(l.descadastrado_em).not.toBeNull();
  });
});
