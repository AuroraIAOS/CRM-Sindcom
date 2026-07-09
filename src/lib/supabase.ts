import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios (.env). " +
      "Somente a anon key vai no frontend — service_role nunca.",
  );
}

/** Cliente único do app (anon key). Componentes não usam isto direto — as
 *  queries vivem em features/<domínio>/api.ts como hooks TanStack Query. */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Papéis da aplicação (espelham o enum papel_usuario do banco). */
export type PapelUsuario = Database["public"]["Enums"]["papel_usuario"];
