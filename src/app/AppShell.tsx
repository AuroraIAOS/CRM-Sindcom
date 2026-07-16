import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV, type NavItem } from "./nav";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/features/notificacoes/NotificationBell";
import { useNotificacoesRealtime } from "@/features/notificacoes/api";

const GRUPOS: Array<{ id: NavItem["grupo"]; titulo: string }> = [
  { id: "principal", titulo: "" },
  { id: "financeiro", titulo: "Financeiro" },
  { id: "administracao", titulo: "Administração" },
  { id: "portal", titulo: "Portal do parceiro" },
];

const ROTULO_ROLE: Record<string, string> = {
  admin: "Administrador",
  presidente: "Presidente",
  secretaria: "Secretaria",
  juridico: "Jurídico",
  parceiro: "Parceiro",
};

export function AppShell() {
  const { perfil, role, signOut } = useAuth();
  const itens = NAV.filter((i) => role && i.roles.includes(role));
  useNotificacoesRealtime();

  return (
    <div className="grid min-h-full grid-cols-[260px_1fr] print:block">
      <aside className="flex flex-col gap-4 border-r border-black/10 bg-fundo-2 p-4 print:hidden">
        <img
          src="/assets/brand/logo_horizontal_colorido.png"
          alt="Sindcom"
          className="mb-2 max-w-[180px]"
        />
        <nav className="flex flex-col gap-4 overflow-y-auto">
          {GRUPOS.map(({ id, titulo }) => {
            const doGrupo = itens.filter((i) => i.grupo === id);
            if (doGrupo.length === 0) return null;
            return (
              <div key={id} className="flex flex-col gap-1">
                {titulo && (
                  <span className="px-2 text-xs font-bold uppercase tracking-wide text-texto-2">
                    {titulo}
                  </span>
                )}
                {doGrupo.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-texto-1 transition-colors hover:bg-black/5",
                        isActive && "bg-realce/10 font-bold text-realce",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between border-b border-black/10 bg-white px-6 py-3 print:hidden">
          <div className="text-sm text-texto-2">
            {perfil?.nome}
            {role && (
              <span className="ml-2 rounded bg-black/5 px-2 py-0.5 text-xs">
                {ROTULO_ROLE[role] ?? role}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-2 text-sm text-texto-2 hover:text-realce"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </header>

        {/* `print:*` libera a folha da guia das restrições de layout da tela
            (padding, scroll interno) — ver /servicos/:id/guia. */}
        <main className="flex-1 overflow-auto p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
