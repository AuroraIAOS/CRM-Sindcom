import type ExcelJS from "exceljs";
import type { ParseResultado } from "@/features/importacao/parsers";

/**
 * Lê um `.xlsx` no NAVEGADOR e devolve o mesmo `ParseResultado` que o
 * `parsers.ts` produz para CSV.
 *
 * POR QUE ESTA PONTE EXISTE, E POR QUE ELA É PEQUENA DE PROPÓSITO
 * A validação de trabalhador é uma só no projeto (`validarTrabalhadores.ts`),
 * e ela consome `ParseResultado`. Se o caminho do `.xlsx` tivesse validação
 * própria, existiriam duas regras de dígito verificador de CPF divergindo com
 * o tempo — é exatamente assim que a regra some. Então tudo que este arquivo
 * faz é CONVERTER FORMATO. Zero regra de negócio aqui dentro.
 *
 * Tudo vira STRING, como no CSV. Isso não é preguiça: é a defesa do zero à
 * esquerda (orientacoes.md §2.10). Se o contador digitou o CPF numa célula
 * numérica, o Excel já comeu o zero antes de nós — e quem restaura é o
 * `normalizarIdentificador` do validador compartilhado, que também emite o
 * aviso na tela. Converter para número aqui destruiria o dado outra vez.
 */

const LIMITE_LINHAS = 20_000;

/** Valor de célula → texto, sem inventar formatação. */
function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "boolean") return valor ? "sim" : "nao";
  if (valor instanceof Date) {
    // Data lida como Date volta em ISO — o `parseDataFlexivel` do projeto
    // aceita esse formato, então não há tratamento especial a fazer.
    return valor.toISOString().slice(0, 10);
  }
  const objeto = valor as unknown as Record<string, unknown>;
  // Célula de fórmula: interessa o RESULTADO, não a fórmula.
  if ("result" in objeto) return textoDaCelula(objeto.result as ExcelJS.CellValue);
  // Rich text (pedaços com formatação diferente na mesma célula).
  if ("richText" in objeto && Array.isArray(objeto.richText)) {
    return (objeto.richText as Array<{ text?: string }>).map((p) => p.text ?? "").join("").trim();
  }
  if ("text" in objeto && typeof objeto.text === "string") return objeto.text.trim();
  if ("hyperlink" in objeto && typeof objeto.hyperlink === "string") return String(objeto.hyperlink).trim();
  return String(valor).trim();
}

export class PlanilhaInvalida extends Error {}

export async function lerPlanilhaXlsx(arquivo: File): Promise<ParseResultado> {
  // Import dinâmico de propósito: o `exceljs` sozinho pesa ~1,2 MB no bundle, e
  // ele só faz sentido no instante em que alguém ANEXA um arquivo. Importado no
  // topo, ele entraria no chunk principal e o CRM inteiro — inclusive a tela de
  // login da Secretaria, num celular em 3G — pagaria por uma biblioteca que a
  // maioria das sessões nunca usa. Aqui ele vira um chunk à parte, buscado sob
  // demanda. Medido: bundle principal 2.144 kB → 1.204 kB, com o exceljs num
  // chunk próprio de 938 kB que só é baixado por quem anexa planilha.
  const { default: ExcelJSRuntime } = await import("exceljs");
  const livro = new ExcelJSRuntime.Workbook() as ExcelJS.Workbook;
  try {
    await livro.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    throw new PlanilhaInvalida(
      "Não foi possível abrir este arquivo como planilha do Excel. " +
        "Se você exportou em CSV, reabra no Excel e salve como .xlsx.",
    );
  }

  const aba = livro.worksheets[0];
  if (!aba) throw new PlanilhaInvalida("A planilha não tem nenhuma aba com dados.");

  const linhasBrutas: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (linha) => {
    if (linhasBrutas.length > LIMITE_LINHAS) return;
    const celulas: string[] = [];
    // `linha.eachCell` pula vazias; percorrer por índice preserva a POSIÇÃO da
    // coluna, que é o que casa cabeçalho com valor. Pular uma vazia deslocaria
    // todas as seguintes e trocaria CPF por telefone silenciosamente.
    for (let c = 1; c <= aba.columnCount; c += 1) {
      celulas.push(textoDaCelula(linha.getCell(c).value));
    }
    linhasBrutas.push(celulas);
  });

  const indiceCabecalho = linhasBrutas.findIndex((l) => l.some((c) => c !== ""));
  if (indiceCabecalho === -1) throw new PlanilhaInvalida("A planilha está vazia.");

  const cabecalhos = linhasBrutas[indiceCabecalho].map((c, i) => c || `coluna_${i + 1}`);

  const linhas = linhasBrutas
    .slice(indiceCabecalho + 1)
    .filter((l) => l.some((c) => c !== ""))
    .map((l) => {
      const registro: Record<string, string> = {};
      cabecalhos.forEach((h, i) => {
        registro[h] = l[i] ?? "";
      });
      return registro;
    });

  if (linhas.length > LIMITE_LINHAS) {
    throw new PlanilhaInvalida(
      `A planilha tem mais de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas. ` +
        "Envie em partes — este link aceita quantos envios você precisar.",
    );
  }

  return { cabecalhos, linhas };
}
