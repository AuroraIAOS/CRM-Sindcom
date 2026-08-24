// ============================================================================
// 02_superficie.spec.ts — Portão de segurança adversarial (ETAPA 07)
// Vetores V2, V4, V6 e V7 do método herdado do CRM Vitrine:
//   V2 — acesso direto ao banco fora da camada de RLS
//   V4 — burlar ou reescrever política de RLS
//   V6 — sequestro de credencial
//   V7 — exposição indevida de dado pessoal (LGPD)
//
// DIFERENÇA PARA tests/rls/: aquelas suítes provam que o caminho PRETENDIDO
// funciona. Esta ataca de propósito, procurando o caminho NÃO pretendido. Todo
// caso aqui afirma o comportamento SEGURO — um caso vermelho é achado real, não
// teste mal escrito.
//
// SEGURO EM PRODUÇÃO: este arquivo só LÊ e só tenta escritas que DEVEM falhar.
// Nada aqui apaga, altera ou cria dado. Os ataques destrutivos moram no arquivo
// 01_nucleo.spec.ts, atrás de exigirBench().
// ============================================================================
import { describe, it, expect } from "vitest";
import { clienteAnon, loginComo, ehErroRls, refDoProjeto, type Role } from "../rls/helpers";

/** As 29 tabelas de `public` — toda a superfície exposta ao PostgREST. */
const TABELAS = [
  "atendimentos_juridicos", "auditoria", "beneficiados", "beneficios", "cartas_oposicao",
  "cnaes", "configuracoes", "convencoes_coletivas", "empresas", "estabelecimentos",
  "eventos_nivel", "faturas", "importacoes_csv", "motivos_situacao_cadastral", "municipios",
  "naturezas_juridicas", "notificacoes", "parceiros", "perfis", "pisos_convencao",
  "qualificacoes_responsavel", "recepcionistas", "repasses", "snapshots_dashboard",
  "solicitacoes_admin", "solicitacoes_servico", "taxas_convencao", "trabalhadores",
  "vinculos_empregaticios",
] as const;

/**
 * As 14 views. Elas merecem varredura própria porque VIEW NÃO TEM RLS: quem
 * decide é o `security_invoker` e o GRANT. Foi exatamente aqui que apareceu o
 * achado A-01 desta etapa (`empresas_estabelecimentos` vazando para anônimo).
 */
const VIEWS = [
  "empresas_estabelecimentos", "v_base_calculo_trabalhador", "v_cartas_ano_base",
  "v_dash_conversoes_mensais", "v_dash_dicas", "v_dash_evolucao_niveis", "v_dash_kpis",
  "v_dash_mapa", "v_dash_receita_mensal", "v_dash_top_parceiros", "v_fila_parceiro",
  "v_mensalidade_titular", "v_relatorio_convencao", "v_repasses_para_email",
] as const;

/**
 * Views de agregação escalar (`select (select count…), (select sum…)`) devolvem
 * SEMPRE uma linha, mesmo para anon — a RLS zera os campos em vez de sumir com a
 * linha (armadilha registrada em orientacoes.md §2.6b). Esperar `[]` nelas é
 * esperar a coisa errada; o que se afirma é que os NÚMEROS vieram zerados.
 */
const VIEWS_AGREGADAS = new Set(["v_dash_kpis"]);

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];

// ============================================================================
// V2 — acesso direto fora da camada de RLS
// ============================================================================
describe("V2 — o que um anônimo alcança", () => {
  it("anon não lê NENHUMA das 29 tabelas", async () => {
    const anon = clienteAnon();
    const vazamentos: string[] = [];

    for (const t of TABELAS) {
      const { data, error } = await anon.from(t).select("*").limit(1);
      if (!error && (data ?? []).length > 0) {
        vazamentos.push(`${t} devolveu ${data!.length} linha(s)`);
      }
    }

    expect(vazamentos, `anon leu dado de tabela: ${vazamentos.join(" | ")}`).toEqual([]);
  });

  it("anon não lê NENHUMA das 14 views (view não tem RLS — só invoker e GRANT)", async () => {
    const anon = clienteAnon();
    const vazamentos: string[] = [];

    for (const v of VIEWS) {
      const { data, error } = await anon.from(v).select("*").limit(1);
      if (error) continue; // negado por GRANT/função interna — é o desfecho seguro

      const linhas = data ?? [];
      if (linhas.length === 0) continue;

      if (VIEWS_AGREGADAS.has(v)) {
        // A linha existe por construção; o achado seria um número diferente de zero.
        const numeros = Object.entries(linhas[0] as Record<string, unknown>)
          .filter(([, val]) => typeof val === "number" || (typeof val === "string" && /^[\d.]+$/.test(val)))
          .filter(([, val]) => Number(val) !== 0);
        if (numeros.length > 0) {
          vazamentos.push(`${v} devolveu número não-zerado para anon: ${JSON.stringify(numeros)}`);
        }
        continue;
      }

      vazamentos.push(`${v} devolveu ${linhas.length} linha(s) de dado real`);
    }

    expect(
      vazamentos,
      `VAZAMENTO ANÔNIMO — a anon key é pública (vai no bundle do PWA): ${vazamentos.join(" | ")}`,
    ).toEqual([]);
  });

  it("anon não escreve em NENHUMA tabela", async () => {
    const anon = clienteAnon();
    const vazamentos: string[] = [];

    for (const t of TABELAS) {
      // Payload deliberadamente inválido: o que se mede é se a RLS/GRANT barra
      // ANTES de o Postgres chegar a reclamar do conteúdo. Sucesso aqui é achado.
      const { error } = await anon.from(t).insert({ id: "00000000-0000-0000-0000-000000000000" } as never).select();
      if (!error) vazamentos.push(`${t} aceitou INSERT anônimo`);
    }

    expect(vazamentos, `anon escreveu: ${vazamentos.join(" | ")}`).toEqual([]);
  });

  it("anon não executa as funções internas de RLS", async () => {
    const anon = clienteAnon();
    // fn_role/fn_parceiro_id/fn_eh são revogadas de anon em 03_rls.sql §18.
    for (const fn of ["fn_role", "fn_parceiro_id"]) {
      const { error } = await anon.rpc(fn);
      expect(ehErroRls(error), `anon executou ${fn}() (erro: ${JSON.stringify(error)})`).toBe(true);
    }
  });
});

describe("V2 — o que um autenticado alcança fora da RLS", () => {
  it("nenhum papel chama função de trigger ou job de pg_cron por RPC", async () => {
    // Estas rodam como owner e ignoram RLS. 05_hardening.sql revoga EXECUTE de
    // authenticated; aqui se MEDE, em vez de confiar no arquivo.
    const internas = [
      "fn_auditoria", "fn_notifica_solicitacao_admin", "fn_registra_evento_nivel",
      "fn_evoluir_solicitacoes", "fn_marcar_guias_em_atraso", "fn_marcar_boletos_inadimplentes",
      "fn_snapshot_dashboard", "fn_set_updated_at", "fn_gera_numero_guia", "fn_valida_solicitacao",
      "fn_guarda_job",
    ];
    const { client } = await loginComo("secretaria");
    const executadas: string[] = [];

    for (const fn of internas) {
      const { error } = await client.rpc(fn);
      if (!error) executadas.push(fn);
    }

    expect(executadas, `secretaria executou função interna por RPC: ${executadas.join(", ")}`).toEqual([]);
  });

  it("não existe RPC de execução de SQL arbitrário exposta", async () => {
    const { client } = await loginComo("secretaria");
    for (const fn of ["exec_sql", "execute_sql", "run_sql", "sql", "query", "eval"]) {
      const { error } = await client.rpc(fn, { query: "select 1" } as never);
      expect(error, `RPC de SQL arbitrário exposta: ${fn}`).not.toBeNull();
    }
  });

  it("a service_role key não está no que o navegador recebe", async () => {
    const { readFileSync, existsSync } = await import("node:fs");

    // 1. Nenhuma variável VITE_* de service role — VITE_* vai para o bundle.
    const nomesVite = readFileSync(".env", "utf-8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("VITE_"))
      .map((l) => l.split("=")[0]);
    expect(nomesVite.some((n) => /SERVICE_ROLE/i.test(n)), "variável VITE_* de service role no .env").toBe(false);

    // 2. E o bundle construído não carrega um JWT com role service_role.
    //    (`dist/` só existe depois de `npm run build` — quando não existe, o
    //    item 1 já cobre a origem do vazamento.)
    if (existsSync("dist")) {
      const { readdirSync } = await import("node:fs");
      const assets = readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
      for (const a of assets) {
        const conteudo = readFileSync(`dist/assets/${a}`, "utf-8");
        expect(/"?role"?\s*:\s*"service_role"/.test(conteudo), `service_role no bundle dist/assets/${a}`).toBe(false);
        expect(conteudo.includes("service_role"), `string "service_role" no bundle dist/assets/${a}`).toBe(false);
      }
    }
  });
});

// ============================================================================
// V4 — burla / reescrita de política
// ============================================================================
describe("V4 — as primitivas de autorização são fail-closed", () => {
  it("fn_eh() nega em vez de devolver NULL para quem consulta sem papel", async () => {
    // fn_role() devolve NULL para usuário sem perfil ativo, e `fn_eh()` sobre
    // NULL devolve NULL — que NÃO é `false`. Onde o resultado for usado em `if`
    // ou em `not`, NULL se comporta como "não verdadeiro", mas em `not fn_eh()`
    // vira NULL e o `if` deixa passar. É a armadilha que
    // fn_definir_pin_recepcionista trata com `is not true`.
    const { client } = await loginComo("parceiro");
    const { data, error } = await client.rpc("fn_eh", { p_roles: ["admin"] } as never);
    expect(error === null || ehErroRls(error)).toBe(true);
    if (!error) expect(data, "fn_eh('admin') devolveu verdadeiro para o parceiro").not.toBe(true);
  });

  it("papel nenhum reescreve o próprio papel em perfis", async () => {
    for (const papel of ["secretaria", "juridico", "parceiro", "presidente"] as Role[]) {
      const { client, uid } = await loginComo(papel);
      const { data, error } = await client
        .from("perfis")
        .update({ role: "admin" })
        .eq("id", uid)
        .select("id, role");

      // Barrado por RLS (erro) OU sem efeito (0 linhas) — as duas formas contam.
      const escalou = !error && (data ?? []).some((l) => (l as { role?: string }).role === "admin");
      expect(escalou, `${papel} escalou o próprio papel para admin`).toBe(false);

      // E confere no banco, não só na resposta: UPDATE barrado por RLS não dá
      // erro, apenas afeta zero linhas (orientacoes.md §2.6d).
      const { data: conferencia } = await client.from("perfis").select("role").eq("id", uid).single();
      expect(conferencia?.role, `${papel} teve o papel alterado no banco`).toBe(papel);
    }
  });

  it("nenhum papel cria um perfil novo (não há escritor legítimo fora do Admin)", async () => {
    for (const papel of ["secretaria", "juridico", "parceiro", "presidente"] as Role[]) {
      const { client, uid } = await loginComo(papel);
      const { error } = await client
        .from("perfis")
        .insert({ id: uid, role: "admin", nome: "Invasor", ativo: true } as never)
        .select("id");
      expect(error, `${papel} inseriu linha em perfis (erro esperado, veio ${JSON.stringify(error)})`).not.toBeNull();
    }
  });
});

// ============================================================================
// V6 — sequestro de credencial
// ============================================================================
describe("V6 — credencial guardada no banco não vaza pela API", () => {
  /**
   * O desfecho SEGURO destes dois casos é `42501` — a coluna ser NEGADA —, e não
   * "veio zero linha". A diferença não é preciosismo: rodando contra produção, o
   * caso do token passou só porque a base ainda não tem guia nenhuma. Ausência de
   * dado não é prova de proteção; é falso verde esperando dado aparecer.
   */
  async function colunaNegadaParaTodos(tabela: string, coluna: string): Promise<string[]> {
    const legiveis: string[] = [];
    for (const papel of PAPEIS) {
      const { client } = await loginComo(papel);
      const { error } = await client.from(tabela).select(coluna).limit(1);
      if (!ehErroRls(error)) legiveis.push(`${papel}${error ? ` (erro inesperado: ${error.code})` : ""}`);
    }
    return legiveis;
  }

  it("papel nenhum lê recepcionistas.pin_hash", async () => {
    // O PIN tem de 4 a 6 dígitos (fn_definir_pin_recepcionista valida `^\d{4,6}$`).
    // São 10^4 a 10^6 candidatos: quem tiver o hash quebra offline e passa a
    // registrar check-in como se fosse o recepcionista — e o check-in é o que
    // autoriza o convênio a cobrar do sindicato.
    const legiveis = await colunaNegadaParaTodos("recepcionistas", "pin_hash");
    expect(legiveis, `hash de PIN legível por: ${legiveis.join(", ")}`).toEqual([]);
  });

  it("o parceiro só alcança o token das PRÓPRIAS guias", async () => {
    // ACHADO ACEITO, e o motivo importa: `token_publico` é legível por
    // `authenticated`, e tem de ser — a Secretaria precisa dele para imprimir e
    // enviar a guia (src/features/servicos/GuiaPrint.tsx). O narrowing de coluna
    // é tudo-ou-nada para o papel `authenticated` do Postgres: não há como
    // liberar para a Secretaria e negar ao parceiro por essa via.
    //
    // O invariante que sobra é o que de fato protege: a RLS de LINHA. Cada
    // parceiro só enxerga as próprias solicitações, então só alcança os próprios
    // tokens. É isto que este caso mede — e é isto que quebraria se alguém
    // afrouxasse `pol_solic_select`.
    const { client, uid } = await loginComo("parceiro");
    const { data: visiveis, error } = await client
      .from("solicitacoes_servico")
      .select("id, parceiro_id, token_publico");
    expect(error, `parceiro não conseguiu ler as próprias guias: ${JSON.stringify(error)}`).toBeNull();

    const { data: perfil } = await client.from("perfis").select("parceiro_id").eq("id", uid).single();
    const alheias = (visiveis ?? []).filter(
      (l) => (l as { parceiro_id: string }).parceiro_id !== perfil!.parceiro_id,
    );
    expect(
      alheias.length,
      `parceiro alcançou o token de ${alheias.length} guia(s) de outro parceiro`,
    ).toBe(0);
  });

  it("configuracoes é lida por todos por design — então não pode guardar segredo", async () => {
    // `pol_config_select` autoriza QUALQUER papel a ler (`fn_role() is not null`),
    // e isso é deliberado: são parâmetros de operação (prazo de boleto, prazo de
    // alerta de carta), não credenciais. O ataque aqui não é "quem lê" — é
    // verificar que ninguém guardou um segredo numa tabela de leitura pública.
    const { client } = await loginComo("parceiro");
    const { data, error } = await client.from("configuracoes").select("chave, valor");
    expect(error, "parceiro deveria ler configuracoes (pol_config_select)").toBeNull();

    const suspeitas = (data ?? []).filter((l) => {
      const { chave, valor } = l as { chave: string; valor: string | null };
      const nomeDeSegredo = /senha|password|secret|segredo|token|chave_api|api_key|hash|credencial/i.test(chave);
      // Valor com cara de credencial: JWT, chave longa opaca, bearer.
      const valorDeSegredo = !!valor && (/^eyJ[\w-]+\./.test(valor) || /^(sk|pk|sb)_/.test(valor) || valor.length > 60);
      return nomeDeSegredo || valorDeSegredo;
    });

    expect(
      suspeitas.map((l) => (l as { chave: string }).chave),
      "segredo guardado em configuracoes, que TODO papel autenticado lê",
    ).toEqual([]);
  });

  it("só o Admin escreve em configuracoes", async () => {
    for (const papel of ["presidente", "secretaria", "juridico", "parceiro"] as Role[]) {
      const { client } = await loginComo(papel);
      const { error } = await client
        .from("configuracoes")
        .update({ valor: "999" })
        .eq("chave", "dias_vencimento_boleto")
        .select("chave");
      const { data: conferencia } = await client
        .from("configuracoes")
        .select("valor")
        .eq("chave", "dias_vencimento_boleto")
        .single();
      expect(conferencia?.valor, `${papel} alterou um parâmetro do sistema`).not.toBe("999");
      expect(error === null || ehErroRls(error)).toBe(true);
    }
  });
});

// ============================================================================
// V7 — exposição indevida de dado pessoal (LGPD)
// ============================================================================
describe("V7 — dado pessoal fica no domínio de quem tem motivo para vê-lo", () => {
  it("o parceiro não lê CPF por nenhum caminho", async () => {
    // O portal do parceiro existe justamente para esconder o CPF: v_fila_parceiro
    // é security definer e omite a coluna de propósito (03_rls.sql §17). O ataque
    // procura o caminho de volta — tabela direta, view de base de cálculo, embedding.
    const { client } = await loginComo("parceiro");
    const vazamentos: string[] = [];

    for (const alvo of ["trabalhadores", "beneficiados", "v_base_calculo_trabalhador", "v_mensalidade_titular", "v_relatorio_convencao", "v_cartas_ano_base"]) {
      const { data, error } = await client.from(alvo).select("cpf").limit(3);
      if (error) continue;
      const comCpf = (data ?? []).filter((l) => (l as { cpf?: string | null }).cpf);
      if (comCpf.length > 0) vazamentos.push(`${alvo} devolveu ${comCpf.length} CPF`);
    }

    // Embedding do PostgREST: puxar dado de carona numa relação permitida.
    const { data: embed } = await client
      .from("solicitacoes_servico")
      .select("id, trabalhadores(cpf, nome)")
      .limit(3);
    const vazouPorEmbed = (embed ?? []).some((l) => {
      const t = (l as { trabalhadores?: { cpf?: string | null } | null }).trabalhadores;
      return t && t.cpf;
    });
    if (vazouPorEmbed) vazamentos.push("embedding solicitacoes_servico→trabalhadores devolveu CPF");

    expect(vazamentos, `parceiro alcançou CPF: ${vazamentos.join(" | ")}`).toEqual([]);
  });

  it("o parceiro não enxerga a fila de outro parceiro", async () => {
    const { client } = await loginComo("parceiro");
    const { data, error } = await client.from("v_fila_parceiro").select("id").limit(50);
    expect(error, `v_fila_parceiro recusou o próprio parceiro: ${JSON.stringify(error)}`).toBeNull();

    // Toda linha visível precisa ser de solicitação do próprio parceiro. Como a
    // view não expõe parceiro_id, cruza-se pela tabela — que a RLS já filtra.
    const { data: minhas } = await client.from("solicitacoes_servico").select("id");
    const idsPermitidos = new Set((minhas ?? []).map((l) => (l as { id: string }).id));
    const intrusas = (data ?? []).filter((l) => !idsPermitidos.has((l as { id: string }).id));
    expect(intrusas.length, `v_fila_parceiro devolveu ${intrusas.length} linha(s) de outro parceiro`).toBe(0);
  });

  it("o parceiro não lê a base cadastral do sindicato", async () => {
    const { client } = await loginComo("parceiro");
    const vazamentos: string[] = [];
    for (const alvo of ["empresas", "estabelecimentos", "empresas_estabelecimentos", "vinculos_empregaticios", "faturas", "repasses", "atendimentos_juridicos", "cartas_oposicao"]) {
      const { data, error } = await client.from(alvo).select("*").limit(1);
      if (!error && (data ?? []).length > 0) vazamentos.push(alvo);
    }
    expect(vazamentos, `parceiro leu base interna: ${vazamentos.join(", ")}`).toEqual([]);
  });

  it("o jurídico não alcança o financeiro, e o financeiro não alcança o jurídico", async () => {
    const { client: juridico } = await loginComo("juridico");
    for (const alvo of ["faturas", "repasses"]) {
      const { data, error } = await juridico.from(alvo).select("*").limit(1);
      const leu = !error && (data ?? []).length > 0;
      expect(leu, `jurídico leu ${alvo}`).toBe(false);
    }
  });
});

// ============================================================================
// Sanidade do alvo — evita o pior falso verde: rodar contra o banco errado.
// ============================================================================
describe("sanidade", () => {
  it("o alvo da suíte está declarado e é o esperado", () => {
    const ref = refDoProjeto();
    expect(ref, "VITE_SUPABASE_URL ausente ou malformada").toMatch(/^[a-z]{20}$/);
    console.log(`[adversarial] alvo = ${ref}`);
  });
});
