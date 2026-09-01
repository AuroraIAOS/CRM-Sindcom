#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/semear_contabilidades_08_9.mjs
// ETAPA 08 · Subetapa 08.9 — semeadura de `contabilidades` e dos vínculos.
//
// O QUE FAZ
// Transforma o agrupamento por e-mail — que hoje é implícito na coluna
// `estabelecimentos.email` e se perde no dia em que a empresa troca de
// escritório — em entidade persistida e editável.
//
// Caixa com 2+ estabelecimentos vira `contabilidades`. Caixa com 1 NÃO vira:
// é empresa isolada, e são 8.241 delas (53% da base) — atendidas pelo
// formulário direto da 08.8, não por planilha.
//
// GOVERNANÇA: roda logado como Admin com a ANON KEY, passando pelas mesmas
// policies que a Denise enfrentaria (`pol_contabilidades_insert`,
// `pol_contab_estab_insert`). NÃO usa service_role — mesmo padrão da carga da
// 06.4 (scripts/rfb/carregar_06_4.mjs) e regra do CLAUDE.md.
//
// A SEMEADURA NUNCA APAGA. Mesmo princípio da skill `atualizar-sindcom` (06.6):
// divergência vira RELATÓRIO, jamais `DELETE`. Um escritório que perdeu
// clientes desde a última carga continua na base — quem decide desativá-lo é a
// Denise, falando com ele, não um script comparando planilhas.
//
// IDEMPOTÊNCIA: `ON CONFLICT DO NOTHING` nos dois inserts (§2.14). Rodar duas
// vezes não duplica NEM altera — inclusive preserva o `confirmado = true` e o
// nome que a Denise tiver corrigido à mão, porque linha existente não é tocada.
//
// Uso: node scripts/semear_contabilidades_08_9.mjs [--dry] [--bench]
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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
// A mesma trava da suíte (§2.20): anunciar o alvo não é o mesmo que provar em
// qual alvo se está. Pedir bench e receber produção seria uma escrita em massa
// no banco errado.
if (BENCH && REF === REF_PRODUCAO) {
  console.error("ABORTADO: --bench pedido, mas VITE_SUPABASE_URL aponta para PRODUÇÃO.");
  process.exit(1);
}

const LOTE = 500;
const PAGINA = 1000; // o PostgREST trunca em 1000 sem avisar (§2.4)
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/;

const OBSERVACAO_SEMEADURA =
  "Nome provisório — derivado do agrupamento por e-mail na semeadura da Subetapa 08.9. " +
  "O escritório ainda não confirmou razão social nem a carteira de clientes.";

/** Lê TODAS as linhas de uma consulta, paginando (§2.4). */
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

async function contar(client, tabela) {
  const { count, error } = await client.from(tabela).select("id", { count: "exact", head: true });
  if (error) throw new Error(`contagem de ${tabela}: ${error.message}`);
  return count ?? 0;
}

/** Insere em lotes com ON CONFLICT DO NOTHING. Nunca atualiza, nunca apaga. */
async function inserirIgnorandoExistentes(client, tabela, linhas, onConflict) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const { error } = await client.from(tabela).upsert(lote, { onConflict, ignoreDuplicates: true });
    if (error) {
      throw new Error(
        `Lote ${Math.floor(i / LOTE) + 1} de ${tabela} (linhas ${i}–${i + lote.length}): ` +
          `${error.message} | code=${error.code} | details=${error.details}`,
      );
    }
    process.stdout.write(`\r  ${tabela}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}   `);
  }
  console.log("");
}

// ---------------------------------------------------------------------------

console.log(`\n=== Subetapa 08.9 — semeadura de contabilidades ===`);
console.log(`Alvo: ${BENCH ? "BENCH" : "PRODUÇÃO"} (${REF})${DRY ? "  ·  MODO --dry" : ""}\n`);

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

// --- 1. Agrupamento -------------------------------------------------------
const estabelecimentos = await lerTudo((de, ate) =>
  client
    .from("estabelecimentos")
    .select("id, email")
    .not("email", "is", null)
    .order("id")
    .range(de, ate),
);

const porCaixa = new Map();
for (const e of estabelecimentos) {
  const caixa = (e.email ?? "").trim().toLowerCase();
  if (!caixa) continue;
  if (!porCaixa.has(caixa)) porCaixa.set(caixa, []);
  porCaixa.get(caixa).push(e.id);
}

const grupos = [];
const isoladas = [];
const descartadasPorFormato = [];
for (const [caixa, ids] of porCaixa) {
  if (ids.length < 2) {
    isoladas.push(caixa);
  } else if (!FORMATO_EMAIL.test(caixa)) {
    // Hoje são ZERO — medido em 2026-08-26. O filtro existe para o ciclo mensal
    // da RFB: uma caixa malformada que vire "contabilidade" recebe um link que
    // nunca chega, e some da conta de cobertura sem ninguém notar. Descartar em
    // silêncio seria pior; por isso o relatório abaixo.
    descartadasPorFormato.push({ caixa, estabelecimentos: ids.length });
  } else {
    grupos.push({ caixa, ids });
  }
}

const vinculosPrevistos = grupos.reduce((s, g) => s + g.ids.length, 0);
console.log(`Estabelecimentos com e-mail ......... ${estabelecimentos.length}`);
console.log(`Caixas únicas ....................... ${porCaixa.size}`);
console.log(`  → contabilidades (2+ estabs) ...... ${grupos.length}`);
console.log(`  → empresas isoladas (1 estab) ..... ${isoladas.length}  (não viram contabilidade)`);
console.log(`  → descartadas por formato ......... ${descartadasPorFormato.length}`);
console.log(`Vínculos previstos .................. ${vinculosPrevistos}\n`);

if (descartadasPorFormato.length > 0) {
  console.log("ATENÇÃO — caixas com 2+ estabelecimentos e e-mail malformado (NÃO semeadas):");
  for (const d of descartadasPorFormato) console.log(`  · ${d.caixa} (${d.estabelecimentos})`);
  console.log("");
}

const antesContab = await contar(client, "contabilidades");
const antesVinculos = await contar(client, "contabilidade_estabelecimentos");
console.log(`ANTES:  contabilidades=${antesContab}  vínculos=${antesVinculos}\n`);

if (DRY) {
  console.log("--dry: nada foi gravado.");
  process.exit(0);
}

// --- 2. Contabilidades ----------------------------------------------------
// `nome` é NOT NULL e a RFB não traz razão social do ESCRITÓRIO — só a das
// empresas-cliente. Usar a razão social de um cliente como nome do contador
// seria inventar informação. O e-mail é o único fato que temos, então ele é o
// nome provisório, e a observação diz isso na própria linha.
console.log("Semeando contabilidades...");
await inserirIgnorandoExistentes(
  client,
  "contabilidades",
  grupos.map((g) => ({ nome: g.caixa, email: g.caixa, observacoes: OBSERVACAO_SEMEADURA })),
  "email",
);

const contabilidades = await lerTudo((de, ate) =>
  client.from("contabilidades").select("id, email").order("id").range(de, ate),
);
const idPorCaixa = new Map(contabilidades.map((c) => [c.email, c.id]));

// --- 3. Vínculos ----------------------------------------------------------
const vinculos = [];
const semContabilidade = [];
for (const g of grupos) {
  const contabilidade_id = idPorCaixa.get(g.caixa);
  if (!contabilidade_id) {
    semContabilidade.push(g.caixa);
    continue;
  }
  for (const estabelecimento_id of g.ids) {
    // `confirmado: false` porque o agrupamento é HEURÍSTICA, não declaração do
    // contador. É esse campo que permite ao CRM registrar "essa empresa não é
    // mais minha" em vez de esquecer.
    vinculos.push({
      contabilidade_id,
      estabelecimento_id,
      origem: "agrupamento_email",
      confirmado: false,
    });
  }
}
if (semContabilidade.length > 0) {
  console.error(`ABORTADO: ${semContabilidade.length} caixa(s) sem id após o insert.`);
  console.error(semContabilidade.slice(0, 5).join(", "));
  process.exit(1);
}

console.log("Semeando vínculos...");
await inserirIgnorandoExistentes(
  client,
  "contabilidade_estabelecimentos",
  vinculos,
  "contabilidade_id,estabelecimento_id",
);

// --- 4. Conferência -------------------------------------------------------
const depoisContab = await contar(client, "contabilidades");
const depoisVinculos = await contar(client, "contabilidade_estabelecimentos");
console.log(`\nDEPOIS: contabilidades=${depoisContab}  vínculos=${depoisVinculos}`);
console.log(`DELTA:  contabilidades=+${depoisContab - antesContab}  vínculos=+${depoisVinculos - antesVinculos}\n`);

const naoConfirmados = await lerTudo((de, ate) =>
  client
    .from("contabilidade_estabelecimentos")
    .select("id")
    .eq("origem", "agrupamento_email")
    .eq("confirmado", false)
    .order("id")
    .range(de, ate),
);
console.log(`Vínculos com origem='agrupamento_email' e confirmado=false: ${naoConfirmados.length}`);

// --- 5. Relatório de divergência — NUNCA apaga ----------------------------
const caixasAtuais = new Set(grupos.map((g) => g.caixa));
const orfas = contabilidades.filter((c) => !caixasAtuais.has(c.email));
if (orfas.length > 0) {
  console.log(
    `\nRELATÓRIO (nada foi apagado): ${orfas.length} contabilidade(s) na base que o agrupamento ` +
      `atual não sustenta mais — o escritório caiu para 1 estabelecimento, perdeu todos, ou o ` +
      `e-mail mudou na RFB. Decidir uma a uma é ato da Denise, não do script.`,
  );
  for (const o of orfas.slice(0, 20)) console.log(`  · ${o.email}`);
  if (orfas.length > 20) console.log(`  ... e mais ${orfas.length - 20}`);
}

// --- 6. Conferência a olho dos casos grandes ------------------------------
console.log("\nConferência dos maiores contra a origem:");
for (const caixa of ["juridico@contss.com.br", "rm2091adm@gmail.com"]) {
  const contabilidadeId = idPorCaixa.get(caixa);
  if (!contabilidadeId) {
    console.log(`  · ${caixa}: NÃO ENCONTRADA`);
    continue;
  }
  const { count, error } = await client
    .from("contabilidade_estabelecimentos")
    .select("id", { count: "exact", head: true })
    .eq("contabilidade_id", contabilidadeId);
  if (error) throw new Error(error.message);
  const naOrigem = porCaixa.get(caixa)?.length ?? 0;
  const ok = count === naOrigem ? "OK" : "DIVERGE";
  console.log(`  · ${caixa}: ${count} vínculo(s) · ${naOrigem} na origem → ${ok}`);
}

console.log("\nSemeadura concluída.");
