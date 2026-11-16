// Validação REAL de arquivo: pela assinatura (magic bytes), nunca pelo Content-Type nem pela extensão
// declarados pelo cliente. Extensão e MIME finais vêm do que foi DETECTADO.

export type TipoArquivo = "pdf" | "doc" | "docx" | "jpg" | "png" | "mp4";

export const MIME: Record<TipoArquivo, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
};

export const LIMITE_ARQUIVO = 5 * 1024 * 1024;
export const LIMITE_TOTAL = 20 * 1024 * 1024;

function comeca(b: Uint8Array, ...bytes: number[]): boolean {
  return b.length >= bytes.length && bytes.every((x, i) => b[i] === x);
}

/** Detecta o tipo pela assinatura. Devolve null se não reconhecido. */
export function detectarTipo(b: Uint8Array): TipoArquivo | null {
  if (comeca(b, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (comeca(b, 0xff, 0xd8, 0xff)) return "jpg";
  if (comeca(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (comeca(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "doc"; // OLE2
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "mp4"; // ....ftyp
  if (comeca(b, 0x50, 0x4b, 0x03, 0x04)) {
    // ZIP: só vale como DOCX se parecer pacote OOXML de Word nos primeiros KB.
    const cab = new TextDecoder("latin1").decode(b.subarray(0, Math.min(b.length, 4096)));
    if (cab.includes("[Content_Types].xml") || cab.includes("word/")) return "docx";
  }
  return null;
}

/** Nome seguro para anexo: sem caminho, sem controle/cabeçalho, extensão = tipo detectado. */
export function sanitizarNome(nomeOriginal: string, tipo: TipoArquivo, indice = 1): string {
  let base = nomeOriginal.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  base = base.split(/[\\/]/).pop() ?? "";
  base = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  base = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+/, "").replace(/[._-]+$/, "").replace(/_+/g, "_").slice(0, 60);
  if (!base) base = `arquivo_${indice}`;
  return `${base}.${tipo}`;
}

export interface ArquivoValidado {
  nome: string;
  tipo: TipoArquivo;
  contentType: string;
  conteudo: Uint8Array;
}

export interface ResultadoArquivos {
  arquivos: ArquivoValidado[];
  erro?: string;
}

/** Valida os Files de um campo. Não lança; devolve a mensagem amigável do primeiro problema. */
export async function validarArquivos(
  files: File[],
  opcoes: { permitidos: TipoArquivo[]; max: number },
): Promise<ResultadoArquivos> {
  // Campo de arquivo não preenchido chega como File vazio sem nome: ignora.
  const lista = files.filter((f) => f.size > 0 || f.name);
  if (lista.length > opcoes.max) {
    return { arquivos: [], erro: opcoes.max === 1 ? "Envie apenas um arquivo." : `Envie no máximo ${opcoes.max} arquivos.` };
  }
  const saida: ArquivoValidado[] = [];
  let total = 0;
  let i = 0;
  for (const f of lista) {
    i++;
    if (f.size === 0) return { arquivos: [], erro: "O arquivo enviado está vazio." };
    if (f.size > LIMITE_ARQUIVO) return { arquivos: [], erro: "Cada arquivo deve ter no máximo 5 MB." };
    total += f.size;
    if (total > LIMITE_TOTAL) return { arquivos: [], erro: "O total dos arquivos excede 20 MB." };
    const conteudo = new Uint8Array(await f.arrayBuffer());
    const tipo = detectarTipo(conteudo);
    if (!tipo || !opcoes.permitidos.includes(tipo)) {
      return { arquivos: [], erro: `Formato não aceito. Use: ${opcoes.permitidos.join(", ").toUpperCase()}.` };
    }
    saida.push({ nome: sanitizarNome(f.name, tipo, i), tipo, contentType: MIME[tipo], conteudo });
  }
  return { arquivos: saida };
}
