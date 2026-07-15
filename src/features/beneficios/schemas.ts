import { z } from "zod";

const valorOpcional = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
  z.number().nonnegative("Não pode ser negativo").optional(),
);

/** Checagem valor_convenio ≤ valor_particular — espelha chk_valores_beneficio
 *  (sql/01_schema.sql §9). Compartilhada pelas duas variantes do schema. */
function valoresCoerentes(v: { valor_particular?: number; valor_convenio?: number }) {
  return (
    v.valor_convenio === undefined ||
    v.valor_particular === undefined ||
    v.valor_convenio <= v.valor_particular
  );
}
const MSG_VALORES = {
  message: "O valor do convênio não pode ser maior que o valor particular",
  path: ["valor_convenio"],
};

const beneficioBase = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório"),
  descricao: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
  valor_particular: valorOpcional,
  valor_convenio: valorOpcional,
  nivel_minimo: z.enum(["bronze", "prata", "ouro"]),
  condicoes: z.string().trim().optional(),
  ativo: z.boolean(),
});

/** Espelha beneficios — usado no cadastro/edição dentro da aba "Benefícios"
 *  do parceiro (parceiro_id já é conhecido pelo contexto). `nivel_minimo` é o
 *  gate de acesso (bronze < prata < ouro), a mesma ordem de
 *  `fn_valida_solicitacao`. */
export const beneficioSchema = beneficioBase.refine(valoresCoerentes, MSG_VALORES);
export type BeneficioFormValues = z.infer<typeof beneficioSchema>;

/** Variante da tela transversal `/beneficios`, onde o parceiro precisa ser
 *  escolhido no próprio formulário. */
export const beneficioComParceiroSchema = beneficioBase
  .extend({ parceiro_id: z.string().uuid("Selecione um parceiro") })
  .refine(valoresCoerentes, MSG_VALORES);
export type BeneficioComParceiroFormValues = z.infer<typeof beneficioComParceiroSchema>;
