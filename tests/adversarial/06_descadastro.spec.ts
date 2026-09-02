// ============================================================================
// 06_descadastro.spec.ts — Portão adversarial da superfície NOVA (ETAPA 09 · 9.00)
//
// O CLAUDE.md dispara o portão em "qualquer etapa nova, integração nova ou
// deploy que aumente a superfície exposta". A 9.00 aumenta as três: uma tela
// sem login, uma tabela nova e uma Edge Function pública. Este arquivo NÃO
// reataca o que a 08.12 já cobriu (`05_comunicacao.spec.ts`) — ataca só o que a
// 9.00 criou.
//
// OS TRÊS LUGARES QUE A RLS NÃO ALCANÇA, aplicados a esta subetapa:
//   (1) view sem `security_invoker` → `v_cobertura_contabilidades` foi
//       REESCRITA aqui (`create or replace`), e um `create or replace` que
//       esqueça a opção a devolve para o dono. Medido no catálogo, não lido.
//   (2) função exposta como RPC → a 9.00 não criou função SQL nenhuma; o teste
//       de varredura afirma isso em vez de presumir.
//   (3) endpoint público com service_role → é o grosso deste arquivo.
//
// DIVISÃO POR ALVO, como nos 5 arquivos anteriores: o que só MEDE negação roda
// também contra produção, porque é lá que a RLS que vale está no ar; o que
// ESCREVE ou CONSOME recurso roda só no bench, atrás de `exigirBench()` (§2.20).
//
// UM ACHADO DESTE ARQUIVO JÁ FOI CORRIGIDO ANTES DE IR AO AR, e o teste que o
// mede continua aqui como regressão: o POST com token que não resolve envio
// nenhum gravava uma linha em `descadastros_campanha` a cada chamada, SEM
// freio — escrita não autenticada e ilimitada. O freio passou a valer nesse
// ramo, e só nele: token válido nunca é freado, porque frear a saída seria um
// obstáculo à saída.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, clienteServico, loginComo, ehProducao, exigirBench, type Role } from "../rls/helpers";

const PRODUCAO = ehProducao();
const bench = PRODUCAO ? describe.skip : describe;

const FN = `${process.env.VITE_SUPABASE_URL}/functions/v1/descadastrar`;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

type Resposta = { ok?: boolean; erro?: string; nome?: string; email?: string; ja_estava?: boolean; registrados?: number };

/** Nunca `.json()` direto: um caminho de erro pode vir da borda (WAF) em HTML,
 *  e o sintoma pareceria achado sem ser (orientacoes.md §7.8). */
async function chamar(url: string, init: RequestInit = {}): Promise<{ http: number; corpo: Resposta | null; texto: string }> {
  const r = await fetch(url, { ...init, headers: { apikey: ANON_KEY, ...(init.headers ?? {}) } });
  const texto = await r.text();
  let corpo: Resposta | null = null;
  try {
    corpo = JSON.parse(texto) as Resposta;
  } catch {
    corpo = null;
  }
  return { http: r.status, corpo, texto };
}

const postar = (corpo: unknown, url = FN) =>
  chamar(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
}, 60_000);

// ============================================================================
// V2/V7 — o anônimo contra a tabela nova
//
// A asserção FORTE é o 42501, não o conjunto vazio: vazio prova que a RLS
// filtrou; 42501 prova que o GRANT nem deixou a consulta chegar à policy.
// ============================================================================
describe("V2 — anônimo contra `descadastros_campanha`", () => {
  it("select: barrado no GRANT (42501), não só pela RLS", async () => {
    const { error } = await clienteAnon().from("descadastros_campanha").select("*").limit(1);
    expect(error?.code).toBe("42501");
  });

  it("insert: o anônimo não escreve um motivo diretamente, sem passar pelo endpoint", async () => {
    const { error } = await clienteAnon()
      .from("descadastros_campanha")
      .insert({ via: "formulario", motivo: "outro", email: "ataque@exemplo.com" });
    expect(error).not.toBeNull();
  });

  it("controle negativo: o Admin LÊ a tabela — não é 'negar tudo'", async () => {
    const { error } = await clientes.admin.from("descadastros_campanha").select("*").limit(1);
    expect(error).toBeNull();
  });
});

// ============================================================================
// V6 — o que o endpoint público entrega a quem só tem um token
// ============================================================================
describe("V6/V3 — o endpoint de descadastro como fonte de informação", () => {
  it("não é oráculo de existência: token inexistente e lixo respondem IGUAL", async () => {
    const a = await chamar(`${FN}?token=00000000-0000-4000-8000-000000000000`);
    const b = await chamar(`${FN}?token=%20nao-e-uuid%20`);
    expect(a.http).toBe(200);
    expect(b.http).toBe(200);
    expect(a.corpo?.ok).toBe(false);
    expect(b.corpo?.ok).toBe(false);
    // Se as mensagens divergissem, varrer o espaço de tokens ganharia um sinal.
    expect(a.corpo?.erro).toBe(b.corpo?.erro);
  });

  it("payload de SQL no token não devolve dado nem quebra o endpoint", async () => {
    const payloads = [
      "' or '1'='1",
      "'; drop table descadastros_campanha; --",
      "00000000-0000-4000-8000-000000000000' union select token from envios_campanha --",
    ];
    for (const p of payloads) {
      const { http, corpo, texto } = await chamar(`${FN}?token=${encodeURIComponent(p)}`);
      // A borda (WAF da Supabase) pode barrar antes da função — 403 com HTML é
      // desfecho legítimo, e confundi-lo com defeito já custou tempo (§7.8). O
      // que se afirma é o DESFECHO, não o formato.
      expect(texto).not.toContain('"ok":true');
      if (http === 200) expect(corpo?.ok).toBe(false);
    }
  });

  it("a base continua de pé depois dos payloads", async () => {
    const { error } = await clientes.admin.from("descadastros_campanha").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("parâmetro extra na URL não amplia o que o token alcança", async () => {
    const { corpo } = await chamar(
      `${FN}?token=00000000-0000-4000-8000-000000000000&select=*&campanha_id=1&limit=1000`,
    );
    expect(corpo?.ok).toBe(false);
  });
});

// ============================================================================
// V4 — o webhook de UM CLIQUE, que é o único caminho que descadastra POR E-MAIL
//
// Ele é o mais perigoso da subetapa: quem o alcançasse descadastraria qualquer
// endereço da base sem token nenhum, silenciando o canal com um contador
// legítimo. Por isso a asserção aqui não é sobre mensagem: é sobre STATUS.
// ============================================================================
describe("V4 — o webhook do ESP não abre sem o segredo", () => {
  const alvos = [
    ["sem chave nenhuma", `${FN}?fonte=brevo`],
    ["chave vazia", `${FN}?fonte=brevo&chave=`],
    ["chave chutada", `${FN}?fonte=brevo&chave=segredo`],
    ["chave longa", `${FN}?fonte=brevo&chave=${"a".repeat(512)}`],
  ] as const;

  for (const [nome, url] of alvos) {
    it(`${nome}: 401, e nada é registrado`, async () => {
      const { http, corpo } = await postar({ email: "alvo@exemplo.com" }, url);
      expect(http).toBe(401);
      expect(corpo?.ok).toBe(false);
      expect(corpo?.registrados).toBeUndefined();
    });
  }

  it("o segredo NÃO tem valor padrão no código — ausente significa fechado, nunca aberto", () => {
    const fonte = readFileSync("supabase/functions/descadastrar/index.ts", "utf-8");
    // `?? ""` seguido da guarda `!WEBHOOK_SEGREDO` é o que garante fechado por
    // omissão. Um default não vazio transformaria "não configurado" em "aberto
    // com senha conhecida", que é pior que aberto.
    expect(fonte).toMatch(/DESCADASTRO_WEBHOOK_SEGREDO"\)\s*\?\?\s*""/);
    expect(fonte).toContain("if (!WEBHOOK_SEGREDO ||");
  });
});

// ============================================================================
// Varredura de catálogo — o que a leitura de código NÃO enxerga
//
// Dois dos cinco achados da ETAPA 07 saíram daqui e de nenhum outro lugar.
// ============================================================================
describe("Varredura — o que o catálogo cobra do sql/24", () => {
  const arquivos = readdirSync("sql").filter((f) => f.endsWith(".sql"));

  it("a view reescrita pela 9.00 mantém `security_invoker` no arquivo", () => {
    // `create or replace view` que esqueça a opção devolve a view ao dono e ela
    // passa a ler a base inteira com o privilégio dele — foi assim que a base
    // empresarial vazou para `anon` na ETAPA 07 (§2.15).
    const sql = readFileSync("sql/24_descadastro_09_00.sql", "utf-8");
    const criacoes = sql.match(/create or replace view[\s\S]*?as\b/gi) ?? [];
    expect(criacoes.length).toBeGreaterThan(0);
    for (const c of criacoes) expect(c).toMatch(/security_invoker\s*=\s*on/i);
  });

  it("a tabela nova revoga `anon` explicitamente em algum arquivo sql/", () => {
    const revogado = arquivos.some((f) =>
      /revoke all on descadastros_campanha from anon/i.test(readFileSync(`sql/${f}`, "utf-8")),
    );
    expect(revogado).toBe(true);
  });

  it("`authenticated` recebe SELECT e só — a 9.00 não concede escrita a papel nenhum", () => {
    const sql = readFileSync("sql/24_descadastro_09_00.sql", "utf-8");
    // COMENTÁRIO FORA ANTES DE CASAR (orientacoes.md §4.9). A primeira versão
    // deste caso ficou vermelha contra um SQL correto: o bloco que EXPLICA a
    // decisão diz "Não é `grant all` com policy faltando", e o `[^;]*` do regex
    // atravessou a explicação até o `revoke all on descadastros_campanha` da
    // linha seguinte. Guarda por padrão textual precisa medir CÓDIGO, não prosa.
    const codigo = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(codigo).toMatch(/grant select on descadastros_campanha to authenticated/i);
    expect(codigo).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*on descadastros_campanha/i);
  });

  it("a 9.00 não criou função SQL nenhuma — logo não há RPC nova a expor", () => {
    // A RLS não olha `EXECUTE`: função nova nasce chamável por quem tiver o
    // grant, e é o segundo dos três lugares que o CLAUDE.md manda procurar. Aqui
    // a resposta é "não existe", e o teste a fixa para que criar uma no futuro
    // obrigue a revisar este arquivo.
    const sql = readFileSync("sql/24_descadastro_09_00.sql", "utf-8");
    expect(sql).not.toMatch(/create (or replace )?function/i);
  });
});

// ============================================================================
// MEDIÇÃO no catálogo VIVO — privilégio é o que o banco guardou, não o que o
// arquivo diz. Roda nos dois alvos: é leitura.
// ============================================================================
describe("MEDIÇÃO — o catálogo do alvo desta execução", () => {
  it("a view em produção/bench realmente tem `security_invoker` ligado", async () => {
    // Sem `exec_sql` disponível a papel autenticado, a prova possível pelo
    // cliente é COMPORTAMENTAL, e ela é mais forte que ler `reloptions`: se a
    // view fosse SECURITY DEFINER (do `postgres`), o Parceiro — que não lê
    // `contabilidades` — enxergaria linha. Ele não pode enxergar nenhuma.
    const { data, error } = await clientes.parceiro
      .from("v_cobertura_contabilidades")
      .select("contabilidade_id")
      .limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("controle positivo: o Admin lê onde o Parceiro não lê — sem isso o [] acima não prova nada", async () => {
    // O CONTROLE NÃO PODE SER A VIEW, e isso foi medido: no bench há 4
    // contabilidades e ZERO linhas em `contabilidade_estabelecimentos`, e o
    // `join` interno da view derruba tudo em silêncio (orientacoes.md §7.9).
    // Um controle positivo apoiado na view provaria "está vazio" em vez de
    // "o Parceiro está barrado" — e um `[]` que vem de tabela vazia não
    // distingue recorte de papel de ausência de dado.
    const admin = await clientes.admin.from("contabilidades").select("id").limit(5);
    const parceiro = await clientes.parceiro.from("contabilidades").select("id").limit(5);
    expect(admin.error).toBeNull();
    expect((admin.data ?? []).length).toBeGreaterThan(0);
    expect((parceiro.data ?? []).length).toBe(0);
  });

  it("a view não devolve o token do link — nem para o Admin", async () => {
    const { data } = await clientes.admin.from("v_cobertura_contabilidades").select("*").limit(1);
    const colunas = Object.keys((data ?? [{}])[0] ?? {});
    expect(colunas).not.toContain("token");
  });
});

// ============================================================================
// BENCH — o que ESCREVE. `exigirBench()` em cada caso, e o arquivo inteiro é
// pulado em produção antes disso (§2.20).
// ============================================================================
bench("BENCH · o freio do ramo que grava sem vínculo", () => {
  const servico = () => clienteServico();

  it("REGRESSÃO: POST em laço com token inválido para de gravar linha nova", async () => {
    exigirBench("laço de POST inválido contra /descadastrar");
    const admin = servico();
    const token = `9.00-ataque-${Date.now()}`;

    const antes = await admin
      .from("descadastros_campanha")
      .select("id", { count: "exact", head: true })
      .eq("token_informado", token);

    // 14 chamadas: o freio é 10 falhas em 15 min. Sem o conserto, seriam 14
    // linhas; com ele, o crescimento para bem antes disso.
    for (let i = 0; i < 14; i += 1) {
      await postar({ token, motivo: "outro", motivo_livre: `tentativa ${i}` });
    }

    const depois = await admin
      .from("descadastros_campanha")
      .select("id", { count: "exact", head: true })
      .eq("token_informado", token);

    const gravadas = (depois.count ?? 0) - (antes.count ?? 0);
    expect(gravadas).toBeGreaterThan(0); // o primeiro pedido É registrado
    expect(gravadas).toBeLessThan(14); // e o laço não escreve à vontade
  }, 60_000);

  it("a resposta ao freado é IGUAL à do não freado — nada confirma ao varredor que ele está sendo contado", async () => {
    exigirBench("POST freado contra /descadastrar");
    const token = `9.00-mesmo-texto-${Date.now()}`;
    const primeira = await postar({ token, motivo: "outro" });
    for (let i = 0; i < 12; i += 1) await postar({ token, motivo: "outro" });
    const depoisDoFreio = await postar({ token, motivo: "outro" });
    expect(depoisDoFreio.http).toBe(primeira.http);
    expect(depoisDoFreio.corpo?.ok).toBe(primeira.corpo?.ok);
  }, 60_000);
});

bench("BENCH · o que o conteúdo enviado pelo visitante consegue fazer", () => {
  it("motivo fora da lista vira NULL — nunca chega ao CHECK e nunca derruba a saída", async () => {
    exigirBench("POST com motivo arbitrário");
    const admin = clienteServico();
    const token = `9.00-motivo-invalido-${Date.now()}`;

    const { http, corpo } = await postar({ token, motivo: "'; delete from envios_campanha; --" });
    // O ponto central: a saída ACONTECE. Um CHECK violado devolveria erro e o
    // visitante ficaria sem conseguir sair por causa de um campo de telemetria.
    expect(http).toBe(200);
    expect(corpo?.ok).toBe(true);

    const { data } = await admin
      .from("descadastros_campanha")
      .select("motivo, motivo_livre")
      .eq("token_informado", token)
      .maybeSingle();
    expect(data?.motivo).toBeNull();
  }, 30_000);

  it("motivo_livre gigante é truncado, não recusado", async () => {
    exigirBench("POST com motivo_livre gigante");
    const admin = clienteServico();
    const token = `9.00-livre-gigante-${Date.now()}`;

    const { corpo } = await postar({ token, motivo: "outro", motivo_livre: "x".repeat(50_000) });
    expect(corpo?.ok).toBe(true);

    const { data } = await admin
      .from("descadastros_campanha")
      .select("motivo_livre")
      .eq("token_informado", token)
      .maybeSingle();
    expect((data?.motivo_livre as string | null)?.length ?? 0).toBeLessThanOrEqual(2000);
  }, 30_000);

  it("o token informado é truncado antes de virar linha — nada de campo ilimitado", async () => {
    exigirBench("POST com token gigante");
    const admin = clienteServico();
    const token = "9.00-token-gigante-" + "z".repeat(5_000);

    await postar({ token, motivo: "outro" });
    const { data } = await admin
      .from("descadastros_campanha")
      .select("token_informado")
      .like("token_informado", "9.00-token-gigante-%")
      .limit(1)
      .maybeSingle();
    if (data) expect((data.token_informado as string).length).toBeLessThanOrEqual(200);
  }, 30_000);

  it("GARANTIA DA SUBETAPA: nenhum desses ataques carimbou `descadastrado_em` em envio nenhum", async () => {
    exigirBench("conferência de envios_campanha após os ataques");
    const admin = clienteServico();
    // Os tokens dos casos acima não resolvem envio nenhum. Se algum tivesse
    // carimbado, um atacante estaria silenciando contadores legítimos — que é o
    // pior desfecho possível desta superfície.
    const { data } = await admin
      .from("descadastros_campanha")
      .select("envio_id")
      .like("token_informado", "9.00-%");
    for (const l of data ?? []) expect(l.envio_id).toBeNull();
  }, 30_000);
});
