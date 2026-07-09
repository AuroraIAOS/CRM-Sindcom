import { defineConfig } from "vitest/config";

// Config isolada dos testes (não carrega o plugin PWA do vite.config).
// A suíte RLS fala direto com o Supabase via supabase-js (anon key + login),
// exercitando o caminho JWT real. Sem paralelismo entre arquivos para não
// embaralhar sessões/limpezas no banco compartilhado.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    globals: false,
  },
});
