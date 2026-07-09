import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type PapelUsuario } from "./supabase";
import type { Database } from "./database.types";

type Perfil = Database["public"]["Tables"]["perfis"]["Row"];

type AuthContextValue = {
  session: Session | null;
  perfil: Perfil | null;
  role: PapelUsuario | null;
  /** true enquanto resolve a sessão inicial ou carrega o perfil. */
  carregando: boolean;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function carregarPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Não vaza detalhe técnico; o RoleGate trata ausência de perfil.
    console.error("Falha ao carregar perfil:", error.message);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function sincroniza(s: Session | null) {
      if (!ativo) return;
      setSession(s);
      if (s?.user) {
        const p = await carregarPerfil(s.user.id);
        if (ativo) setPerfil(p);
      } else {
        setPerfil(null);
      }
      if (ativo) setCarregando(false);
    }

    supabase.auth.getSession().then(({ data }) => sincroniza(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setCarregando(true);
      void sincroniza(s);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      perfil,
      role: perfil?.role ?? null,
      carregando,
      async signIn(email, senha) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, perfil, carregando],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
