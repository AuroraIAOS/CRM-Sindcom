import { z } from "zod";

/**
 * Faturas excepcionais (frontend.md §2.2): os 3 tipos que a Secretária cria
 * na mão — `contribuicao_sindical`/`mensalidade_convenio` são exclusivos da
 * engine automática (Subetapa 02.6, `fn_gerar_faturas_*`), daí o enum aqui
 * não incluí-los (comentário do próprio `tipo_fatura` em sql/01_schema.sql:
 * "3 últimos: guias excepcionais (Secretaria)").
 */
export const faturaExcepcionalSchema = z.object({
  trabalhador_id: z.string().uuid("Selecione um trabalhador"),
  tipo: z.enum(["multa", "acordo", "taxa_adicional"]),
  competencia: z.string().min(1, "Informe a competência"),
  valor: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().positive("Valor deve ser maior que zero"),
  ),
  forma_cobranca: z.enum(["holerite", "boleto_direto"]),
  data_vencimento: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

export type FaturaExcepcionalFormValues = z.infer<typeof faturaExcepcionalSchema>;
