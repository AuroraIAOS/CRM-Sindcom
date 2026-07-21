import { z } from "zod";

/**
 * Edição de um parâmetro (`configuracoes.valor`). As duas chaves atuais
 * (`dias_alerta_carta`, `dias_vencimento_boleto` — sql/04_dashboard.sql §A)
 * são contagens de dias consumidas por `fn_config()::int` em SQL, então a
 * validação aqui espelha essa constraint: inteiro positivo, sem o front
 * aceitar algo que o banco só rejeitaria depois no cast.
 */
export const configuracaoSchema = z.object({
  valor: z
    .string()
    .trim()
    .regex(/^\d+$/, "Deve ser um número inteiro positivo")
    .refine((v) => Number(v) > 0, "Deve ser maior que zero"),
});

export type ConfiguracaoFormValues = z.infer<typeof configuracaoSchema>;

const PAPEIS = ["admin", "presidente", "secretaria", "juridico", "parceiro"] as const;

/**
 * Edição de perfil existente. Espelha o `chk_parceiro_exige_vinculo` do
 * schema (sql/01_schema.sql §6): role = 'parceiro' exige parceiro_id.
 * NÃO cobre criação de login novo — isso exige `auth.users`, que a anon key
 * não pode escrever (CLAUDE.md: service_role nunca no frontend). Ver nota na
 * página.
 */
export const perfilSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome obrigatório"),
    role: z.enum(PAPEIS),
    parceiro_id: z.string().uuid().optional().or(z.literal("")),
    ativo: z.boolean(),
  })
  .refine((v) => v.role !== "parceiro" || v.parceiro_id, {
    message: "Papel Parceiro exige um parceiro vinculado",
    path: ["parceiro_id"],
  });

export type PerfilFormValues = z.infer<typeof perfilSchema>;
