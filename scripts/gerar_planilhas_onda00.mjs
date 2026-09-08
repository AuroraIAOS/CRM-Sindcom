#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/gerar_planilhas_onda00.mjs
// ETAPA 09 · Subetapa 9.1 — Onda 00: os 52 trabalhadores fictícios
//
// POR QUE ESTE SCRIPT EXISTE
// Não existe gerador de CPF válido no repo (src/lib/validators.ts só confere,
// não gera — CLAUDE.md/pedido do Maxwell). Os 52 CPFs abaixo foram gerados à
// parte, na faixa fictícia 900000xxx (nunca alocada pela Receita), e CONFERIDOS
// um a um contra `cpfValido()` antes de entrar aqui.
//
// O QUE ESTE SCRIPT PRODUZ
//  · dados/onda_00/planilha_alfa.xlsx  — 30 linhas, as 5 empresas da
//    DEMO — Contabilidade Alfa (upload direto na página /enviar-dados/:token)
//  · dados/onda_00/planilha_omega.xlsx — 7 linhas, as 2 empresas da
//    DEMO — Contabilidade Ômega
//  · dados/onda_00/trabalhadores_delta.csv e _gama.csv — referência para
//    digitar no FORMULÁRIO DIRETO (08.8): essas duas empresas são isoladas
//    (1 estabelecimento), e a página não oferece upload de planilha para elas
//    — o campo é preenchido linha a linha na tela.
//
// Mesmo layout de colunas do modelo "Cadastro sindical 2026" (sql/20 §12):
//   cnpj_estabelecimento, nome, cpf, telefone_whatsapp, salario_informado,
//   recolhe_contribuicao
//
// Uso: node scripts/gerar_planilhas_onda00.mjs
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";

// --- CPFs, gerados e conferidos contra cpfValido() (900000xxx = fictícios) --
const CPFS = [
  "90000000175", "90000000256", "90000000337", "90000000418", "90000000507",
  "90000000680", "90000000760", "90000000841", "90000000922", "90000001066",
  "90000001147", "90000001228", "90000001309", "90000001490", "90000001570",
  "90000001651", "90000001732", "90000001813", "90000001902", "90000002038",
  "90000002119", "90000002208", "90000002380", "90000002461", "90000002542",
  "90000002623", "90000002704", "90000002895", "90000002976", "90000003000",
  "90000003190", "90000003271", "90000003352", "90000003433", "90000003514",
  "90000003603", "90000003786", "90000003867", "90000003948", "90000004081",
  "90000004162", "90000004243", "90000004324", "90000004405", "90000004596",
  "90000004677", "90000004758", "90000004839", "90000004910", "90000005053",
  "90000005134", "90000005215",
];

const SOBRENOMES = [
  "Ribeiro", "Nunes", "Souza", "Pereira", "Almeida", "Costa", "Silveira", "Martins",
  "Barbosa", "Carvalho", "Teixeira", "Rocha", "Andrade", "Moreira", "Cardoso",
  "Farias", "Gomes", "Lopes", "Vieira", "Azevedo", "Correia", "Dias", "Fonseca",
  "Guimarães", "Henriques", "Ianiski", "Junqueira", "Kowalski", "Leal", "Machado",
  "Neves", "Oliveira", "Pinheiro", "Queiroz", "Ramalho", "Sales", "Tavares",
  "Uchoa", "Valente", "Wagner", "Xavier", "Yamada", "Zampieri", "Bezerra",
  "Cavalcante", "Duarte", "Esteves", "Freitas", "Gouveia", "Holanda", "Iglesias",
];
const NOMES = [
  "Ana", "Carlos", "Marta", "João", "Fernanda", "Rafael", "Beatriz", "Lucas",
  "Camila", "Bruno", "Juliana", "Diego", "Patrícia", "Felipe", "Renata", "Gustavo",
  "Larissa", "André", "Vanessa", "Marcelo", "Tatiane", "Rodrigo", "Simone",
  "Eduardo", "Cristina", "Fábio", "Aline", "Thiago", "Priscila", "Vinícius",
  "Débora", "Leonardo", "Sandra", "Mateus", "Viviane", "Alexandre", "Roberta",
  "Daniel", "Adriana", "Paulo", "Michele", "Ricardo", "Elaine", "Sérgio",
  "Cláudia", "Márcio", "Denise", "Igor", "Rosana", "Wagner", "Elisângela",
];

function nomeFicticio(i) {
  const nome = NOMES[i % NOMES.length];
  const sobrenome = SOBRENOMES[(i * 7 + 3) % SOBRENOMES.length];
  return `DEMO — ${nome} ${sobrenome}`;
}

function telefone(i) {
  return `35 9${String(8000 + i).padStart(4, "0")}-${String(1000 + i * 3).padStart(4, "0")}`;
}

function salario(i) {
  const base = 1518 + (i % 8) * 90; // varia entre 1518,00 e 2148,00
  return base.toFixed(2).replace(".", ",");
}

// --- Distribuição por empresa: [chave, cnpj, quantidade, oposição] ---------
const EMPRESAS = [
  { chave: "alfa01", cnpj: "99999902000140", qtd: 5, oposicao: 1 },
  { chave: "alfa02", cnpj: "99999903000195", qtd: 2, oposicao: 2 },
  { chave: "alfa03", cnpj: "99999904000130", qtd: 3, oposicao: 1 },
  { chave: "alfa04", cnpj: "99999905000184", qtd: 15, oposicao: 5 },
  { chave: "alfa05", cnpj: "99999906000129", qtd: 5, oposicao: 0 },
  { chave: "omega01", cnpj: "99999907000173", qtd: 5, oposicao: 1 },
  { chave: "omega02", cnpj: "99999908000118", qtd: 2, oposicao: 2 },
  { chave: "delta", cnpj: "99999909000162", qtd: 5, oposicao: 2 },
  { chave: "gama", cnpj: "99999910000197", qtd: 10, oposicao: 0 },
];

let cursor = 0;
const linhas = []; // { chave, cnpj, nome, cpf, telefone, salario, situacao }
for (const e of EMPRESAS) {
  for (let i = 0; i < e.qtd; i += 1) {
    const cpf = CPFS[cursor];
    linhas.push({
      chave: e.chave,
      cnpj: e.cnpj,
      nome: nomeFicticio(cursor),
      cpf,
      telefone: telefone(cursor),
      salario: salario(cursor),
      // As primeiras `oposicao` linhas de cada empresa saem em oposição —
      // ordem arbitrária, o que importa é bater a contagem da tabela do plano.
      situacao: i < e.oposicao ? "oposição" : "sindicalizado",
    });
    cursor += 1;
  }
}
if (cursor !== 52) throw new Error(`esperava 52 linhas, gerou ${cursor}`);
const totalOposicao = linhas.filter((l) => l.situacao === "oposição").length;
if (totalOposicao !== 14) throw new Error(`esperava 14 em oposição, gerou ${totalOposicao}`);
console.log(`52 trabalhadores gerados — ${totalOposicao} em oposição, ${52 - totalOposicao} sindicalizados.`);

// ----------------------------------------------------------------------------
// OOXML .xlsx mínimo, sem dependência (mesma técnica de gerar_xlsx_demo.mjs)
// ----------------------------------------------------------------------------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function montarZip(entradas) {
  const locais = [];
  const central = [];
  let deslocamento = 0;
  for (const { nome, conteudo } of entradas) {
    const nomeBytes = Buffer.from(nome, "utf8");
    const crc = crc32(conteudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(conteudo.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nomeBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nomeBytes, conteudo);
    const cab = Buffer.alloc(46);
    cab.writeUInt32LE(0x02014b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(20, 6);
    cab.writeUInt16LE(0, 8);
    cab.writeUInt16LE(0, 10);
    cab.writeUInt16LE(0, 12);
    cab.writeUInt16LE(0x2821, 14);
    cab.writeUInt32LE(crc, 16);
    cab.writeUInt32LE(conteudo.length, 20);
    cab.writeUInt32LE(conteudo.length, 24);
    cab.writeUInt16LE(nomeBytes.length, 28);
    cab.writeUInt32LE(deslocamento, 42);
    central.push(cab, nomeBytes);
    deslocamento += 30 + nomeBytes.length + conteudo.length;
  }
  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, corpoCentral, fim]);
}

const CABECALHO = [
  "cnpj_estabelecimento", "nome", "cpf", "telefone_whatsapp", "salario_informado", "recolhe_contribuicao",
];
function escapar(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function celula(ref, valor) {
  return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`;
}
function coluna(i) {
  return String.fromCharCode(65 + i);
}
function planilhaXml(linhasDaAba) {
  const partes = [];
  partes.push(`<row r="1">${CABECALHO.map((h, i) => celula(`${coluna(i)}1`, h)).join("")}</row>`);
  linhasDaAba.forEach((linha, idx) => {
    const r = idx + 2;
    partes.push(`<row r="${r}">${linha.map((v, i) => celula(`${coluna(i)}${r}`, v)).join("")}</row>`);
  });
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${partes.join("")}</sheetData></worksheet>`
  );
}
const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `</Types>`;
const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;
const WORKBOOK =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="Cadastro sindical 2026" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `</Relationships>`;

function gerarXlsx(caminho, linhasDaAba) {
  const zip = montarZip([
    { nome: "[Content_Types].xml", conteudo: Buffer.from(CONTENT_TYPES, "utf8") },
    { nome: "_rels/.rels", conteudo: Buffer.from(RELS, "utf8") },
    { nome: "xl/workbook.xml", conteudo: Buffer.from(WORKBOOK, "utf8") },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: Buffer.from(WORKBOOK_RELS, "utf8") },
    { nome: "xl/worksheets/sheet1.xml", conteudo: Buffer.from(planilhaXml(linhasDaAba), "utf8") },
  ]);
  writeFileSync(caminho, zip);
  console.log(`${caminho} — ${zip.length} bytes · ${linhasDaAba.length} linha(s) + cabeçalho`);
}

const PASTA = "dados/onda_00";
mkdirSync(PASTA, { recursive: true });

const linhaComoArray = (l) => [l.cnpj, l.nome, l.cpf, l.telefone, l.salario, l.situacao];

const doAlfa = linhas.filter((l) => l.chave.startsWith("alfa")).map(linhaComoArray);
const doOmega = linhas.filter((l) => l.chave.startsWith("omega")).map(linhaComoArray);
gerarXlsx(`${PASTA}/planilha_alfa.xlsx`, doAlfa);
gerarXlsx(`${PASTA}/planilha_omega.xlsx`, doOmega);

// Delta e Gama: referência em CSV para digitar no FORMULÁRIO DIRETO (08.8) —
// essas duas são empresa isolada, a página não oferece upload ali.
function csvReferencia(caminho, linhasDaEmpresa) {
  const cab = "nome;cpf;telefone;piso;status";
  const corpo = linhasDaEmpresa
    .map((l) => `${l.nome};${l.cpf};${l.telefone};${l.salario.replace(",", ".")};${l.situacao === "oposição" ? "oposicao" : "sindicalizado"}`)
    .join("\r\n");
  writeFileSync(caminho, "﻿" + cab + "\r\n" + corpo + "\r\n", "utf-8");
  console.log(`${caminho} — ${linhasDaEmpresa.length} linha(s), para digitar no formulário direto`);
}
csvReferencia(`${PASTA}/trabalhadores_delta.csv`, linhas.filter((l) => l.chave === "delta"));
csvReferencia(`${PASTA}/trabalhadores_gama.csv`, linhas.filter((l) => l.chave === "gama"));

console.log("\nResumo por empresa:");
for (const e of EMPRESAS) {
  const doGrupo = linhas.filter((l) => l.chave === e.chave);
  const op = doGrupo.filter((l) => l.situacao === "oposição").length;
  console.log(`  ${e.chave.padEnd(8)} ${e.cnpj} — ${doGrupo.length} trabalhador(es), ${op} em oposição`);
}
