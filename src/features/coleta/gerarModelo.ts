import type ExcelJS from "exceljs";
import type { EstabelecimentoDoToken } from "./api";

/**
 * Gera, NO NAVEGADOR, o modelo `.xlsx` que o contador baixa em
 * `/enviar-dados/:token` — uma linha por estabelecimento da carteira dele,
 * com CNPJ e razão social já preenchidos (Subetapa 08.7).
 *
 * DEGRAU ANTERIOR: até a 08.6 o modelo era ESTÁTICO
 * (`scripts/gerar_modelo_coleta.mjs` → `public/modelos/quadro-de-empregados.xlsx`,
 * removidos nesta subetapa). Esta função assume o lugar dele: mesmos
 * cabeçalhos, mesma formatação de texto nas colunas de CPF/CNPJ
 * (orientacoes.md §2.10), mesma aba "Instruções" — só que agora sabe QUEM
 * está baixando e o que já foi enviado.
 *
 * Import dinâmico do `exceljs` pelo mesmo motivo de `lerPlanilha.ts`
 * (orientacoes.md §4.8): a biblioteca só deve pesar no bundle de quem
 * realmente anexa ou baixa planilha — não no de quem só abre o login.
 *
 * Cabeçalhos dos SEIS campos que `validarTrabalhadores.ts` espera continuam
 * idênticos aos de `specs/importacao.md` §3.3 (com os apelidos que o
 * contador entende: "piso", "status"). `razao_social` é a SÉTIMA coluna,
 * puramente informativa — o validador não a conhece e a ignora
 * (specs/importacao.md §4: "colunas extras são ignoradas").
 */

const VERMELHO = "FFC62828";
const AREIA = "FFEFEEE7";
const TEXTO = "FF424242";
const VERDE_SUCESSO = "FF2E7D32";
const VERDE_FUNDO = "FFE8F5E9";

const MARCADOR_JA_ENVIADO = " (já enviado)";

type ColunaModelo = {
  chave: string;
  largura: number;
  texto: boolean;
  obrigatoria: boolean;
  explicacao: string;
  exemplo: string;
};

const COLUNAS: ColunaModelo[] = [
  {
    chave: "cnpj_estabelecimento",
    largura: 22,
    texto: true,
    obrigatoria: true,
    explicacao:
      "CNPJ da empresa onde a pessoa trabalha. Já vem preenchido para cada empresa da sua carteira — não apague.",
    exemplo: "12345678000190",
  },
  {
    chave: "razao_social",
    largura: 34,
    texto: false,
    obrigatoria: false,
    explicacao:
      "Nome da empresa, só para você identificar a linha. Não precisa preencher nem apagar — o sistema não lê esta coluna.",
    exemplo: "COMERCIO DE ALIMENTOS LTDA",
  },
  {
    chave: "nome",
    largura: 34,
    texto: false,
    obrigatoria: true,
    explicacao: "Nome completo do trabalhador.",
    exemplo: "Maria Aparecida de Souza",
  },
  {
    chave: "cpf",
    largura: 16,
    texto: true,
    obrigatoria: true,
    explicacao:
      "CPF com 11 dígitos. NÃO apague o zero da frente — esta coluna já vem formatada como texto justamente para preservá-lo.",
    exemplo: "00123456797",
  },
  {
    chave: "telefone",
    largura: 18,
    texto: true,
    obrigatoria: false,
    explicacao: "Telefone com DDD, de preferência o WhatsApp. Só dígitos.",
    exemplo: "35988887777",
  },
  {
    chave: "piso",
    largura: 14,
    texto: false,
    obrigatoria: true,
    explicacao:
      "Salário pago hoje, em reais. Obrigatório: é a partir dele que se calcula o valor a recolher. Como a " +
      "guia de recolhimento é emitida por empresa, um único campo em branco impede fechar o boleto de toda " +
      "a empresa — não só o daquele empregado.",
    exemplo: "1600,00",
  },
  {
    chave: "status",
    largura: 20,
    texto: true,
    obrigatoria: true,
    explicacao:
      'Escreva exatamente "sindicalizado" ou "oposição". É este campo que define se a pessoa contribui — ' +
      "deixar em branco faz o sistema assumir que contribui.",
    exemplo: "sindicalizado",
  },
];

export async function gerarModeloColeta(
  nomeContador: string,
  estabelecimentos: EstabelecimentoDoToken[],
) {
  const { default: ExcelJSRuntime } = await import("exceljs");
  const livro = new ExcelJSRuntime.Workbook() as ExcelJS.Workbook;
  livro.creator = "Sindicato dos Empregados no Comércio de Passos e Região";

  // ---- aba "Dados" — a que o sistema lê (sempre a primeira aba) ----
  const dados = livro.addWorksheet("Dados", { views: [{ state: "frozen", ySplit: 1 }] });
  dados.columns = COLUNAS.map((c) => ({ key: c.chave, width: c.largura }));
  dados.getRow(1).values = COLUNAS.map((c) => c.chave);
  dados.getRow(1).eachCell((celula) => {
    celula.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    celula.alignment = { vertical: "middle", horizontal: "left" };
  });
  dados.getRow(1).height = 22;

  // Defesa do zero à esquerda pela COLUNA, não célula a célula — aplica às
  // linhas que o contador ainda vai digitar (orientacoes.md §2.10).
  COLUNAS.forEach((c, i) => {
    if (!c.texto) return;
    dados.getColumn(i + 1).numFmt = "@";
  });

  // Uma linha por estabelecimento da carteira do token. Os já cobertos ficam
  // NA LISTA, marcados — não escondidos: o contador pode ter gente NOVA numa
  // empresa que já mandou dado antes.
  for (const e of estabelecimentos) {
    const nomeEmpresa = e.nome_fantasia || e.razao_social;
    const linha = dados.addRow({
      cnpj_estabelecimento: e.cnpj,
      razao_social: e.ja_coberto ? `${nomeEmpresa}${MARCADOR_JA_ENVIADO}` : nomeEmpresa,
    });
    if (e.ja_coberto) {
      linha.eachCell({ includeEmpty: true }, (celula) => {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FUNDO } };
      });
      linha.getCell("razao_social").font = { color: { argb: VERDE_SUCESSO }, italic: true };
    }
  }

  // ---- aba "Instruções" — nunca é lida pelo sistema ----
  const guia = livro.addWorksheet("Instruções");
  guia.columns = [{ width: 24 }, { width: 14 }, { width: 78 }, { width: 26 }];

  function linhaTitulo(texto: string, tamanho = 14) {
    const linha = guia.addRow([texto]);
    linha.getCell(1).font = { bold: true, size: tamanho, color: { argb: VERMELHO } };
    linha.height = 22;
    return linha;
  }
  function linhaTexto(texto: string) {
    const linha = guia.addRow([texto]);
    guia.mergeCells(`A${linha.number}:D${linha.number}`);
    linha.getCell(1).alignment = { wrapText: true, vertical: "top" };
    linha.getCell(1).font = { color: { argb: TEXTO } };
    linha.height = 30;
    return linha;
  }

  linhaTitulo(`Quadro de empregados — ${nomeContador}`);
  linhaTexto(
    "Preencha a aba DADOS, uma linha por trabalhador, e envie pelo mesmo link que você recebeu por e-mail. " +
      "As linhas já vêm com o CNPJ e o nome de cada empresa da sua carteira — copie a linha quantas vezes " +
      "precisar se uma empresa tiver mais de um funcionário. Você pode enviar quantas vezes quiser, com " +
      "quantas empresas conseguir por vez — envio parcial vale muito mais que envio nenhum. Reenviar a " +
      "mesma planilha não duplica ninguém.",
  );
  guia.addRow([]);

  const cabecalhoTabela = guia.addRow(["Coluna", "Obrigatória", "O que preencher", "Exemplo"]);
  cabecalhoTabela.eachCell((celula) => {
    celula.font = { bold: true, color: { argb: TEXTO } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AREIA } };
  });
  for (const c of COLUNAS) {
    const linha = guia.addRow([c.chave, c.obrigatoria ? "sim" : "não", c.explicacao, c.exemplo]);
    linha.getCell(3).alignment = { wrapText: true, vertical: "top" };
    linha.getCell(4).alignment = { horizontal: "left" };
    linha.height = 34;
  }

  guia.addRow([]);
  linhaTitulo("Duas coisas que evitam retrabalho", 12);
  linhaTexto(
    "1) CPF com zero na frente: as colunas de CPF e CNPJ já vêm formatadas como TEXTO. Se você recriar a " +
      "planilha do zero ou colar valores, formate essas colunas como Texto antes de digitar — senão o Excel " +
      "apaga o zero inicial e o CPF passa a ser recusado.",
  );
  linhaTexto(
    '2) Coluna "status": escreva sindicalizado ou oposição. Qualquer outra palavra faz o sistema avisar e ' +
      "aplicar o padrão (contribui) — o que classificaria errado quem se opôs.",
  );
  if (estabelecimentos.some((e) => e.ja_coberto)) {
    linhaTexto(
      "3) Linhas em verde na aba Dados são empresas que já têm gente cadastrada com este link. Não precisa " +
        "mexer nelas — a menos que essa empresa tenha contratado alguém novo, aí é só preencher normalmente.",
    );
  }

  return livro.xlsx.writeBuffer();
}
