import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loginComo, ehProducao } from "./helpers";
import { lerPlanilhaXlsx, PlanilhaInvalida } from "../../src/features/coleta/lerPlanilha";
import { contarPorStatus } from "../../src/features/importacao/parsers";
import {
  validarTrabalhadores,
  type ContextoTrabalhadores,
} from "../../src/features/importacao/validarTrabalhadores";

/**
 * Subetapa 08.6 — `/enviar-dados/:token`.
 *
 * O QUE ESTA SUÍTE PROVA, E O QUE ELA NÃO PROVA
 *
 * Prova: o PIPELINE que a página roda, com os módulos REAIS que ela importa —
 * `lerPlanilhaXlsx` → `validarTrabalhadores` → a decisão de habilitar o envio.
 * Se a validação da página divergir do resto do CRM, quebra aqui.
 *
 * Não prova: pixel. O projeto não tem jsdom nem testing-library, e testa
 * renderização por análise estática (`tests/adversarial/04_renderizacao.spec.ts`).
 * A conferência visual do ciclo completo é de Maxwell, no link real.
 *
 * NÃO ENVIA REMESSA. O caminho de sucesso do upload é exercitado UMA vez, à
 * mão, como evidência da subetapa — e não a cada `npm run test`. Uma remessa
 * por execução de suíte encheria a fila de revisão da Denise (08.10) de
 * arquivo de teste, que é exatamente o tipo de lixo que ninguém remove depois.
 * As recusas, essas sim, rodam sempre: elas só escrevem em `tentativas_remessa`,
 * que é o registro do freio e existe para isso.
 */

const CAMINHO_GERADOR = "scripts/gerar_xlsx_demo.mjs";
const CNPJ_DEMO_1 = "99999901000191";
const CNPJ_DEMO_2 = "99999901000272";

/** Sobe um `.xlsx` de verdade para a memória, como o `<input type="file">` faria. */
function comoArquivo(caminho: string, nome: string): File {
  return new File([readFileSync(caminho)], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * O MESMO contexto que `EnviarDadosPage` monta — e o ponto central é o que ele
 * NÃO tem: `cpfsExistentes` vazio. A página não lê `trabalhadores`, então nunca
 * responde "este CPF já está na nossa base" a um visitante anônimo.
 */
function contextoDaPagina(cnpjsDaCarteira: string[]): ContextoTrabalhadores {
  return {
    cpfsExistentes: new Set<string>(),
    municipioIdPorNomeNormalizado: new Map<string, number>(),
    municipioIdPorCodigoIbge: new Map<number, number>(),
    estabelecimentoIdPorCnpjCompleto: new Map(cnpjsDaCarteira.map((c) => [c, c])),
  };
}

const pastaTemp = process.env.TEMP ?? process.env.TMPDIR ?? ".";
const arquivoBom = `${pastaTemp}/08-6-bom.xlsx`;
const arquivoRuim = `${pastaTemp}/08-6-ruim.xlsx`;

beforeAll(() => {
  execSync(`node ${CAMINHO_GERADOR} "${arquivoBom}"`, { stdio: "ignore" });
  execSync(`node ${CAMINHO_GERADOR} "${arquivoRuim}" --com-erros`, { stdio: "ignore" });
});

describe("08.6 · a página lê o .xlsx com o mesmo validador do resto do CRM", () => {
  it("planilha correta: todas as linhas aproveitáveis e o envio habilita", async () => {
    const parse = await lerPlanilhaXlsx(comoArquivo(arquivoBom, "quadro.xlsx"));
    expect(parse.cabecalhos).toContain("cpf");
    expect(parse.cabecalhos).toContain("cnpj_estabelecimento");

    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_DEMO_1, CNPJ_DEMO_2]), "ignorar");
    const c = contarPorStatus(preview);
    expect(c.total).toBe(3);
    expect(c.rejeitadas).toBe(0);

    // A regra do botão, escrita como a página escreve.
    const aproveitaveis = c.total - c.rejeitadas;
    expect(aproveitaveis).toBeGreaterThan(0);
  });

  it("planilha com erros: cada defeito acende a mensagem certa NA LINHA certa", async () => {
    const parse = await lerPlanilhaXlsx(comoArquivo(arquivoRuim, "quadro.xlsx"));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_DEMO_1, CNPJ_DEMO_2]), "ignorar");
    const juntas = (i: number) => preview[i].mensagens.join(" | ");

    expect(preview[0].status).not.toBe("rejeitada"); // linha boa, controle negativo

    expect(juntas(1)).toMatch(/dígito verificador inválido/i);
    expect(preview[1].status).toBe("rejeitada");

    expect(juntas(2)).toMatch(/Nome é obrigatório/i);
    expect(preview[2].status).toBe("rejeitada");

    expect(juntas(3)).toMatch(/CPF é obrigatório/i);
    expect(preview[3].status).toBe("rejeitada");

    // CNPJ fora da carteira: NÃO bloqueia — a linha entra, o trabalhador é
    // cadastrado, mas sem vínculo. A página avisa isso em destaque, porque
    // vínculo é a métrica da etapa e uma linha assim não move o número.
    expect(juntas(4)).toMatch(/não encontrado/i);
    expect(preview[4].status).not.toBe("rejeitada");

    const c = contarPorStatus(preview);
    expect(c.rejeitadas).toBe(3);
    expect(c.total - c.rejeitadas).toBeGreaterThan(0); // ainda habilita o envio
  });

  it("planilha só com linhas ruins não habilita o envio", async () => {
    const parse = await lerPlanilhaXlsx(comoArquivo(arquivoRuim, "quadro.xlsx"));
    // Só as três rejeitadas (índices 1..3 do arquivo com erros).
    const parseSoRuins = { cabecalhos: parse.cabecalhos, linhas: parse.linhas.slice(1, 4) };
    const preview = validarTrabalhadores(parseSoRuins, contextoDaPagina([CNPJ_DEMO_1]), "ignorar");
    const c = contarPorStatus(preview);
    expect(c.total - c.rejeitadas).toBe(0);
  });

  it("arquivo que não é planilha é recusado no navegador, antes de sair da máquina", async () => {
    const csv = new File(["cpf,nome\n11144477735,Fulano\n"], "disfarcado.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await expect(lerPlanilhaXlsx(csv)).rejects.toBeInstanceOf(PlanilhaInvalida);
  });

  it("CPF com zero à esquerda sobrevive à leitura — o zero não é comido", async () => {
    // A planilha demo traz `00123456797`. Se o leitor convertesse célula em
    // número, viraria 123456789 e o validador acusaria DV inválido num CPF que
    // é válido (orientacoes.md §2.10).
    const parse = await lerPlanilhaXlsx(comoArquivo(arquivoBom, "quadro.xlsx"));
    expect(parse.linhas[0].cpf).toBe("00123456797");
  });
});

describe("08.6 · o modelo que o contador baixa casa com o validador", () => {
  const MODELO = "public/modelos/quadro-de-empregados.xlsx";

  it("a aba lida é a primeira e vem SEM linha de exemplo", async () => {
    // Uma linha de exemplo em "Dados" seria lida como pessoa de verdade: o
    // contador que esquecesse de apagá-la cadastraria um fantasma no sindicato.
    // Os exemplos vivem na aba "Instruções", que o leitor nunca abre.
    const parse = await lerPlanilhaXlsx(comoArquivo(MODELO, "modelo.xlsx"));
    expect(parse.linhas.length).toBe(0);
    expect(parse.cabecalhos).toEqual([
      "cnpj_estabelecimento",
      "nome",
      "cpf",
      "telefone",
      "piso",
      "status",
    ]);
  });

  it("os rótulos do contador ('telefone', 'piso', 'status') mapeiam nos campos certos", async () => {
    // ESTE é o teste que impede o acidente silencioso. Se "status" não casasse
    // com `recolhe_contribuicao`, `campo()` devolveria "" e TODO MUNDO cairia no
    // padrão legal (contribui) — quem se opôs entraria Prata, sem aviso nenhum,
    // porque célula vazia é caso previsto e não gera mensagem.
    const ExcelJS = (await import("exceljs")).default;
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(MODELO);
    const aba = livro.worksheets[0];
    aba.addRow([CNPJ_DEMO_1, "DEMO — Sindicalizada", "00123456797", "35988887777", "1600,00", "sindicalizado"]);
    aba.addRow([CNPJ_DEMO_1, "DEMO — Opositor", "11144477735", "35988886666", "1750,50", "oposição"]);
    const preenchido = `${pastaTemp}/08-6-modelo-preenchido.xlsx`;
    await livro.xlsx.writeFile(preenchido);

    const parse = await lerPlanilhaXlsx(comoArquivo(preenchido, "preenchido.xlsx"));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_DEMO_1]), "ignorar");
    expect(preview.length).toBe(2);
    expect(preview[0].status).not.toBe("rejeitada");
    expect(preview[1].status).not.toBe("rejeitada");

    const sindicalizada = preview[0].dados;
    const opositor = preview[1].dados;
    if (sindicalizada?.tipo !== "novo" || opositor?.tipo !== "novo") {
      throw new Error("as duas linhas do modelo deveriam ser cadastros novos");
    }

    // status → recolhe_contribuicao (o campo que decide Prata × Bronze)
    expect(sindicalizada.valores.recolhe_contribuicao_sindical).toBe(true);
    expect(opositor.valores.recolhe_contribuicao_sindical).toBe(false);
    // telefone → telefone_whatsapp
    expect(sindicalizada.valores.telefone_whatsapp).toBe("35988887777");
    // piso → salario_informado, dentro do vínculo
    expect(sindicalizada.valores.vinculo?.salario_informado).toBe(1600);
    expect(opositor.valores.vinculo?.salario_informado).toBe(1750.5);
    // cnpj_estabelecimento → vínculo com o estabelecimento da carteira
    expect(sindicalizada.valores.vinculo?.estabelecimento_id).toBe(CNPJ_DEMO_1);
  });

  it('o modelo declara o piso como obrigatório, e a célula "B9" diz "sim"', async () => {
    // Maxwell pediu a correção desta célula em 2026-08-26. Ela não é cosmética:
    // a guia de recolhimento é emitida POR EMPRESA, então um piso em branco
    // impede fechar o boleto da empresa inteira, não só o daquele empregado.
    const ExcelJS = (await import("exceljs")).default;
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(MODELO);
    const instrucoes = livro.getWorksheet("Instruções")!;
    expect(instrucoes.getRow(9).getCell(1).value).toBe("piso");
    expect(instrucoes.getRow(9).getCell(2).value).toBe("sim");
    // Só o telefone segue opcional entre os seis.
    const opcionais: string[] = [];
    for (let linha = 5; linha <= 10; linha += 1) {
      if (instrucoes.getRow(linha).getCell(2).value === "não") {
        opcionais.push(String(instrucoes.getRow(linha).getCell(1).value));
      }
    }
    expect(opcionais).toEqual(["telefone"]);
  });

  it("piso em branco vira AVISO na linha — não rejeição, para não perder o vínculo", async () => {
    // A escolha é deliberada: rejeitar a linha descartaria a PESSOA e o
    // VÍNCULO, que é a métrica da ETAPA 08. Cadastrar com a lacuna visível é
    // melhor que não cadastrar — e sem aviso nenhum seria pior que as duas.
    const ExcelJS = (await import("exceljs")).default;
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(MODELO);
    const aba = livro.worksheets[0];
    aba.addRow([CNPJ_DEMO_1, "DEMO — Sem piso", "00123456797", "", "", "sindicalizado"]);
    aba.addRow([CNPJ_DEMO_1, "DEMO — Piso zerado", "11144477735", "", "0", "sindicalizado"]);
    const caminho = `${pastaTemp}/08-6-sem-piso.xlsx`;
    await livro.xlsx.writeFile(caminho);

    const parse = await lerPlanilhaXlsx(comoArquivo(caminho, "sem-piso.xlsx"));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_DEMO_1]), "ignorar");

    expect(preview[0].status).toBe("aviso");
    expect(preview[0].mensagens.join(" | ")).toMatch(/Piso salarial não informado/i);
    expect(preview[1].mensagens.join(" | ")).toMatch(/não é um valor válido/i);
    // Nenhuma das duas é descartada, e as duas seguem gerando vínculo.
    expect(preview.filter((l) => l.status === "rejeitada")).toEqual([]);
    for (const linha of preview) {
      if (linha.dados?.tipo !== "novo") throw new Error("deveriam ser cadastros novos");
      expect(linha.dados.valores.vinculo?.estabelecimento_id).toBe(CNPJ_DEMO_1);
      expect(linha.dados.valores.vinculo?.salario_informado).toBeNull();
    }
  });

  it("as colunas de CPF e CNPJ nascem formatadas como TEXTO", async () => {
    // A defesa do zero à esquerda (§2.10), e ela só é possível por causa da D6:
    // em CSV não existe formatação de célula. O formato está na COLUNA, que é o
    // que o Excel aplica às linhas que o contador ainda vai digitar.
    const ExcelJS = (await import("exceljs")).default;
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(MODELO);
    const aba = livro.worksheets[0];
    const formatoDe = (nome: string) => {
      const indice = ["cnpj_estabelecimento", "nome", "cpf", "telefone", "piso", "status"].indexOf(nome);
      return aba.getColumn(indice + 1).numFmt;
    };
    expect(formatoDe("cpf")).toBe("@");
    expect(formatoDe("cnpj_estabelecimento")).toBe("@");
  });
});

describe("08.6 · a página não abre caminho para o banco", () => {
  it("nenhum arquivo de features/coleta importa supabase-js", () => {
    // A regra é do desenho, não do gosto: quem abre `/enviar-dados/:token` não
    // tem sessão, e a anon key está no bundle publicado. Uma consulta a tabela
    // saindo daqui seria leitura anônima com a chave que qualquer um lê no
    // DevTools. O único servidor que esta tela conhece é a Edge Function.
    const achados = execSync(
      'git grep -n -E "from \\"@/lib/supabase\\"|from .supabase-js." -- src/features/coleta/ || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados, `features/coleta falando com o banco direto:\n${achados}`).toBe("");
  });

  it("o contexto de validação da página nasce sem CPF nenhum", () => {
    // Guarda contra a "melhoria" mais tentadora desta tela: preencher
    // `cpfsExistentes` para marcar duplicatas. Faria a página responder
    // "este CPF já está cadastrado" a quem só tem um link.
    const fonte = readFileSync("src/features/coleta/EnviarDadosPage.tsx", "utf-8");
    expect(fonte).toMatch(/cpfsExistentes:\s*new Set<string>\(\)/);
  });
});

describe.skipIf(!ehProducao())("08.6 · o link recusado não oferece envio (Edge Function)", () => {
  const FN = `${process.env.VITE_SUPABASE_URL}/functions/v1/receber-remessa`;
  const ANON = process.env.VITE_SUPABASE_ANON_KEY as string;
  let tokens: Record<string, string> = {};

  beforeAll(async () => {
    const { client } = await loginComo("admin");
    const { data } = await client
      .from("envios_campanha")
      .select("token, token_expira_em, token_revogado_em, campanhas!inner(nome)")
      .eq("campanhas.nome", "DEMO — Campanha de coleta 2026");
    for (const e of data ?? []) {
      const situacao =
        e.token_revogado_em !== null
          ? "revogado"
          : new Date(e.token_expira_em as string).getTime() <= Date.now()
            ? "expirado"
            : "valido";
      tokens[situacao] = e.token as string;
    }
  });

  it("token válido devolve o nome da contabilidade e a carteira dela", async () => {
    const r = await fetch(`${FN}?token=${tokens.valido}`, { headers: { apikey: ANON } });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { ok: boolean; nome?: string; estabelecimentos?: unknown[] };
    expect(corpo.ok).toBe(true);
    expect(corpo.nome).toContain("DEMO");
    expect((corpo.estabelecimentos ?? []).length).toBeGreaterThan(0);
  });

  for (const situacao of ["revogado", "expirado"] as const) {
    it(`token ${situacao}: HTTP 200 com ok:false — nunca exceção (§2.18)`, async () => {
      const r = await fetch(`${FN}?token=${tokens[situacao]}`, { headers: { apikey: ANON } });
      expect(r.status).toBe(200);
      const corpo = (await r.json()) as { ok: boolean; erro?: string };
      expect(corpo.ok).toBe(false);
      expect(corpo.erro).toBeTruthy();
      // A página usa essa mensagem no lugar do formulário de upload.
      expect(corpo.erro).toMatch(/secretaria/i);
    });
  }
});
