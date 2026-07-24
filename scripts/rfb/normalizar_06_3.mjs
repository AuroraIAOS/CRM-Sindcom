#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/normalizar_06_3.mjs
// Subetapa 06.3 (docs/plano_importacao_rfb.md): normalização + reconciliação.
// NÃO ESCREVE NO BANCO. Lê os NDJSON da 06.2, aplica as regras de conversão e
// produz (a) os NDJSON prontos para carga e (b) o relatório de reconciliação
// com os códigos distintos de cada FK, para conferência contra o banco.
//
// REGRAS DE NORMALIZAÇÃO
//  · datas AAAAMMDD → YYYY-MM-DD ('0', '00000000', '' e datas inválidas → null)
//  · capital_social '5000,00' → 5000.00
//  · município TOM → municipios.id (de-para do banco, Subetapa 06.0/06.3)
//  · string vazia → null (Postgres distingue '' de NULL; '' em coluna de data
//    ou FK quebraria a carga)
//  · códigos de FK ficam EXATAMENTE como a RFB entrega — a Subetapa 06.0
//    alinhou as tabelas de referência ao layout oficial, então não se mexe aqui
//  · colunas que o banco gera sozinho JAMAIS são emitidas: id, cnpj_completo
//    (GENERATED ALWAYS — INSERT nela dá erro 428C9), created_at, updated_at.
//    convencao_id fica de fora de propósito: vínculo com CCT é ato manual.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DIR = "D:/BD/filtrados";
const mapaMunicipios = JSON.parse(fs.readFileSync(path.join(DIR, "municipios_de_para.json"), "utf8"));

// --- helpers de normalização ------------------------------------------------

function vazioParaNull(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function dataRfb(v) {
  const t = vazioParaNull(v);
  if (!t) return null;
  if (!/^\d{8}$/.test(t)) return null;          // '0', '00000000' e lixo caem aqui
  const ano = Number(t.slice(0, 4));
  const mes = Number(t.slice(4, 6));
  const dia = Number(t.slice(6, 8));
  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // valida data real (rejeita 20250230) comparando o round-trip
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

function decimalRfb(v) {
  const t = vazioParaNull(v);
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function inteiroOuNull(v) {
  const t = vazioParaNull(v);
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

async function* lerNdjson(arquivo) {
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, "utf8"), crlfDelay: Infinity });
  for await (const linha of rl) {
    const t = linha.trim();
    if (t) yield JSON.parse(t);
  }
}

// --- estabelecimentos -------------------------------------------------------

async function normalizarEstabelecimentos() {
  const ws = fs.createWriteStream(path.join(DIR, "estabelecimentos_normalizados.ndjson"));
  const distintos = { cnae_principal: new Set(), motivo_situacao: new Set(), municipio_tom: new Set(), uf: new Set(), matriz_filial: new Set(), situacao_cadastral: new Set() };
  const erros = [];
  const datasDescartadas = { data_situacao_cadastral: 0, data_inicio_atividades: 0, data_situacao_especial: 0 };
  let total = 0;
  let comEmail = 0;
  const cnpjCompletoVistos = new Set();
  let duplicatasCnpjCompleto = 0;

  for await (const o of lerNdjson(path.join(DIR, "estabelecimentos_filtrados.ndjson"))) {
    total++;

    // CHECKs do schema (01_schema.sql): rejeitar aqui é infinitamente melhor
    // que descobrir no meio da carga.
    if (!/^\d{8}$/.test(o.cnpj_basico)) erros.push({ linha: total, campo: "cnpj_basico", valor: o.cnpj_basico, regra: "^\\d{8}$" });
    if (!/^\d{4}$/.test(o.cnpj_ordem)) erros.push({ linha: total, campo: "cnpj_ordem", valor: o.cnpj_ordem, regra: "^\\d{4}$" });
    if (!/^\d{2}$/.test(o.cnpj_dv)) erros.push({ linha: total, campo: "cnpj_dv", valor: o.cnpj_dv, regra: "^\\d{2}$" });

    const matriz = inteiroOuNull(o.matriz_filial);
    if (matriz !== null && matriz !== 1 && matriz !== 2) {
      erros.push({ linha: total, campo: "matriz_filial", valor: o.matriz_filial, regra: "in (1,2)" });
    }

    const municipioId = mapaMunicipios[String(Number.parseInt(o.municipio_tom, 10))] ?? null;
    if (municipioId === null) {
      erros.push({ linha: total, campo: "municipio_tom", valor: o.municipio_tom, regra: "de-para TOM→municipios.id" });
    }

    // Detecta duplicata do índice único ux_estabelecimentos_cnpj_completo
    const cnpjCompleto = `${o.cnpj_basico}${o.cnpj_ordem}${o.cnpj_dv}`;
    if (cnpjCompletoVistos.has(cnpjCompleto)) duplicatasCnpjCompleto++;
    cnpjCompletoVistos.add(cnpjCompleto);

    distintos.cnae_principal.add(o.cnae_principal);
    if (vazioParaNull(o.motivo_situacao)) distintos.motivo_situacao.add(o.motivo_situacao);
    distintos.municipio_tom.add(o.municipio_tom);
    distintos.uf.add(o.uf);
    distintos.matriz_filial.add(o.matriz_filial);
    distintos.situacao_cadastral.add(o.situacao_cadastral);

    // Conta datas presentes na origem que a normalização teve de descartar —
    // silêncio aqui esconderia perda de informação.
    for (const campo of ["data_situacao_cadastral", "data_inicio_atividades", "data_situacao_especial"]) {
      if (vazioParaNull(o[campo]) && dataRfb(o[campo]) === null) datasDescartadas[campo]++;
    }
    if (vazioParaNull(o.email)) comEmail++;

    const registro = {
      cnpj_basico: o.cnpj_basico,
      cnpj_ordem: o.cnpj_ordem,
      cnpj_dv: o.cnpj_dv,
      matriz_filial: matriz,
      nome_fantasia: vazioParaNull(o.nome_fantasia),
      situacao_cadastral: vazioParaNull(o.situacao_cadastral),
      data_situacao_cadastral: dataRfb(o.data_situacao_cadastral),
      motivo_situacao: vazioParaNull(o.motivo_situacao),
      data_inicio_atividades: dataRfb(o.data_inicio_atividades),
      cnae_principal: vazioParaNull(o.cnae_principal),
      tipo_logradouro: vazioParaNull(o.tipo_logradouro),
      logradouro: vazioParaNull(o.logradouro),
      numero: vazioParaNull(o.numero),
      complemento: vazioParaNull(o.complemento),
      bairro: vazioParaNull(o.bairro),
      cep: vazioParaNull(o.cep),
      uf: vazioParaNull(o.uf),
      municipio_id: municipioId,
      ddd_1: vazioParaNull(o.ddd_1),
      telefone_1: vazioParaNull(o.telefone_1),
      ddd_2: vazioParaNull(o.ddd_2),
      telefone_2: vazioParaNull(o.telefone_2),
      email: vazioParaNull(o.email),
      situacao_especial: vazioParaNull(o.situacao_especial),
      data_situacao_especial: dataRfb(o.data_situacao_especial),
      // convencao_id omitido de propósito → NULL no banco (vínculo com CCT é manual)
    };
    ws.write(JSON.stringify(registro) + "\n");
  }

  await new Promise((r) => ws.end(r));
  return { total, distintos, erros, datasDescartadas, comEmail, duplicatasCnpjCompleto, cnpjCompletoDistintos: cnpjCompletoVistos.size };
}

// --- empresas ---------------------------------------------------------------

async function normalizarEmpresas() {
  const ws = fs.createWriteStream(path.join(DIR, "empresas_normalizadas.ndjson"));
  const distintos = { natureza_juridica: new Set(), qualificacao_responsavel: new Set(), porte: new Set() };
  const erros = [];
  let total = 0;
  let capitalNulo = 0;
  const cnpjVistos = new Set();
  let duplicatas = 0;

  for await (const o of lerNdjson(path.join(DIR, "empresas_filtradas.ndjson"))) {
    total++;
    if (!/^\d{8}$/.test(o.cnpj_basico)) erros.push({ linha: total, campo: "cnpj_basico", valor: o.cnpj_basico, regra: "^\\d{8}$" });
    if (!vazioParaNull(o.razao_social)) erros.push({ linha: total, campo: "razao_social", valor: o.razao_social, regra: "not null" });

    if (cnpjVistos.has(o.cnpj_basico)) duplicatas++;
    cnpjVistos.add(o.cnpj_basico);

    if (vazioParaNull(o.natureza_juridica)) distintos.natureza_juridica.add(o.natureza_juridica);
    if (vazioParaNull(o.qualificacao_responsavel)) distintos.qualificacao_responsavel.add(o.qualificacao_responsavel);
    if (vazioParaNull(o.porte)) distintos.porte.add(o.porte);

    const capital = decimalRfb(o.capital_social);
    if (capital === null) capitalNulo++;

    ws.write(JSON.stringify({
      cnpj_basico: o.cnpj_basico,
      razao_social: vazioParaNull(o.razao_social),
      natureza_juridica: vazioParaNull(o.natureza_juridica),
      qualificacao_responsavel: vazioParaNull(o.qualificacao_responsavel),
      capital_social: capital,
      porte: vazioParaNull(o.porte),
    }) + "\n");
  }

  await new Promise((r) => ws.end(r));
  return { total, distintos, erros, capitalNulo, duplicatas, cnpjDistintos: cnpjVistos.size };
}

// --- main -------------------------------------------------------------------

const est = await normalizarEstabelecimentos();
const emp = await normalizarEmpresas();

const relatorio = {
  geradoEm: new Date().toISOString(),
  estabelecimentos: {
    total: est.total,
    cnpjCompletoDistintos: est.cnpjCompletoDistintos,
    duplicatasCnpjCompleto: est.duplicatasCnpjCompleto,
    comEmail: est.comEmail,
    datasDescartadasNaNormalizacao: est.datasDescartadas,
    violacoesDeCheck: est.erros,
    distintos: {
      cnae_principal: [...est.distintos.cnae_principal].sort(),
      motivo_situacao: [...est.distintos.motivo_situacao].sort(),
      municipio_tom: [...est.distintos.municipio_tom].sort(),
      uf: [...est.distintos.uf].sort(),
      matriz_filial: [...est.distintos.matriz_filial].sort(),
      situacao_cadastral: [...est.distintos.situacao_cadastral].sort(),
    },
  },
  empresas: {
    total: emp.total,
    cnpjDistintos: emp.cnpjDistintos,
    duplicatas: emp.duplicatas,
    capitalSocialNulo: emp.capitalNulo,
    violacoesDeCheck: emp.erros,
    distintos: {
      natureza_juridica: [...emp.distintos.natureza_juridica].sort(),
      qualificacao_responsavel: [...emp.distintos.qualificacao_responsavel].sort(),
      porte: [...emp.distintos.porte].sort(),
    },
  },
};

fs.writeFileSync(path.join(DIR, "reconciliacao_06_3.json"), JSON.stringify(relatorio, null, 2));

console.log("=".repeat(78));
console.log("NORMALIZAÇÃO — Subetapa 06.3");
console.log("=".repeat(78));
console.log(`\nEstabelecimentos: ${est.total} normalizados`);
console.log(`  CNPJ completo distintos: ${est.cnpjCompletoDistintos} · duplicatas: ${est.duplicatasCnpjCompleto} ${est.duplicatasCnpjCompleto === 0 ? "✅" : "🔴 (violaria ux_estabelecimentos_cnpj_completo)"}`);
console.log(`  Violações de CHECK: ${est.erros.length} ${est.erros.length === 0 ? "✅" : "🔴"}`);
console.log(`  Com e-mail: ${est.comEmail} (${((est.comEmail / est.total) * 100).toFixed(1)}%)`);
console.log(`  Datas descartadas na normalização: ${JSON.stringify(est.datasDescartadas)}`);
console.log(`\nEmpresas: ${emp.total} normalizadas`);
console.log(`  CNPJ distintos: ${emp.cnpjDistintos} · duplicatas: ${emp.duplicatas} ${emp.duplicatas === 0 ? "✅" : "🔴 (violaria a PK)"}`);
console.log(`  Violações de CHECK: ${emp.erros.length} ${emp.erros.length === 0 ? "✅" : "🔴"}`);
console.log(`  Capital social nulo/não-parseável: ${emp.capitalNulo}`);
console.log(`\n--- Códigos distintos a reconciliar contra o banco ---`);
console.log(`  cnae_principal:           ${relatorio.estabelecimentos.distintos.cnae_principal.length}`);
console.log(`  motivo_situacao:          ${relatorio.estabelecimentos.distintos.motivo_situacao.length} → ${relatorio.estabelecimentos.distintos.motivo_situacao.join(",")}`);
console.log(`  natureza_juridica:        ${relatorio.empresas.distintos.natureza_juridica.length}`);
console.log(`  qualificacao_responsavel: ${relatorio.empresas.distintos.qualificacao_responsavel.length} → ${relatorio.empresas.distintos.qualificacao_responsavel.join(",")}`);
console.log(`  municipio_tom:            ${relatorio.estabelecimentos.distintos.municipio_tom.length}`);
console.log(`\n--- Domínios sem FK (conferência de sanidade) ---`);
console.log(`  uf:                 ${relatorio.estabelecimentos.distintos.uf.join(",")}`);
console.log(`  matriz_filial:      ${relatorio.estabelecimentos.distintos.matriz_filial.join(",")}`);
console.log(`  situacao_cadastral: ${relatorio.estabelecimentos.distintos.situacao_cadastral.join(",")}`);
console.log(`  porte:              ${relatorio.empresas.distintos.porte.join(",")}`);
console.log(`\nRelatório: ${path.join(DIR, "reconciliacao_06_3.json")}`);
