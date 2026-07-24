#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/carregar_06_4.mjs
// Subetapa 06.4 (docs/plano_importacao_rfb.md): carga em produção.
//
// GOVERNANÇA: roda logado como admin@crm.local com a ANON KEY, passando pelas
// mesmas políticas de RLS que a Denise enfrentaria (pol_empresas_insert /
// pol_estab_insert exigem fn_eh('admin')). NÃO usa service_role — respeitando
// a regra do CLAUDE.md de que a service_role só vive em Edge Functions/n8n.
//
// ORDEM OBRIGATÓRIA: empresas → estabelecimentos (FK estabelecimentos.cnpj_basico).
//
// IDEMPOTÊNCIA: usa ON CONFLICT DO NOTHING (ignoreDuplicates). Rodar duas vezes
// não duplica NEM altera — o que já está no banco fica intocado. Isso também
// protege, por construção, o convencao_id preenchido manualmente pela Denise:
// a coluna nem é enviada, e linhas existentes não são tocadas.
//
// Uso: node scripts/rfb/carregar_06_4.mjs [--dry]
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.test" }); // credenciais do Admin (gitignored)

const DIR = "D:/BD/filtrados";
const LOTE = 500;
const DRY = process.argv.includes("--dry");

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const SENHA = process.env.TEST_USER_PASSWORD;

if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error("ABORTADO: faltam credenciais em .env.test");
  process.exit(1);
}

async function lerNdjson(arquivo) {
  const linhas = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(DIR, arquivo), "utf8"),
    crlfDelay: Infinity,
  });
  for await (const l of rl) if (l.trim()) linhas.push(JSON.parse(l));
  return linhas;
}

async function carregar(client, tabela, registros, onConflict) {
  let inseridosOuIgnorados = 0;
  const inicio = Date.now();
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    const { error } = await client
      .from(tabela)
      .upsert(lote, { onConflict, ignoreDuplicates: true });
    if (error) {
      throw new Error(
        `Lote ${i / LOTE + 1} de ${tabela} falhou (linhas ${i}-${i + lote.length}): ` +
          `${error.message} | code=${error.code} | details=${error.details}`,
      );
    }
    inseridosOuIgnorados += lote.length;
    const pct = ((inseridosOuIgnorados / registros.length) * 100).toFixed(1);
    process.stdout.write(`\r  ${tabela}: ${inseridosOuIgnorados}/${registros.length} (${pct}%)`);
  }
  const s = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`  · ${s}s`);
  return inseridosOuIgnorados;
}

const empresas = await lerNdjson("empresas_normalizadas.ndjson");
const estabelecimentos = await lerNdjson("estabelecimentos_normalizados.ndjson");
console.log(`Lidos: ${empresas.length} empresas · ${estabelecimentos.length} estabelecimentos`);

if (DRY) {
  console.log("--dry: nada foi enviado.");
  process.exit(0);
}

const client = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sessao, error: erroLogin } = await client.auth.signInWithPassword({
  email: EMAIL,
  password: SENHA,
});
if (erroLogin || !sessao.user) {
  console.error(`ABORTADO: login do Admin falhou: ${erroLogin?.message}`);
  process.exit(1);
}
console.log(`Autenticado como ${EMAIL} (uid ${sessao.user.id})\n`);

console.log("Carregando (ordem obrigatória: empresas → estabelecimentos)...");
await carregar(client, "empresas", empresas, "cnpj_basico");
await carregar(client, "estabelecimentos", estabelecimentos, "cnpj_basico,cnpj_ordem,cnpj_dv");

console.log("\nCarga concluída. Conferência de contagem é feita por SQL na sequência.");
