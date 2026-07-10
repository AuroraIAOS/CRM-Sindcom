/**
 * Validação de dígito verificador de CPF/CNPJ.
 *
 * O banco só garante o formato (`cpf ~ '^\d{11}$'`); a validação de DV é
 * regra do frontend/importação (specs/importacao.md §3.3/§3.4). Reutilizado
 * tanto pelos formulários de cadastro quanto pelo pipeline de importação CSV.
 */

/** Remove tudo que não é dígito. */
export function apenasDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Valida o dígito verificador de um CPF (aceita com ou sem máscara). */
export function cpfValido(entrada: string): boolean {
  const cpf = apenasDigitos(entrada);
  if (cpf.length !== 11) return false;
  // Rejeita sequências repetidas (00000000000, 11111111111, …).
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digitos = cpf.split("").map(Number);
  for (let j = 9; j <= 10; j++) {
    let soma = 0;
    for (let i = 0; i < j; i++) {
      soma += digitos[i] * (j + 1 - i);
    }
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== digitos[j]) return false;
  }
  return true;
}

/** Valida o dígito verificador de um CNPJ (aceita com ou sem máscara). */
export function cnpjValido(entrada: string): boolean {
  const cnpj = apenasDigitos(entrada);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digitos = cnpj.split("").map(Number);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calc = (pesos: number[]): number => {
    const soma = pesos.reduce((acc, peso, i) => acc + digitos[i] * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calc(pesos1) === digitos[12] && calc(pesos2) === digitos[13];
}

/** Validador de e-mail leve (warning na importação, não bloqueante). */
export function emailValido(entrada: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((entrada ?? "").trim());
}
