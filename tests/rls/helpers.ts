import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Credenciais dos 5 usuários de teste (arquivo gitignored).
config({ path: ".env.test" });

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SENHA = process.env.TEST_USER_PASSWORD;

export type Role = "admin" | "presidente" | "secretaria" | "juridico" | "parceiro";
export type Ator = Role | "anon";

const EMAILS: Record<Role, string | undefined> = {
  admin: process.env.TEST_ADMIN_EMAIL,
  presidente: process.env.TEST_PRESIDENTE_EMAIL,
  secretaria: process.env.TEST_SECRETARIA_EMAIL,
  juridico: process.env.TEST_JURIDICO_EMAIL,
  parceiro: process.env.TEST_PARCEIRO_EMAIL,
};

function novoCliente(): SupabaseClient {
  if (!URL || !ANON) {
    throw new Error(
      "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env.test",
    );
  }
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clienteAnon(): SupabaseClient {
  return novoCliente();
}

/** Faz login como o papel e devolve um cliente autenticado + o uid. */
export async function loginComo(role: Role): Promise<{ client: SupabaseClient; uid: string }> {
  const email = EMAILS[role];
  if (!email) throw new Error(`E-mail do papel "${role}" ausente no .env.test`);
  if (!SENHA) throw new Error("TEST_USER_PASSWORD ausente no .env.test");

  const client = novoCliente();
  const { data, error } = await client.auth.signInWithPassword({ email, password: SENHA });
  if (error || !data.user) {
    // Falha de credencial → o chamador deve PARAR e perguntar (não inventar).
    throw new Error(`FALHA_CREDENCIAL: login de "${role}" (${email}) falhou: ${error?.message}`);
  }
  return { client, uid: data.user.id };
}

// --- Asserções de RLS -------------------------------------------------------

type ErroSupabase = { code?: string | null; message?: string | null } | null;

/** Erro de RLS/permissão (negado): SQLSTATE 42501 ou mensagem equivalente. */
export function ehErroRls(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  return code === "42501" || /row-level security|permission denied|not authorized/i.test(msg);
}

const CODIGOS_CONSTRAINT = new Set(["23502", "23503", "23514", "23505"]);

/** Erro de constraint/trigger (RLS PASSOU, falhou depois nos dados). */
export function ehErroConstraintOuTrigger(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  // P0001 = raise exception de trigger de negócio (também significa "passou o RLS")
  return CODIGOS_CONSTRAINT.has(code) || code === "P0001";
}
