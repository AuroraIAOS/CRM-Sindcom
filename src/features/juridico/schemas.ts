import { z } from "zod";

/**
 * Espelha `atendimentos_juridicos` (sql/01_schema.sql §13 + sql/16_juridico.sql).
 *
 * O que NÃO é validado aqui, de propósito: o gate dos Direitos Individuais
 * (Bronze só pode 'orientacao'; inadimplente na contribuição fica bloqueado).
 * Essa regra é do trigger `fn_valida_atendimento_juridico` — o formulário
 * ANTECIPA o aviso na tela para não desperdiçar o clique do usuário, mas quem
 * decide é o Postgres. Duplicar a regra no zod criaria duas fontes de verdade.
 */
export const atendimentoSchema = z.object({
  trabalhador_id: z.string().uuid("Selecione o trabalhador"),
  data: z.string().min(1, "Informe a data do atendimento"),
  tipo: z.enum(["orientacao", "homologacao", "processo", "outro"], {
    required_error: "Selecione o tipo de atendimento",
  }),
  resumo: z.string().trim().optional(),
  status: z.enum(["aberto", "em_andamento", "concluido", "arquivado"]).default("aberto"),
});

export type AtendimentoFormValues = z.infer<typeof atendimentoSchema>;

/** Edição: o trabalhador não muda (atendimento errado se corrige excluindo e
 *  recriando — trocar o titular de um atendimento já registrado reescreveria
 *  o histórico jurídico de duas pessoas de uma vez). */
export const edicaoAtendimentoSchema = atendimentoSchema.omit({ trabalhador_id: true });

export type EdicaoAtendimentoFormValues = z.infer<typeof edicaoAtendimentoSchema>;
