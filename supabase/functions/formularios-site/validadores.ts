// Validadores puros (sem I/O). Testados em tests/validadores.test.ts.

export function apenasDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** Normaliza NFC, remove caracteres de controle (multilinha preserva \n) e apara. */
export function limparTexto(v: string, multilinha = false): string {
  let s = v.normalize("NFC");
  s = multilinha
    ? s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, "")
    : s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ");
  return s.trim();
}

export function validarCpf(entrada: string): boolean {
  const d = apenasDigitos(entrada);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

/** CNPJ numérico ou alfanumérico (vigente desde jul/2026). Devolve a forma normalizada ou null. */
export function normalizarCnpj(entrada: string): string | null {
  const s = entrada.toUpperCase().replace(/[.\-\/\s]/g, "");
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s)) return null;
  if (/^(.)\1{13}$/.test(s)) return null;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const dv = (base: string) => {
    let p = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += val(base[i]) * p;
      p = p === 9 ? 2 : p + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(s.slice(0, 12));
  const d2 = dv(s.slice(0, 12) + d1);
  return s.endsWith(`${d1}${d2}`) ? s : null;
}

export function validarCnpj(entrada: string): boolean {
  return normalizarCnpj(entrada) !== null;
}

/** Telefone BR (fixo 10 ou celular 11 dígitos, com ou sem +55). Devolve só dígitos (sem 55) ou null. */
export function normalizarTelefone(entrada: string): string | null {
  let d = apenasDigitos(entrada);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  if (d.length === 10 && d[2] === "0") return null;
  if (d.length === 10 && d[2] === "1") return null;
  return d;
}

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function validarEmail(entrada: string): boolean {
  return entrada.length <= 254 && !/[\s<>,;"]/.test(entrada) && EMAIL_RE.test(entrada);
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function validarUf(v: string): boolean {
  return UFS.includes(v.toUpperCase());
}

/** Interpreta checkbox/booleano vindo de multipart. */
export function interpretarBooleano(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return ["true", "on", "1", "sim", "yes", "s"].includes(v.trim().toLowerCase());
}
