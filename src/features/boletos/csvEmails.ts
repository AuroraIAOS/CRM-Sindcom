import { gerarCsv, type ColunaCsv } from "@/lib/csv";

export type LinhaEmail = {
  nome: string;
  email: string;
  link: string;
  convencoes: string;
  nCnpj: number;
};

const COLUNAS: ColunaCsv<LinhaEmail>[] = [
  { titulo: "nome", valor: (l) => l.nome },
  { titulo: "email", valor: (l) => l.email },
  { titulo: "link", valor: (l) => l.link },
  { titulo: "convencoes", valor: (l) => l.convencoes },
  { titulo: "n_cnpj", valor: (l) => l.nCnpj },
];

/** CSV da lista de e-mails para a Brevo. Neutraliza fórmula via lib/csv.ts. */
export function gerarCsvEmails(linhas: LinhaEmail[]): string {
  return gerarCsv(linhas, COLUNAS);
}
