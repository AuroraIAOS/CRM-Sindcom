import { z } from "zod";

/** Espelha parceiros (sql/01_schema.sql §7). CNPJ é opcional (nem todo
 *  parceiro do convênio é PJ formal — ver check no schema: null ou 14
 *  dígitos). `status` é texto livre no banco; a UI oferece um conjunto fixo
 *  (ativo/suspenso/encerrado) para manter consistência com o StatusBadge. */
export const parceiroSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  segmento: z.string().trim().optional(),
  cnpj: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos")
    .optional()
    .or(z.literal("")),
  contato_nome: z.string().trim().optional(),
  contato_email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  contato_whatsapp: z.string().trim().optional(),
  data_inicio_contrato: z.string().trim().optional().or(z.literal("")),
  data_fim_contrato: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["ativo", "suspenso", "encerrado"]),
  observacoes: z.string().trim().optional(),
});

export type ParceiroFormValues = z.infer<typeof parceiroSchema>;

/** Edição de recepcionista existente — o PIN nunca aparece aqui, só em
 *  "Definir PIN" (pinSchema), que fala com fn_definir_pin_recepcionista. */
export const recepcionistaSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  ativo: z.boolean(),
});

export type RecepcionistaFormValues = z.infer<typeof recepcionistaSchema>;

/** Criação: exige o PIN inicial (fn_criar_recepcionista grava já com hash). */
export const novoRecepcionistaSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN deve ter de 4 a 6 dígitos"),
});

export type NovoRecepcionistaFormValues = z.infer<typeof novoRecepcionistaSchema>;

/** Redefinição de PIN de um recepcionista já existente. */
export const pinSchema = z
  .object({
    pin: z.string().regex(/^\d{4,6}$/, "PIN deve ter de 4 a 6 dígitos"),
    confirmarPin: z.string(),
  })
  .refine((v) => v.pin === v.confirmarPin, {
    message: "Os PINs não conferem",
    path: ["confirmarPin"],
  });

export type PinFormValues = z.infer<typeof pinSchema>;
