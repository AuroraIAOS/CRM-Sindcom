import type ExcelJS from "exceljs";

/**
 * Gera, NO NAVEGADOR, o `.xlsx` que representa o que a empresa isolada
 * digitou no formulário direto (Subetapa 08.8) — para que o envio passe pelo
 * MESMO caminho da planilha: a Edge Function `receber-remessa` valida o
 * arquivo POR CONTEÚDO (assinatura de ZIP + `[Content_Types].xml`), não por
 * extensão, então só um `.xlsx` de verdade passa. Gerando um aqui, o
 * formulário não precisa de um segundo caminho de escrita nem de mudança
 * nenhuma na Edge Function (proibida nesta subetapa) — a remessa nasce
 * idêntica à de quem anexou planilha, e a 08.10 a revisa do mesmo jeito.
 *
 * Cabeçalhos idênticos aos do modelo (`gerarModelo.ts` / specs/importacao.md
 * §3.3), sem a coluna informativa `razao_social` — aqui não faz sentido: é
 * uma linha por FUNCIONÁRIO, não por estabelecimento, e o CNPJ é sempre o
 * mesmo (o único da carteira deste token).
 */

export type LinhaFormularioDireto = {
  nome: string;
  cpf: string;
  telefone: string;
  piso: string;
  status: "sindicalizado" | "oposicao";
};

const CABECALHOS = ["cnpj_estabelecimento", "nome", "cpf", "telefone", "piso", "status"] as const;

export async function gerarPlanilhaDoFormulario(cnpj: string, linhas: LinhaFormularioDireto[]) {
  const { default: ExcelJSRuntime } = await import("exceljs");
  const livro = new ExcelJSRuntime.Workbook() as ExcelJS.Workbook;
  const aba = livro.addWorksheet("Dados");
  aba.columns = CABECALHOS.map((chave) => ({ key: chave, width: 20 }));
  aba.getRow(1).values = [...CABECALHOS];

  // Defesa do zero à esquerda (orientacoes.md §2.10) — o CPF chega aqui como
  // string digitada no formulário, mas a remessa pode ser reaberta no Excel
  // pela Denise (08.10) antes de importar, e a coluna precisa continuar texto.
  aba.getColumn(CABECALHOS.indexOf("cnpj_estabelecimento") + 1).numFmt = "@";
  aba.getColumn(CABECALHOS.indexOf("cpf") + 1).numFmt = "@";

  for (const l of linhas) {
    aba.addRow({
      cnpj_estabelecimento: cnpj,
      nome: l.nome,
      cpf: l.cpf,
      telefone: l.telefone,
      piso: l.piso,
      status: l.status,
    });
  }

  return livro.xlsx.writeBuffer();
}
