import { Navigate, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { homeDoRole, podeAcessar } from "./nav";
import type { PapelUsuario } from "@/lib/supabase";

function TelaCarregando() {
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-texto-2">
      Carregando…
    </div>
  );
}

function SemPerfil({ onSair }: { onSair: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Acesso sem perfil</h1>
      <p className="max-w-md text-texto-2">
        Sua conta está autenticada, mas não há um perfil ativo vinculado. Fale
        com o administrador do sistema.
      </p>
      <button
        onClick={onSair}
        className="rounded-md border border-realce px-4 py-2 text-sm font-bold text-realce"
      >
        Sair
      </button>
    </div>
  );
}

/**
 * Guard de rota E de elemento.
 * - Rota: envolve o elemento; sem sessão → /login; sem acesso → home do papel.
 * - Elemento: <RoleGate roles={['admin']}>...</RoleGate> esconde/mostra trechos.
 */
export function RoleGate({
  roles,
  children,
  /** Como elemento inline, não redireciona: apenas oculta se não tiver acesso. */
  inline = false,
}: {
  roles?: PapelUsuario[];
  children: ReactNode;
  inline?: boolean;
}) {
  const { session, perfil, role, carregando, signOut } = useAuth();
  const location = useLocation();

  if (carregando) return inline ? null : <TelaCarregando />;

  if (!session) {
    if (inline) return null;
    return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  }

  if (!perfil || !perfil.ativo) {
    if (inline) return null;
    return <SemPerfil onSair={() => void signOut()} />;
  }

  if (roles && !podeAcessar(role, roles)) {
    if (inline) return null;
    return <RedirecionaSemAcesso destino={homeDoRole(role)} />;
  }

  return <>{children}</>;
}

/** Redireciona para a home do papel e avisa que o acesso foi negado. */
function RedirecionaSemAcesso({ destino }: { destino: string }) {
  useEffect(() => {
    toast.error("Acesso negado", {
      description: "Você não tem permissão para acessar esta página.",
    });
  }, []);
  return <Navigate to={destino} replace />;
}
