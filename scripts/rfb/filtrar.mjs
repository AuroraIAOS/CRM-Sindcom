#!/usr/bin/env node
// ============================================================================
// CRM SINDCOM — scripts/rfb/filtrar.mjs
// Subetapa 06.1 (docs/plano_importacao_rfb.md): ferramenta de filtragem e
// validação, hoje rodada contra 1 arquivo de estabelecimentos para provar
// que o parser está correto antes do passe completo nos 22 GB (Subetapa 06.2).
//
// FILTROS (aplicados sobre estabelecimentos, cascateiam para empresas depois):
//   1. município ∈ 29 códigos TOM da base_territorial
//   2. CNAE principal começa com 45, 46 ou 47
//   3. situação cadastral = '02' (ativa) — decisão D1
//
// Uso:
//   node scripts/rfb/filtrar.mjs <estabelecimentosN.csv> [--amostras N]
//
// Streaming puro: nunca materializa o arquivo inteiro em memória. Decodifica
// Latin-1 → UTF-8 (padrão dos exports da Receita) e usa o parser real do
// papaparse (já dependência do projeto) para respeitar aspas com ";" embutido
// — a armadilha que Maxwell apontou explicitamente.
// ============================================================================

import fs from "node:fs";
import Papa from "papaparse";
import {
  MUNICIPIOS_TOM,
  CNAE_PREFIXOS,
  SITUACAO_ATIVA,
  AMOSTRA_CONTROLE_8,
  CONTAGEM_CONTROLE_ESPERADA,
} from "./municipios.mjs";

// Posições 0-indexed no CSV de estabelecimentos (30 colunas, sem cabeçalho,
// layout oficial do CNPJ — docs/plano_importacao_rfb.md §1.2).
const COL = {
  cnpj_basico: 0,
  cnpj_ordem: 1,
  cnpj_dv: 2,
  matriz_filial: 3,
  nome_fantasia: 4,
  situacao_cadastral: 5,
  tipo_logradouro: 13,
  logradouro: 14,
  bairro: 17,
  uf: 19,
  municipio: 20,
  cnae_principal: 11,
};

function cnaeComecaCom45a47(cnae) {
  if (!cnae) return false;
  return CNAE_PREFIXOS.some((p) => cnae.startsWith(p));
}

async function main() {
  const arquivo = process.argv[2];
  const idxAmostras = process.argv.indexOf("--amostras");
  const maxAmostras = idxAmostras >= 0 ? Number(process.argv[idxAmostras + 1]) : 5;

  if (!arquivo) {
    console.error("Uso: node scripts/rfb/filtrar.mjs <estabelecimentosN.csv> [--amostras N]");
    process.exit(1);
  }
  if (!fs.existsSync(arquivo)) {
    console.error(`ABORTADO: arquivo não encontrado: ${arquivo}`);
    process.exit(1);
  }

  const tamanhoBytes = fs.statSync(arquivo).size;
  console.log(`Arquivo: ${arquivo} (${(tamanhoBytes / 1024 / 1024 / 1024).toFixed(3)} GB)`);
  console.log(`Municípios alvo: ${MUNICIPIOS_TOM.size} · CNAE: ${CNAE_PREFIXOS.join("/")}* · situação: ${SITUACAO_ATIVA}\n`);

  let totalLinhas = 0;
  let controleAmostra8SemSituacao = 0; // reproduz o número já medido nesta sessão
  let controleAmostra8ComSituacao = 0; // primeira medição real do impacto da decisão D1
  let filtroCompleto = 0; // os 3 filtros reais (o que vai para a 06.2+)
  const amostrasFiltroCompleto = [];
  let ultimoLogMemoria = 0;
  const inicio = Date.now();

  // Node decodifica Latin-1 (ISO-8859-1) nativamente — mapeamento direto
  // byte→code point, exatamente o encoding dos exports da Receita. Sem
  // dependência externa: setEncoding faz o stream emitir strings já corretas.
  const streamArquivo = fs.createReadStream(arquivo);
  streamArquivo.setEncoding("latin1");

  await new Promise((resolve, reject) => {
    Papa.parse(streamArquivo, {
      delimiter: ";",
      quoteChar: '"',
      header: false,
      skipEmptyLines: true,
      step: (resultado) => {
        totalLinhas++;

        const linha = resultado.data;
        const municipio = Number.parseInt(linha[COL.municipio], 10);
        const cnae = linha[COL.cnae_principal];
        const situacao = linha[COL.situacao_cadastral];
        const cnaeOk = cnaeComecaCom45a47(cnae);

        if (AMOSTRA_CONTROLE_8.has(municipio) && cnaeOk) {
          controleAmostra8SemSituacao++;
          if (situacao === SITUACAO_ATIVA) controleAmostra8ComSituacao++;
        }

        if (MUNICIPIOS_TOM.has(municipio) && cnaeOk && situacao === SITUACAO_ATIVA) {
          filtroCompleto++;
          if (amostrasFiltroCompleto.length < maxAmostras) {
            amostrasFiltroCompleto.push({
              cnpj: `${linha[COL.cnpj_basico]}/${linha[COL.cnpj_ordem]}-${linha[COL.cnpj_dv]}`,
              municipio,
              cnae,
              endereco: `${linha[COL.tipo_logradouro]} ${linha[COL.logradouro]}, ${linha[COL.bairro]} - ${linha[COL.uf]}`,
              fantasia: linha[COL.nome_fantasia],
            });
          }
        }

        if (totalLinhas - ultimoLogMemoria >= 1_000_000) {
          ultimoLogMemoria = totalLinhas;
          const rssMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
          const decorridoS = ((Date.now() - inicio) / 1000).toFixed(0);
          console.log(`  ${totalLinhas.toLocaleString("pt-BR")} linhas · RSS ${rssMB} MB · ${decorridoS}s`);
        }
      },
      complete: resolve,
      error: reject,
    });
  });

  const duracaoS = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`RESULTADO — ${arquivo}`);
  console.log("=".repeat(78));
  console.log(`Total de linhas lidas: ${totalLinhas.toLocaleString("pt-BR")}`);
  console.log(`Duração: ${duracaoS}s · RSS final: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB\n`);

  console.log("--- Número de controle (amostra 8 municípios, SEM filtro de situação) ---");
  console.log(`Medido agora:  ${controleAmostra8SemSituacao}`);
  console.log(`Esperado:      ${CONTAGEM_CONTROLE_ESPERADA}`);
  if (controleAmostra8SemSituacao === CONTAGEM_CONTROLE_ESPERADA) {
    console.log("✅ BATE — o parser reproduz a contagem já medida manualmente.\n");
  } else {
    console.log("🔴 DIVERGIU — o parser está errado ou o critério mudou. NÃO prosseguir para a 06.2.\n");
  }

  console.log("--- Mesma amostra de 8 municípios, COM filtro de situação = 02 (decisão D1) ---");
  console.log(`Estabelecimentos ativos: ${controleAmostra8ComSituacao} de ${controleAmostra8SemSituacao} (${((controleAmostra8ComSituacao / controleAmostra8SemSituacao) * 100).toFixed(1)}% ativos)\n`);

  console.log("--- Filtro completo (29 municípios + CNAE 45/46/47 + situação ativa) ---");
  console.log(`Estabelecimentos aprovados neste arquivo: ${filtroCompleto}\n`);

  console.log(`--- Amostra de ${amostrasFiltroCompleto.length} linhas aprovadas (conferir acentuação) ---`);
  for (const a of amostrasFiltroCompleto) {
    console.log(`  CNPJ ${a.cnpj} · município ${a.municipio} · CNAE ${a.cnae} · ${a.fantasia || "(sem fantasia)"} · ${a.endereco}`);
  }

  if (controleAmostra8SemSituacao !== CONTAGEM_CONTROLE_ESPERADA) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
