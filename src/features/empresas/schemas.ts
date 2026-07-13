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
