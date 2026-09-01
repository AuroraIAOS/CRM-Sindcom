#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/gerar_campanha_08_13.mjs
// ETAPA 08 · Subetapa 08.13 — listas segmentadas por caixa + envios_campanha
//
// O QUE FAZ
// Cria as 4 campanhas (A/B/C/D, por concentração de estabelecimentos na
// mesma caixa de e-mail), grava UM `envios_campanha` por caixa (token novo,
// por DEFAULT do banco) e exporta os 4 CSVs que vão para o ESP — nome da
// caixa, e-mail e o link com token, e NADA MAIS (nunca CPF, nunca dado de
// trabalhador). É a ÚNICA vez que este script roda: gerar campanha duas
// vezes duplicaria destinatário, e por isso ele ABORTA se as 4 campanhas já
// existirem, em vez de continuar por cima.
//
// A LISTA É MONTADA POR CAIXA, NUNCA POR ESTABELECIMENTO — um contador com
// 129 estabelecimentos recebe UM e-mail, não 129 idênticos (spam garantido
// no aquecimento do subdomínio novo).
//
// GOVERNANÇA: mesmo padrão de scripts/semear_contabilidades_08_9.mjs — anon
// key + login de Admin, passando pelas mesmas policies que o Admin real
// enfrentaria (`pol_campanhas_insert`, `pol_envios_insert`, ambas
// `fn_eh('admin')`). NÃO usa service_role.
//
// SEGMENTAÇÃO (medida e conferida por query antes deste script existir):
//   A (20+ estabs)   · contabilidades reais (exclui a DEMO)
//   B (5-19 estabs)  · idem
//   C (2-4 estabs)   · idem
//   D (1 estab)      · estabelecimentos cuja caixa de e-mail NÃO virou
//                      contabilidade (grupo de tamanho 1) — MESMA lógica de
//                      agrupamento do 08.9 (lower(btrim(email))), com o
//                      MESMO filtro de formato: caixa malformada é
//                      DESCARTADA e REPORTADA, nunca semeada em silêncio —
//                      um token que nunca chega some da conta sem sinal.
//
// Uso: node scripts/gerar_campanha_08_13.mjs [--dry] [--bench]
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import Papa from "papaparse";
import { mkdirSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const BENCH = process.argv.includes("--bench");

config({ path: BENCH ? ".env.bench" : ".env.test", override: true });

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const SENHA = process.env.TEST_USER_PASSWORD;

if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error(`ABORTADO: faltam credenciais em ${BENCH ? ".env.bench" : ".env.test"}`);
  process.exit(1);
}

const REF = URL.replace(/^https?:\/\//, "").split(".")[0];
const REF_PRODUCAO = "vcswvscjqifelslsdjth";
if (BENCH && REF === REF_PRODUCAO) {
  console.error("ABORTADO: --bench pedido, mas VITE_SUPABASE_URL aponta para PRODUÇÃO.");
  process.exit(1);
}

const PAGINA = 1000; // PostgREST trunca em 1000 sem avisar (§2.4)
const LOTE = 500;
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/;
const PASTA_SAIDA = "dados/campanha_08_13";

const SEGMENTOS = [
  { chave: "A", nome: "Coleta 2026 · Contabilidades grandes (20+)", min: 20, max: Infinity },
  { chave: "B", nome: "Coleta 2026 · Contabilidades médias (5-19)", min: 5, max: 19 },
  { chave: "C", nome: "Coleta 2026 · Contabilidades pequenas (2-4)", min: 2, max: 4 },
];
const NOME_CAMPANHA_D = "Coleta 2026 · Empresas isoladas";

/** Neutraliza injeção de fórmula (mesma defesa de src/lib/csv.ts §2.19) —
 *  reimplementada aqui porque este script roda em Node puro (.mjs), fora do
 *  bundle TypeScript do app. */
function neutralizarFormula(valor) {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}
function gerarCsv(linhas, colunas) {
  const dados = linhas.map((linha) => {
    const registro = {};
    for (const c of colunas) {
      const v = c.valor(linha);
      registro[c.titulo] = v === null || v === undefined ? "" : neutralizarFormula(String(v));
    }
    return registro;
  });
  return Papa.unparse(dados, { delimiter: ";", columns: colunas.map((c) => c.titulo), quotes: true, newline: "\r\n" });
}

async function lerTudo(construir) {
  const todas = [];
  for (let pagina = 0; ; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await construir(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}

async function inserirEmLotes(client, tabela, linhas) {
  const inseridas = [];
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const { data, error } = await client.from(tabela).insert(lote).select("id, email, token, contabilidade_id, estabelecimento_id");
    if (error) {
      throw new Error(`Lote ${Math.floor(i / LOTE) + 1} de ${tabela} (linhas ${i}–${i + lote.length}): ${error.message}`);
    }
    inseridas.push(...(data ?? []));
    process.stdout.write(`\r  ${tabela}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}   `);
  }
  console.log("");
  return inseridas;
}

// ---------------------------------------------------------------------------

console.log(`\n=== Subetapa 08.13 — listas segmentadas + envios_campanha ===`);
console.log(`Alvo: ${BENCH ? "BENCH" : "PRODUÇÃO"} (${REF})${DRY ? "  ·  MODO --dry" : ""}\n`);

const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: sessao, error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao.user) {
  console.error(`ABORTADO: login do Admin falhou: ${erroLogin?.message}`);
  process.exit(1);
}
console.log(`Autenticado como ${EMAIL} (uid ${sessao.user.id})\n`);

// --- 0. Guarda de idempotência ---------------------------------------------
const nomesAlvo = [...SEGMENTOS.map((s) => s.nome), NOME_CAMPANHA_D];
const { data: existentes, error: erroExistentes } = await client
  .from("campanhas")
  .select("id, nome")
  .in("nome", nomesAlvo);
if (erroExistentes) throw new Error(erroExistentes.message);
if ((existentes ?? []).length > 0 && !DRY) {
  console.error("ABORTADO: já existe(m) campanha(s) com este nome — rodar de novo duplicaria destinatário:");
  for (const e of existentes) console.error(`  · ${e.nome} (${e.id})`);
  console.error("\nSe a intenção é mesmo gerar de novo, decida manualmente o que fazer com as existentes primeiro.");
  process.exit(1);
}

// --- 1. Segmentação A/B/C (contabilidades reais, exclui DEMO) --------------
const contabilidades = await lerTudo((de, ate) =>
  client.from("contabilidades").select("id, nome, email").not("nome", "ilike", "DEMO%").order("id").range(de, ate),
);
const vinculos = await lerTudo((de, ate) =>
  client.from("contabilidade_estabelecimentos").select("contabilidade_id").order("id").range(de, ate),
);
const totalPorContabilidade = new Map();
for (const v of vinculos) {
  totalPorContabilidade.set(v.contabilidade_id, (totalPorContabilidade.get(v.contabilidade_id) ?? 0) + 1);
}

const porSegmento = new Map(SEGMENTOS.map((s) => [s.chave, []]));
for (const c of contabilidades) {
  const total = totalPorContabilidade.get(c.id) ?? 0;
  const segmento = SEGMENTOS.find((s) => total >= s.min && total <= s.max);
  if (!segmento) {
    console.warn(`AVISO: contabilidade ${c.email} tem ${total} estabelecimento(s) — fora de A/B/C, ignorada.`);
    continue;
  }
  porSegmento.get(segmento.chave).push({ ...c, total });
}

// --- 2. Segmento D (isoladas) -----------------------------------------------
const estabelecimentos = await lerTudo((de, ate) =>
  client.from("estabelecimentos").select("id, email, nome_fantasia, empresas(razao_social)").not("email", "is", null).order("id").range(de, ate),
);
const porCaixa = new Map();
for (const e of estabelecimentos) {
  const caixa = (e.email ?? "").trim().toLowerCase();
  if (!caixa) continue;
  if (!porCaixa.has(caixa)) porCaixa.set(caixa, []);
  porCaixa.get(caixa).push(e);
}
const isoladas = [];
const isoladasDescartadas = [];
for (const [caixa, estabs] of porCaixa) {
  if (estabs.length !== 1) continue;
  if (!FORMATO_EMAIL.test(caixa)) {
    isoladasDescartadas.push({ caixa, id: estabs[0].id });
  } else {
    isoladas.push({ caixa, estab: estabs[0] });
  }
}

// --- 3. Relatório antes de gravar qualquer coisa ---------------------------
console.log("Segmentação calculada:");
for (const s of SEGMENTOS) {
  const lista = porSegmento.get(s.chave);
  console.log(`  ${s.chave} (${s.nome}): ${lista.length} caixas, ${lista.reduce((n, c) => n + c.total, 0)} estabelecimentos`);
}
console.log(`  D (${NOME_CAMPANHA_D}): ${isoladas.length} caixas, ${isoladas.length} estabelecimentos`);
if (isoladasDescartadas.length > 0) {
  console.log(`\nATENÇÃO — ${isoladasDescartadas.length} caixa(s) isolada(s) com e-mail malformado (NÃO recebem token):`);
  for (const d of isoladasDescartadas) console.log(`  · "${d.caixa}" (estabelecimento ${d.id})`);
}
const total = SEGMENTOS.reduce((n, s) => n + porSegmento.get(s.chave).length, 0) + isoladas.length;
console.log(`\nTotal de caixas com token novo: ${total}\n`);

if (DRY) {
  console.log("--dry: nada foi gravado.");
  process.exit(0);
}

// --- 4. Campanhas ------------------------------------------------------------
const { data: modelo } = await client.from("modelos_coleta").select("id").eq("ativo", true).eq("destino", "trabalhadores").maybeSingle();
const campanhaIdPorSegmento = new Map();
for (const nome of nomesAlvo) {
  const { data, error } = await client
    .from("campanhas")
    .insert({ nome, modelo_coleta_id: modelo?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`campanha "${nome}": ${error.message}`);
  campanhaIdPorSegmento.set(nome, data.id);
  console.log(`Campanha criada: ${nome} (${data.id})`);
}

// --- 5. envios_campanha ------------------------------------------------------
const linhasABC = SEGMENTOS.flatMap((s) =>
  porSegmento.get(s.chave).map((c) => ({
    campanha_id: campanhaIdPorSegmento.get(s.nome),
    contabilidade_id: c.id,
    email: c.email,
  })),
);
const linhasD = isoladas.map((i) => ({
  campanha_id: campanhaIdPorSegmento.get(NOME_CAMPANHA_D),
  estabelecimento_id: i.estab.id,
  email: i.caixa,
}));

console.log("\nGravando envios_campanha...");
const inseridasABC = await inserirEmLotes(client, "envios_campanha", linhasABC);
const inseridasD = await inserirEmLotes(client, "envios_campanha", linhasD);

// --- 6. Conferência (nunca por leitura de código — sempre por query) --------
console.log("\nConferência:");
for (const nome of nomesAlvo) {
  const { count } = await client
    .from("envios_campanha")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaIdPorSegmento.get(nome));
  console.log(`  · ${nome}: ${count} envios_campanha`);
}
const todosEmails = [...inseridasABC, ...inseridasD].map((r) => r.email.toLowerCase());
const emailsUnicos = new Set(todosEmails);
console.log(`\nE-mails: ${todosEmails.length} linhas · ${emailsUnicos.size} únicos → ${todosEmails.length === emailsUnicos.size ? "ZERO duplicata" : "⚠️ DUPLICATA ENCONTRADA"}`);

// --- 7. CSVs para o ESP — nome da caixa, e-mail, link. NADA MAIS. -----------
mkdirSync(PASTA_SAIDA, { recursive: true });
const BASE_LINK = "https://crm.sindcompassos.org/enviar-dados";
const COLUNAS_CSV = [
  { titulo: "nome", valor: (l) => l.nome },
  { titulo: "email", valor: (l) => l.email },
  { titulo: "link", valor: (l) => `${BASE_LINK}/${l.token}` },
];

function nomeArquivo(chave) {
  return `${PASTA_SAIDA}/segmento_${chave.toLowerCase()}.csv`;
}

for (const s of SEGMENTOS) {
  const contabsDoSegmento = porSegmento.get(s.chave);
  const idParaNome = new Map(contabsDoSegmento.map((c) => [c.id, c.nome]));
  const linhas = inseridasABC
    .filter((r) => r.contabilidade_id && idParaNome.has(r.contabilidade_id))
    .map((r) => ({ nome: idParaNome.get(r.contabilidade_id), email: r.email, token: r.token }));
  const csv = gerarCsv(linhas, COLUNAS_CSV);
  writeFileSync(nomeArquivo(s.chave), "﻿" + csv, "utf-8");
  console.log(`  CSV ${s.chave}: ${nomeArquivo(s.chave)} (${linhas.length} linhas)`);
}
{
  const nomeParaEstab = new Map(
    isoladas.map((i) => [
      i.estab.id,
      i.estab.nome_fantasia || i.estab.empresas?.razao_social || i.caixa,
    ]),
  );
  const linhas = inseridasD.map((r) => ({ nome: nomeParaEstab.get(r.estabelecimento_id) ?? r.email, email: r.email, token: r.token }));
  const csv = gerarCsv(linhas, COLUNAS_CSV);
  writeFileSync(nomeArquivo("d"), "﻿" + csv, "utf-8");
  console.log(`  CSV D: ${nomeArquivo("d")} (${linhas.length} linhas)`);
}

console.log("\nSubetapa 08.13 concluída — nenhum e-mail foi disparado (isso é a 08.15, ordenada por Maxwell).");
