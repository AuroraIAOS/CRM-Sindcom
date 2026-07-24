#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/delta.mjs
// Subetapa 06.6: motor de atualização mensal. Compara o estado novo da RFB
// (NDJSON normalizado) com o que está no Supabase e aplica APENAS o delta.
//
// ┌─ REGRA QUE DEFINE ESTE SCRIPT ────────────────────────────────────────┐
// │ NUNCA APAGA NADA. Empresa/estabelecimento que sumiu do arquivo da RFB │
// │ ou que fechou (situação ≠ 02) vira RELATÓRIO para a Denise decidir —  │
// │ jamais um DELETE automático. Pode haver trabalhador com vínculo e     │
// │ histórico financeiro ali; deleção é ato humano.                       │
// └───────────────────────────────────────────────────────────────────────┘
//
// PROTEÇÕES HERDADAS DO CLAUDE.md (nunca tocadas num UPDATE):
//   · convencao_id  — vínculo CCT↔estabelecimento é trabalho MANUAL da Denise.
//     Um "update mensal" que sobrescrevesse isso destruiria silenciosamente,
//     todo mês, o trabalho dela. A coluna nem entra no payload.
//   · id, created_at — identidade e origem do registro.
//
// Uso:
//   node scripts/rfb/delta.mjs            → só relatório (não grava nada)
//   node scripts/rfb/delta.mjs --aplicar  → grava o delta (insere novas, atualiza alteradas)
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.test" });

const DIR = process.env.RFB_DIR ?? "D:/BD/filtrados";
const APLICAR = process.argv.includes("--aplicar");
const LOTE = 500;
const PAGINA = 1000; // PostgREST trunca em 1000 sem avisar (orientacoes.md §2.4)

// Colunas comparadas — exatamente as que vêm da RFB. Tudo que não está aqui
// (convencao_id, id, created_at, updated_at) é INTOCÁVEL por construção.
const CAMPOS_ESTAB = [
  "cnpj_basico", "cnpj_ordem", "cnpj_dv", "matriz_filial", "nome_fantasia",
  "situacao_cadastral", "data_situacao_cadastral", "motivo_situacao",
  "data_inicio_atividades", "cnae_principal", "tipo_logradouro", "logradouro",
  "numero", "complemento", "bairro", "cep", "uf", "municipio_id",
  "ddd_1", "telefone_1", "ddd_2", "telefone_2", "email",
  "situacao_especial", "data_situacao_especial",
];
const CAMPOS_EMP = [
  "cnpj_basico", "razao_social", "natureza_juridica",
  "qualificacao_responsavel", "capital_social", "porte",
];

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const SENHA = process.env.TEST_USER_PASSWORD;
if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error("ABORTADO: faltam credenciais em .env.test");
  process.exit(1);
}

// --- utilidades -------------------------------------------------------------

async function lerNdjson(arquivo) {
  const linhas = [];
  const caminho = path.join(DIR, arquivo);
  if (!fs.existsSync(caminho)) return linhas;
  const rl = readline.createInterface({ input: fs.createReadStream(caminho, "utf8"), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) linhas.push(JSON.parse(l));
  return linhas;
}

// Normaliza para comparação: o banco devolve numeric como string ("25000.00")
// e o NDJSON tem número (25000) — sem isto, TODA linha pareceria "alterada".
function comparavel(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return String(v);
  const s = String(v).trim();
  if (/^-?\d+\.\d+$/.test(s)) return String(Number(s)); // "25000.00" → "25000"
  return s;
}

function diferencas(novo, atual, campos) {
  const difs = {};
  for (const c of campos) {
    const a = comparavel(novo[c]);
    const b = comparavel(atual[c]);
    if (a !== b) difs[c] = { de: b, para: a };
  }
  return difs;
}

async function buscarTudo(client, tabela, colunas) {
  const linhas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await client
      .from(tabela).select(colunas)
      .order("cnpj_basico", { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (error) throw new Error(`Leitura de ${tabela} falhou: ${error.message}`);
    linhas.push(...data);
    if (data.length < PAGINA) break;
  }
  return linhas;
}

// --- main -------------------------------------------------------------------

const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: sessao, error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao.user) {
  console.error(`ABORTADO: login do Admin falhou: ${erroLogin?.message}`);
  process.exit(1);
}
console.log(`Autenticado como ${EMAIL}\n`);

const novosEstab = await lerNdjson("estabelecimentos_normalizados.ndjson");
const novasEmp = await lerNdjson("empresas_normalizadas.ndjson");
const rejeitadosConhecidos = await lerNdjson("rejeitados_conhecidos.ndjson"); // opcional

console.log(`RFB (novo estado): ${novasEmp.length} empresas · ${novosEstab.length} estabelecimentos`);

const atuaisEstab = await buscarTudo(client, "estabelecimentos", CAMPOS_ESTAB.join(","));
const atuaisEmp = await buscarTudo(client, "empresas", CAMPOS_EMP.join(","));
console.log(`Banco (estado atual): ${atuaisEmp.length} empresas · ${atuaisEstab.length} estabelecimentos\n`);

const chaveEstab = (r) => `${r.cnpj_basico}${r.cnpj_ordem}${r.cnpj_dv}`;
const mapAtualEstab = new Map(atuaisEstab.map((r) => [chaveEstab(r), r]));
const mapAtualEmp = new Map(atuaisEmp.map((r) => [r.cnpj_basico, r]));
const mapNovoEstab = new Map(novosEstab.map((r) => [chaveEstab(r), r]));
const mapNovoEmp = new Map(novasEmp.map((r) => [r.cnpj_basico, r]));
const mapRejeitado = new Map(rejeitadosConhecidos.map((r) => [chaveEstab(r), r]));

// --- classificação ----------------------------------------------------------

const estabNovos = [], estabAlterados = [], estabSumidos = [];
for (const [k, novo] of mapNovoEstab) {
  const atual = mapAtualEstab.get(k);
  if (!atual) { estabNovos.push(novo); continue; }
  const difs = diferencas(novo, atual, CAMPOS_ESTAB);
  if (Object.keys(difs).length) estabAlterados.push({ chave: k, registro: novo, difs });
}
for (const [k, atual] of mapAtualEstab) {
  if (mapNovoEstab.has(k)) continue;
  const rej = mapRejeitado.get(k);
  estabSumidos.push({
    chave: k,
    cnpj: `${atual.cnpj_basico}/${atual.cnpj_ordem}-${atual.cnpj_dv}`,
    nome_fantasia: atual.nome_fantasia,
    // Distingue os dois motivos: sair do filtro (fechou/mudou) é MUITO mais
    // comum e mais acionável que sumir do arquivo da Receita.
    motivo: rej ? rej.motivo_rejeicao : "não encontrado no arquivo da RFB",
    detalhe: rej ? rej.detalhe : null,
  });
}

const empNovas = [], empAlteradas = [], empSumidas = [];
for (const [k, novo] of mapNovoEmp) {
  const atual = mapAtualEmp.get(k);
  if (!atual) { empNovas.push(novo); continue; }
  const difs = diferencas(novo, atual, CAMPOS_EMP);
  if (Object.keys(difs).length) empAlteradas.push({ chave: k, registro: novo, difs });
}
for (const [k, atual] of mapAtualEmp) {
  if (!mapNovoEmp.has(k)) empSumidas.push({ cnpj_basico: k, razao_social: atual.razao_social });
}

// --- relatório --------------------------------------------------------------

const relatorio = {
  geradoEm: new Date().toISOString(),
  modo: APLICAR ? "aplicar" : "somente relatório",
  empresas: {
    novas: empNovas.length,
    alteradas: empAlteradas.length,
    sumidas: empSumidas.length,
    detalheAlteradas: empAlteradas.slice(0, 50).map((a) => ({ cnpj: a.chave, difs: a.difs })),
    detalheSumidas: empSumidas.slice(0, 200),
  },
  estabelecimentos: {
    novos: estabNovos.length,
    alterados: estabAlterados.length,
    sumidos: estabSumidos.length,
    detalheAlterados: estabAlterados.slice(0, 50).map((a) => ({ cnpj: a.chave, difs: a.difs })),
    detalheSumidos: estabSumidos.slice(0, 200),
  },
};
fs.writeFileSync(path.join(DIR, "delta_relatorio.json"), JSON.stringify(relatorio, null, 2));

const z = (n) => (n === 0 ? "0 ✅" : String(n));
console.log("=".repeat(78));
console.log(`DELTA — ${APLICAR ? "APLICANDO" : "somente relatório (nada será gravado)"}`);
console.log("=".repeat(78));
console.log(`Empresas         · novas: ${z(empNovas.length)} · alteradas: ${z(empAlteradas.length)} · sumidas: ${z(empSumidas.length)}`);
console.log(`Estabelecimentos · novos: ${z(estabNovos.length)} · alterados: ${z(estabAlterados.length)} · sumidos: ${z(estabSumidos.length)}`);

if (estabSumidos.length) {
  console.log(`\n⚠️  ${estabSumidos.length} estabelecimento(s) saíram da base da RFB — NÃO serão apagados.`);
  console.log("   Relatório para a Denise decidir (deleção é ato humano):");
  const porMotivo = {};
  for (const s of estabSumidos) porMotivo[s.motivo] = (porMotivo[s.motivo] ?? 0) + 1;
  for (const [m, n] of Object.entries(porMotivo)) console.log(`     · ${m}: ${n}`);
  for (const s of estabSumidos.slice(0, 10)) {
    console.log(`     - ${s.cnpj} ${s.nome_fantasia ?? "(sem fantasia)"} → ${s.motivo}${s.detalhe ? ` (${s.detalhe})` : ""}`);
  }
  if (estabSumidos.length > 10) console.log(`     ... e mais ${estabSumidos.length - 10} (lista completa no JSON)`);
}

// --- aplicação --------------------------------------------------------------

if (!APLICAR) {
  console.log(`\nRelatório: ${path.join(DIR, "delta_relatorio.json")}`);
  console.log("Nada foi gravado. Rode com --aplicar para efetivar o delta.");
  process.exit(0);
}

async function inserir(tabela, registros, onConflict) {
  for (let i = 0; i < registros.length; i += LOTE) {
    const { error } = await client.from(tabela)
      .upsert(registros.slice(i, i + LOTE), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`INSERT em ${tabela} falhou: ${error.message}`);
  }
}

async function atualizar(tabela, alterados, chaveWhere) {
  for (const a of alterados) {
    let q = client.from(tabela).update(a.registro);
    for (const [col, val] of Object.entries(chaveWhere(a.registro))) q = q.eq(col, val);
    const { error } = await q;
    if (error) throw new Error(`UPDATE em ${tabela} falhou (${a.chave}): ${error.message}`);
  }
}

// Ordem obrigatória: empresas antes (FK de estabelecimentos.cnpj_basico).
if (empNovas.length) { await inserir("empresas", empNovas, "cnpj_basico"); console.log(`\n✓ ${empNovas.length} empresa(s) inserida(s)`); }
if (estabNovos.length) { await inserir("estabelecimentos", estabNovos, "cnpj_basico,cnpj_ordem,cnpj_dv"); console.log(`✓ ${estabNovos.length} estabelecimento(s) inserido(s)`); }
if (empAlteradas.length) { await atualizar("empresas", empAlteradas, (r) => ({ cnpj_basico: r.cnpj_basico })); console.log(`✓ ${empAlteradas.length} empresa(s) atualizada(s)`); }
if (estabAlterados.length) {
  await atualizar("estabelecimentos", estabAlterados, (r) => ({ cnpj_basico: r.cnpj_basico, cnpj_ordem: r.cnpj_ordem, cnpj_dv: r.cnpj_dv }));
  console.log(`✓ ${estabAlterados.length} estabelecimento(s) atualizado(s)`);
}
if (!empNovas.length && !estabNovos.length && !empAlteradas.length && !estabAlterados.length) {
  console.log("\nNada a gravar — o banco já reflete o arquivo da RFB.");
}
console.log(`\nRelatório: ${path.join(DIR, "delta_relatorio.json")}`);
