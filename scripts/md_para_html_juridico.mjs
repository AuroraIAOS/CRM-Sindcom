#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/md_para_html_juridico.mjs
// ETAPA 08 · Subetapa 08.3 — converte os textos jurídicos .md em .html
//
// PARA QUÊ
// Os três textos são revisados pelo Dr. Adenilson em `.docx`, com controle de
// alterações. O Word abre HTML e salva como `.docx` preservando estrutura —
// então o caminho é `.md` → `.html` → Word → `.docx`
// (ver `scripts/gerar_docx_juridico.ps1`).
//
// POR QUE UM CONVERSOR PRÓPRIO, E NÃO UMA BIBLIOTECA
// O projeto não tem `pandoc` nem conversor de Markdown, e o subconjunto usado
// nestes três arquivos é pequeno e conhecido: títulos, negrito, itálico,
// citação, tabela, lista, régua e parágrafo. Trazer dependência nova para isso
// custaria mais do que as 80 linhas abaixo — e um conversor genérico ainda
// erraria a parte que mais importa aqui: **juntar as linhas quebradas em ~95
// colunas de volta em parágrafos**. Sem isso o documento chega ao Dr. com uma
// quebra de linha no meio de cada frase.
//
// Uso: node scripts/md_para_html_juridico.mjs <entrada.md> <saida.html>
// ============================================================================

import fs from "node:fs";

const ENTRADA = process.argv[2];
const SAIDA = process.argv[3];
if (!ENTRADA || !SAIDA) {
  console.error("Uso: node scripts/md_para_html_juridico.mjs <entrada.md> <saida.html>");
  process.exit(1);
}

function escapar(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Marcação inline: negrito, itálico e código. Aplicada DEPOIS do escape. */
function inline(s) {
  return escapar(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

const linhas = fs.readFileSync(ENTRADA, "utf8").split(/\r?\n/);
const saida = [];
let i = 0;

/** Junta linhas consecutivas até a próxima em branco — é o que devolve o
 *  parágrafo à sua forma corrida. */
function blocoCorrido(condicaoFim) {
  const partes = [];
  while (i < linhas.length && linhas[i].trim() !== "" && !condicaoFim(linhas[i])) {
    partes.push(linhas[i].trim());
    i += 1;
  }
  return partes.join(" ");
}

const ehTitulo = (l) => /^#{1,6}\s/.test(l);
const ehLista = (l) => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l);
const ehCitacao = (l) => /^>\s?/.test(l);
const ehTabela = (l) => /^\s*\|/.test(l);
const ehRegua = (l) => /^\s*---+\s*$/.test(l);
const especial = (l) => ehTitulo(l) || ehLista(l) || ehCitacao(l) || ehTabela(l) || ehRegua(l);

while (i < linhas.length) {
  const linha = linhas[i];

  if (linha.trim() === "") { i += 1; continue; }

  if (ehRegua(linha)) { saida.push("<hr/>"); i += 1; continue; }

  if (ehTitulo(linha)) {
    const nivel = linha.match(/^#+/)[0].length;
    saida.push(`<h${nivel}>${inline(linha.replace(/^#+\s*/, ""))}</h${nivel}>`);
    i += 1;
    continue;
  }

  if (ehTabela(linha)) {
    const linhasTabela = [];
    while (i < linhas.length && ehTabela(linhas[i])) { linhasTabela.push(linhas[i]); i += 1; }
    const celulas = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const cabecalho = celulas(linhasTabela[0]);
    // A 2ª linha é o separador (|---|---|) e não vira conteúdo.
    const corpo = linhasTabela.slice(2).map(celulas);
    saida.push('<table border="1" cellspacing="0" cellpadding="4">');
    saida.push("<tr>" + cabecalho.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr>");
    for (const l of corpo) saida.push("<tr>" + l.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
    saida.push("</table>");
    continue;
  }

  if (ehCitacao(linha)) {
    const partes = [];
    while (i < linhas.length && ehCitacao(linhas[i])) {
      partes.push(linhas[i].replace(/^>\s?/, "").trim());
      i += 1;
    }
    saida.push(`<blockquote><p>${inline(partes.join(" "))}</p></blockquote>`);
    continue;
  }

  if (ehLista(linha)) {
    const ordenada = /^\s*\d+\.\s/.test(linha);
    const itens = [];
    while (i < linhas.length && (ehLista(linhas[i]) || (linhas[i].trim() !== "" && /^\s{2,}\S/.test(linhas[i]) && itens.length))) {
      if (ehLista(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim());
      } else {
        // continuação indentada do item anterior: volta para a mesma frase
        itens[itens.length - 1] += " " + linhas[i].trim();
      }
      i += 1;
    }
    const tag = ordenada ? "ol" : "ul";
    saida.push(`<${tag}>` + itens.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
    continue;
  }

  const paragrafo = blocoCorrido(especial);
  if (paragrafo) saida.push(`<p>${inline(paragrafo)}</p>`);
}

// Tipografia conforme docs/design-tokens.md, com pilha de fallback: o Word
// substitui a fonte ausente sem avisar, e o documento vai para a máquina do Dr.
const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${escapar(ENTRADA.split(/[\\/]/).pop())}</title>
<style>
 body { font-family: Lato, Calibri, sans-serif; font-size: 11pt; color: #424242; line-height: 1.45; }
 h1, h2, h3, h4 { font-family: "Playfair Display", Georgia, serif; color: #424242; }
 h1 { font-size: 20pt; } h2 { font-size: 15pt; } h3 { font-size: 12.5pt; } h4 { font-size: 11.5pt; }
 blockquote { margin: 8pt 0 8pt 18pt; padding-left: 10pt; border-left: 3px solid #C62828; color: #565656; }
 table { border-collapse: collapse; font-size: 10pt; }
 th { background: #EFEEE7; text-align: left; }
 code { font-family: Consolas, monospace; font-size: 10pt; }
 hr { border: 0; border-top: 1px solid #EFEEE7; }
</style></head><body>
${saida.join("\n")}
</body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log(`${SAIDA} — ${saida.length} blocos`);
