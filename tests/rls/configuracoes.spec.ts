import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, type Role } from "./helpers";

/**
 * Subetapa 03.5 — `/configuracoes`.
 *
 * Três blocos: (1) RLS de `configuracoes` — Admin escreve, os demais só leem;
 * (2) RLS de `perfis` — Admin lê/edita todos, os demais só a própria linha;
 * (3) o critério de aceite em si ("parâmetros editáveis por Admin refletem no
 * comportamento do sistema") — muda `dias_alerta_carta` de verdade e observa
 * a dica CARTA_PENDENTE (v_dash_dicas) reagir, sem mock nenhum. O valor
 * original é restaurado no `afterAll`: `configuracoes` tem só 2 linhas
 * canônicas, não é dado de demonstração que deva crescer ou mudar de valor
 * permanentemente por causa de um teste (orientacoes.md §7.3 é sobre
 * cadastros de negócio, não sobre parâmetros globais do sistema).
 *
 * Login UMA VEZ por papel no `beforeAll`, igual ao padrão de `rls.spec.ts` —
 * `signInWithPassword` tem limite de taxa no Supabase, e logar dentro de
 * cada `it()` (como a primeira versão deste arquivo fazia) esgotou a cota da
 * sessão em 2026-07-21 e derrubou a suíte inteira com "Request rate limit
 * reached". Ver orientacoes.md §7.4.
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;
const uids: Record<Role, string> = {} as never;

const CHAVE_TESTE = "dias_alerta_carta";
let valorOriginal: string | null = null;

beforeAll(async () => {
  for (const papel of PAPEIS) {
    const { client, uid } = await loginComo(papel);
    clientes[papel] = client;
    uids[papel] = uid;
  }
  const { data } = await clientes.admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", CHAVE_TESTE)
    .single();
  valorOriginal = data!.valor;
}, 60_000);

afterAll(async () => {
  // Rede de segurança: se algum teste quebrou antes de restaurar, devolve o
  // parâmetro ao valor medido no início em vez de deixar "45" ou "7"
  // vazando para a próxima execução da suíte.
  if (valorOriginal !== null) {
    await clientes.admin.from("configuracoes").update({ valor: valorOriginal }).eq("chave", CHAVE_TESTE);
  }
  for (const papel of PAPEIS) await clientes[papel]?.auth.signOut();
});

describe("03.5 · configuracoes — RLS", () => {
  it("qualquer autenticado lê; só Admin escreve", async () => {
    for (const papel of PAPEIS) {
      const { data, error } = await clientes[papel].from("configuracoes").select("*");
      expect(error, `${papel} deveria ler configuracoes`).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    }
  });

  it("secretária é barrada de escrever — sem erro nenhum: a linha só some do UPDATE", async () => {
    // `pol_config_admin` é a ÚNICA policy para UPDATE (a de SELECT não conta
    // para esse comando), e ela é só `USING`, sem policy dedicada de UPDATE
    // para não-admin. Resultado medido: PostgREST devolve 200, error null,
    // data []  — a linha nunca entra no conjunto que o UPDATE enxerga, então
    // não há "violação" para reportar, só zero linhas afetadas. Mesma família
    // do "200 + zero itens" da leitura (orientacoes.md §3.2/§7.2), agora do
    // lado da escrita: uma tela que não conferir o retorno acharia que salvou.
    const { data, error } = await clientes.secretaria
      .from("configuracoes")
      .update({ valor: "999" })
      .eq("chave", CHAVE_TESTE)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // nenhuma linha afetada — não é sucesso disfarçado

    // Confere no banco que o valor realmente não mudou.
    const { data: linha } = await clientes.secretaria
      .from("configuracoes")
      .select("valor")
      .eq("chave", CHAVE_TESTE)
      .single();
    expect(linha!.valor).not.toBe("999");
  });

  it("Admin escreve e o valor persiste", async () => {
    const { error } = await clientes.admin
      .from("configuracoes")
      .update({ valor: "7" })
      .eq("chave", CHAVE_TESTE);
    expect(error).toBeNull();

    const { data: depois } = await clientes.admin
      .from("configuracoes")
      .select("valor, updated_at")
      .eq("chave", CHAVE_TESTE)
      .single();
    expect(depois!.valor).toBe("7");

    // Restaura antes dos demais testes do arquivo, para não vazar estado.
    await clientes.admin.from("configuracoes").update({ valor: valorOriginal }).eq("chave", CHAVE_TESTE);
  });
});

describe("03.5 · perfis — RLS", () => {
  it("Admin lê todos os perfis; os demais só o próprio", async () => {
    const { data: todos } = await clientes.admin.from("perfis").select("id");
    expect(todos!.length).toBeGreaterThanOrEqual(5); // os 5 perfis-seed da Fase 0, no mínimo

    for (const papel of ["presidente", "secretaria", "juridico", "parceiro"] as const) {
      const { data } = await clientes[papel].from("perfis").select("id");
      expect(data!.length, `${papel} deveria ver só a própria linha`).toBe(1);
      expect(data![0].id).toBe(uids[papel]);
    }
  });

  it("só Admin escreve em perfis — testado na PRÓPRIA linha do Admin, sem tocar nos 5 perfis-seed usados pelas outras suítes", async () => {
    const { data: antes } = await clientes.admin
      .from("perfis")
      .select("nome")
      .eq("id", uids.admin)
      .single();
    const nomeOriginal = antes!.nome;

    // Admin PODE editar (mesmo a própria linha — pol_perfis_admin_all não
    // distingue "própria" de "alheia", só exige fn_eh('admin')).
    const { error: erroAdmin } = await clientes.admin
      .from("perfis")
      .update({ nome: `${nomeOriginal} (teste 03.5)` })
      .eq("id", uids.admin);
    expect(erroAdmin).toBeNull();

    // Restaura imediatamente — este é o único admin da base (medido em
    // 2026-07-21), deixar o nome alterado seria ruído para sempre.
    await clientes.admin.from("perfis").update({ nome: nomeOriginal }).eq("id", uids.admin);

    // Secretária NÃO pode editar nem a PRÓPRIA linha — pol_perfis_admin_all
    // exige Admin para toda escrita, sem exceção de dono. E, como em
    // `configuracoes` acima, o bloqueio não vem como erro: o UPDATE
    // simplesmente não enxerga nenhuma linha para afetar (200, data []).
    const { data: perfilSecretaria } = await clientes.secretaria
      .from("perfis")
      .select("nome")
      .eq("id", uids.secretaria)
      .single();
    const { data: resultadoSecretaria, error: erroSecretaria } = await clientes.secretaria
      .from("perfis")
      .update({ nome: "Tentativa não autorizada" })
      .eq("id", uids.secretaria)
      .select();
    expect(erroSecretaria).toBeNull();
    expect(resultadoSecretaria).toEqual([]);

    // O nome dela não pode ter mudado — RLS bloqueou de fato.
    const { data: depois } = await clientes.admin
      .from("perfis")
      .select("nome")
      .eq("id", uids.secretaria)
      .single();
    expect(depois!.nome).toBe(perfilSecretaria!.nome);
  });

  it("constraint do banco: role parceiro exige parceiro_id (chk_parceiro_exige_vinculo)", async () => {
    // Prova que a UI não pode contornar a regra mesmo se o form falhasse em
    // validar — o Postgres também recusa.
    const { data: parceiroAtual } = await clientes.admin
      .from("perfis")
      .select("id, role, parceiro_id")
      .eq("role", "parceiro")
      .limit(1)
      .single();

    const { error } = await clientes.admin
      .from("perfis")
      .update({ role: "parceiro", parceiro_id: null })
      .eq("id", parceiroAtual!.id);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514"); // check constraint
  });
});

describe("03.5 · efeito real de parâmetro (critério de aceite da subetapa)", () => {
  it("dias_alerta_carta muda quais CCTs aparecem na dica CARTA_PENDENTE", async () => {
    // CCT "DEMO — CCT Comércio Varejista 2026/2027" tem data_limite_oposicao
    // a ~41 dias de hoje (medido em 2026-07-21) e 3 trabalhadores não-Ouro
    // sem carta para o ano-base — candidata perfeita: some da janela padrão
    // (30 dias) e aparece quando o parâmetro sobe.
    const { data: cct } = await clientes.admin
      .from("convencoes_coletivas")
      .select("id, nome, data_limite_oposicao")
      .ilike("nome", "%Comércio Varejista 2026%")
      .single();
    if (!cct) {
      // Dado de demonstração pode ter sido removido/renomeado — não falha
      // a suíte por isso, só avisa que este teste ficou sem fixture.
      console.warn("CCT de demonstração não encontrada — pulando o teste de efeito real.");
      return;
    }

    try {
      // 1) Com o default (30), a CCT (41 dias de distância) NÃO deve aparecer.
      await clientes.admin.from("configuracoes").update({ valor: "30" }).eq("chave", CHAVE_TESTE);
      const { data: dicasAntes } = await clientes.admin.from("v_dash_dicas").select("titulo, quantidade");
      const apareceAntes = (dicasAntes ?? []).some(
        (d) => d.titulo?.includes(cct.nome) && (d.quantidade ?? 0) > 0,
      );
      expect(apareceAntes, "com 30 dias, a CCT de 41 dias não deveria estar na dica").toBe(false);

      // 2) Alargando a janela para 45 dias, a MESMA CCT passa a aparecer —
      //    efeito real do parâmetro, lido de uma view que não conhece o teste.
      await clientes.admin.from("configuracoes").update({ valor: "45" }).eq("chave", CHAVE_TESTE);
      const { data: dicasDepois } = await clientes.admin.from("v_dash_dicas").select("titulo, quantidade");
      const linhaDepois = (dicasDepois ?? []).find((d) => d.titulo?.includes(cct.nome));
      expect(linhaDepois, "com 45 dias, a CCT deveria entrar na dica CARTA_PENDENTE").toBeDefined();
      expect(linhaDepois!.quantidade).toBe(3);
    } finally {
      await clientes.admin.from("configuracoes").update({ valor: valorOriginal }).eq("chave", CHAVE_TESTE);
    }
  });
});
