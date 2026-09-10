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
import { limparCachePersistido } from "./queryClient";

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
    // Qual usuário já teve o perfil resolvido. É a chave da correção abaixo:
    // distingue "mudou quem está logado" (login/logout — precisa recarregar e
    // pode mostrar a tela de carregando) de "o mesmo usuário de sempre, só com
    // token novo" (nada a recarregar, nada a desmontar).
    let usuarioResolvido: string | null = null;
    let jaResolveuUmaVez = false;

    async function sincroniza(s: Session | null) {
      if (!ativo) return;
      setSession(s);
      const idAtual = s?.user?.id ?? null;

      if (jaResolveuUmaVez && idAtual === usuarioResolvido) {
        // Só o token mudou. Buscar o perfil de novo custaria uma requisição e,
        // pior, manteria `carregando` ligado durante ela.
        if (ativo) setCarregando(false);
        return;
      }

      usuarioResolvido = idAtual;
      if (idAtual) {
        const p = await carregarPerfil(idAtual);
        if (!ativo) return;
        setPerfil(p);
      } else {
        setPerfil(null);
      }
      // Só aqui, e não antes do `await`: `getSession()` e o primeiro evento do
      // listener correm juntos na abertura do app. Marcar antes deixaria o
      // segundo a chegar cair no atalho acima e desligar `carregando` com o
      // perfil ainda em voo — e a tela "sem perfil" piscaria no meio do login.
      jaResolveuUmaVez = true;
      if (ativo) setCarregando(false);
    }

    supabase.auth.getSession().then(({ data }) => sincroniza(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      // NÃO ligar `carregando` para todo evento de auth (defeito medido na
      // Subetapa 9.2). O supabase-js reage ao `visibilitychange` da aba: ao
      // voltar de outra aba ele chama `_recoverAndRefresh()` e, se o token
      // estiver dentro da margem de 90s do vencimento, emite `TOKEN_REFRESHED`
      // — e o ticker de auto-refresh emite o mesmo evento uma vez por hora com
      // a aba aberta. Como `RoleGate` devolve <TelaCarregando/> NO LUGAR dos
      // children enquanto `carregando` é true, a árvore inteira desmontava e
      // remontava: o formulário que o operador estava preenchendo voltava em
      // branco, com a aparência exata de um F5. Só a troca de USUÁRIO justifica
      // esconder a tela.
      const mudouUsuario = (s?.user?.id ?? null) !== usuarioResolvido;
      if (mudouUsuario || !jaResolveuUmaVez) setCarregando(true);
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
        // Num computador compartilhado, o cache offline de quem saiu não
        // pode sobreviver para o próximo login (Subetapa 03.3).
        await limparCachePersistido();
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
