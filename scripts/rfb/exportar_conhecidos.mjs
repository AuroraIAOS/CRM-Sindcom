#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/exportar_conhecidos.mjs
// Subetapa 06.6: exporta os cnpj_completo que já estão no banco para
// D:\BD\filtrados\cnpj_conhecidos.txt.
//
// Esse arquivo é lido pelo passe de filtragem para responder à pergunta que
// o relatório mensal precisa fazer: um estabelecimento que o CRM conhece e
// que NÃO passou mais no filtro — por quê? Fechou? Mudou de CNAE? Mudou de
// município? Sem isso, todo sumiço viraria o genérico (e enganoso)
// "não encontrado no arquivo da RFB".
//
// Somente leitura. Roda antes do passe, no ciclo mensal.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.test" });

const DIR = process.env.RFB_DIR ?? "D:/BD/filtrados";
const PAGINA = 1000; // PostgREST trunca em 1000 sem avisar (orientacoes.md §2.4)

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const SENHA = process.env.TEST_USER_PASSWORD;
if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error("ABORTADO: faltam credenciais em .env.test");
  process.exit(1);
}

const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: sessao, error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao.user) {
  console.error(`ABORTADO: login do Admin falhou: ${erroLogin?.message}`);
  process.exit(1);
}

const cnpjs = [];
for (let offset = 0; ; offset += PAGINA) {
  const { data, error } = await client
    .from("estabelecimentos").select("cnpj_completo")
    .order("cnpj_completo", { ascending: true })
    .range(offset, offset + PAGINA - 1);
  if (error) { console.error(`ABORTADO: leitura falhou: ${error.message}`); process.exit(1); }
  cnpjs.push(...data.map((r) => r.cnpj_completo));
  if (data.length < PAGINA) break;
}

fs.mkdirSync(DIR, { recursive: true });
const destino = path.join(DIR, "cnpj_conhecidos.txt");
fs.writeFileSync(destino, cnpjs.join("\n"));
console.log(`${cnpjs.length} cnpj_completo exportados para ${destino}`);
