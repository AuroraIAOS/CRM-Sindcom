import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config isolada dos testes (não carrega o plugin PWA do vite.config).
// A suíte RLS fala direto com o Supabase via supabase-js (anon key + login),
// exercitando o caminho JWT real. Sem paralelismo entre arquivos para não
// embaralhar sessões/limpezas no banco compartilhado.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    // Autentica os 5 papéis UMA vez por execução (ver tests/rls/globalSetup.ts):
    // sem isso, o rate limit de auth do Supabase derruba a suíte com sintoma
    // idêntico ao de RLS quebrada.
    globalSetup: ["./tests/rls/globalSetup.ts"],
    globals: false,
  },
});
