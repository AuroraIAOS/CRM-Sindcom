#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/gerar_xlsx_demo.mjs
// ETAPA 08 · infraestrutura de teste da Subetapa 08.5
//
// Gera um `.xlsx` REAL (pacote OOXML), sem dependência nova.
//
// POR QUE ISSO EXISTE
// A 08.5 precisa provar que a Edge Function aceita planilha de verdade e recusa
// `.csv` renomeado — e a checagem do servidor é por CONTEÚDO, não por extensão.
// Provar isso com um arquivo falso provaria o teste, não a função. O `exceljs`
// (decidido para o projeto) só entra no Circuito 3, na 08.7; até lá este script
// escreve o ZIP na mão, com método "stored" (sem compressão), que não precisa
// de biblioteca nenhuma — só de um CRC32 de dez linhas.
//
// Uso:
//   node scripts/gerar_xlsx_demo.mjs <saida.xlsx> [--linhas N]
// ============================================================================

import fs from "node:fs";

// --- CRC32 (o único cálculo que um ZIP "stored" exige) ---------------------
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

/** Monta um ZIP com método 0 (stored). Suficiente e legível por qualquer leitor
 *  de OOXML — inclusive o Excel, que não exige compressão. */
function montarZip(entradas) {
  const locais = [];
  const central = [];
  let deslocamento = 0;

  for (const { nome, conteudo } of entradas) {
    const nomeBytes = Buffer.from(nome, "utf8");
    const crc = crc32(conteudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura "PK\x03\x04"
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // método: stored
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x2821, 12); // data (2000-01-01, fixa: saída determinística)
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

// --- Conteúdo: as 6 colunas do modelo "Cadastro sindical 2026" -------------
const CABECALHO = [
  "cnpj_estabelecimento",
  "nome",
  "cpf",
  "telefone_whatsapp",
  "salario_informado",
  "recolhe_contribuicao",
];

function escapar(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Célula sempre inline string (`t="inlineStr"`): é o equivalente, no arquivo
 *  que NÓS geramos, da defesa do `numFmt: '@'` da 08.7 — CPF com zero à
 *  esquerda não vira número e não perde o zero (orientacoes.md §2.10). */
function celula(ref, valor) {
  return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`;
}

function coluna(i) {
  return String.fromCharCode(65 + i);
}

function planilha(linhas) {
  const partes = [];
  partes.push(`<row r="1">${CABECALHO.map((h, i) => celula(`${coluna(i)}1`, h)).join("")}</row>`);
  linhas.forEach((linha, idx) => {
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

// --- Linhas de demonstração ------------------------------------------------
// Nomes com prefixo DEMO por regra do projeto: registro de demonstração fica
// gravado e não pode ser confundido com cadastro real (CLAUDE.md).
const DEMONSTRACAO = [
  ["99999901000191", "DEMO — Ana Paula Ribeiro", "00123456789", "35988887777", "1600.00", "sindicalizado"],
  ["99999901000191", "DEMO — Carlos Eduardo Nunes", "11144477735", "35988886666", "1750.50", "oposicao"],
  ["99999901000272", "DEMO — Marta Lopes de Souza", "52998224725", "", "", "sindicalizado"],
];

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node scripts/gerar_xlsx_demo.mjs <saida.xlsx> [--linhas N]");
  process.exit(1);
}
const indiceLinhas = process.argv.indexOf("--linhas");
const quantas = indiceLinhas > -1 ? Number.parseInt(process.argv[indiceLinhas + 1], 10) : DEMONSTRACAO.length;

const linhas = [];
for (let i = 0; i < quantas; i += 1) linhas.push(DEMONSTRACAO[i % DEMONSTRACAO.length]);

const zip = montarZip([
  { nome: "[Content_Types].xml", conteudo: Buffer.from(CONTENT_TYPES, "utf8") },
  { nome: "_rels/.rels", conteudo: Buffer.from(RELS, "utf8") },
  { nome: "xl/workbook.xml", conteudo: Buffer.from(WORKBOOK, "utf8") },
  { nome: "xl/_rels/workbook.xml.rels", conteudo: Buffer.from(WORKBOOK_RELS, "utf8") },
  { nome: "xl/worksheets/sheet1.xml", conteudo: Buffer.from(planilha(linhas), "utf8") },
]);

fs.writeFileSync(saida, zip);
console.log(`${saida} — ${zip.length} bytes · ${linhas.length} linha(s) + cabeçalho`);
