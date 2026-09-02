import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, clienteAnon, ehProducao, type Role } from "./helpers";
import { MOTIVOS } from "../../src/features/descadastro/api";

/**
 * Subetapa 9.00 — descadastro com coleta de motivo.
 *
 * O QUE ESTA SUÍTE PROVA
 *  1. O recorte de leitura de `descadastros_campanha` bate com o de
 *     `envios_campanha` (§10.5 do sql/20): Admin, Presidente e Secretaria leem;
 *     Jurídico e Parceiro não alcançam linha nenhuma.
 *  2. NENHUM papel autenticado escreve ali. A ausência de policy de INSERT é
 *     deliberada (a escrita é só da Edge Function com service_role), e ausência
 *     de policy nega em silêncio — então o teste afirma isso em vez de deixar
 *     implícito.
 *  3. A recusa do endpoint público é RESULTADO, nunca exceção (§2.18): HTTP 200
 *     com `{ok:false}`. Se virasse `raise`, o registro da própria tentativa iria
 *     junto no rollback e o freio nunca contaria.
 *  4. `v_cobertura_contabilidades` ganhou `descadastrado_em` SEM inflar as duas
 *     contagens — a subconsulta escalar em vez do `join` (orientacoes.md §2.2).
 *  5. As sete opções da tela são exatamente as sete que o banco aceita. Divergir
 *     aqui produziria um motivo recusado pelo CHECK justamente no clique final,
 *     que é o único lugar onde não se pode falhar.
 *
 * O QUE ELA NÃO PROVA
 * O caminho de UM CLIQUE com segredo válido. Configurar `DESCADASTRO_WEBHOOK_
 * SEGREDO` é ato de quem tem o painel, não do repositório; o que se prova aqui é
 * o estado seguro por omissão — sem segredo, o caminho está FECHADO. A passagem
 * real pelo botão do Gmail é evidência da Onda 00 (Subetapa 9.1).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const LEEM: Role[] = ["admin", "presidente", "secretaria"];

const clientes: Record<Role, SupabaseClient> = {} as never;

const FN = `${process.env.VITE_SUPABASE_URL}/functions/v1/descadastrar`;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;

type RespostaFn = { ok: boolean; erro?: string; nome?: string; ja_estava?: boolean };

/** Lê como TEXTO e só então tenta JSON: caminho de erro de endpoint público
 *  pode vir da borda (WAF da Supabase) em HTML, e `.json()` direto quebraria o
 *  teste com um sintoma que parece achado e não é (orientacoes.md §7.8). */
async function chamar(init: RequestInit & { url: string }): Promise<{ http: number; corpo: RespostaFn | null; texto: string }> {
  const { url, ...resto } = init;
  const r = await fetch(url, resto);
  const texto = await r.text();
  let corpo: RespostaFn | null = null;
  try {
    corpo = JSON.parse(texto) as RespostaFn;
  } catch {
    corpo = null;
  }
  return { http: r.status, corpo, texto };
}

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
}, 60_000);

describe("9.00 · quem lê `descadastros_campanha`", () => {
  for (const papel of PAPEIS) {
    const deveLer = LEEM.includes(papel);
    it(`${papel}: ${deveLer ? "lê" : "não alcança linha nenhuma"}`, async () => {
      const { data, error } = await clientes[papel].from("descadastros_campanha").select("*").limit(1);
      // O GRANT é de SELECT para todo `authenticated`, então quem não pode não
      // recebe 42501: recebe conjunto vazio, filtrado pela policy. A distinção
      // importa — asserção errada aqui passaria mesmo se a policy sumisse.
      expect(error).toBeNull();
      if (!deveLer) expect((data ?? []).length).toBe(0);
    });
  }

  it("anônimo é barrado no GRANT (42501), não só pela RLS", async () => {
    const { error } = await clienteAnon().from("descadastros_campanha").select("*").limit(1);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("9.00 · nenhum papel autenticado escreve o descadastro", () => {
  // A escrita é exclusivamente da Edge Function com service_role. Se um papel
  // inserisse, existiria um segundo caminho de entrada sem token, sem rastro de
  // IP e sem passar pelo ESP — o mesmo motivo que fez `remessas_dados` nascer
  // sem policy de INSERT (sql/20 §10.6).
  for (const papel of LEEM) {
    it(`${papel} não insere`, async () => {
      const { error } = await clientes[papel]
        .from("descadastros_campanha")
        .insert({ via: "formulario", motivo: "outro", email: "9.00-teste@invalido.local" });
      expect(error).not.toBeNull();
    });
  }

  it("Admin não apaga um descadastro — é histórico, como o envio", async () => {
    const { data, error } = await clientes.admin
      .from("descadastros_campanha")
      .delete()
      .eq("via", "formulario")
      .select("id");
    // DELETE barrado por privilégio dá erro; barrado por RLS devolve zero linhas
    // (§2.6d). Os dois desfechos são aceitáveis; o inaceitável é apagar.
    if (error === null) expect((data ?? []).length).toBe(0);
  });
});

describe("9.00 · o endpoint público recusa como RESULTADO, nunca como exceção", () => {
  const lixos: Array<[string, string]> = [
    ["token que não é UUID", "nao-e-uuid-nenhum"],
    ["UUID inexistente", "00000000-0000-4000-8000-000000000000"],
  ];

  for (const [nome, token] of lixos) {
    it(`${nome}: HTTP 200 com ok:false e mensagem genérica`, async () => {
      const { http, corpo } = await chamar({
        url: `${FN}?token=${encodeURIComponent(token)}`,
        headers: { apikey: ANON_KEY },
      });
      expect(http).toBe(200);
      expect(corpo?.ok).toBe(false);
      // Mesma frase para os dois: "não existe" e "lixo" não podem se distinguir,
      // ou o endpoint vira oráculo de existência de token.
      expect(corpo?.erro).toBe("Link inválido.");
    });
  }

  it("consulta sem token nenhum também recusa como resultado", async () => {
    const { http, corpo } = await chamar({ url: FN, headers: { apikey: ANON_KEY } });
    expect(http).toBe(200);
    expect(corpo?.ok).toBe(false);
  });

  it("o webhook de um clique nasce FECHADO — sem o segredo configurado, 401", async () => {
    // Estado seguro por omissão: um webhook aberto deixaria qualquer um
    // descadastrar qualquer e-mail da base, sem token e sem rastro.
    const { http, corpo } = await chamar({
      url: `${FN}?fonte=brevo&chave=chute`,
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "qualquer@exemplo.com" }),
    });
    expect(http).toBe(401);
    expect(corpo?.ok).toBe(false);
  });
});

describe("9.00 · a marcação em /cobertura não inflou as contagens da view", () => {
  it("a soma de estabelecimentos continua batendo com a contagem crua — invariante, não contagem fixa", async () => {
    const { data: view, error } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("contabilidade_id, total_estabelecimentos, estabelecimentos_cobertos, descadastrado_em");
    expect(error).toBeNull();

    const { count: totalVinculos } = await clientes.admin
      .from("contabilidade_estabelecimentos")
      .select("id", { count: "exact", head: true });

    // O INVARIANTE, e não "> 0": a view faz `join contabilidade_estabelecimentos`,
    // e join interno some com a linha em silêncio. No bench há 4 contabilidades
    // e ZERO vínculos — a view devolve 0 linhas, corretamente. Fixar "> 0" aqui
    // faria o teste cobrar um cenário que só existe em produção, que é o defeito
    // que o §7.9 do orientacoes.md descreve. O que vale nos dois alvos é: a soma
    // da view É a contagem crua de vínculos.
    //
    // É esta igualdade que pega a armadilha da subconsulta: um
    // `join envios_campanha` multiplicaria a linha da contabilidade por quantos
    // envios ela tem — e "revogar token" (08.11) cria o segundo —, inflando a
    // soma em silêncio e fazendo a tela mentir para cima justamente onde a
    // decisão é "quem ainda falta" (§2.2).
    const somaView = (view ?? []).reduce((s, l) => s + (l.total_estabelecimentos as number), 0);
    expect(somaView).toBe(totalVinculos ?? 0);

    if ((totalVinculos ?? 0) > 0) {
      expect((view ?? []).length).toBeGreaterThan(0);
      expect(view?.[0]).toHaveProperty("descadastrado_em");
    }
  });

  it("a coluna `descadastrado_em` existe na view — provado por consulta, mesmo com a view vazia", async () => {
    // Separado do caso acima de propósito: pedir a coluna pelo nome no `select`
    // já é a prova de que ela existe. Se não existisse, o PostgREST devolveria
    // erro — e uma view vazia não teria como acusar a falta pela linha [0].
    const { error } = await clientes.admin
      .from("v_cobertura_contabilidades")
      .select("descadastrado_em")
      .limit(1);
    expect(error).toBeNull();
  });

  it("o Jurídico lê a view e recebe `descadastrado_em` nulo — sem erro e sem coluna nova de verdade", async () => {
    // A view é `security_invoker`: a subconsulta enfrenta a RLS de
    // `envios_campanha`, onde o Jurídico não tem policy de SELECT. O
    // comportamento certo é nulo, não 42501 — e afirmá-lo evita que uma futura
    // troca para SECURITY DEFINER passe despercebida.
    const { data, error } = await clientes.juridico
      .from("v_cobertura_contabilidades")
      .select("contabilidade_id, descadastrado_em")
      .limit(20);
    expect(error).toBeNull();
    for (const l of data ?? []) expect(l.descadastrado_em).toBeNull();
  });
});

describe("9.00 · a tela e o banco concordam sobre as sete opções", () => {
  it("os valores de MOTIVOS são exatamente os do CHECK em sql/24", () => {
    // Divergir aqui produziria um motivo recusado pelo CHECK no clique final —
    // o único lugar do fluxo onde falhar é inaceitável, porque é a saída.
    const sql = readFileSync("sql/24_descadastro_09_00.sql", "utf-8");
    const bloco = /motivo\s+text check \(motivo in \(([\s\S]*?)\)\)/.exec(sql);
    expect(bloco).not.toBeNull();
    const noBanco = [...(bloco![1].matchAll(/'([a-z_]+)'/g))].map((m) => m[1]).sort();
    const naTela = MOTIVOS.map((m) => m.valor).slice().sort();
    expect(naTela).toEqual(noBanco);
    expect(naTela.length).toBe(7);
  });

  it("`outro` existe — é o que impede que a pergunta obrigatória vire uma armadilha sem saída", () => {
    expect(MOTIVOS.map((m) => m.valor)).toContain("outro");
  });
});

describe("9.00 · a página pública não lê o banco", () => {
  it("nenhum arquivo de features/descadastro importa supabase-js", () => {
    // Mesma garantia de `features/coleta`: quem abre o link não tem sessão e não
    // deve alcançar tabela nenhuma, nem para ler. O token vale só na função.
    for (const arquivo of ["src/features/descadastro/api.ts", "src/features/descadastro/DescadastrarPage.tsx"]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte).not.toContain("@/lib/supabase");
      expect(fonte).not.toContain("from \"@supabase/supabase-js\"");
    }
  });

  it("o alvo desta execução está declarado — bench ou produção, medido e não anunciado", () => {
    // §2.20: teste que escolhe ambiente por variável precisa PROVAR em qual está.
    expect(typeof ehProducao()).toBe("boolean");
  });
});
