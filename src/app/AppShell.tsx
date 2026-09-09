import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV, type NavItem } from "./nav";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/features/notificacoes/NotificationBell";
import { useNotificacoesRealtime } from "@/features/notificacoes/api";
import { useContagemRemessasAbertas } from "@/features/remessas/api";
import { useContagemCadastrosPendentes } from "@/features/aprovacoes/api";
import { useContagemFilaAdminPendente } from "@/features/fila-admin/api";
import { OfflineBanner } from "@/components/shared/OfflineBanner";

const GRUPOS: Array<{ id: NavItem["grupo"]; titulo: string }> = [
  { id: "principal", titulo: "" },
  { id: "financeiro", titulo: "Financeiro" },
  { id: "campanhas", titulo: "Campanhas" },
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

/**
 * Marcador de quantidade das abas — o MESMO do sino de notificações
 * (`NotificationBell`), de propósito: dois marcadores com desenhos diferentes
 * na mesma tela ensinariam que eles significam coisas diferentes. Aqui ele é
 * embutido na linha em vez de sobreposto ao ícone, porque a linha do menu tem
 * largura e o ícone do cabeçalho não tem.
 */
function Marcador({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-realce px-1.5 text-xs font-bold text-white"
      aria-label={`${n} ${n === 1 ? "pendência" : "pendências"}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppShell() {
  const { perfil, role, signOut } = useAuth();
  const itens = NAV.filter((i) => role && i.roles.includes(role));
  useNotificacoesRealtime();

  /**
   * Cada contagem só é buscada por quem tem a aba — `enabled` recebe a MESMA
   * matriz de papéis do `NAV`. Sem isso, o parceiro dispararia uma consulta a
   * `remessas_dados` que a RLS zera (§2.6b: view/RLS não recusa, ZERA), e nós
   * gastaríamos requisição para desenhar um marcador que nunca aparece.
   */
  const podeVer = (path: string) => itens.some((i) => i.path === path);
  const remessasAbertas = useContagemRemessasAbertas(podeVer("/remessas"));
  const cadastrosPendentes = useContagemCadastrosPendentes(podeVer("/aprovacoes"));
  const filaAdminPendente = useContagemFilaAdminPendente(podeVer("/fila-admin"));

  const contagemPorRota: Record<string, number | undefined> = {
    "/remessas": remessasAbertas.data,
    "/aprovacoes": cadastrosPendentes.data,
    "/fila-admin": filaAdminPendente.data,
  };

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
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <Marcador n={contagemPorRota[item.path]} />
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

        <OfflineBanner />

        {/* `print:*` libera a folha da guia das restrições de layout da tela
            (padding, scroll interno) — ver /servicos/:id/guia. */}
        <main className="flex-1 overflow-auto p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
