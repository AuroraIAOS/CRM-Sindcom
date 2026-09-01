import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loginComo, ehProducao } from "./helpers";
import { lerPlanilhaXlsx, PlanilhaInvalida } from "../../src/features/coleta/lerPlanilha";
import { gerarModeloColeta } from "../../src/features/coleta/gerarModelo";
import { gerarPlanilhaDoFormulario } from "../../src/features/coleta/gerarPlanilhaFormulario";
import type { EstabelecimentoDoToken } from "../../src/features/coleta/api";
import { contarPorStatus, type ParseResultado } from "../../src/features/importacao/parsers";
import {
  descartarLinhasSemPessoa,
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

describe("08.7 · modelo pré-preenchido gerado no navegador", () => {
  const CARTEIRA: EstabelecimentoDoToken[] = [
    { cnpj: CNPJ_DEMO_1, razao_social: "DEMO — Comercio Um Ltda", nome_fantasia: null, ja_coberto: false },
    { cnpj: CNPJ_DEMO_2, razao_social: "DEMO — Comercio Dois Ltda", nome_fantasia: "Loja Dois", ja_coberto: true },
  ];

  /** Gera o modelo, grava num arquivo temporário e devolve como `File` — o
   *  mesmo formato que `<input type="file">` entregaria de volta. */
  async function gerarEComoArquivo(nome: string, carteira: EstabelecimentoDoToken[]): Promise<File> {
    const buffer = await gerarModeloColeta(nome, carteira);
    const caminho = `${pastaTemp}/08-7-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`;
    const { writeFileSync } = await import("node:fs");
    // `writeBuffer()` do exceljs devolve o `Buffer` do PACOTE, não o global do
    // Node — mesmo runtime, tipos diferentes. `Buffer.from` normaliza.
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));
    return comoArquivo(caminho, "modelo.xlsx");
  }

  it("cabeçalhos: os seis campos de sempre + 'razao_social', informativa", async () => {
    const parse = await lerPlanilhaXlsx(await gerarEComoArquivo("DEMO — Contador", CARTEIRA));
    expect(parse.cabecalhos).toEqual([
      "cnpj_estabelecimento",
      "razao_social",
      "nome",
      "cpf",
      "telefone",
      "piso",
      "status",
    ]);
  });

  it("uma linha por estabelecimento da carteira, com CNPJ e razão social preenchidos", async () => {
    const parse = await lerPlanilhaXlsx(await gerarEComoArquivo("DEMO — Contador", CARTEIRA));
    expect(parse.linhas.length).toBe(CARTEIRA.length);
    expect(parse.linhas[0].cnpj_estabelecimento).toBe(CNPJ_DEMO_1);
    expect(parse.linhas[0].razao_social).toBe("DEMO — Comercio Um Ltda");
    expect(parse.linhas[0].nome).toBe("");
    expect(parse.linhas[0].cpf).toBe("");
    // nome_fantasia, quando existe, tem prioridade sobre a razão social.
    expect(parse.linhas[1].razao_social).toContain("Loja Dois");
  });

  it("estabelecimento já coberto vem MARCADO, sem sumir da lista", async () => {
    const parse = await lerPlanilhaXlsx(await gerarEComoArquivo("DEMO — Contador", CARTEIRA));
    expect(parse.linhas[0].razao_social).not.toMatch(/já enviado/i);
    expect(parse.linhas[1].razao_social).toMatch(/já enviado/i);
  });

  it("linha só com CNPJ pré-preenchido (contador não mexeu) é descartada do preview", async () => {
    // É exatamente o estado em que o modelo sai do gerador: ninguém preencheu
    // nome/cpf ainda. Sem o filtro, as duas apareceriam como REJEITADAS por
    // "CPF é obrigatório" — ruído que não é erro nenhum.
    const parse = descartarLinhasSemPessoa(await lerPlanilhaXlsx(await gerarEComoArquivo("DEMO — Contador", CARTEIRA)));
    expect(parse.linhas.length).toBe(0);
  });

  it("os rótulos do contador ('telefone', 'piso', 'status') mapeiam nos campos certos", async () => {
    // ESTE é o teste que impede o acidente silencioso. Se "status" não casasse
    // com `recolhe_contribuicao`, `campo()` devolveria "" e TODO MUNDO cairia no
    // padrão legal (contribui) — quem se opôs entraria Prata, sem aviso nenhum,
    // porque célula vazia é caso previsto e não gera mensagem.
    const ExcelJS = (await import("exceljs")).default;
    const arquivoModelo = await gerarEComoArquivo("DEMO — Contador", CARTEIRA);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(await arquivoModelo.arrayBuffer());
    const aba = livro.worksheets[0];
    aba.addRow([CNPJ_DEMO_1, "", "DEMO — Sindicalizada", "00123456797", "35988887777", "1600,00", "sindicalizado"]);
    aba.addRow([CNPJ_DEMO_1, "", "DEMO — Opositor", "11144477735", "35988886666", "1750,50", "oposição"]);
    const preenchido = `${pastaTemp}/08-7-modelo-preenchido.xlsx`;
    await livro.xlsx.writeFile(preenchido);

    const parse = descartarLinhasSemPessoa(await lerPlanilhaXlsx(comoArquivo(preenchido, "preenchido.xlsx")));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_DEMO_1]), "ignorar");
    // As duas linhas pré-preenchidas (sem pessoa) foram descartadas; sobram as
    // duas que acabaram de ser adicionadas.
    expect(preview.length).toBe(2);
    expect(preview[0].status).not.toBe("rejeitada");
    expect(preview[1].status).not.toBe("rejeitada");

    const sindicalizada = preview[0].dados;
    const opositor = preview[1].dados;
    if (sindicalizada?.tipo !== "novo" || opositor?.tipo !== "novo") {
      throw new Error("as duas linhas deveriam ser cadastros novos");
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

  it('o modelo declara o piso como obrigatório na aba Instruções', async () => {
    // Maxwell pediu esta regra em 2026-08-26 (herdada da 08.6, aqui só
    // reconfirmada com a coluna extra `razao_social` no meio): a guia de
    // recolhimento é emitida POR EMPRESA, então um piso em branco impede
    // fechar o boleto da empresa inteira, não só o daquele empregado. Busca
    // pelo TEXTO da linha, não pelo número — a posição muda se a lista de
    // colunas mudar de novo, e o teste não deveria saber disso de cor.
    const ExcelJS = (await import("exceljs")).default;
    const arquivoModelo = await gerarEComoArquivo("DEMO — Contador", CARTEIRA);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(await arquivoModelo.arrayBuffer());
    const instrucoes = livro.getWorksheet("Instruções")!;

    const obrigatoriedadePor = new Map<string, string>();
    instrucoes.eachRow((linha) => {
      const chave = String(linha.getCell(1).value ?? "");
      const valor = linha.getCell(2).value;
      if (["cnpj_estabelecimento", "razao_social", "nome", "cpf", "telefone", "piso", "status"].includes(chave)) {
        obrigatoriedadePor.set(chave, String(valor));
      }
    });

    expect(obrigatoriedadePor.get("piso")).toBe("sim");
    // Só telefone e a coluna informativa (razao_social) seguem opcionais.
    const opcionais = [...obrigatoriedadePor.entries()].filter(([, v]) => v === "não").map(([k]) => k);
    expect(opcionais.sort()).toEqual(["razao_social", "telefone"]);
  });

  it("as colunas de CPF e CNPJ nascem formatadas como TEXTO", async () => {
    // A defesa do zero à esquerda (§2.10) está na COLUNA, que é o que o Excel
    // aplica às linhas que o contador ainda vai digitar.
    const ExcelJS = (await import("exceljs")).default;
    const arquivoModelo = await gerarEComoArquivo("DEMO — Contador", CARTEIRA);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(await arquivoModelo.arrayBuffer());
    const aba = livro.worksheets[0];
    const cabecalhos = (aba.getRow(1).values as unknown[]).slice(1).map(String);
    const formatoDe = (nome: string) => aba.getColumn(cabecalhos.indexOf(nome) + 1).numFmt;
    expect(formatoDe("cpf")).toBe("@");
    expect(formatoDe("cnpj_estabelecimento")).toBe("@");
  });

  it("CPF com zero à esquerda sobrevive ao ciclo completo (gera → salva → lê)", async () => {
    // A evidência que a subetapa pede: gerar o modelo, preencher um CPF que
    // começa com zero, salvar e reler — o zero não pode sumir no caminho.
    const ExcelJS = (await import("exceljs")).default;
    const arquivoModelo = await gerarEComoArquivo("DEMO — Contador", CARTEIRA);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(await arquivoModelo.arrayBuffer());
    const aba = livro.worksheets[0];
    aba.addRow([CNPJ_DEMO_1, "", "DEMO — Zero na frente", "00123456797", "", "1600,00", "sindicalizado"]);
    const caminho = `${pastaTemp}/08-7-zero-esquerda.xlsx`;
    await livro.xlsx.writeFile(caminho);

    const parse = descartarLinhasSemPessoa(await lerPlanilhaXlsx(comoArquivo(caminho, "zero.xlsx")));
    const linha = parse.linhas.find((l) => l.nome === "DEMO — Zero na frente");
    expect(linha?.cpf).toBe("00123456797");
  });
});

describe("08.7 · descartarLinhasSemPessoa", () => {
  const CABECALHOS = ["cnpj_estabelecimento", "nome", "cpf"];

  function resultado(linhas: Record<string, string>[]): ParseResultado {
    return { cabecalhos: CABECALHOS, linhas };
  }

  it("descarta linha com nome E cpf vazios, mesmo com outra coluna preenchida", () => {
    const parse = resultado([{ cnpj_estabelecimento: "12345678000190", nome: "", cpf: "" }]);
    expect(descartarLinhasSemPessoa(parse).linhas).toEqual([]);
  });

  it("mantém linha com nome OU cpf preenchidos", () => {
    const comNome = resultado([{ cnpj_estabelecimento: "", nome: "Fulano", cpf: "" }]);
    const comCpf = resultado([{ cnpj_estabelecimento: "", nome: "", cpf: "11144477735" }]);
    expect(descartarLinhasSemPessoa(comNome).linhas.length).toBe(1);
    expect(descartarLinhasSemPessoa(comCpf).linhas.length).toBe(1);
  });

  it("não mexe nos cabeçalhos nem na ordem das linhas mantidas", () => {
    const linhas = [
      { cnpj_estabelecimento: "1", nome: "A", cpf: "" },
      { cnpj_estabelecimento: "2", nome: "", cpf: "" },
      { cnpj_estabelecimento: "3", nome: "B", cpf: "" },
    ];
    const parse = descartarLinhasSemPessoa(resultado(linhas));
    expect(parse.cabecalhos).toEqual(CABECALHOS);
    expect(parse.linhas.map((l) => l.nome)).toEqual(["A", "B"]);
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

describe("08.8 · formulário direto (empresa isolada)", () => {
  /**
   * NÃO EXISTE, EM PRODUÇÃO, TOKEN DEMO DE EMPRESA ISOLADA (carteira de 1).
   * Os três tokens DEMO já gravados (08.6) são todos de CONTABILIDADE
   * (`estabelecimento_id is null`, `contabilidade_id` preenchido) — conferido
   * por query direta em `envios_campanha`. Criar um novo token/campanha em
   * produção só para este teste seria escrever em `envios_campanha` fora do
   * escopo do Circuito 3 (a 08.13 é quem gera tokens reais de empresa
   * isolada). Por isso esta suíte prova o PIPELINE e o FORMATO do arquivo —
   * não um envio real de ponta a ponta contra a Edge Function. Isso fica
   * pendente para quando a 08.13 gerar os primeiros tokens de empresa
   * isolada de verdade (ou para Maxwell testar manualmente então).
   */
  const CNPJ_EMPRESA_ISOLADA = "99999901000353";

  /** Réplica FIEL do `validarPlanilha` da Edge Function (não altera o arquivo
   *  dela — só prova, sem rede, que o `.xlsx` gerado passaria por ele: mesma
   *  assinatura de ZIP + a mesma entrada OOXML obrigatória. */
  function passariaNaEdgeFunction(bytes: Uint8Array): boolean {
    const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const marca = new TextEncoder().encode("[Content_Types].xml");
    const contem = (alvo: Uint8Array, agulha: Uint8Array) => {
      for (let i = 0; i <= alvo.length - agulha.length; i += 1) {
        let bate = true;
        for (let j = 0; j < agulha.length; j += 1) if (alvo[i + j] !== agulha[j]) { bate = false; break; }
        if (bate) return true;
      }
      return false;
    };
    return ehZip && contem(bytes, marca);
  }

  it("o .xlsx gerado do formulário passaria na validação POR CONTEÚDO da Edge Function", async () => {
    const buffer = await gerarPlanilhaDoFormulario(CNPJ_EMPRESA_ISOLADA, [
      { nome: "DEMO — Funcionário Um", cpf: "00123456797", telefone: "35988887777", piso: "1600,00", status: "sindicalizado" },
    ]);
    expect(passariaNaEdgeFunction(new Uint8Array(buffer))).toBe(true);
  });

  it("mesmo formato do caminho da planilha: os seis cabeçalhos idênticos", async () => {
    const buffer = await gerarPlanilhaDoFormulario(CNPJ_EMPRESA_ISOLADA, [
      { nome: "DEMO — Fulana", cpf: "00123456797", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const { writeFileSync } = await import("node:fs");
    const caminho = `${pastaTemp}/08-8-formulario.xlsx`;
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));
    const parse = await lerPlanilhaXlsx(comoArquivo(caminho, "formulario.xlsx"));
    // O mesmo cabeçalho que o modelo da 08.7 e o arquivo manual da 08.5 usam.
    expect(parse.cabecalhos).toEqual(["cnpj_estabelecimento", "nome", "cpf", "telefone", "piso", "status"]);
  });

  it("ciclo completo com 2 funcionários: mesma validação, mesmo mapeamento de status do caminho da planilha", async () => {
    const buffer = await gerarPlanilhaDoFormulario(CNPJ_EMPRESA_ISOLADA, [
      { nome: "DEMO — Sindicalizada Isolada", cpf: "00123456797", telefone: "35988887777", piso: "1600,00", status: "sindicalizado" },
      { nome: "DEMO — Opositor Isolado", cpf: "11144477735", telefone: "", piso: "1750,50", status: "oposicao" },
    ]);
    const { writeFileSync } = await import("node:fs");
    const caminho = `${pastaTemp}/08-8-dois-funcionarios.xlsx`;
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));

    const parse = await lerPlanilhaXlsx(comoArquivo(caminho, "dois.xlsx"));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_EMPRESA_ISOLADA]), "ignorar");
    expect(preview.length).toBe(2);
    expect(preview.filter((l) => l.status === "rejeitada")).toEqual([]);

    const sindicalizada = preview[0].dados;
    const opositor = preview[1].dados;
    if (sindicalizada?.tipo !== "novo" || opositor?.tipo !== "novo") {
      throw new Error("as duas linhas deveriam ser cadastros novos");
    }
    // Mesmo tradutor de situação sindical do caminho da planilha
    // (interpretarSituacaoSindical) — "oposicao" sem cedilha, o valor do
    // <select> do formulário, já é um apelido reconhecido.
    expect(sindicalizada.valores.recolhe_contribuicao_sindical).toBe(true);
    expect(opositor.valores.recolhe_contribuicao_sindical).toBe(false);
    expect(sindicalizada.valores.vinculo?.estabelecimento_id).toBe(CNPJ_EMPRESA_ISOLADA);
    expect(opositor.valores.vinculo?.estabelecimento_id).toBe(CNPJ_EMPRESA_ISOLADA);
  });

  it("CPF inválido é rejeitado pela MESMA regra de dígito verificador — não há segunda validação", async () => {
    const buffer = await gerarPlanilhaDoFormulario(CNPJ_EMPRESA_ISOLADA, [
      { nome: "DEMO — CPF Ruim", cpf: "11111111111", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const { writeFileSync } = await import("node:fs");
    const caminho = `${pastaTemp}/08-8-cpf-invalido.xlsx`;
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));

    const parse = await lerPlanilhaXlsx(comoArquivo(caminho, "cpf-ruim.xlsx"));
    const preview = validarTrabalhadores(parse, contextoDaPagina([CNPJ_EMPRESA_ISOLADA]), "ignorar");
    expect(preview[0].status).toBe("rejeitada");
    expect(preview[0].mensagens.join(" | ")).toMatch(/dígito verificador inválido/i);
  });

  it("CPF com zero à esquerda sobrevive ao ciclo completo (formulário → .xlsx → leitura)", async () => {
    const buffer = await gerarPlanilhaDoFormulario(CNPJ_EMPRESA_ISOLADA, [
      { nome: "DEMO — Zero Formulário", cpf: "00123456797", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const { writeFileSync } = await import("node:fs");
    const caminho = `${pastaTemp}/08-8-zero-esquerda.xlsx`;
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));

    const parse = await lerPlanilhaXlsx(comoArquivo(caminho, "zero.xlsx"));
    expect(parse.linhas[0].cpf).toBe("00123456797");
  });
});
