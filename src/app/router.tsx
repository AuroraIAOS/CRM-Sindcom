import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { NAV, homeDoRole } from "./nav";
import { useAuth } from "@/lib/auth";
import { Placeholder } from "@/components/shared/Placeholder";
import { LoginPage } from "@/features/auth/LoginPage";
import { RecuperarSenhaPage } from "@/features/auth/RecuperarSenhaPage";
import { GuiaPublicaPage } from "@/features/servicos/GuiaPublicaPage";
import { ListaTrabalhadoresPage } from "@/features/trabalhadores/ListaTrabalhadoresPage";
import { FichaTrabalhadorPage } from "@/features/trabalhadores/FichaTrabalhadorPage";
import { ListaEmpresasPage } from "@/features/empresas/ListaEmpresasPage";
import { ConvencoesPage } from "@/features/convencoes/ConvencoesPage";
import { FilaAdminPage } from "@/features/fila-admin/FilaAdminPage";
import { AprovacoesPage } from "@/features/aprovacoes/AprovacoesPage";
import { ImportacaoPage } from "@/features/importacao/ImportacaoPage";
import { NotificacoesPage } from "@/features/notificacoes/NotificacoesPage";
import { ListaParceirosPage } from "@/features/parceiros/ListaParceirosPage";
import { ListaBeneficiosPage } from "@/features/beneficios/ListaBeneficiosPage";
import { DetalheBeneficioPage } from "@/features/beneficios/DetalheBeneficioPage";
import { ListaServicosPage } from "@/features/servicos/ListaServicosPage";
import { DetalheServicoPage } from "@/features/servicos/DetalheServicoPage";
import { GuiaPrint } from "@/features/servicos/GuiaPrint";
import type { PapelUsuario } from "@/lib/supabase";

/**
 * Telas reais já implementadas, por rota — o restante do NAV/ROTAS_DETALHE
 * segue como Placeholder até a subetapa correspondente as substituir.
 */
const PAGINAS: Partial<Record<string, ReactNode>> = {
  "/trabalhadores": <ListaTrabalhadoresPage />,
  "/empresas": <ListaEmpresasPage />,
  "/convencoes": <ConvencoesPage />,
  "/fila-admin": <FilaAdminPage />,
  "/aprovacoes": <AprovacoesPage />,
  "/importacao": <ImportacaoPage />,
  "/notificacoes": <NotificacoesPage />,
  "/parceiros": <ListaParceirosPage />,
  "/beneficios": <ListaBeneficiosPage />,
  "/servicos": <ListaServicosPage />,
};
const PAGINAS_DETALHE: Partial<Record<string, ReactNode>> = {
  "/trabalhadores/:id": <FichaTrabalhadorPage />,
  "/beneficios/:id": <DetalheBeneficioPage />,
  "/servicos/:id": <DetalheServicoPage />,
  "/servicos/:id/guia": <GuiaPrint />,
};

const INTERNOS: PapelUsuario[] = ["admin", "presidente", "secretaria", "juridico"];
const GESTAO: PapelUsuario[] = ["admin", "presidente", "secretaria"];

function IndexRedirect() {
  const { role } = useAuth();
  return <Navigate to={homeDoRole(role)} replace />;
}

// Rotas de detalhe (não aparecem no menu, mas seguem a mesma matriz de papéis).
const ROTAS_DETALHE: Array<{ path: string; roles: PapelUsuario[]; titulo: string }> = [
  { path: "/trabalhadores/:id", roles: INTERNOS, titulo: "Ficha do trabalhador" },
  { path: "/beneficios/:id", roles: GESTAO, titulo: "Detalhe do benefício" },
  { path: "/servicos/:id", roles: GESTAO, titulo: "Detalhe da solicitação" },
  { path: "/servicos/:id/guia", roles: ["admin", "secretaria"], titulo: "Guia de encaminhamento" },
];

export const router = createBrowserRouter(
  [
    { path: "/login", element: <LoginPage /> },
    { path: "/recuperar-senha", element: <RecuperarSenhaPage /> },
    { path: "/guia/:token", element: <GuiaPublicaPage /> },
    {
      // Área interna: exige sessão + perfil ativo (RoleGate sem roles).
      element: (
        <RoleGate>
          <AppShell />
        </RoleGate>
      ),
      children: [
        { index: true, element: <IndexRedirect /> },
        ...NAV.map((item) => ({
          path: item.path,
          element: (
            <RoleGate roles={item.roles}>
              {PAGINAS[item.path] ?? <Placeholder titulo={item.label} />}
            </RoleGate>
          ),
        })),
        ...ROTAS_DETALHE.map((r) => ({
          path: r.path,
          element: (
            <RoleGate roles={r.roles}>
              {PAGINAS_DETALHE[r.path] ?? <Placeholder titulo={r.titulo} />}
            </RoleGate>
          ),
        })),
      ],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  // BASE_URL vem do --base do Vite (ex.: /preview-usabilidade-01/ nos builds
  // de preview isolado); em produção é "/" — zero mudança de comportamento.
  { basename: import.meta.env.BASE_URL },
);
