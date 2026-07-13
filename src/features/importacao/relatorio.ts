import { exportarCsv } from "@/lib/csv";
import type { LinhaPreview } from "./parsers";

/**
 * Download do CSV de rejeitadas com a coluna extra `motivo_rejeicao`
 * (specs/importacao.md §7) — mesmas colunas do arquivo original, prontas
 * para corrigir e reenviar.
 */
export function baixarRejeitadas<T>(entidade: string, preview: LinhaPreview<T>[]): void {
  const rejeitadas = preview.filter((l) => l.status === "rejeitada");
  if (rejeitadas.length === 0) return;
  const colunasOriginais = Object.keys(rejeitadas[0].bruta);
  exportarCsv(
    `rejeitadas_${entidade}`,
    rejeitadas,
    [
      ...colunasOriginais.map((c) => ({
        titulo: c,
        valor: (l: LinhaPreview<T>) => l.bruta[c],
      })),
      { titulo: "motivo_rejeicao", valor: (l: LinhaPreview<T>) => l.mensagens.join(" | ") },
    ],
  );
}
