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
// ────────────────────────────────────────────────────────────────────────────
// ACRÉSCIMO DA SUBETAPA 9.2 (2026-09-10): as colunas `onda` e `lote`, e uma
// LISTA ÚNICA. O nome do arquivo continua `09_00` de propósito — ele é citado
// no `plano_fases.md` e renomear quebraria a referência sem ganhar nada.
//
// POR QUE ATRIBUTO, E NÃO UMA LISTA POR DIA (decisão do Maxwell)
// Lista é IDENTIDADE ("as 89 contabilidades grandes"); dia de envio é AGENDA.
// Codificar a agenda no nome da lista obriga a MOVER contato entre listas toda
// vez que o calendário mudar — e replanejar é o normal, não a exceção. Com
// `onda` e `lote` como atributos do contato, a lista é uma só e cada disparo
// escolhe seus destinatários por filtro condicional no próprio painel da Brevo.
//
// O QUE CADA COLUNA SIGNIFICA
//   onda → 1..4, o segmento estratégico (grandes / médias / pequenas /
//          isoladas). Define QUAL COPY o e-mail usa — a onda 4 é a trilha B,
//          que são três mensagens diferentes. Nunca misture ondas num disparo.
//   lote → 1..N, o DIA de envio, global e contínuo. É o filtro do dia a dia:
//          "lote = 7" é exatamente o que sai hoje.
//
// A RAMPA, E POR QUE ELA É O PRÓPRIO PLANO DE ONDAS
// O teto do plano Free da Brevo é 300 e-mails/dia. A subida (15 → 30 → 50 → 75
// → 110 → 150 → 200 → 250 → 300, depois 300 fixo) aquece o DOMÍNIO — o IP já é
// quente, porque no Free o envio sai do pool compartilhado da Brevo, e o guia
// de warm-up de IP dedicado (3.000/dia) NÃO se aplica aqui.
//
// **Um lote nunca mistura ondas.** Não é preferência: cada onda tem copy
// própria, e a 4 tem três. Quando uma onda acaba, a seguinte começa num dia
// novo e a rampa CONTINUA de onde estava (não reinicia) — quem já mandou 250
// num dia não volta para 15 no dia seguinte.
//
// ORDEM DENTRO DA ONDA: maior carteira primeiro. As primeiras caixas a receber
// são as que mais cobrem base e as que mais provavelmente estão ativas — e é
// engajamento, não volume, que constrói reputação de domínio novo.
//
// Uso: node scripts/reexportar_csvs_09_00.mjs [--bench]
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { fetchResiliente } from "./lib/fetchResiliente.mjs";
import { config } from "dotenv";
import Papa from "papaparse";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
  { chave: "a", onda: 1, nome: "Coleta 2026 · Contabilidades grandes (20+)", esperado: 89 },
  { chave: "b", onda: 2, nome: "Coleta 2026 · Contabilidades médias (5-19)", esperado: 248 },
  { chave: "c", onda: 3, nome: "Coleta 2026 · Contabilidades pequenas (2-4)", esperado: 613 },
  { chave: "d", onda: 4, nome: "Coleta 2026 · Empresas isoladas", esperado: 8236 },
];

/**
 * A rampa de aquecimento, em e-mails por dia. Depois do último degrau, o teto
 * do plano Free (300) se repete até acabar a base.
 *
 * Mexer aqui muda o calendário inteiro — e é onde se mexe, não no painel da
 * Brevo. Baixar um degrau é sempre seguro; subir só depois de medir rejeição
 * abaixo de 2% no degrau anterior.
 */
const RAMPA = [15, 30, 50, 75, 110, 150, 200, 250];
const TETO_DIARIO = 300;

/**
 * O veredito de `higienizar_emails_09_02.mjs` (Subetapa 9.2). Três decisões, e
 * cada uma tem uma razão diferente:
 *
 *  · `rejeicao_certa` → **NÃO SAI NO CSV.** Domínio inexistente é bounce
 *    garantido, e bounce é o que destrói reputação de domínio novo — mais do
 *    que volume. Não some do CRM: o contato continua na base para follow-up por
 *    telefone, que é o canal certo para quem não tem e-mail alcançável.
 *
 *  · `arriscado` e `inconclusivo` → **SAEM, mas por último.** Vão para o fim da
 *    fila da própria onda, o que na prática os mantém FORA dos lotes 1-9 — a
 *    janela de aquecimento, onde cada rejeição pesa muito mais porque o
 *    denominador é pequeno (uma rejeição em 15 é 6,7%; em 300 é 0,3%). Excluí-los
 *    seria jogar fora contato provavelmente bom por causa de um timeout de DNS.
 */
const ARQUIVO_VEREDITO = `${"dados/campanha_08_13"}/veredito_emails.json`;
const RISCO = { entregavel: 0, arriscado: 1, inconclusivo: 2 };

function carregarVeredito() {
  if (!existsSync(ARQUIVO_VEREDITO)) {
    console.warn(
      `\n  ⚠ ${ARQUIVO_VEREDITO} não existe — o CSV sairá SEM higienização de e-mail.\n` +
        `    Rode antes: node scripts/higienizar_emails_09_02.mjs\n`,
    );
    return null;
  }
  const v = JSON.parse(readFileSync(ARQUIVO_VEREDITO, "utf-8"));
  const dias = (Date.now() - new Date(v.gerado_em).getTime()) / 86_400_000;
  if (dias > 7) {
    console.warn(`\n  ⚠ veredito com ${Math.floor(dias)} dias. Domínio expira e caixa é desativada — reveja antes de disparar.\n`);
  }
  return v;
}

/**
 * Distribui as linhas de UMA onda em lotes diários, continuando a numeração de
 * dias de onde a onda anterior parou. Devolve o próximo dia livre.
 *
 * O `Math.min` com `restantes` é o que faz o último lote da onda ser o resto —
 * e é também o que garante que o lote seguinte comece numa onda nova, nunca
 * completando o dia com contatos de outro segmento.
 */
function distribuirEmLotes(linhas, diaInicial) {
  let dia = diaInicial;
  let i = 0;
  while (i < linhas.length) {
    const tamanho = Math.min(RAMPA[dia - 1] ?? TETO_DIARIO, linhas.length - i);
    for (let k = 0; k < tamanho; k += 1) linhas[i + k].lote = dia;
    i += tamanho;
    dia += 1;
  }
  return dia;
}

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
  // Os dois atributos da 9.2. Números, não texto: assim o painel da Brevo
  // aceita filtro por faixa (`lote <= 3`) além de igualdade.
  { titulo: "onda", valor: (l) => l.onda },
  { titulo: "lote", valor: (l) => l.lote },
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

const client = createClient(URL, ANON, { auth: { persistSession: false }, global: { fetch: fetchResiliente } });
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

// Tamanho da carteira, para ordenar cada onda da maior para a menor. Vem da
// view da 08.11, que já é a fonte de verdade desse número nas telas — refazer a
// contagem aqui criaria uma segunda verdade que envelheceria sozinha.
const carteiraPorContab = new Map();
{
  const linhas = await lerTudo((de, ate) =>
    client.from("v_cobertura_contabilidades").select("contabilidade_id, total_estabelecimentos").range(de, ate),
  );
  for (const l of linhas) carteiraPorContab.set(l.contabilidade_id, l.total_estabelecimentos ?? 0);
}

const veredito = carregarVeredito();
/** nível de risco de um e-mail: 0 entregável · 1 arriscado · 2 inconclusivo ·
 *  null = rejeição certa (não sai). */
function risco(email) {
  if (!veredito) return 0;
  const v = veredito.emails[String(email).trim().toLowerCase()];
  if (!v) return 0; // ausente do veredito = entregável
  return v.nivel === "rejeicao_certa" ? null : (RISCO[v.nivel] ?? 0);
}

mkdirSync(PASTA_SAIDA, { recursive: true });
let divergencias = 0;
let proximoDia = 1;
let excluidos = 0;
const listaUnica = [];
const excluidosDetalhe = [];

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

  const linhas = [];
  for (const e of envios) {
    const r = risco(e.email);
    if (r === null) {
      excluidos += 1;
      const v = veredito.emails[String(e.email).trim().toLowerCase()];
      excluidosDetalhe.push({ onda: campanha.onda, email: e.email, motivo: v.motivo });
      continue;
    }
    linhas.push({
      nome: (e.contabilidade_id ? nomePorContab.get(e.contabilidade_id) : nomePorEstab.get(e.estabelecimento_id)) || e.email,
      email: e.email,
      token: e.token,
      onda: campanha.onda,
      lote: null, // preenchido logo abaixo
      carteira: e.contabilidade_id ? (carteiraPorContab.get(e.contabilidade_id) ?? 0) : 1,
      risco: r,
    });
  }

  // Ordem: entregável antes de duvidoso; dentro disso, maior carteira primeiro;
  // `email` como desempate para a ordem ser DETERMINÍSTICA — rodar o script duas
  // vezes tem de produzir os mesmos lotes, senão replanejar viraria
  // remanejamento de contato.
  linhas.sort((x, y) => x.risco - y.risco || y.carteira - x.carteira || x.email.localeCompare(y.email));
  proximoDia = distribuirEmLotes(linhas, proximoDia);
  listaUnica.push(...linhas);

  const arquivo = `${PASTA_SAIDA}/segmento_${campanha.chave}.csv`;
  writeFileSync(arquivo, "﻿" + gerarCsv(linhas, COLUNAS), "utf-8");

  // §7.2: conferir o efeito, não a ausência de erro. A contagem esperada é a da
  // 08.13; qualquer diferença é notícia — pode ser um descadastro legítimo já
  // registrado, e nesse caso a diferença é o número certo, não um defeito.
  // A conferência soma os EXCLUÍDOS de volta: a higienização de e-mail (9.2)
  // reduz o CSV de propósito, e cobrar o número da 08.13 sem somá-los faria as
  // quatro ondas parecerem divergentes justamente quando estão certas.
  const foraDestaOnda = excluidosDetalhe.filter((x) => x.onda === campanha.onda).length;
  const marca = linhas.length + foraDestaOnda === campanha.esperado ? "✓" : "⚠";
  if (marca === "⚠") divergencias += 1;
  console.log(
    `  ${marca} ${arquivo}: ${linhas.length} linhas` +
      (foraDestaOnda > 0 ? ` (+${foraDestaOnda} excluído(s) por e-mail morto)` : "") +
      ` — 08.13 exportou ${campanha.esperado}`,
  );
}

// ----------------------------------------------------------------------------
// A LISTA ÚNICA — é ESTE arquivo que se importa na Brevo (Subetapa 9.2).
// Os quatro por segmento continuam saindo para conferência e para o caso de
// alguém preferir listas separadas, mas administrar uma só é o desenho.
// ----------------------------------------------------------------------------
const arquivoUnico = `${PASTA_SAIDA}/lista_unica.csv`;
writeFileSync(arquivoUnico, "﻿" + gerarCsv(listaUnica, COLUNAS), "utf-8");

const porLote = new Map();
for (const l of listaUnica) porLote.set(l.lote, (porLote.get(l.lote) ?? 0) + 1);
const dias = [...porLote.keys()].sort((a, b) => a - b);

// §7.2: o efeito observável, não a ausência de erro. Três invariantes que, se
// quebrarem, quebram o calendário inteiro — e em silêncio.
const semLote = listaUnica.filter((l) => !l.lote).length;
const acimaDoTeto = dias.filter((d) => porLote.get(d) > TETO_DIARIO);
const ondasPorLote = new Map();
for (const l of listaUnica) {
  if (!ondasPorLote.has(l.lote)) ondasPorLote.set(l.lote, new Set());
  ondasPorLote.get(l.lote).add(l.onda);
}
const lotesMisturados = dias.filter((d) => ondasPorLote.get(d).size > 1);

if (semLote > 0) { console.error(`  ✗ ${semLote} contato(s) sem lote`); divergencias += 1; }
if (acimaDoTeto.length > 0) { console.error(`  ✗ lote(s) acima do teto de ${TETO_DIARIO}: ${acimaDoTeto.join(", ")}`); divergencias += 1; }
if (lotesMisturados.length > 0) { console.error(`  ✗ lote(s) misturando ondas: ${lotesMisturados.join(", ")}`); divergencias += 1; }

// Quem NÃO recebe e-mail não some do trabalho — muda de canal. Este arquivo é
// a lista de quem o follow-up tem de alcançar por telefone (Subetapa 9.6),
// exatamente como acontece com quem se descadastra.
if (excluidosDetalhe.length > 0) {
  const arquivoExcluidos = `${PASTA_SAIDA}/excluidos_email_morto.csv`;
  writeFileSync(
    arquivoExcluidos,
    "﻿" +
      gerarCsv(excluidosDetalhe, [
        { titulo: "onda", valor: (l) => l.onda },
        { titulo: "email", valor: (l) => l.email },
        { titulo: "motivo", valor: (l) => l.motivo },
      ]),
    "utf-8",
  );
  console.log(`\n  ✓ ${arquivoExcluidos}: ${excluidosDetalhe.length} contato(s) para follow-up por TELEFONE`);
}

const duvidosos = listaUnica.filter((l) => l.risco > 0);
const duvidosoNoAquecimento = duvidosos.filter((l) => l.lote <= RAMPA.length + 1).length;
console.log(`\n  ✓ ${arquivoUnico}: ${listaUnica.length} contatos em ${dias.length} lotes (dias)`);
console.log(`    ${excluidos} excluído(s) por e-mail morto · ${duvidosos.length} duvidoso(s) mantido(s), ${duvidosoNoAquecimento} deles na janela de aquecimento`);
console.log("\n  calendário (lote · onda · contatos):");
for (const d of dias) {
  const onda = [...ondasPorLote.get(d)][0];
  console.log(`    lote ${String(d).padStart(2)} · onda ${onda} · ${String(porLote.get(d)).padStart(3)} contatos`);
}

console.log(
  divergencias === 0
    ? `\nOK. Importe \`lista_unica.csv\` na Brevo como UMA lista; cada disparo filtra por \`lote\` (e \`onda\` escolhe a copy).\nNenhum envio foi criado, alterado ou revogado.`
    : `\n${divergencias} divergência(s) — leia as linhas marcadas acima antes de importar na Brevo.`,
);
