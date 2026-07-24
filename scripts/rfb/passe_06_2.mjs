#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/passe_06_2.mjs
// Subetapa 06.2 (docs/plano_importacao_rfb.md): passe completo sobre os 22 GB.
//
// PASSE 1 (estabelecimentos0-9.csv): filtra pelos 3 critérios (município ∈ 29,
//   CNAE 45/46/47, situação ativa) → estabelecimentos_filtrados.ndjson +
//   conjunto de cnpj_basico aprovados.
// PASSE 2 (empresas0-9.csv): mantém só cnpj_basico ∈ conjunto do passe 1 →
//   empresas_filtradas.ndjson.
//
// Cada arquivo é contado de DUAS formas independentes — contagem rápida de
// bytes '\n' (sem parse) e contagem real do papaparse — para provar que
// nenhum arquivo foi truncado sem depender só da confiança no parser
// (docs/plano_importacao_rfb.md §06.2, critério de qualidade).
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { MUNICIPIOS_TOM, CNAE_PREFIXOS, SITUACAO_ATIVA } from "./municipios.mjs";

const DIR_ORIGEM = "D:/BD";
const DIR_SAIDA = "D:/BD/filtrados";
fs.mkdirSync(DIR_SAIDA, { recursive: true });

const logPath = path.join(DIR_SAIDA, "log_06_2.txt");
fs.writeFileSync(logPath, `Início: ${new Date().toISOString()}\n`);
function log(msg) {
  console.log(msg);
  fs.appendFileSync(logPath, msg + "\n");
}

// Posições 0-indexed — mesmo layout confirmado na Subetapa 06.1.
const COL_ESTAB = {
  cnpj_basico: 0, cnpj_ordem: 1, cnpj_dv: 2, matriz_filial: 3, nome_fantasia: 4,
  situacao_cadastral: 5, data_situacao_cadastral: 6, motivo_situacao: 7,
  data_inicio_atividades: 10, cnae_principal: 11,
  tipo_logradouro: 13, logradouro: 14, numero: 15, complemento: 16, bairro: 17,
  cep: 18, uf: 19, municipio_tom: 20, ddd_1: 21, telefone_1: 22, ddd_2: 23,
  telefone_2: 24, email: 27, situacao_especial: 28, data_situacao_especial: 29,
};
const COL_EMP = {
  cnpj_basico: 0, razao_social: 1, natureza_juridica: 2,
  qualificacao_responsavel: 3, capital_social: 4, porte: 5,
};

function cnaeAprovado(cnae) {
  return !!cnae && CNAE_PREFIXOS.some((p) => cnae.startsWith(p));
}
function linhaEstabAprovada(linha) {
  const municipio = Number.parseInt(linha[COL_ESTAB.municipio_tom], 10);
  return (
    MUNICIPIOS_TOM.has(municipio) &&
    cnaeAprovado(linha[COL_ESTAB.cnae_principal]) &&
    linha[COL_ESTAB.situacao_cadastral] === SITUACAO_ATIVA
  );
}

// Contagem independente de linhas via bytes '\n' — não usa o parser CSV,
// serve de contraprova contra a contagem do papaparse (detecta truncamento
// sem depender da mesma ferramenta que poderia ter o mesmo bug).
function contarLinhasBrutas(caminho) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const rs = fs.createReadStream(caminho);
    rs.on("data", (chunk) => {
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === 0x0a) n++;
    });
    rs.on("end", () => resolve(n));
    rs.on("error", reject);
  });
}

function parseArquivo(caminho, onLinha) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(caminho);
    stream.setEncoding("latin1");
    let total = 0;
    Papa.parse(stream, {
      delimiter: ";",
      quoteChar: '"',
      header: false,
      skipEmptyLines: true,
      step: (r) => { total++; onLinha(r.data); },
      complete: () => resolve(total),
      error: reject,
    });
  });
}

async function passe1() {
  log("\n=== PASSE 1: estabelecimentos0-9.csv ===");
  const wsNdjson = fs.createWriteStream(path.join(DIR_SAIDA, "estabelecimentos_filtrados.ndjson"));
  const cnpjAprovados = new Set();
  const porMunicipio = new Map();
  const porDivisaoCnae = new Map();
  let totalLido = 0;
  let totalAprovado = 0;
  const conferenciaPorArquivo = [];

  for (let i = 0; i <= 9; i++) {
    const arquivo = path.join(DIR_ORIGEM, `estabelecimentos${i}.csv`);
    const inicio = Date.now();

    const linhasBrutas = await contarLinhasBrutas(arquivo);
    const lidoNesteArquivo = await parseArquivo(arquivo, (linha) => {
      if (!linhaEstabAprovada(linha)) return;
      totalAprovado++;
      const municipio = Number.parseInt(linha[COL_ESTAB.municipio_tom], 10);
      const cnae = linha[COL_ESTAB.cnae_principal];
      const cnpj = linha[COL_ESTAB.cnpj_basico];

      cnpjAprovados.add(cnpj);
      porMunicipio.set(municipio, (porMunicipio.get(municipio) ?? 0) + 1);
      const divisao = cnae.slice(0, 2);
      porDivisaoCnae.set(divisao, (porDivisaoCnae.get(divisao) ?? 0) + 1);

      const obj = {};
      for (const [chave, idx] of Object.entries(COL_ESTAB)) obj[chave] = linha[idx];
      wsNdjson.write(JSON.stringify(obj) + "\n");
    });

    totalLido += lidoNesteArquivo;
    const bateu = linhasBrutas === lidoNesteArquivo;
    conferenciaPorArquivo.push({ arquivo: `estabelecimentos${i}.csv`, linhasBrutas, linhasParseadas: lidoNesteArquivo, bateu });
    const s = ((Date.now() - inicio) / 1000).toFixed(1);
    log(`  estabelecimentos${i}.csv: bruto=${linhasBrutas.toLocaleString("pt-BR")} parse=${lidoNesteArquivo.toLocaleString("pt-BR")} ${bateu ? "✅" : "⚠️ DIVERGIU"} · ${s}s · aprovados acumulado=${totalAprovado}`);
  }

  await new Promise((r) => wsNdjson.end(r));
  fs.writeFileSync(path.join(DIR_SAIDA, "cnpj_aprovados.txt"), [...cnpjAprovados].join("\n"));

  return { totalLido, totalAprovado, cnpjAprovados, porMunicipio, porDivisaoCnae, conferenciaPorArquivo };
}

async function passe2(cnpjAprovados) {
  log("\n=== PASSE 2: empresas0-9.csv ===");
  const wsNdjson = fs.createWriteStream(path.join(DIR_SAIDA, "empresas_filtradas.ndjson"));
  let totalLido = 0;
  let totalAprovado = 0;
  const cnpjEncontrados = new Set();
  const conferenciaPorArquivo = [];

  for (let i = 0; i <= 9; i++) {
    const arquivo = path.join(DIR_ORIGEM, `empresas${i}.csv`);
    const inicio = Date.now();

    const linhasBrutas = await contarLinhasBrutas(arquivo);
    const lidoNesteArquivo = await parseArquivo(arquivo, (linha) => {
      const cnpj = linha[COL_EMP.cnpj_basico];
      if (!cnpjAprovados.has(cnpj)) return;
      totalAprovado++;
      cnpjEncontrados.add(cnpj);
      const obj = {};
      for (const [chave, idx] of Object.entries(COL_EMP)) obj[chave] = linha[idx];
      wsNdjson.write(JSON.stringify(obj) + "\n");
    });

    totalLido += lidoNesteArquivo;
    const bateu = linhasBrutas === lidoNesteArquivo;
    conferenciaPorArquivo.push({ arquivo: `empresas${i}.csv`, linhasBrutas, linhasParseadas: lidoNesteArquivo, bateu });
    const s = ((Date.now() - inicio) / 1000).toFixed(1);
    log(`  empresas${i}.csv: bruto=${linhasBrutas.toLocaleString("pt-BR")} parse=${lidoNesteArquivo.toLocaleString("pt-BR")} ${bateu ? "✅" : "⚠️ DIVERGIU"} · ${s}s · aprovadas acumulado=${totalAprovado}`);
  }

  await new Promise((r) => wsNdjson.end(r));
  return { totalLido, totalAprovado, cnpjEncontrados, conferenciaPorArquivo };
}

function verificarSaidaEstabelecimentos() {
  const conteudo = fs.readFileSync(path.join(DIR_SAIDA, "estabelecimentos_filtrados.ndjson"), "utf8").trim();
  const linhas = conteudo.length ? conteudo.split("\n") : [];
  let foraDeMunicipio = 0, foraDeCnae = 0, foraDeSituacao = 0;
  for (const l of linhas) {
    const o = JSON.parse(l);
    if (!MUNICIPIOS_TOM.has(Number.parseInt(o.municipio_tom, 10))) foraDeMunicipio++;
    if (!cnaeAprovado(o.cnae_principal)) foraDeCnae++;
    if (o.situacao_cadastral !== SITUACAO_ATIVA) foraDeSituacao++;
  }
  return { totalVerificado: linhas.length, foraDeMunicipio, foraDeCnae, foraDeSituacao };
}

async function main() {
  const inicioGeral = Date.now();
  const r1 = await passe1();
  const r2 = await passe2(r1.cnpjAprovados);
  const verificacao = verificarSaidaEstabelecimentos();
  const naoEncontrados = [...r1.cnpjAprovados].filter((c) => !r2.cnpjEncontrados.has(c));
  const duracaoMin = ((Date.now() - inicioGeral) / 1000 / 60).toFixed(1);

  const divergenciasEstab = r1.conferenciaPorArquivo.filter((c) => !c.bateu);
  const divergenciasEmp = r2.conferenciaPorArquivo.filter((c) => !c.bateu);

  const relatorio = {
    geradoEm: new Date().toISOString(),
    duracaoMinutos: Number(duracaoMin),
    estabelecimentos: {
      totalLinhasLidas: r1.totalLido,
      totalAprovados: r1.totalAprovado,
      cnpjBasicoDistintos: r1.cnpjAprovados.size,
      conferenciaPorArquivo: r1.conferenciaPorArquivo,
      porMunicipio: Object.fromEntries([...r1.porMunicipio.entries()].sort((a, b) => b[1] - a[1])),
      porDivisaoCnae: Object.fromEntries([...r1.porDivisaoCnae.entries()].sort((a, b) => b[1] - a[1])),
    },
    empresas: {
      totalLinhasLidas: r2.totalLido,
      totalAprovadas: r2.totalAprovado,
      conferenciaPorArquivo: r2.conferenciaPorArquivo,
    },
    integridade: {
      asserção1_semTruncamento: {
        ok: divergenciasEstab.length === 0 && divergenciasEmp.length === 0,
        divergenciasEstabelecimentos: divergenciasEstab,
        divergenciasEmpresas: divergenciasEmp,
      },
      asserção2_cascataIntegra: {
        ok: naoEncontrados.length === 0,
        cnpjAprovadosSemEmpresaCorrespondente: naoEncontrados,
      },
      asserção3_saidaLimpa: {
        ok: verificacao.foraDeMunicipio === 0 && verificacao.foraDeCnae === 0 && verificacao.foraDeSituacao === 0,
        detalhe: verificacao,
      },
    },
  };

  fs.writeFileSync(path.join(DIR_SAIDA, "relatorio_06_2.json"), JSON.stringify(relatorio, null, 2));

  log("\n" + "=".repeat(78));
  log("RELATÓRIO FINAL — Subetapa 06.2");
  log("=".repeat(78));
  log(`Duração total: ${duracaoMin} min`);
  log(`\nEstabelecimentos: ${r1.totalLido.toLocaleString("pt-BR")} linhas lidas, ${r1.totalAprovado.toLocaleString("pt-BR")} aprovados (${r1.cnpjAprovados.size} CNPJs distintos)`);
  log(`Empresas: ${r2.totalLido.toLocaleString("pt-BR")} linhas lidas, ${r2.totalAprovado.toLocaleString("pt-BR")} aprovadas`);
  log(`\n--- Asserção 1: nenhum arquivo truncado (bruto === parseado, arquivo a arquivo) ---`);
  log(relatorio.integridade.asserção1_semTruncamento.ok ? "✅ OK — 20/20 arquivos batendo" : `🔴 ${divergenciasEstab.length + divergenciasEmp.length} arquivo(s) divergindo`);
  log(`\n--- Asserção 2: todo cnpj_basico aprovado existe em empresas (cascata íntegra) ---`);
  log(relatorio.integridade.asserção2_cascataIntegra.ok ? "✅ OK" : `🔴 ${naoEncontrados.length} CNPJ(s) sem empresa correspondente`);
  log(`\n--- Asserção 3: saída 100% dentro dos 3 filtros (reverificado na saída, não na intenção do código) ---`);
  log(relatorio.integridade.asserção3_saidaLimpa.ok ? "✅ OK" : `🔴 ${JSON.stringify(verificacao)}`);
  log(`\nRelatório completo: ${path.join(DIR_SAIDA, "relatorio_06_2.json")}`);
  log(`\nFim: ${new Date().toISOString()}`);
}

main().catch((e) => {
  log("ERRO FATAL: " + (e?.stack || e));
  process.exit(1);
});
