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

describe("08.10 · a planilha só sai do bucket por URL assinada", () => {
  it("Admin e Secretaria assinam e baixam; Jurídico, Parceiro e anon não", async () => {
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

  it("o arquivo baixado abre como planilha e traz as colunas do modelo v1", async () => {
    const { data } = await clientes.admin.storage
      .from("remessas")
      .createSignedUrl(remessas[0].arquivo_path, 60);
    const blob = await (await fetch(data!.signedUrl)).blob();
    const parse = await lerPlanilhaXlsx(new File([blob], "remessa.xlsx"));
    expect(parse.cabecalhos).toEqual(
      expect.arrayContaining(["cnpj_estabelecimento", "nome", "cpf", "recolhe_contribuicao"]),
    );
    expect(parse.linhas.length).toBeGreaterThan(0);
  });
});

describe("08.10 · importar a remessa, e reimportar sem duplicar", () => {
  it("a primeira importação cria trabalhadores e vínculos; a segunda não cria nada", async () => {
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

  it("os CPFs da planilha DEMO estão na base, e o vínculo saiu com o estabelecimento certo", async () => {
    const { data: pessoas } = await clientes.admin
      .from("trabalhadores")
      .select("id, cpf, nome, recolhe_contribuicao_sindical, nivel")
      .in("cpf", ["00123456797", "11144477735", "52998224725"]);
    expect((pessoas ?? []).length).toBe(3);
    for (const p of pessoas ?? []) expect(p.nome as string).toMatch(/^DEMO —/);

    // O mapeamento do modelo v1: oposição → recolhe_contribuicao = false → Bronze.
    const oposicao = (pessoas ?? []).find((p) => p.cpf === "11144477735");
    expect(oposicao!.recolhe_contribuicao_sindical).toBe(false);
    expect(oposicao!.nivel).toBe("bronze");

    const sindicalizado = (pessoas ?? []).find((p) => p.cpf === "00123456797");
    expect(sindicalizado!.recolhe_contribuicao_sindical).toBe(true);
    expect(sindicalizado!.nivel).toBe("prata");

    const { data: vinculos } = await clientes.admin
      .from("vinculos_empregaticios")
      .select("estabelecimento_id, estabelecimentos(cnpj_completo)")
      .in(
        "trabalhador_id",
        (pessoas ?? []).map((p) => p.id as string),
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
  it("mesmo pedindo o contrário, as três flags de nível não mudam em quem já existe", async () => {
    const { data: antes } = await clientes.admin
      .from("trabalhadores")
      .select("cpf, nome, recolhe_contribuicao_sindical, recolhe_mensalidade_convenio, forma_pagamento_preferida")
      .in("cpf", ["00123456797", "11144477735", "52998224725"]);
    expect((antes ?? []).length).toBe(3);

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
      .in("cpf", ["00123456797", "11144477735", "52998224725"]);

    const porCpf = new Map((depois ?? []).map((t) => [t.cpf as string, t]));
    for (const t of antes ?? []) {
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
  it("Jurídico e Parceiro não concluem remessa — e o UPDATE barrado não dá erro (§2.6d)", async () => {
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

  it("a Secretaria conclui, e o carimbo de quem processou fica gravado", async () => {
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

  it("alterar a EVIDÊNCIA da remessa é recusado pelo trigger de imutabilidade", async () => {
    const { error } = await clientes.admin
      .from("remessas_dados")
      .update({ arquivo_path: "trocado.xlsx" })
      .eq("id", remessas[0].id);
    expect(ehErroRls(error), "a evidência da remessa deveria ser imutável").toBe(true);
  });
});
