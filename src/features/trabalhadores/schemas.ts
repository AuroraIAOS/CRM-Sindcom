import { z } from "zod";
import { cpfValido } from "@/lib/validators";

/**
 * Espelha trabalhadores (cadastro central). `nivel` NÃO entra — é coluna
 * gerada no banco a partir das duas flags. A regra `chk_convenio_exige_
 * contribuicao` do banco vira um refine aqui (mensalidade exige contribuição).
 */
export const trabalhadorSchema = z
  .object({
    cpf: z.string().refine(cpfValido, "CPF inválido"),
    nome: z.string().trim().min(1, "Nome obrigatório"),
    data_nascimento: z.string().optional(),
    telefone_whatsapp: z.string().trim().optional(),
    email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
    municipio_id: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
      z.number().optional(),
    ),
    recolhe_contribuicao_sindical: z.boolean().default(true),
    recolhe_mensalidade_convenio: z.boolean().default(false),
    forma_pagamento_preferida: z.enum(["holerite", "boleto_direto"]).default("holerite"),
  })
  .refine((v) => !(v.recolhe_mensalidade_convenio && !v.recolhe_contribuicao_sindical), {
    message: "A mensalidade do convênio exige que o trabalhador recolha a contribuição sindical.",
    path: ["recolhe_mensalidade_convenio"],
  });

export type TrabalhadorFormValues = z.infer<typeof trabalhadorSchema>;

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

/** Espelha o enum parentesco_beneficiado do banco (sql/08_parentesco_enum.sql). */
export const PARENTESCO_OPCOES = [
  "progenitor/a",
  "irmão/a",
  "filho/a",
  "sogro/a",
  "enteado/a",
  "independentes",
  "cônjuge",
] as const;

/** Espelha beneficiados (cpf único, DV validado no front — igual a trabalhadores). */
export const beneficiadoSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  cpf: z.string().refine(cpfValido, "CPF inválido"),
  data_nascimento: z.string().optional(),
  parentesco: z.enum(PARENTESCO_OPCOES).optional(),
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
