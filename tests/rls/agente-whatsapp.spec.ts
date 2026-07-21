import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAnon, ehErroRls, loginComo, type Role } from "./helpers";

/**
 * Subetapa 03.4 — `fn_consulta_nivel_bloqueio` (RPC do agente WhatsApp).
 *
 * O ESCOPO DESTE ARQUIVO É DELIBERADAMENTE NEGATIVO: provar que NENHUM papel
 * do app (incluindo Admin) consegue chamar a função pela sessão normal do
 * frontend — só quem detém a `service_role` pode.
 *
 * Por quê: a função é `security definer` e devolve dado de QUALQUER
 * trabalhador por CPF, sem filtro de RLS nenhum (é o ponto — o agente
 * precisa achar qualquer titular pelo CPF que a pessoa digitar no
 * WhatsApp). Não há tabela nem política que limite isso; o único portão é
 * o GRANT (sql/14_agente_whatsapp.sql: revoke de public/anon/authenticated,
 * só postgres+service_role ficam com EXECUTE — conferido também em
 * orientacoes.md §2.6c: quem CONCEDE é o grant, a guarda interna não
 * substitui isso). Se um dia alguém "destravar" isso achando que o Admin
 * precisa, este teste quebra imediatamente.
 *
 * A lógica de negócio (CPF normalizado, "não encontrado" vs encontrado,
 * bloqueio por tipo de fatura) foi validada manualmente via SQL direto
 * (equivalente a rodar como o dono da função) antes deste arquivo — não dá
 * para exercitá-la aqui porque, por design, NENHUM client deste harness
 * (anon key + login) tem permissão para chamar a função. A service_role real
 * só existe no cofre do n8n de Maxwell, fora deste repositório.
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

beforeAll(async () => {
  for (const papel of PAPEIS) clientes[papel] = (await loginComo(papel)).client;
}, 60_000);

afterAll(async () => {
  for (const papel of PAPEIS) await clientes[papel]?.auth.signOut();
});

describe("03.4 · fn_consulta_nivel_bloqueio — só service_role, nunca a sessão do app", () => {
  it.each(PAPEIS)("%s é negado (42501) mesmo com CPF válido", async (papel) => {
    const { error, data } = await clientes[papel].rpc("fn_consulta_nivel_bloqueio", {
      p_cpf: "33333333333", // CPF real de demonstração — se vazasse, vazaria de verdade
    });
    expect(ehErroRls(error)).toBe(true);
    expect(data).toBeNull();
  });

  it("anon também é negado", async () => {
    const client = clienteAnon();
    const { error, data } = await client.rpc("fn_consulta_nivel_bloqueio", {
      p_cpf: "33333333333",
    });
    expect(ehErroRls(error)).toBe(true);
    expect(data).toBeNull();
  });
});
