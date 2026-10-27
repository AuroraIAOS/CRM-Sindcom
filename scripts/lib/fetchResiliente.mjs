// ============================================================================
// CRM SINDCOM — scripts/lib/fetchResiliente.mjs
//
// (a) PROBLEMA, medido em 2026-09-10 durante a higienização da Onda 01.
// Depois de uma varredura pesada (768 consultas DNS + várias leituras), os
// scripts passaram a abortar logo no login:
//
//     ConnectTimeoutError: Connect Timeout Error
//       (attempted addresses: 172.64.149.246:443, 104.18.38.10:443, timeout: 10000ms)
//     ABORTADO: login de Admin falhou — fetch failed
//
// A leitura natural é "a borda do Supabase bloqueou" (§2.6e). **Errada, e a
// medição mostrou por quê:** o mesmo endpoint respondia — só que devagar.
//
//     node fetch -> 401 em 13.279 ms
//     curl       -> 401 em  9.452 ms
//
// Os dois CHEGARAM. O que difere é o teto: o `undici` do Node usa **10 s de
// timeout de CONEXÃO** por padrão, e o `curl` não. Com a borda em ~13 s, o Node
// desiste e o curl passa — o que faz o mesmo host parecer "bloqueado para o
// script e liberado para o terminal", que é uma conclusão errada e cara.
//
// (b) SOLUÇÃO. Um `fetch` que repete erro TRANSITÓRIO de rede com espera
// crescente. Não repete erro de aplicação (401, 403, 429): esses são resposta,
// não falha de transporte, e repeti-los esconderia problema real.
//
// (c) COMO USAR:
//     import { fetchResiliente } from "./lib/fetchResiliente.mjs";
//     createClient(URL, ANON, { global: { fetch: fetchResiliente } });
// ============================================================================

/** Erros de TRANSPORTE que valem repetir. Timeout de conexão é o desta história;
 *  os demais são a mesma classe (a requisição não chegou a ser respondida). */
const TRANSITORIOS = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const TENTATIVAS = 5;
const ESPERA_BASE_MS = 2000;

export async function fetchResiliente(entrada, opcoes) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      return await fetch(entrada, opcoes);
    } catch (e) {
      const codigo = e?.cause?.code ?? e?.code;
      if (!TRANSITORIOS.has(codigo) || tentativa === TENTATIVAS) throw e;
      ultimoErro = e;
      const espera = ESPERA_BASE_MS * tentativa; // 2s, 4s, 6s, 8s
      process.stderr.write(`\n  ⟳ rede instável (${codigo}); tentativa ${tentativa}/${TENTATIVAS}, aguardando ${espera / 1000}s\n`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimoErro;
}
