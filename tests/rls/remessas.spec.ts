import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo, ehErroRls, type Role } from "./helpers";
import { lerPlanilhaXlsx } from "../../src/features/coleta/lerPlanilha";
import { importarTrabalhadores } from "../../src/features/importacao/api";
import { dedupPorChave } from "../../src/features/importacao/parsers";
import {
  validarTrabalhadores,
  type ContextoTrabalhadores,
  type TrabalhadorPreviewDados,
} from "../../src/features/importacao/validarTrabalhadores";

/**
 * Subetapa 08.10 — revisão e importação da remessa pela Denise.
 *
 * Este é o único ponto do sistema em que dado vindo de fora vira cadastro, e a
 * suíte cobre as quatro promessas que sustentam isso:
 *
 *  1. a planilha só é alcançável por URL ASSINADA, e só por quem deve;
 *  2. reenviar o mesmo arquivo NÃO duplica ninguém;
 *  3. as três flags de nível não mudam em registro existente — nem por
 *     planilha que peça explicitamente;
 *  4. concluir a remessa exige permissão, e a remessa continua imutável.
 *
 * A gravação usada aqui é a `importarTrabalhadores` REAL, a mesma que a tela
 * chama — não uma reimplementação. Se a tela e o teste divergirem, é porque
 * alguém forkou, e é isso que se quer impedir.
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

const CAMPANHA_DEMO = "DEMO — Campanha de coleta 2026";

type RemessaDemo = { id: string; arquivo_path: string; status: string };
let remessas: RemessaDemo[] = [];

async function contarTrabalhadores(c: SupabaseClient) {
  const { count } = await c.from("trabalhadores").select("id", { count: "exact", head: true });
  return count ?? 0;
}
async function contarVinculos(c: SupabaseClient) {
  const { count } = await c.from("vinculos_empregaticios").select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** O contexto completo, como a tela da Denise monta (ela é autenticada e tem
 *  direito de saber que um CPF já existe — ao contrário da página pública). */
async function contextoReal(c: SupabaseClient): Promise<ContextoTrabalhadores> {
  const { data: trabalhadores } = await c.from("trabalhadores").select("cpf");
  const { data: estabs } = await c
    .from("estabelecimentos")
    .select("id, cnpj_completo")
    .like("cnpj_basico", "999999%");
  const estabelecimentoIdPorCnpjCompleto = new Map<string, string>();
  for (const e of estabs ?? []) {
    if (e.cnpj_completo) estabelecimentoIdPorCnpjCompleto.set(e.cnpj_completo, e.id);
  }
  return {
    cpfsExistentes: new Set((trabalhadores ?? []).map((t) => t.cpf as string)),
    municipioIdPorNomeNormalizado: new Map(),
    municipioIdPorCodigoIbge: new Map(),
    estabelecimentoIdPorCnpjCompleto,
  };
}

/**
 * As pessoas que entraram na base POR PLANILHA DEMO: nome com o prefixo do
 * projeto e vínculo num estabelecimento da faixa fictícia `999999…`.
 *
 * Antes isto era uma lista de três CPFs cravados, os da planilha usada em
 * agosto. Ela envelheceu exatamente como a §7.1d previu: remessas reais novas
 * chegaram (a Onda 00 já subiu quatro), a base foi crescendo com OUTRAS pessoas
 * DEMO e os três CPFs originais deixaram de existir — dois casos ficaram
 * vermelhos sem nada ter piorado no código. A promessa que a 08.10 precisa
 * provar nunca foi "estes três CPFs"; é "quem veio de planilha entrou com o
 * vínculo certo e com o nível derivado da situação declarada".
 */
async function pessoasDePlanilhaDemo(c: SupabaseClient) {
  const { data: estabs } = await c.from("estabelecimentos").select("id").like("cnpj_basico", "999999%");
  const idsEstab = (estabs ?? []).map((e) => e.id as string);
  if (idsEstab.length === 0) return [];

  const { data: vinculos } = await c
    .from("vinculos_empregaticios")
    .select("trabalhador_id, estabelecimento_id")
    .in("estabelecimento_id", idsEstab);
  const idsTrab = [...new Set((vinculos ?? []).map((v) => v.trabalhador_id as string))];
  if (idsTrab.length === 0) return [];

  const { data: pessoas } = await c
    .from("trabalhadores")
    .select(
      "id, cpf, nome, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio, forma_pagamento_preferida, nivel",
    )
    .in("id", idsTrab)
    .like("nome", "DEMO —%");
  return pessoas ?? [];
}

function apenasGravaveis(preview: ReturnType<typeof validarTrabalhadores>) {
  const validas = preview
    .map((l) => l.dados)
    .filter(
      (d): d is Exclude<TrabalhadorPreviewDados, { tipo: "ignorada" }> =>
        d !== null && d.tipo !== "ignorada",
    );
  return dedupPorChave(validas, (d) => d.valores.cpf);
}

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;

  const { data } = await clientes.admin
    .from("remessas_dados")
    .select("id, arquivo_path, status, envios_campanha!inner(campanhas!inner(nome))")
    .eq("envios_campanha.campanhas.nome", CAMPANHA_DEMO)
    .order("recebida_em", { ascending: false }); // mais recente primeiro, como a tela lista
  remessas = (data ?? []).map((r) => ({
    id: r.id as string,
    arquivo_path: r.arquivo_path as string,
    status: r.status as string,
  }));
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO PULA EM VEZ DE SEMEAR (decidido em 2026-09-10)
 *
 * Os outros arquivos que dependiam de dado DEMO removido na limpeza de
 * 2026-09-09 foram convertidos para SEMEAR o que usam
 * (`tests/rls/fixtures/campanhaDemo.ts`). Aqui não dá, e o motivo é de desenho,
 * não de esforço:
 *
 *  1. `remessas_dados` **não tem policy de INSERT para papel autenticado
 *     nenhum** — só a Edge Function `receber-remessa`, com `service_role`,
 *     escreve ali. É deliberado: um segundo caminho de entrada de dado externo
 *     seria uma porta sem token, sem freio e sem rastro de IP.
 *  2. Semear pelo endpoint real criaria a remessa, mas o **arquivo ficaria no
 *     bucket para sempre**: `storage.objects` só tem policy de SELECT para o
 *     bucket `remessas` — ninguém apaga. Isso também é deliberado (a evidência
 *     da remessa é imutável), e afrouxar a imutabilidade da evidência para
 *     acomodar um teste é trocar segurança permanente por conveniência (§2.30).
 *  3. O próprio projeto já havia rejeitado esse caminho por escrito, em
 *     `coleta.spec.ts`: "uma remessa por execução de suíte encheria a fila de
 *     revisão da Denise de arquivo de teste".
 *
 * Então estes casos seguem a doutrina que `tests/adversarial/05_comunicacao.spec.ts`
 * já enuncia: **o que ESCREVE roda no bench; contra produção, mede-se negação.**
 * Sem fixture, cada caso PULA com motivo — nunca passa vazio, que seria o falso
 * verde do §7.2.
 *
 * Para recuperar a cobertura: rodar a suíte apontada para o bench (`.env.bench`),
 * ou semear uma remessa DEMO de propósito em produção — decisão do Maxwell,
 * porque é dado que passa a contar nos indicadores de campanha.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function exigirRemessaDemo(ctx: { skip: () => void }) {
  if (remessas.length === 0) ctx.skip();
}

describe("08.10 · a planilha só sai do bucket por URL assinada", () => {
  it("Admin e Secretaria assinam e baixam; Jurídico, Parceiro e anon não", async (ctx) => {
    exigirRemessaDemo(ctx);
    expect(remessas.length, "sem remessa DEMO — rode a 08.5 antes").toBeGreaterThan(0);
    const caminho = remessas[0].arquivo_path;

    for (const papel of ["admin", "secretaria"] as const) {
      const { data, error } = await clientes[papel].storage
        .from("remessas")
        .createSignedUrl(caminho, 60);
      expect(error, `${papel} deveria assinar`).toBeNull();
      const resposta = await fetch(data!.signedUrl);
      expect(resposta.status).toBe(200);
      expect((await resposta.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }

    for (const papel of ["juridico", "parceiro"] as const) {
      const { error } = await clientes[papel].storage.from("remessas").createSignedUrl(caminho, 60);
      expect(error, `${papel} não deveria assinar`).not.toBeNull();
    }
  });

  it("o arquivo baixado abre como planilha e traz as colunas de identidade do modelo", async (ctx) => {
    exigirRemessaDemo(ctx);
    // `remessas[0]` é a mais RECENTE da campanha DEMO — e o rótulo da coluna
    // de situação sindical muda entre versões do modelo (o arquivo manual
    // original da 08.5 usava `recolhe_contribuicao`; a partir da 08.6 o
    // contador vê `status`). Fixar um rótulo específico aqui é a MESMA
    // classe de problema do §7.1b (teste que fixa contagem do dado de
    // demonstração), só que em cabeçalho: quebrou sozinho quando remessas
    // reais via `/enviar-dados/:token` passaram a existir. O que a suíte
    // precisa provar é que a leitura reconhece a planilha, não qual versão
    // exata do modelo gerou a mais recente.
    const { data } = await clientes.admin.storage
      .from("remessas")
      .createSignedUrl(remessas[0].arquivo_path, 60);
    const blob = await (await fetch(data!.signedUrl)).blob();
    const parse = await lerPlanilhaXlsx(new File([blob], "remessa.xlsx"));
    expect(parse.cabecalhos).toEqual(expect.arrayContaining(["cnpj_estabelecimento", "nome", "cpf"]));
    const APELIDOS_SITUACAO_SINDICAL = ["recolhe_contribuicao", "situacao", "situação", "status"];
    expect(parse.cabecalhos.some((h) => APELIDOS_SITUACAO_SINDICAL.includes(h))).toBe(true);
    expect(parse.linhas.length).toBeGreaterThan(0);
  });
});

describe("08.10 · importar a remessa, e reimportar sem duplicar", () => {
  it("a primeira importação cria trabalhadores e vínculos; a segunda não cria nada", async (ctx) => {
    exigirRemessaDemo(ctx);
    const { data } = await clientes.admin.storage
      .from("remessas")
      .createSignedUrl(remessas[0].arquivo_path, 60);
    const blob = await (await fetch(data!.signedUrl)).blob();
    const parse = await lerPlanilhaXlsx(new File([blob], "remessa.xlsx"));

    // --- 1ª passada ---------------------------------------------------------
    const preview1 = validarTrabalhadores(parse, await contextoReal(clientes.admin), "ignorar");
    const antesT = await contarTrabalhadores(clientes.admin);
    const antesV = await contarVinculos(clientes.admin);
    await importarTrabalhadores(apenasGravaveis(preview1), clientes.admin);
    const depois1T = await contarTrabalhadores(clientes.admin);
    const depois1V = await contarVinculos(clientes.admin);

    // Na 1ª execução da suíte isto é > 0; nas seguintes já é 0, porque os CPFs
    // passaram a existir. As duas situações são corretas — o que NÃO pode
    // acontecer é a 2ª passada abaixo criar alguém.
    expect(depois1T).toBeGreaterThanOrEqual(antesT);
    expect(depois1V).toBeGreaterThanOrEqual(antesV);

    // --- 2ª passada, MESMO arquivo -----------------------------------------
    // É esta que prova a spec §5.5: o token é reutilizável justamente porque
    // reenviar a mesma planilha, progressivamente mais completa, é inofensivo.
    const preview2 = validarTrabalhadores(parse, await contextoReal(clientes.admin), "ignorar");
    await importarTrabalhadores(apenasGravaveis(preview2), clientes.admin);
    expect(await contarTrabalhadores(clientes.admin)).toBe(depois1T);
    expect(await contarVinculos(clientes.admin)).toBe(depois1V);

    // E o efeito da etapa aconteceu: existe trabalhador vinculado à base.
    expect(depois1T).toBeGreaterThan(0);
  });

  it("quem veio de planilha DEMO está na base, com vínculo certo e nível derivado da situação", async (ctx) => {
    exigirRemessaDemo(ctx);
    const pessoas = await pessoasDePlanilhaDemo(clientes.admin);
    expect(pessoas.length, "nenhuma pessoa de planilha DEMO na base — rode a importação antes").toBeGreaterThan(0);

    // O mapeamento do modelo v1, afirmado como INVARIANTE e não como nível
    // exato: oposição → recolhe_contribuicao = false → Bronze, sempre; quem
    // contribui é pelo menos Prata (pode ser Ouro se também paga o convênio, e
    // fixar "prata" quebraria no dia em que alguém virasse Ouro legitimamente).
    for (const p of pessoas) {
      if (p.recolhe_contribuicao_sindical === false) {
        expect(p.nivel, `nível de ${p.cpf} (oposição)`).toBe("bronze");
      } else {
        expect(p.nivel, `nível de ${p.cpf} (contribui)`).not.toBe("bronze");
      }
    }

    const { data: vinculos } = await clientes.admin
      .from("vinculos_empregaticios")
      .select("estabelecimento_id, estabelecimentos(cnpj_completo)")
      .in(
        "trabalhador_id",
        pessoas.map((p) => p.id as string),
      );
    expect((vinculos ?? []).length).toBeGreaterThan(0);
    for (const v of vinculos ?? []) {
      const est = v.estabelecimentos as unknown as { cnpj_completo: string } | { cnpj_completo: string }[];
      const cnpj = Array.isArray(est) ? est[0].cnpj_completo : est.cnpj_completo;
      expect(cnpj).toMatch(/^999999/);
    }
  });
});

describe("08.10 · a regra inviolável: planilha não reclassifica ninguém", () => {
  it("mesmo pedindo o contrário, as três flags de nível não mudam em quem já existe", async (ctx) => {
    exigirRemessaDemo(ctx);
    // Os alvos vêm da base, não de CPFs cravados (§7.1d — ver
    // `pessoasDePlanilhaDemo`). Limitados a 5 para o ataque não reescrever a
    // base DEMO inteira: a proteção ou vale para todos, ou falha no primeiro.
    const antes = (await pessoasDePlanilhaDemo(clientes.admin)).slice(0, 5);
    expect(antes.length, "nenhuma pessoa de planilha DEMO para atacar").toBeGreaterThan(0);

    // Uma planilha hostil: mesmos CPFs, TODAS as flags invertidas. É o pior
    // acidente possível do sistema — uma planilha reclassificando gente em
    // silêncio.
    //
    // O `nome` vai IGUAL ao que já está gravado, de propósito. A política
    // "atualizar_contato" atualiza nome legitimamente, e numa versão anterior
    // deste teste todo mundo virou "DEMO — tentativa de reclassificação" na
    // base de produção. Dado de demonstração fica gravado (§7.3) — então teste
    // que escreve nele precisa deixá-lo apresentável.
    const parseHostil = {
      cabecalhos: ["cpf", "nome", "recolhe_contribuicao", "recolhe_mensalidade", "forma_pagamento"],
      linhas: (antes ?? []).map((t) => ({
        cpf: t.cpf as string,
        nome: t.nome as string,
        recolhe_contribuicao: t.recolhe_contribuicao_sindical ? "oposicao" : "sindicalizado",
        recolhe_mensalidade: t.recolhe_mensalidade_convenio ? "nao" : "sim",
        forma_pagamento: t.forma_pagamento_preferida === "holerite" ? "boleto" : "holerite",
      })),
    };

    // A política mais permissiva de propósito: "atualizar dados de contato" é a
    // única que toca registro existente. Se a proteção falhasse, falharia aqui.
    const preview = validarTrabalhadores(
      parseHostil,
      await contextoReal(clientes.admin),
      "atualizar_contato",
    );
    await importarTrabalhadores(apenasGravaveis(preview), clientes.admin);

    const { data: depois } = await clientes.admin
      .from("trabalhadores")
      .select("cpf, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio, forma_pagamento_preferida")
      .in(
        "cpf",
        antes.map((t) => t.cpf as string),
      );

    const porCpf = new Map((depois ?? []).map((t) => [t.cpf as string, t]));
    for (const t of antes) {
      const agora = porCpf.get(t.cpf as string)!;
      expect(agora.recolhe_contribuicao_sindical, `contribuição de ${t.cpf}`).toBe(
        t.recolhe_contribuicao_sindical,
      );
      expect(agora.recolhe_mensalidade_convenio, `mensalidade de ${t.cpf}`).toBe(
        t.recolhe_mensalidade_convenio,
      );
      expect(agora.forma_pagamento_preferida, `forma de pagamento de ${t.cpf}`).toBe(
        t.forma_pagamento_preferida,
      );
    }
  });
});

describe("08.10 · concluir a remessa é ato de quem tem permissão, e ela segue imutável", () => {
  it("Jurídico e Parceiro não concluem remessa — e o UPDATE barrado não dá erro (§2.6d)", async (ctx) => {
    exigirRemessaDemo(ctx);
    const alvo = remessas[0];
    for (const papel of ["juridico", "parceiro"] as const) {
      const { data, error } = await clientes[papel]
        .from("remessas_dados")
        .update({ status: "importada" })
        .eq("id", alvo.id)
        .select();
      expect(error, `${papel} recebeu erro em vez de zero linhas`).toBeNull();
      expect(data ?? [], `${papel} não deveria alterar remessa`).toEqual([]);
    }
  });

  it("a Secretaria conclui, e o carimbo de quem processou fica gravado", async (ctx) => {
    exigirRemessaDemo(ctx);
    const alvo = remessas[0];
    const { uid } = await loginComo("secretaria");
    const { data, error } = await clientes.secretaria
      .from("remessas_dados")
      .update({ status: "importada", processada_em: new Date().toISOString(), processada_por: uid })
      .eq("id", alvo.id)
      .select("status, processada_por, processada_em");
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe("importada");
    expect(data?.[0]?.processada_por).toBe(uid);
    expect(data?.[0]?.processada_em).toBeTruthy();
  });

  it("alterar a EVIDÊNCIA da remessa é recusado pelo trigger de imutabilidade", async (ctx) => {
    exigirRemessaDemo(ctx);
    const { error } = await clientes.admin
      .from("remessas_dados")
      .update({ arquivo_path: "trocado.xlsx" })
      .eq("id", remessas[0].id);
    expect(ehErroRls(error), "a evidência da remessa deveria ser imutável").toBe(true);
  });
});
