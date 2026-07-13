/**
 * Normalização e tipos compartilhados do pipeline de importação
 * (specs/importacao.md). Parse/validação rodam no navegador; a gravação é
 * feita direto do frontend com a sessão do Admin (decisão de escopo da
 * subetapa 01.5 — sem Edge Function nesta rodada).
 */
import Papa from "papaparse";
import { apenasDigitos } from "@/lib/validators";

export type StatusLinha = "inserir" | "atualizar" | "aviso" | "rejeitada";

export type LinhaPreview<T> = {
  linha: number; // 1-based, contando o cabeçalho como linha 0
  status: StatusLinha;
  mensagens: string[]; // motivos de rejeição/aviso, uma ou mais
  dados: T | null; // payload normalizado — null quando rejeitada sem dados úteis
  bruta: Record<string, string>; // linha original, para o CSV de rejeitadas
};

/** "" / undefined → null (colunas opcionais do banco). */
export function vazioParaNull(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

export function paraBooleano(v: string | undefined | null, padrao: boolean): boolean {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return padrao;
  return ["sim", "1", "true", "verdadeiro"].includes(s);
}

/**
 * Normaliza um identificador numérico (CPF/CNPJ) para `tamanho` dígitos.
 * Sinaliza `zeroComido` quando a string tinha 1 dígito a menos que o
 * esperado — indício clássico do Excel convertendo "01234567" em número
 * (specs/importacao.md §6).
 */
export function normalizarIdentificador(
  v: string | undefined | null,
  tamanho: number,
): { valor: string; zeroComido: boolean } {
  const digitos = apenasDigitos(v ?? "");
  const zeroComido = digitos.length === tamanho - 1;
  const valor = zeroComido ? digitos.padStart(tamanho, "0") : digitos;
  return { valor, zeroComido };
}

/** Normaliza cabeçalhos para comparação tolerante (maiúsculas, sem acento, trim). */
export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export type ParseResultado = {
  cabecalhos: string[];
  linhas: Record<string, string>[];
};

export type MapaColunas = Record<string, string | undefined>;

/**
 * Casa os cabeçalhos reais do arquivo (em qualquer variação de acento/caixa)
 * com os "campos lógicos" que cada importador espera, tentando cada alias em
 * ordem. Base para o "diff das colunas esperadas × encontradas" quando um
 * campo obrigatório não é achado (specs/importacao.md §4 — cabeçalho não
 * reconhecido aborta antes do preview).
 */
export function construirMapaColunas(
  cabecalhosReais: string[],
  candidatosPorCampo: Record<string, string[]>,
): MapaColunas {
  const normalizados = cabecalhosReais.map((h) => ({ real: h, norm: normalizarCabecalho(h) }));
  const mapa: MapaColunas = {};
  for (const [campo, candidatos] of Object.entries(candidatosPorCampo)) {
    const candidatosNorm = candidatos.map(normalizarCabecalho);
    const achado = normalizados.find((h) => candidatosNorm.includes(h.norm));
    mapa[campo] = achado?.real;
  }
  return mapa;
}

/** Lê um campo lógico de uma linha bruta, usando o mapa de colunas. */
export function campo(bruta: Record<string, string>, mapa: MapaColunas, campoLogico: string): string {
  const real = mapa[campoLogico];
  return real ? (bruta[real] ?? "").trim() : "";
}

/**
 * Lê o arquivo como texto tentando UTF-8; se a decodificação parecer
 * corrompida (padrão clássico de mojibake Latin-1 lido como UTF-8, ex.
 * "Ã§Ã£o"), refaz como ISO-8859-1 (specs/importacao.md §3: "detecção e
 * fallback Latin-1, comum em exports da Receita").
 */
async function lerTextoComFallback(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const pareceCorrompido = /�|Ã[-¿]|Â[-¿]/.test(utf8);
  if (!pareceCorrompido) return utf8;
  return new TextDecoder("iso-8859-1").decode(buffer);
}

/** Parse com papaparse (delimitador `;`, cabeçalho na 1ª linha). */
export async function parseCsv(arquivo: File): Promise<ParseResultado> {
  const texto = await lerTextoComFallback(arquivo);
  const resultado = Papa.parse<Record<string, string>>(texto, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const cabecalhos = resultado.meta.fields ?? [];
  return { cabecalhos, linhas: resultado.data };
}

/**
 * Remove duplicatas por chave, mantendo a ÚLTIMA ocorrência — evita o erro
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" do Postgres
 * quando o mesmo CPF/CNPJ aparece 2x no arquivo dentro do mesmo lote de upsert.
 */
export function dedupPorChave<T>(itens: T[], chave: (item: T) => string): T[] {
  const porChave = new Map<string, T>();
  for (const item of itens) porChave.set(chave(item), item);
  return Array.from(porChave.values());
}

/** true quando ≥5% das linhas têm um aviso de zero restaurado — dispara o
 *  banner de "Excel comeu o zero à esquerda" acima da tabela de preview. */
export function temAvisoZeroComido<T>(preview: LinhaPreview<T>[]): boolean {
  if (preview.length === 0) return false;
  const comAviso = preview.filter((l) => l.mensagens.some((m) => m.includes("zero à esquerda"))).length;
  return comAviso / preview.length >= 0.05;
}

export function contarPorStatus<T>(preview: LinhaPreview<T>[]) {
  return {
    total: preview.length,
    inserir: preview.filter((l) => l.status === "inserir").length,
    atualizar: preview.filter((l) => l.status === "atualizar").length,
    avisos: preview.filter((l) => l.status === "aviso").length,
    rejeitadas: preview.filter((l) => l.status === "rejeitada").length,
  };
}
