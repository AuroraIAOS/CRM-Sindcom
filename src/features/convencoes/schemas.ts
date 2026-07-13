import { z } from "zod";

/** Espelha convencoes_coletivas. */
export const convencaoSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome obrigatório"),
    ano_base: z.coerce.number().int().min(2000).max(2100),
    data_inicio_vigencia: z.string().min(1, "Informe o início da vigência"),
    data_fim_vigencia: z.string().optional(),
    data_limite_oposicao: z.string().optional(),
    documento_url: z.string().trim().optional(),
    observacoes: z.string().trim().optional(),
  })
  .refine(
    (v) => !v.data_fim_vigencia || v.data_fim_vigencia >= v.data_inicio_vigencia,
    { message: "Fim da vigência não pode ser antes do início", path: ["data_fim_vigencia"] },
  );

export type ConvencaoFormValues = z.infer<typeof convencaoSchema>;

/** Espelha pisos_convencao (funcao vazio = piso geral da categoria). */
export const pisoSchema = z.object({
  funcao: z.string().trim().optional(),
  valor: z.coerce.number().positive("Deve ser maior que zero"),
});

export type PisoFormValues = z.infer<typeof pisoSchema>;

/** Espelha taxas_convencao. */
export const taxaSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  valor: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().nonnegative().optional(),
  ),
  observacoes: z.string().trim().optional(),
});

export type TaxaFormValues = z.infer<typeof taxaSchema>;
