#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/seed_onda00.mjs
// ETAPA 09 · Subetapa 9.1 — Onda 00: mundo fictício para a prova ponta a ponta
//
// POR QUE ESTE MUNDO É SEPARADO DO "DEMO — Contabilidade Modelo"
// `tests/rls/remessas.spec.ts` lê a remessa MAIS RECENTE da campanha
// "DEMO — Campanha de coleta 2026" (orientacoes.md §7.1d — já quebrou uma vez
// quando um teste manual real injetou remessa nova ali). A Onda 00 vai gerar
// remessas de verdade, em dias diferentes, através do link enviado por e-mail
// de verdade — se caíssem na mesma campanha, quebrariam esse teste de novo.
// Por isso este script cria campanhas, contabilidades e CNPJs PRÓPRIOS,
// nunca tocando no mundo 99999901 nem na campanha "... 2026".
//
// O QUE ESTE SCRIPT FAZ
//  1. 9 empresas + 9 estabelecimentos DEMO (faixa 999999{02..10}), cada um com
//     UM estabelecimento (ordem 0001), CNPJ com DV válido de verdade.
//  2. 2 contabilidades (Alfa, Ômega), com os e-mails reais de Maxwell.
//  3. contabilidade_estabelecimentos ligando Alfa→5 estabs, Ômega→2 estabs.
//  4. 2 campanhas novas: "DEMO — Onda 00 · Trilha A" e "... · Trilha B".
//  5. 4 envios_campanha (os 4 destinatários reais da Onda 00), cada um com
//     token novo (DEFAULT gen_random_uuid()).
//
// IDEMPOTENTE por nome/e-mail/CNPJ: pode rodar de novo sem duplicar (usa
// upsert com onConflict nas colunas que têm unique). Não apaga nada.
//
// Uso: node scripts/seed_onda00.mjs
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

config({ path: ".env.test", override: true });

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const SENHA = process.env.TEST_USER_PASSWORD;

if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error("ABORTADO: faltam credenciais em .env.test");
  process.exit(1);
}

// §2.20 — provar o alvo, nunca supor.
const REF_PRODUCAO = "vcswvscjqifelslsdjth";
const REF = URL.replace(/^https?:\/\//, "").split(".")[0];
if (REF !== REF_PRODUCAO) {
  console.error(`ABORTADO: esperava produção (${REF_PRODUCAO}), URL aponta para ${REF}.`);
  process.exit(1);
}
console.log(`alvo = PRODUÇÃO (${REF})`);

const client = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin) {
  console.error("ABORTADO: login de Admin falhou —", erroLogin.message);
  process.exit(1);
}
console.log("login: admin OK");

// ----------------------------------------------------------------------------
// 1. EMPRESAS + ESTABELECIMENTOS — 9 CNPJs fictícios, DV válido (cnpjValido)
// ----------------------------------------------------------------------------
const EMPRESAS = [
  { basico: "99999902", ordem: "0001", dv: "40", nome: "DEMO — Alfa Comércio 01 Ltda", chave: "alfa01" },
  { basico: "99999903", ordem: "0001", dv: "95", nome: "DEMO — Alfa Comércio 02 Ltda", chave: "alfa02" },
  { basico: "99999904", ordem: "0001", dv: "30", nome: "DEMO — Alfa Comércio 03 Ltda", chave: "alfa03" },
  { basico: "99999905", ordem: "0001", dv: "84", nome: "DEMO — Alfa Comércio 04 Ltda", chave: "alfa04" },
  { basico: "99999906", ordem: "0001", dv: "29", nome: "DEMO — Alfa Comércio 05 Ltda", chave: "alfa05" },
  { basico: "99999907", ordem: "0001", dv: "73", nome: "DEMO — Ômega Comércio 01 Ltda", chave: "omega01" },
  { basico: "99999908", ordem: "0001", dv: "18", nome: "DEMO — Ômega Comércio 02 Ltda", chave: "omega02" },
  { basico: "99999909", ordem: "0001", dv: "62", nome: "DEMO — Empresa Delta Ltda", chave: "delta" },
  { basico: "99999910", ordem: "0001", dv: "97", nome: "DEMO — Empresa Gama Ltda", chave: "gama" },
];

console.log("\n1. empresas + estabelecimentos");
const estabPorChave = new Map();
for (const e of EMPRESAS) {
  const { error: erroEmpresa } = await client
    .from("empresas")
    .upsert({ cnpj_basico: e.basico, razao_social: e.nome, porte: "ME" }, { onConflict: "cnpj_basico" });
  if (erroEmpresa) throw new Error(`empresas ${e.basico}: ${erroEmpresa.message}`);

  const { data: estab, error: erroEstab } = await client
    .from("estabelecimentos")
    .upsert(
      {
        cnpj_basico: e.basico,
        cnpj_ordem: e.ordem,
        cnpj_dv: e.dv,
        matriz_filial: 1,
        nome_fantasia: e.nome,
        situacao_cadastral: "02",
        uf: "MG",
      },
      { onConflict: "cnpj_basico,cnpj_ordem,cnpj_dv" },
    )
    .select("id, cnpj_completo")
    .single();
  if (erroEstab) throw new Error(`estabelecimentos ${e.basico}: ${erroEstab.message}`);
  estabPorChave.set(e.chave, estab);
  console.log(`   ${estab.cnpj_completo} — ${e.nome}`);
}

// ----------------------------------------------------------------------------
// 2. CONTABILIDADES (Trilha A)
// ----------------------------------------------------------------------------
console.log("\n2. contabilidades");
const CONTABILIDADES = [
  { nome: "DEMO — Contabilidade Alfa", email: "maxwell.mr@hotmail.com", estabs: ["alfa01", "alfa02", "alfa03", "alfa04", "alfa05"] },
  { nome: "DEMO — Contabilidade Ômega", email: "maxwellbiologo@gmail.com", estabs: ["omega01", "omega02"] },
];
const contabPorNome = new Map();
for (const c of CONTABILIDADES) {
  const { data: contab, error } = await client
    .from("contabilidades")
    .upsert({ nome: c.nome, email: c.email, ativa: true }, { onConflict: "email" })
    .select("id, nome, email")
    .single();
  if (error) throw new Error(`contabilidades ${c.nome}: ${error.message}`);
  contabPorNome.set(c.nome, contab);
  console.log(`   ${contab.nome} — ${contab.email}`);

  for (const chave of c.estabs) {
    const estab = estabPorChave.get(chave);
    const { error: erroVinculo } = await client
      .from("contabilidade_estabelecimentos")
      .upsert(
        { contabilidade_id: contab.id, estabelecimento_id: estab.id, origem: "informado", confirmado: true },
        { onConflict: "contabilidade_id,estabelecimento_id" },
      );
    if (erroVinculo) throw new Error(`contabilidade_estabelecimentos ${c.nome}/${chave}: ${erroVinculo.message}`);
  }
}

// ----------------------------------------------------------------------------
// 3. CAMPANHAS — duas, próprias da Onda 00 (nunca a "... 2026" do §7.1d)
// ----------------------------------------------------------------------------
console.log("\n3. campanhas");
async function upsertCampanha(nome, eixo, assunto) {
  const { data: existente } = await client.from("campanhas").select("id").eq("nome", nome).maybeSingle();
  if (existente) {
    console.log(`   ${nome} — já existia (${existente.id})`);
    return existente;
  }
  const { data, error } = await client
    .from("campanhas")
    .insert({ nome, eixo, onda: 0, assunto })
    .select("id, nome")
    .single();
  if (error) throw new Error(`campanhas ${nome}: ${error.message}`);
  console.log(`   ${data.nome} — criada (${data.id})`);
  return data;
}

const campanhaA = await upsertCampanha(
  "DEMO — Onda 00 · Trilha A (contabilidades)",
  "requisicao",
  "Solicitação de dados — Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)",
);
const campanhaB = await upsertCampanha(
  "DEMO — Onda 00 · Trilha B (empresas isoladas)",
  "estrutural",
  "Sindicato dos Empregados no Comércio de Passos: novos canais de atendimento",
);

// ----------------------------------------------------------------------------
// 4. ENVIOS_CAMPANHA — os 4 destinatários reais da Onda 00
// ----------------------------------------------------------------------------
console.log("\n4. envios_campanha");
async function upsertEnvio(campanhaId, email, { contabilidadeId, estabelecimentoId }) {
  const filtro = client
    .from("envios_campanha")
    .select("id, token, email")
    .eq("campanha_id", campanhaId)
    .eq("email", email);
  const { data: existente } = await filtro.maybeSingle();
  if (existente) {
    console.log(`   ${email} — já existia, token=${existente.token}`);
    return existente;
  }
  const { data, error } = await client
    .from("envios_campanha")
    .insert({
      campanha_id: campanhaId,
      contabilidade_id: contabilidadeId ?? null,
      estabelecimento_id: estabelecimentoId ?? null,
      email,
    })
    .select("id, token, email")
    .single();
  if (error) throw new Error(`envios_campanha ${email}: ${error.message}`);
  console.log(`   ${email} — criado, token=${data.token}`);
  return data;
}

const envioAlfa = await upsertEnvio(campanhaA.id, "maxwell.mr@hotmail.com", {
  contabilidadeId: contabPorNome.get("DEMO — Contabilidade Alfa").id,
});
const envioOmega = await upsertEnvio(campanhaA.id, "maxwellbiologo@gmail.com", {
  contabilidadeId: contabPorNome.get("DEMO — Contabilidade Ômega").id,
});
const envioDelta = await upsertEnvio(campanhaB.id, "maxwell.mr.mobile@gmail.com", {
  estabelecimentoId: estabPorChave.get("delta").id,
});
const envioGama = await upsertEnvio(campanhaB.id, "passossindcom@gmail.com", {
  estabelecimentoId: estabPorChave.get("gama").id,
});

// ----------------------------------------------------------------------------
// 5. CSVs para importar na Brevo — mesmo layout de reexportar_csvs_09_00.mjs
// ----------------------------------------------------------------------------
console.log("\n5. CSVs para a Brevo");
const PASTA = "dados/onda_00";
mkdirSync(PASTA, { recursive: true });
const BASE_LINK = "https://crm.sindcompassos.org/enviar-dados";
const BASE_SAIDA = "https://crm.sindcompassos.org/descadastrar";

function linhaCsv(nome, email, token) {
  return `"${nome}";"${email}";"${BASE_LINK}/${token}";"${BASE_SAIDA}/${token}"`;
}
const cabecalho = `"nome";"email";"link";"saida"`;

writeFileSync(
  `${PASTA}/trilha_a.csv`,
  "﻿" +
    [
      cabecalho,
      linhaCsv("DEMO — Contabilidade Alfa", envioAlfa.email, envioAlfa.token),
      linhaCsv("DEMO — Contabilidade Ômega", envioOmega.email, envioOmega.token),
    ].join("\r\n") +
    "\r\n",
  "utf-8",
);
writeFileSync(
  `${PASTA}/trilha_b.csv`,
  "﻿" +
    [
      cabecalho,
      linhaCsv("DEMO — Empresa Delta Ltda", envioDelta.email, envioDelta.token),
      linhaCsv("DEMO — Empresa Gama Ltda", envioGama.email, envioGama.token),
    ].join("\r\n") +
    "\r\n",
  "utf-8",
);
console.log(`   ${PASTA}/trilha_a.csv`);
console.log(`   ${PASTA}/trilha_b.csv`);

// ----------------------------------------------------------------------------
// RESUMO — os 4 links reais, prontos para conferência manual antes do envio
// ----------------------------------------------------------------------------
console.log("\n== RESUMO ONDA 00 ==");
console.log(`Trilha A · Alfa   (${envioAlfa.email}): ${BASE_LINK}/${envioAlfa.token}  |  saída: ${BASE_SAIDA}/${envioAlfa.token}`);
console.log(`Trilha A · Ômega  (${envioOmega.email}): ${BASE_LINK}/${envioOmega.token}  |  saída: ${BASE_SAIDA}/${envioOmega.token}`);
console.log(`Trilha B · Delta  (${envioDelta.email}): ${BASE_LINK}/${envioDelta.token}  |  saída: ${BASE_SAIDA}/${envioDelta.token}`);
console.log(`Trilha B · Gama   (${envioGama.email}): ${BASE_LINK}/${envioGama.token}  |  saída: ${BASE_SAIDA}/${envioGama.token}`);
console.log("\nNenhum e-mail foi enviado por este script. Nenhuma campanha foi criada na Brevo.");
