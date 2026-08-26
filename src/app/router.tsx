import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { NAV, homeDoRole } from "./nav";
import { useAuth } from "@/lib/auth";
import { Placeholder } from "@/components/shared/Placeholder";
import { LoginPage } from "@/features/auth/LoginPage";
import { RecuperarSenhaPage } from "@/features/auth/RecuperarSenhaPage";
import { GuiaPublicaPage } from "@/features/servicos/GuiaPublicaPage";
import { EnviarDadosPage } from "@/features/coleta/EnviarDadosPage";
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
import { PortalFilaPage } from "@/features/portal-parceiro/PortalFilaPage";
import { PortalBeneficiosPage } from "@/features/portal-parceiro/PortalBeneficiosPage";
import { PortalRecepcionistasPage } from "@/features/portal-parceiro/PortalRecepcionistasPage";
import { ListaFaturasPage } from "@/features/financeiro/ListaFaturasPage";
import { ListaGuiasPage } from "@/features/financeiro/ListaGuiasPage";
import { ConfiguracoesPage } from "@/features/configuracoes/ConfiguracoesPage";
import { ListaAtendimentosPage } from "@/features/juridico/ListaAtendimentosPage";
import { ListaCartasPage } from "@/features/cartas/ListaCartasPage";
import type { PapelUsuario } from "@/lib/supabase";

/**
 * Telas reais já implementadas, por rota — o restante do NAV/ROTAS_DETALHE
 * segue como Placeholder até a subetapa correspondente as substituir.
 */
/**
 * O dashboard carrega sob demanda: Recharts + Leaflet somam ~900 kB, e quem
 * abre `/trabalhadores` ou o `/portal` não deve pagar por eles. O chunk
 * continua entrando no precache do PWA, então o offline da 03.3 não perde
 * nada — só deixa de bloquear o primeiro carregamento das demais telas.
 */
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

function CarregandoTela() {
  return (
    <div className="flex h-64 items-center justify-center text-texto-2">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
    </div>
  );
}

const PAGINAS: Partial<Record<string, ReactNode>> = {
  "/dashboard": (
    <Suspense fallback={<CarregandoTela />}>
      <DashboardPage />
    </Suspense>
  ),
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
  "/portal": <PortalFilaPage />,
  "/portal/beneficios": <PortalBeneficiosPage />,
  "/portal/recepcionistas": <PortalRecepcionistasPage />,
  "/financeiro/faturas": <ListaFaturasPage />,
  "/financeiro/guias": <ListaGuiasPage />,
  "/configuracoes": <ConfiguracoesPage />,
  "/juridico": <ListaAtendimentosPage />,
  "/cartas": <ListaCartasPage />,
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
    // Rota pública da coleta externa (ETAPA 08): fora do AppShell e fora do
    // RoleGate, como a guia do QR. O token é a credencial; não há sessão.
    { path: "/enviar-dados/:token", element: <EnviarDadosPage /> },
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
