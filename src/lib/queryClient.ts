import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

/**
 * Cliente único do TanStack Query + persistência em IndexedDB (Subetapa
 * 03.3, frontend.md §6: "Offline de leitura: TanStack Query + persister em
 * IndexedDB. Dashboard e listas recentes abrem com o último snapshot").
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "Sem mutações offline no v1" (frontend.md §6) — como isso é garantido:
 *
 * `networkMode: 'always'` nas mutations é deliberado e é o OPOSTO do que
 * parece intuitivo. O default do TanStack ('online') faria uma mutação
 * disparada offline ficar PAUSADA — sem erro, sem sucesso — e disparar
 * sozinha quando a conexão voltasse, minutos depois, sem o usuário
 * confirmar de novo. Isso é exatamente o "conflito desproporcional ao
 * ganho" que a spec descarta (aprovações e status mudando sozinhos). Com
 * 'always', a mutação TENTA na hora, falha rápido com erro de rede, e
 * `mensagemErro()` (lib/mensagens.ts) traduz para uma mensagem clara —
 * nunca fica pendurada esperando reconexão.
 *
 * Consequência: nenhuma mutation fica com `isPaused: true`, então não há
 * nada para o persister "resumir" — reforçado ainda assim por
 * `shouldDehydrateMutation: () => false` na config de persistência (nunca
 * grava mutation nenhuma no IndexedDB, mesmo que uma exceção futura use
 * outro networkMode).
 *
 * Queries continuam com o `networkMode` default ('online'): offline, elas
 * pausam o fetch e mantêm o último dado em cache visível — é exatamente a
 * leitura offline que a subetapa pede.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { networkMode: "always" },
  },
});

// idb-keyval já devolve Promises e aceita valores estruturados (não-string)
// — sem precisar de JSON.stringify, ao contrário do persister de localStorage.
const storage = {
  getItem: async (key: string) => (await get(key)) ?? null,
  setItem: (key: string, value: unknown) => set(key, value),
  removeItem: (key: string) => del(key),
};

export const persister = createAsyncStoragePersister({
  storage,
  key: "sindcom-cache-v1",
});

/**
 * `buster` funciona como versão do formato do cache: mudar este valor
 * invalida todo cache persistido nos navegadores dos usuários no próximo
 * deploy — usar quando uma mudança de schema tornar o cache antigo
 * incompatível com o que o app espera ler.
 */
export const PERSIST_BUSTER = "2026-07-21";

/** 24h — dado offline "velho demais" para confiar é descartado, não servido
 *  como se fosse atual. */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * Limpa o cache em memória E o persistido no IndexedDB. Chamado no logout
 * (lib/auth.tsx) — sem isso, num computador compartilhado (a sede do
 * Sindcom tem mais de um usuário interno), o próximo login no mesmo
 * navegador herdaria o cache offline de quem saiu, com dados de uma sessão
 * RLS diferente da sua.
 */
export async function limparCachePersistido() {
  queryClient.clear();
  await persister.removeClient();
}
