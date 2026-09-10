#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/higienizar_emails_09_02.mjs
// ETAPA 09 · Subetapa 9.2 — higienização da base de e-mails ANTES da Onda 01
//
// POR QUE ISTO EXISTE, E POR QUE ANTES DO PRIMEIRO DISPARO
// O domínio `envios.sindcompassos.org` é novo. Num domínio sem histórico, o que
// destrói reputação não é volume — é **taxa de rejeição**. Provedor que recebe
// uma leva de "usuário inexistente" conclui que o remetente comprou lista, e a
// conclusão é difícil de reverter. A base veio de dados públicos da Receita, e
// dado público envelhece: empresa fecha, contador troca de provedor, e o
// endereço continua no cadastro.
//
// A regra do plano é "nunca subir volume com rejeição acima de 2%". Este script
// existe para que essa régua seja cumprida ANTES do envio, e não descoberta
// depois dele.
//
// O QUE ELE MEDE, E O QUE ELE NÃO PODE MEDIR
//
//  MEDE (e é conclusivo):
//   · sintaxe do endereço;
//   · usuário obviamente falso (`00000000@…`, `xxxxx@…`);
//   · **o domínio existe no DNS?** `NXDOMAIN` é rejeição CERTA — não há
//     servidor no mundo para receber aquela mensagem;
//   · **o domínio aceita e-mail?** registro MX. Sem MX e sem A/AAAA, também é
//     rejeição certa.
//
//  NÃO MEDE (e nenhuma ferramenta gratuita mede com honestidade):
//   · se a CAIXA existe dentro de um domínio válido. Descobrir isso exige
//     sondar o servidor SMTP por `RCPT TO`, o que (a) a maioria dos provedores
//     grandes responde com "aceita tudo" para justamente impedir a sondagem, e
//     (b) é comportamento que queima IP. Não fazemos.
//
//  Por isso a saída deste script é honesta em três níveis, e não um "válido/
//  inválido" binário que daria falsa segurança.
//
// O QUE ELE NÃO FAZ: não altera NADA no banco. Só lê `envios_campanha` e
// escreve um arquivo de veredito que `reexportar_csvs_09_00.mjs` consome.
// Revogar token ou apagar envio é decisão do Maxwell, não efeito colateral de
// uma varredura de DNS que pode ter dado timeout.
//
// Uso: node scripts/higienizar_emails_09_02.mjs [--bench]
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { fetchResiliente } from "./lib/fetchResiliente.mjs";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import dns from "node:dns/promises";

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
console.log(`alvo = ${REF === "vcswvscjqifelslsdjth" ? "PRODUÇÃO" : "BENCH"} (${REF})`);

const PAGINA = 1000; // §2.4
const PASTA_SAIDA = "dados/campanha_08_13";
const ARQUIVO_VEREDITO = `${PASTA_SAIDA}/veredito_emails.json`;
const CONCORRENCIA = 24; // resolvers públicos aguentam; acima disso dá SERVFAIL falso

/** Sintaxe deliberadamente conservadora: recusa só o que é indefensável. Um
 *  regex "RFC completo" rejeita endereço válido e raro, e aqui um falso
 *  positivo custa um contato real perdido. */
const SINTAXE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** Usuário que não é de ninguém. Não inclui `contato@`, `financeiro@` etc. —
 *  endereço de papel é legítimo e, num contador, costuma ser O endereço. */
const USUARIO_LIXO = /^(0+|1+|x+|xx+|na|nao|naotem|sememail|sem_email|teste|test|email)$/i;

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

/**
 * Veredito de UM domínio. A ordem das tentativas segue a RFC 5321 §5.1: MX
 * primeiro; sem MX, o A/AAAA vale como destino implícito. Só quando as duas
 * falham por inexistência é que se pode afirmar rejeição certa.
 */
async function classificarDominio(dominio) {
  try {
    const mx = await dns.resolveMx(dominio);
    if (mx && mx.length > 0) return { nivel: "entregavel", motivo: `MX (${mx.length})` };
    return await semMx(dominio);
  } catch (e) {
    if (e.code === "ENODATA" || e.code === "ENOTFOUND") return await semMx(dominio, e.code);
    return { nivel: "inconclusivo", motivo: `DNS ${e.code ?? "erro"}` };
  }
}

async function semMx(dominio, codigoMx) {
  try {
    const a = await dns.resolve4(dominio);
    if (a && a.length > 0) return { nivel: "arriscado", motivo: "sem MX, mas domínio resolve (A)" };
  } catch (e) {
    if (e.code === "ENOTFOUND" || (codigoMx === "ENOTFOUND" && e.code === "ENODATA")) {
      return { nivel: "rejeicao_certa", motivo: "domínio não existe (NXDOMAIN)" };
    }
    if (e.code === "ENODATA") return { nivel: "rejeicao_certa", motivo: "domínio sem MX e sem A" };
    return { nivel: "inconclusivo", motivo: `DNS ${e.code ?? "erro"}` };
  }
  return { nivel: "rejeicao_certa", motivo: "domínio sem MX e sem A" };
}

/** Pool simples: N tarefas em voo, sem dependência externa. */
async function emParalelo(itens, limite, tarefa) {
  const resultados = new Map();
  let indice = 0;
  let feitos = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (indice < itens.length) {
        const meu = itens[indice++];
        resultados.set(meu, await tarefa(meu));
        feitos += 1;
        if (feitos % 50 === 0) process.stdout.write(`\r  domínios verificados: ${feitos}/${itens.length}`);
      }
    }),
  );
  process.stdout.write(`\r  domínios verificados: ${itens.length}/${itens.length}\n`);
  return resultados;
}

// ----------------------------------------------------------------------------

const client = createClient(URL, ANON, { auth: { persistSession: false }, global: { fetch: fetchResiliente } });
const { error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin) {
  console.error("ABORTADO: login de Admin falhou —", erroLogin.message);
  process.exit(1);
}

console.log("\n1. lendo os envios ativos");
const envios = await lerTudo((de, ate) =>
  client
    .from("envios_campanha")
    .select("id, email, token, token_expira_em, contabilidade_id, estabelecimento_id")
    .is("token_revogado_em", null)
    .is("descadastrado_em", null)
    .order("email")
    .range(de, ate),
);
console.log(`   ${envios.length} envios ativos`);

// --- 2. sintaxe e usuário -----------------------------------------------------
console.log("\n2. sintaxe e usuário");
const problemasPorEmail = new Map();
for (const e of envios) {
  const email = String(e.email ?? "").trim().toLowerCase();
  if (!SINTAXE.test(email)) {
    problemasPorEmail.set(email, { nivel: "rejeicao_certa", motivo: "sintaxe inválida" });
    continue;
  }
  const usuario = email.split("@")[0];
  if (USUARIO_LIXO.test(usuario)) {
    problemasPorEmail.set(email, { nivel: "rejeicao_certa", motivo: `usuário inexistente ("${usuario}")` });
  }
}
console.log(`   ${problemasPorEmail.size} endereço(s) reprovado(s) antes do DNS`);

// --- 3. DNS por domínio -------------------------------------------------------
const dominios = [...new Set(envios.map((e) => String(e.email ?? "").trim().toLowerCase().split("@")[1]).filter(Boolean))];
console.log(`\n3. DNS em ${dominios.length} domínios distintos (MX, com A/AAAA como destino implícito)`);
const veredictoDominio = await emParalelo(dominios, CONCORRENCIA, classificarDominio);

// Uma segunda passada só nos inconclusivos: SERVFAIL e timeout são transitórios,
// e classificar um domínio bom como ruim custa um contato real.
const inconclusivos = dominios.filter((d) => veredictoDominio.get(d).nivel === "inconclusivo");
if (inconclusivos.length > 0) {
  console.log(`   ${inconclusivos.length} inconclusivo(s) — repetindo (timeout e SERVFAIL são transitórios)`);
  const segunda = await emParalelo(inconclusivos, 8, classificarDominio);
  for (const [d, v] of segunda) veredictoDominio.set(d, v);
}

// --- 4. consolidação ----------------------------------------------------------
const porNivel = { entregavel: [], arriscado: [], rejeicao_certa: [], inconclusivo: [] };
const detalhePorEmail = {};
for (const e of envios) {
  const email = String(e.email ?? "").trim().toLowerCase();
  const dominio = email.split("@")[1];
  const v = problemasPorEmail.get(email) ?? veredictoDominio.get(dominio) ?? { nivel: "inconclusivo", motivo: "sem domínio" };
  porNivel[v.nivel].push(email);
  if (v.nivel !== "entregavel") detalhePorEmail[email] = { ...v, dominio };
}

const dominiosRuins = {};
for (const [d, v] of veredictoDominio) if (v.nivel !== "entregavel") dominiosRuins[d] = v;

mkdirSync(PASTA_SAIDA, { recursive: true });
writeFileSync(
  ARQUIVO_VEREDITO,
  JSON.stringify(
    {
      gerado_em: new Date().toISOString(),
      alvo: REF,
      total_envios: envios.length,
      resumo: Object.fromEntries(Object.entries(porNivel).map(([k, v]) => [k, v.length])),
      dominios: dominiosRuins,
      emails: detalhePorEmail,
    },
    null,
    2,
  ),
  "utf-8",
);

// --- 5. relatório -------------------------------------------------------------
const pct = (n) => `${((n / envios.length) * 100).toFixed(2)}%`;
console.log("\n4. veredito");
console.log(`   entregável .......... ${String(porNivel.entregavel.length).padStart(5)}  (${pct(porNivel.entregavel.length)})`);
console.log(`   arriscado ........... ${String(porNivel.arriscado.length).padStart(5)}  (${pct(porNivel.arriscado.length)})  sem MX, mas o domínio existe`);
console.log(`   REJEIÇÃO CERTA ...... ${String(porNivel.rejeicao_certa.length).padStart(5)}  (${pct(porNivel.rejeicao_certa.length)})  não sai no CSV`);
console.log(`   inconclusivo ........ ${String(porNivel.inconclusivo.length).padStart(5)}  (${pct(porNivel.inconclusivo.length)})  DNS não respondeu`);

const amostra = Object.entries(detalhePorEmail).filter(([, v]) => v.nivel === "rejeicao_certa").slice(0, 12);
if (amostra.length > 0) {
  console.log("\n   amostra de rejeição certa:");
  for (const [email, v] of amostra) console.log(`     ${email.padEnd(42)} ${v.motivo}`);
}

console.log(`\n   veredito gravado em ${ARQUIVO_VEREDITO}`);
console.log("   Nada foi alterado no banco. Rode `reexportar_csvs_09_00.mjs` para gerar o CSV já filtrado.");
