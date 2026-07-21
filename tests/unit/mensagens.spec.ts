import { afterEach, describe, expect, it, vi } from "vitest";
import { mensagemErro } from "@/lib/mensagens";

/**
 * Subetapa 03.3 — a tradução de erro de rede é o que garante que uma
 * mutation offline (networkMode: 'always', lib/queryClient.ts) falhe com
 * mensagem clara em vez do texto técnico do navegador ("Failed to fetch").
 * Isolado aqui porque não dá para simular rede real dentro do vitest
 * (environment: "node") contra o Supabase de verdade — mas a função em si é
 * pura e determinística, então o comportamento fica coberto sem precisar de
 * um navegador.
 */

function comNavigatorOnLine(valor: boolean, fn: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: valor },
    configurable: true,
  });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
}

describe("mensagemErro — sem conexão", () => {
  afterEach(() => vi.restoreAllMocks());

  it("navigator.onLine === false vence qualquer outra interpretação do erro", () => {
    comNavigatorOnLine(false, () => {
      // Mesmo um erro que pareceria SQLSTATE de permissão — offline manda.
      const msg = mensagemErro({ code: "42501", message: "permission denied" });
      expect(msg).toMatch(/sem conexão/i);
    });
  });

  it("reconhece o texto de falha de rede dos três navegadores mesmo com onLine indefinido", () => {
    comNavigatorOnLine(true, () => {
      expect(mensagemErro({ message: "Failed to fetch" })).toMatch(/sem conexão/i);
      expect(mensagemErro({ message: "NetworkError when attempting to fetch resource" })).toMatch(
        /sem conexão/i,
      );
      expect(mensagemErro({ message: "Load failed" })).toMatch(/sem conexão/i);
    });
  });

  it("online, com erro de negócio normal, não deve mencionar rede", () => {
    comNavigatorOnLine(true, () => {
      const msg = mensagemErro({ code: "23505", message: "duplicate key" });
      expect(msg).not.toMatch(/conexão|rede/i);
      expect(msg).toMatch(/duplicidade/i);
    });
  });
});
