#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/gerar_modelo_coleta.mjs
// ETAPA 08 · o modelo `.xlsx` que o contador baixa em /enviar-dados/:token
//
// POR QUE ESTE SCRIPT EXISTE, E NÃO UM ARQUIVO SOLTO NO REPO
// O modelo é um artefato com REGRA dentro: os cabeçalhos precisam casar com os
// apelidos de `validarTrabalhadores.ts`, e as colunas de CPF e CNPJ precisam
// nascer formatadas como TEXTO. Arquivo binário commitado à mão não tem como
// ser revisado — ninguém vê num diff que o `numFmt` caiu. Gerando por script,
// a regra fica legível e reprodutível.
//
// A DEFESA QUE ESTE ARQUIVO CARREGA (orientacoes.md §2.10)
// O Excel converte número longo em notação científica e COME zero à esquerda:
// `00123456797` vira `123456789`, e o CPF válido passa a ter DV inválido. A
// única defesa é a célula nascer como texto (`numFmt: '@'`) — e ela só existe
// porque a D6 escolheu `.xlsx` em vez de CSV, onde não há formatação de célula.
//
// RELAÇÃO COM A 08.7 (Circuito 3): lá o modelo passa a ser gerado SOB DEMANDA
// no navegador, PRÉ-PREENCHIDO com os estabelecimentos daquele token. Este
// arquivo estático é o degrau anterior — mesmos cabeçalhos, mesma formatação —
// e deve ser removido quando a 08.7 entrar.
//
// Uso: node scripts/gerar_modelo_coleta.mjs [saida.xlsx]
// ============================================================================

import ExcelJS from "exceljs";

const SAIDA = process.argv[2] ?? "public/modelos/quadro-de-empregados.xlsx";

// Tokens de marca (docs/design-tokens.md) — sem inventar paleta.
const VERMELHO = "FFC62828";
const AREIA = "FFEFEEE7";
const TEXTO = "FF424242";

/**
 * Os seis campos, com os rótulos que Maxwell escolheu para o contador. Eles NÃO
 * são os nomes internos das colunas do banco de propósito: contador fala
 * "piso" e "status", não "salario_informado" e "recolhe_contribuicao". O
 * casamento acontece pelos apelidos declarados em `validarTrabalhadores.ts`.
 */
const COLUNAS = [
  {
    chave: "cnpj_estabelecimento",
    largura: 22,
    texto: true,
    obrigatoria: true,
    explicacao: "CNPJ da empresa onde a pessoa trabalha, com 14 dígitos. Pode digitar com ou sem pontuação.",
    exemplo: "12345678000190",
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
    obrigatoria: false,
    explicacao:
      "Salário pago hoje, em reais. Se ficar em branco, o sindicato não consegue calcular a contribuição dessa pessoa.",
    exemplo: "1600,00",
  },
  {
    chave: "status",
    largura: 20,
    texto: true,
    obrigatoria: true,
    explicacao:
      'Escreva exatamente "sindicalizado" ou "oposição". É este campo que define se a pessoa contribui — deixar em branco faz o sistema assumir que contribui.',
    exemplo: "sindicalizado",
  },
];

const livro = new ExcelJS.Workbook();
livro.creator = "Sindicato dos Empregados no Comércio de Passos e Região";
livro.created = new Date(2026, 0, 1); // fixo: saída determinística entre execuções

// ---------------------------------------------------------------------------
// Aba 1 — "Dados". É a que o sistema lê (sempre a PRIMEIRA aba do arquivo).
//
// Ela tem SÓ o cabeçalho, sem linha de exemplo. Uma linha de exemplo aqui seria
// lida como pessoa de verdade: o contador que esquecesse de apagá-la cadastraria
// "Maria Aparecida de Souza" no sindicato. Os exemplos vivem na aba de
// instruções, que o leitor nunca abre.
// ---------------------------------------------------------------------------
const dados = livro.addWorksheet("Dados", {
  views: [{ state: "frozen", ySplit: 1 }], // cabeçalho fixo ao rolar
});

dados.columns = COLUNAS.map((c) => ({ key: c.chave, width: c.largura }));
dados.getRow(1).values = COLUNAS.map((c) => c.chave);
dados.getRow(1).eachCell((celula) => {
  celula.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
  celula.alignment = { vertical: "middle", horizontal: "left" };
});
dados.getRow(1).height = 22;

// A defesa do zero à esquerda, aplicada no estilo da COLUNA — não célula a
// célula. É o mecanismo certo por dois motivos: o Excel aplica o formato da
// coluna às linhas que o contador ainda vai digitar (e são justamente essas que
// importam), e não materializa centenas de linhas vazias no arquivo. Uma versão
// anterior deste script formatava as linhas 2..500 uma a uma; o modelo saía com
// 499 linhas em branco dentro.
COLUNAS.forEach((c, i) => {
  if (!c.texto) return;
  dados.getColumn(i + 1).numFmt = "@";
});

// ---------------------------------------------------------------------------
// Aba 2 — "Instruções". Nunca é lida pelo sistema.
// ---------------------------------------------------------------------------
const guia = livro.addWorksheet("Instruções");
guia.columns = [
  { width: 24 },
  { width: 14 },
  { width: 78 },
  { width: 26 },
];

function linhaTitulo(texto, tamanho = 14) {
  const linha = guia.addRow([texto]);
  linha.getCell(1).font = { bold: true, size: tamanho, color: { argb: VERMELHO } };
  linha.height = 22;
  return linha;
}

function linhaTexto(texto) {
  const linha = guia.addRow([texto]);
  guia.mergeCells(`A${linha.number}:D${linha.number}`);
  linha.getCell(1).alignment = { wrapText: true, vertical: "top" };
  linha.getCell(1).font = { color: { argb: TEXTO } };
  linha.height = 30;
  return linha;
}

linhaTitulo("Quadro de empregados — Sindicato dos Empregados no Comércio de Passos e Região");
linhaTexto(
  "Preencha a aba DADOS, uma linha por trabalhador, e envie pelo mesmo link que você recebeu por e-mail. " +
    "Você pode enviar quantas vezes quiser, com quantas empresas conseguir por vez — envio parcial vale " +
    "muito mais que envio nenhum. Reenviar a mesma planilha não duplica ninguém.",
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

// ---------------------------------------------------------------------------
await livro.xlsx.writeFile(SAIDA);
console.log(`${SAIDA} — ${COLUNAS.length} colunas · abas: Dados, Instruções`);
