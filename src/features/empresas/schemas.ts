import { z } from "zod";

/** Espelha empresas — campos identidade (Receita) ficam fora do form, só os
 *  editáveis por Denise/Admin entram aqui. */
export const empresaSchema = z.object({
  razao_social: z.string().trim().min(1, "Razão social obrigatória"),
  porte: z.string().trim().optional(),
  capital_social: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().nonnegative("Não pode ser negativo").optional(),
  ),
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;

/** Espelha estabelecimentos — subconjunto editável (contato, endereço,
 *  município, vínculo com CCT). Identidade Receita (CNPJ, CNAE, situação
 *  cadastral) é somente leitura nesta subetapa. */
export const estabelecimentoSchema = z.object({
  nome_fantasia: z.string().trim().optional(),
  tipo_logradouro: z.string().trim().optional(),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cep: z.string().trim().optional(),
  municipio_id: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().optional(),
  ),
  ddd_1: z.string().trim().optional(),
  telefone_1: z.string().trim().optional(),
  ddd_2: z.string().trim().optional(),
  telefone_2: z.string().trim().optional(),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  convencao_id: z.string().uuid().optional().or(z.literal("")),
});

export type EstabelecimentoFormValues = z.infer<typeof estabelecimentoSchema>;

/** Criação (Tarefa 04.3) — admin-only por RLS. CNPJ básico é a PK; ordem/DV
 *  identificam o estabelecimento dentro da empresa (mesma convenção da Receita
 *  usada em `sql/01_schema.sql`: cnpj_completo = basico || ordem || dv). */
export const novaEmpresaSchema = z.object({
  cnpj_basico: z.string().regex(/^\d{8}$/, "CNPJ básico deve ter 8 dígitos"),
  razao_social: z.string().trim().min(1, "Razão social obrigatória"),
  porte: z.string().trim().optional(),
});

export type NovaEmpresaFormValues = z.infer<typeof novaEmpresaSchema>;

export const novoEstabelecimentoSchema = estabelecimentoSchema.extend({
  cnpj_ordem: z.string().regex(/^\d{4}$/, "Deve ter 4 dígitos (ex.: 0001)"),
  cnpj_dv: z.string().regex(/^\d{2}$/, "Deve ter 2 dígitos"),
});

export type NovoEstabelecimentoFormValues = z.infer<typeof novoEstabelecimentoSchema>;
