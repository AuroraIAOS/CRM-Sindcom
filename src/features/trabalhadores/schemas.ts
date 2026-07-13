import { z } from "zod";
import { cpfValido } from "@/lib/validators";

/** Espelha vinculos_empregaticios (chk_datas_vinculo, ux_vinculo_principal_ativo). */
export const vinculoSchema = z
  .object({
    estabelecimento_id: z.string().uuid("Selecione um estabelecimento"),
    funcao: z.string().trim().optional(),
    data_admissao: z.string().optional(),
    data_desligamento: z.string().optional(),
    salario_informado: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
      z.number().positive("Deve ser maior que zero").optional(),
    ),
    principal: z.boolean().default(true),
  })
  .refine(
    (v) => !v.data_desligamento || !v.data_admissao || v.data_desligamento >= v.data_admissao,
    { message: "Data de desligamento não pode ser antes da admissão", path: ["data_desligamento"] },
  );

export type VinculoFormValues = z.infer<typeof vinculoSchema>;

/** Espelha beneficiados (cpf único, DV validado no front — igual a trabalhadores). */
export const beneficiadoSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  cpf: z.string().refine(cpfValido, "CPF inválido"),
  data_nascimento: z.string().optional(),
  parentesco: z.string().trim().optional(),
  tipo: z.enum(["direto", "indireto", "adicional"], { required_error: "Selecione o tipo" }),
});

export type BeneficiadoFormValues = z.infer<typeof beneficiadoSchema>;

/** Espelha cartas_oposicao (unique trabalhador_id+ano_base). */
export const cartaSchema = z.object({
  ano_base: z.coerce.number().int().min(2000).max(2100),
  data_entrega: z.string().min(1, "Informe a data de entrega"),
  forma: z.enum(["presencial", "email", "correio", "outro"], {
    required_error: "Selecione a forma de entrega",
  }),
  comprovante_url: z.string().trim().optional(),
});

export type CartaFormValues = z.infer<typeof cartaSchema>;
