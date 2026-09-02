#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/reexportar_csvs_09_00.mjs
// ETAPA 09 · Subetapa 9.00 — reexporta os 4 CSVs do ESP com a coluna `saida`
//
// POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE NÃO É O 08.13 DE NOVO
// O `gerar_campanha_08_13.mjs` ABORTA se as 4 campanhas já existirem, e está
// certo: gerar campanha duas vezes duplicaria destinatário. Mas os CSVs que ele
// exportou têm três colunas — `nome`, `email`, `link` — e a 9.00 acrescentou um
// quarto endereço por destinatário: o do formulário de descadastro, que é o link
// do CORPO do e-mail.
//
// Este script **só LÊ** `envios_campanha` e reescreve os 4 arquivos. Não cria
// campanha, não cria envio, não toca em token nenhum. Rodar duas vezes produz o
// mesmo resultado.
//
// A JANELA EM QUE ISSO SAI DE GRAÇA É AGORA. Os CSVs ainda NÃO foram importados
// na Brevo (item (e) da Subetapa 9.0, em aberto). Acrescentar uma coluna antes da
// importação custa zero; depois dela custaria reimportar 9.186 contatos.
//
// O CAMPO DE MESCLAGEM QUE ISSO CRIA
// `link`  → {{ contact.LINK }}   — o envio da planilha (já usado nas 4 copies)
// `saida` → {{ contact.SAIDA }}  — o formulário de descadastro, no rodapé
//
// E o que ele NÃO substitui: o cabeçalho `List-Unsubscribe` continua sendo o de
// UM CLIQUE da Brevo. Google e Microsoft são 79,9% da lista e o exigem sem
// formulário; obrigá-los a passar por esta URL seria descumprimento, com custo
// em entregabilidade e não em teste (plano, 9.00, decisão (a)).
//
// Uso: node scripts/reexportar_csvs_09_00.mjs [--bench]
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import Papa from "papaparse";
import { mkdirSync, writeFileSync } from "node:fs";

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

// §2.20: provar o alvo, não anunciá-lo. O ref sai impresso antes de qualquer
// leitura, para que "rodei contra o bench" nunca seja uma suposição.
const REF = URL.replace(/^https?:\/\//, "").split(".")[0];
const REF_PRODUCAO = "vcswvscjqifelslsdjth";
if (BENCH && REF === REF_PRODUCAO) {
  console.error("ABORTADO: --bench pedido, mas a URL aponta para PRODUÇÃO.");
  process.exit(1);
}
console.log(`alvo = ${REF === REF_PRODUCAO ? "PRODUÇÃO" : "BENCH"} (${REF})`);

const PAGINA = 1000; // PostgREST trunca em 1000 sem avisar (§2.4)
const PASTA_SAIDA = "dados/campanha_08_13";
const BASE_LINK = "https://crm.sindcompassos.org/enviar-dados";
const BASE_SAIDA = "https://crm.sindcompassos.org/descadastrar";

const CAMPANHAS = [
  { chave: "a", nome: "Coleta 2026 · Contabilidades grandes (20+)", esperado: 89 },
  { chave: "b", nome: "Coleta 2026 · Contabilidades médias (5-19)", esperado: 248 },
  { chave: "c", nome: "Coleta 2026 · Contabilidades pequenas (2-4)", esperado: 613 },
  { chave: "d", nome: "Coleta 2026 · Empresas isoladas", esperado: 8236 },
];

/** Mesma defesa de `src/lib/csv.ts` (§2.19), reimplementada porque este script
 *  roda em Node puro, fora do bundle TypeScript. Nome de empresa da Receita
 *  começando com `-` ou `=` vira fórmula ao abrir no Excel. */
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
  return Papa.unparse(dados, {
    delimiter: ";",
    columns: colunas.map((c) => c.titulo),
    quotes: true,
    newline: "\r\n",
  });
}

const COLUNAS = [
  { titulo: "nome", valor: (l) => l.nome },
  { titulo: "email", valor: (l) => l.email },
  { titulo: "link", valor: (l) => `${BASE_LINK}/${l.token}` },
  { titulo: "saida", valor: (l) => `${BASE_SAIDA}/${l.token}` },
];

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

const client = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: erroLogin } = await client.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin) {
  console.error("ABORTADO: login de Admin falhou —", erroLogin.message);
  process.exit(1);
}

const { data: campanhas, error: erroCampanhas } = await client.from("campanhas").select("id, nome");
if (erroCampanhas) {
  console.error("ABORTADO:", erroCampanhas.message);
  process.exit(1);
}
const idPorNome = new Map((campanhas ?? []).map((c) => [c.nome, c.id]));

mkdirSync(PASTA_SAIDA, { recursive: true });
let divergencias = 0;

for (const campanha of CAMPANHAS) {
  const id = idPorNome.get(campanha.nome);
  if (!id) {
    console.error(`  ✗ campanha não encontrada: ${campanha.nome}`);
    divergencias += 1;
    continue;
  }

  // Só envios ATIVOS: token revogado (08.11) não vai para o ESP, e envio já
  // descadastrado (9.00) muito menos — mandar de novo para quem pediu para sair
  // é o erro que este trabalho inteiro existe para não cometer.
  const envios = await lerTudo((de, ate) =>
    client
      .from("envios_campanha")
      .select("email, token, contabilidade_id, estabelecimento_id")
      .eq("campanha_id", id)
      .is("token_revogado_em", null)
      .is("descadastrado_em", null)
      .order("email")
      .range(de, ate),
  );

  // O `nome` da coluna 1 nunca é usado como mesclagem (§1 das copies: em A/B/C
  // ele É o e-mail, e em D contém CPF). Ele existe só para a lista ficar legível
  // no painel do ESP, e por isso se resolve com o dado que estiver à mão.
  const idsContab = [...new Set(envios.map((e) => e.contabilidade_id).filter(Boolean))];
  const idsEstab = [...new Set(envios.map((e) => e.estabelecimento_id).filter(Boolean))];

  const nomePorContab = new Map();
  for (let i = 0; i < idsContab.length; i += 500) {
    const { data } = await client.from("contabilidades").select("id, nome").in("id", idsContab.slice(i, i + 500));
    for (const c of data ?? []) nomePorContab.set(c.id, c.nome);
  }
  const nomePorEstab = new Map();
  for (let i = 0; i < idsEstab.length; i += 500) {
    const { data } = await client
      .from("estabelecimentos")
      .select("id, nome_fantasia, empresas(razao_social)")
      .in("id", idsEstab.slice(i, i + 500));
    for (const e of data ?? []) nomePorEstab.set(e.id, e.nome_fantasia || e.empresas?.razao_social || "");
  }

  const linhas = envios.map((e) => ({
    nome: (e.contabilidade_id ? nomePorContab.get(e.contabilidade_id) : nomePorEstab.get(e.estabelecimento_id)) || e.email,
    email: e.email,
    token: e.token,
  }));

  const arquivo = `${PASTA_SAIDA}/segmento_${campanha.chave}.csv`;
  writeFileSync(arquivo, "﻿" + gerarCsv(linhas, COLUNAS), "utf-8");

  // §7.2: conferir o efeito, não a ausência de erro. A contagem esperada é a da
  // 08.13; qualquer diferença é notícia — pode ser um descadastro legítimo já
  // registrado, e nesse caso a diferença é o número certo, não um defeito.
  const marca = linhas.length === campanha.esperado ? "✓" : "⚠";
  if (marca === "⚠") divergencias += 1;
  console.log(`  ${marca} ${arquivo}: ${linhas.length} linhas (08.13 exportou ${campanha.esperado})`);
}

console.log(
  divergencias === 0
    ? "\n4 CSVs reexportados com a coluna `saida`. Nenhum envio foi criado, alterado ou revogado."
    : `\n${divergencias} divergência(s) — leia a linha marcada acima antes de importar na Brevo.`,
);
