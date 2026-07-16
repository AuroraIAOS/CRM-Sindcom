import { z } from "zod";

/**
 * Espelha `solicitacoes_servico` (sql/01_schema.sql §9) — o "carrinho" que vira
 * guia de encaminhamento, distinto de `beneficios` (catálogo/oferta).
 *
 * O que NÃO está aqui é deliberado: `valor_particular`/`valor_convenio` são
 * snapshot da emissão feito pelo trigger `fn_valida_solicitacao` a partir do
 * benefício escolhido — preço nunca vem do formulário. `numero_guia` e
 * `token_publico` são gerados pelo banco.
 *
 * As regras de nível mínimo e de bloqueio por inadimplência também vivem no
 * trigger; o formulário apenas as antecipa para reduzir atrito (frontend.md
 * §2.2), sem jamais ser a fonte da verdade.
 */
export const solicitacaoSchema = z.object({
  trabalhador_id: z.string().uuid("Selecione um trabalhador"),
  /** Vazio = solicitação para o próprio titular. */
  beneficiado_id: z.string().uuid().optional(),
  parceiro_id: z.string().uuid("Selecione um parceiro"),
  beneficio_id: z.string().uuid("Selecione um benefício"),
  data_agendada: z.string().min(1, "Informe a data agendada"),
  horario: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

export type SolicitacaoFormValues = z.infer<typeof solicitacaoSchema>;
