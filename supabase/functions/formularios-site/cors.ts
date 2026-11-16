// CORS restrito às origens do site. Configurável por SITE_ORIGENS (lista separada por vírgula).

export const ORIGENS_PADRAO = [
  "https://sindcompassos.org",
  "https://www.sindcompassos.org",
  "https://novo.sindcompassos.org",
  "http://localhost:8099",
];

export function origensPermitidas(env: (k: string) => string | undefined): string[] {
  const cru = env("SITE_ORIGENS");
  if (!cru || !cru.trim()) return ORIGENS_PADRAO;
  return cru.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

export function origemPermitida(origem: string | null, permitidas: string[]): boolean {
  return !!origem && permitidas.includes(origem);
}

/** Cabeçalhos CORS só para origem permitida; para as demais, apenas Vary (o navegador bloqueia). */
export function cabecalhosCors(origem: string | null, permitidas: string[]): Record<string, string> {
  const base: Record<string, string> = { "Vary": "Origin" };
  if (origemPermitida(origem, permitidas)) {
    base["Access-Control-Allow-Origin"] = origem!;
    base["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    base["Access-Control-Allow-Headers"] = "Content-Type";
    base["Access-Control-Max-Age"] = "600";
  }
  return base;
}
