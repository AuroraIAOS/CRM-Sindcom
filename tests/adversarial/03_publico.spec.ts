// ============================================================================
// 03_publico.spec.ts — Portão de segurança adversarial (ETAPA 07)
// Vetores V2, V6 e V7 na SUPERFÍCIE PÚBLICA — a parte do sistema que responde
// a quem não fez login nenhum:
//
//   1. fn_dados_guia_publica(uuid)                   — página do QR da guia
//   2. fn_registrar_checkin(uuid,text,boolean,text)  — check-in do parceiro
//   3. Edge Function `formulario-filiacao`           — verify_jwt = false
//
// É aqui que o CRM Vitrine encontrou o achado A06: código de servidor rodando
// com service_role, onde a RLS não participa. O Sindcom é mono-organização e não
// tem fronteira de conta para cruzar — o que sobra é PIN, token e segredo.
//
// Os casos que ESCREVEM rodam só no bench. Os que apenas medem negação rodam
// também contra produção, que é onde a fidelidade importa.
// ============================================================================
import { describe, it, expect, afterAll } from "vitest";
import { clienteAnon, clienteServico, ehProducao } from "../rls/helpers";

const PULAR = ehProducao();
const bench = PULAR ? describe.skip : describe;

const limpeza: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza adversarial falhou:", (e as Error).message);
    }
  }
});

// ============================================================================
// 1. A guia pública — o token é a única credencial
// ============================================================================
describe("V7 — página pública da guia", () => {
  it("token aleatório não devolve guia nenhuma (não é enumerável)", async () => {
    const anon = clienteAnon();
    for (let i = 0; i < 5; i++) {
      const { data, error } = await anon.rpc("fn_dados_guia_publica", { p_token: crypto.randomUUID() });
      expect(error, `RPC pública falhou com token aleatório: ${JSON.stringify(error)}`).toBeNull();
      expect((data ?? []).length, "token aleatório devolveu uma guia — o espaço de token é adivinhável").toBe(0);
    }
  });

  it("a guia pública não expõe CPF nem contato — só o necessário para o balcão", async () => {
    // O contrato de retorno é a defesa: se alguém acrescentar uma coluna na
    // função, ela passa a valer para todo mundo que tiver o link, para sempre.
    const anon = clienteAnon();
    const { data } = await anon.rpc("fn_dados_guia_publica", { p_token: crypto.randomUUID() });
    // Sem linha não há colunas para inspecionar; a asserção forte vive no bench,
    // com uma guia real. Aqui garante-se apenas que a chamada é legítima.
    expect(Array.isArray(data)).toBe(true);
  });
});

bench("V7 — a guia pública, com uma guia de verdade", () => {
  it("devolve o balcão, e nada além dele", async () => {
    const admin = clienteServico();
    const { data: guia } = await admin
      .from("solicitacoes_servico")
      .select("token_publico")
      .limit(1)
      .single();

    const { data, error } = await clienteAnon().rpc("fn_dados_guia_publica", { p_token: guia!.token_publico });
    expect(error).toBeNull();
    expect((data ?? []).length, "guia real não foi devolvida pela função pública").toBe(1);

    const colunas = Object.keys((data as Record<string, unknown>[])[0]);
    const proibidas = colunas.filter((c) => /cpf|telefone|email|nascimento|endereco|token/i.test(c));
    expect(proibidas, `a página pública expõe dado pessoal além do balcão: ${proibidas.join(", ")}`).toEqual([]);
  });

  it("o link da guia não expira — quem já teve acesso continua tendo, para sempre", async () => {
    // Não há coluna de expiração em solicitacoes_servico: o token é eterno. Isto
    // não é falha de implementação (nada foi construído errado); é uma decisão
    // que ninguém tomou explicitamente. O caso existe para que a decisão seja
    // consciente — se um dia houver expiração, ele vira vermelho e se atualiza.
    const admin = clienteServico();
    const { data } = await admin.from("solicitacoes_servico").select("*").limit(1).single();
    const temExpiracao = Object.keys(data as Record<string, unknown>).some((c) => /expira|validade|expires/i.test(c));
    expect(
      temExpiracao,
      "PENDÊNCIA CONHECIDA: o token da guia pública não expira — registrada no relatório da ETAPA 07",
    ).toBe(false);
  });
});

// ============================================================================
// 2. O check-in — PIN de 4 a 6 dígitos, endpoint aberto, sem login
// ============================================================================
bench("V6 — força bruta do PIN no endpoint público", () => {
  it("MEDIÇÃO: quantas tentativas de PIN errado o endpoint aceita seguidas", async () => {
    // fn_definir_pin_recepcionista valida `^\d{4,6}$` — de 10.000 a 1.000.000
    // candidatos. O endpoint é anônimo. O que se mede aqui não é "o PIN errado é
    // recusado" (é, e deve ser), e sim se existe QUALQUER freio entre tentativas:
    // bloqueio, atraso progressivo, limite por token.
    const admin = clienteServico();
    const { data: guia } = await admin
      .from("solicitacoes_servico")
      .select("token_publico, status")
      .eq("status", "solicitada")
      .limit(1)
      .maybeSingle();
    if (!guia) {
      expect.fail("bench sem guia em status 'solicitada' — refazer a fixture antes de medir força bruta");
    }

    // Zera o freio antes de medir: com resíduo de execução anterior dentro da
    // janela de 15 min, o primeiro palpite já viria bloqueado e a medição diria
    // "protegido" sem ter testado nada.
    await admin.from("tentativas_checkin").delete().eq("token_alvo", guia!.token_publico);

    const anon = clienteAnon();
    const TENTATIVAS = 15;
    const inicio = Date.now();
    let recusas = 0;
    let bloqueios = 0;

    for (let i = 0; i < TENTATIVAS; i++) {
      const pin = String(1000 + i).padStart(4, "0");
      const { data, error } = await anon.rpc("fn_registrar_checkin", {
        p_token: guia!.token_publico,
        p_pin: pin,
        p_atendido: true,
        p_justificativa: null,
      });
      const r = (data ?? {}) as { ok?: boolean; erro?: string };
      if (!error && r.ok !== false) {
        expect.fail(`PIN ${pin} foi ACEITO — força bruta bem-sucedida em ${i + 1} tentativas`);
      }
      const mensagem = error?.message ?? r.erro ?? "";
      if (/inválida|invalid/i.test(mensagem)) recusas++;
      else bloqueios++; // qualquer recusa DIFERENTE de "senha inválida" indica freio
    }

    const duracao = Date.now() - inicio;
    console.log(
      `[força bruta do PIN] ${TENTATIVAS} tentativas em ${duracao}ms ` +
        `(${Math.round(duracao / TENTATIVAS)}ms por tentativa) — ${recusas} recusas simples, ${bloqueios} bloqueios`,
    );

    expect(
      bloqueios,
      `ACHADO: ${TENTATIVAS} tentativas de PIN seguidas, todas atendidas sem nenhum freio. ` +
        `Um PIN de 4 dígitos são 10.000 candidatos; a ${Math.round(duracao / TENTATIVAS)}ms cada, ` +
        `o espaço inteiro cai em ~${Math.round((10000 * (duracao / TENTATIVAS)) / 60000)} minutos em série — ` +
        `e nada impede paralelizar.`,
    ).toBeGreaterThan(0);
  });

  it("o PIN de um parceiro não vale na guia de outro parceiro", async () => {
    // A função filtra recepcionistas por `r.parceiro_id = v_sol.parceiro_id`.
    // Este caso prova esse filtro — é o análogo direto do A06 do Vitrine
    // (fronteira reafirmada à mão dentro de código SECURITY DEFINER).
    const admin = clienteServico();
    const { data: guias } = await admin
      .from("solicitacoes_servico")
      .select("token_publico, parceiro_id, status")
      .eq("status", "solicitada");

    const parceiros = [...new Set((guias ?? []).map((g) => (g as { parceiro_id: string }).parceiro_id))];
    if (parceiros.length < 2) {
      expect.fail("bench precisa de guias abertas em DOIS parceiros para medir isolamento de check-in");
    }

    // A recepcionista com PIN conhecido (4731) pertence ao primeiro parceiro.
    const { data: recep } = await admin.from("recepcionistas").select("parceiro_id").limit(1).single();
    const guiaDeOutro = (guias ?? []).find(
      (g) => (g as { parceiro_id: string }).parceiro_id !== recep!.parceiro_id,
    ) as { token_publico: string } | undefined;
    expect(guiaDeOutro, "sem guia de outro parceiro no bench").toBeDefined();

    // O caso anterior travou tokens de propósito. Sem zerar o freio aqui, a
    // recusa chegaria como "Muitas tentativas" e o teste mediria o rate limit
    // em vez do isolamento entre parceiros — passaria pelo motivo errado.
    await admin.from("tentativas_checkin").delete().eq("token_alvo", guiaDeOutro!.token_publico);

    const { data, error } = await clienteAnon().rpc("fn_registrar_checkin", {
      p_token: guiaDeOutro!.token_publico,
      p_pin: "4731",
      p_atendido: true,
      p_justificativa: null,
    });

    const r = (data ?? {}) as { ok?: boolean; erro?: string };
    expect(r.ok !== true, "PIN de um parceiro executou a guia de OUTRO parceiro").toBe(true);
    expect(error?.message ?? r.erro ?? "").toMatch(/inválida|invalid/i);
  });

  it("check-in não pode ser repetido (sem replay do mesmo link)", async () => {
    const admin = clienteServico();
    const { data: recep } = await admin.from("recepcionistas").select("parceiro_id").limit(1).single();
    const { data: guia } = await admin
      .from("solicitacoes_servico")
      .select("token_publico, id")
      .eq("parceiro_id", recep!.parceiro_id)
      .eq("status", "solicitada")
      .limit(1)
      .maybeSingle();
    if (!guia) return;

    limpeza.push(async () => {
      await admin
        .from("solicitacoes_servico")
        .update({ status: "solicitada", checkin_em: null, checkin_por: null })
        .eq("id", guia.id);
    });

    await admin.from("tentativas_checkin").delete().eq("token_alvo", guia.token_publico);

    const anon = clienteAnon();
    const primeira = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico, p_pin: "4731", p_atendido: true, p_justificativa: null,
    });
    expect(primeira.error, `check-in legítimo falhou: ${JSON.stringify(primeira.error)}`).toBeNull();
    expect((primeira.data as { ok?: boolean })?.ok, `check-in legítimo recusado: ${JSON.stringify(primeira.data)}`).toBe(true);

    const segunda = await anon.rpc("fn_registrar_checkin", {
      p_token: guia.token_publico, p_pin: "4731", p_atendido: true, p_justificativa: null,
    });
    const r2 = (segunda.data ?? {}) as { ok?: boolean; erro?: string };
    expect(r2.ok !== true, "o mesmo link executou a guia DUAS vezes — replay aceito").toBe(true);
    expect(segunda.error?.message ?? r2.erro ?? "").toMatch(/já processada/i);
  });
});

// ============================================================================
// 3. A Edge Function pública (verify_jwt = false)
// ============================================================================
describe("V2 — Edge Function formulario-filiacao", () => {
  const endpoint = () => `${process.env.VITE_SUPABASE_URL}/functions/v1/formulario-filiacao`;
  const anonKey = () => process.env.VITE_SUPABASE_ANON_KEY!;

  const corpo = {
    nome_completo: "ADVERSARIAL — não deve entrar",
    cpf: "00000000191",
  };

  async function chamar(headers: Record<string, string>) {
    const r = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), ...headers },
      body: JSON.stringify(corpo),
    });
    return { status: r.status, texto: (await r.text()).slice(0, 200) };
  }

  it("sem o header de segredo, não grava nada", async () => {
    const r = await chamar({});
    expect([401, 403, 404, 500], `resposta inesperada sem segredo: ${r.status} ${r.texto}`).toContain(r.status);
    expect(r.status, "a função aceitou a submissão SEM o segredo").not.toBe(201);
  });

  it("com segredo errado, não grava nada", async () => {
    const r = await chamar({ "X-Formulario-Secret": "segredo-errado-do-teste-adversarial" });
    expect(r.status, "a função aceitou a submissão com segredo ERRADO").not.toBe(201);
    expect([401, 403, 404, 500]).toContain(r.status);
  });

  it("com segredo vazio, não grava nada (string vazia não pode passar por 'ausente')", async () => {
    const r = await chamar({ "X-Formulario-Secret": "" });
    expect(r.status, "segredo vazio foi aceito").not.toBe(201);
  });

  it("GET não é aceito", async () => {
    const r = await fetch(endpoint(), { method: "GET", headers: { apikey: anonKey() } });
    expect([404, 405], `GET devolveu ${r.status}`).toContain(r.status);
  });

  it("a resposta de erro não devolve o segredo esperado nem a service_role", async () => {
    const r = await chamar({ "X-Formulario-Secret": "x" });
    expect(/service_role|eyJ[\w-]{20,}/.test(r.texto), `resposta vazou credencial: ${r.texto}`).toBe(false);
  });
});
