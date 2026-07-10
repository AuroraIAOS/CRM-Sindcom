/**
 * Formatação e mascaramento para exibição (PT-BR).
 *
 * - Máscaras de CPF/CNPJ e datas DD/MM/AAAA para telas e exportação.
 * - `mascararCpf`/`mascararCnpj` alimentam a exportação "mascarada (divulgação)"
 *   de specs/importacao.md §8 (segura para compartilhamento externo).
 */
import { apenasDigitos } from "./validators";

/** 12345678901 → 123.456.789-01 (deixa cru se não tiver 11 dígitos). */
export function formatarCpf(valor: string | null | undefined): string {
  const cpf = apenasDigitos(valor ?? "");
  if (cpf.length !== 11) return valor ?? "";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/** 11222333000181 → 11.222.333/0001-81 (deixa cru se não tiver 14 dígitos). */
export function formatarCnpj(valor: string | null | undefined): string {
  const cnpj = apenasDigitos(valor ?? "");
  if (cnpj.length !== 14) return valor ?? "";
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** Mascara CPF para divulgação: ***.456.789-** */
export function mascararCpf(valor: string | null | undefined): string {
  const cpf = apenasDigitos(valor ?? "");
  if (cpf.length !== 11) return "";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/** Mascara CNPJ para divulgação: **.***.333/0001-** */
export function mascararCnpj(valor: string | null | undefined): string {
  const cnpj = apenasDigitos(valor ?? "");
  if (cnpj.length !== 14) return "";
  return `**.***.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-**`;
}

/** ISO (AAAA-MM-DD ou timestamptz) → DD/MM/AAAA. Vazio → "". */
export function formatarDataBR(valor: string | null | undefined): string {
  if (!valor) return "";
  // Aceita "2026-07-10" e "2026-07-10T13:00:00Z" sem sofrer com fuso.
  const iso = valor.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return valor;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Converte data em formatos aceitos pela importação (AAAAMMDD / AAAA-MM-DD /
 * DD/MM/AAAA) para ISO AAAA-MM-DD. Retorna null se não reconhecer.
 */
export function parseDataFlexivel(entrada: string | null | undefined): string | null {
  const s = (entrada ?? "").trim();
  if (!s) return null;

  let ano: string, mes: string, dia: string;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    [, ano, mes, dia] = m;
  } else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    [, ano, mes, dia] = m;
  } else if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) {
    [, dia, mes, ano] = m;
  } else {
    return null;
  }

  const d = Number(dia), mo = Number(mes);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

const MOEDA_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** number | string → "R$ 1.234,56". Vazio/inválido → "". */
export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(n)) return "";
  return MOEDA_BRL.format(n);
}
