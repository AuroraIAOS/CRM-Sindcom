import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Inbox,
  Building2,
  ScrollText,
  Handshake,
  Gift,
  ConciergeBell,
  Receipt,
  Banknote,
  FileText,
  Scale,
  Upload,
  FileSpreadsheet,
  BarChart3,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { PapelUsuario } from "@/lib/supabase";

export type NavItem = {
  path: string;
  label: string;
  roles: PapelUsuario[];
  icon: LucideIcon;
  grupo: "principal" | "financeiro" | "administracao" | "portal";
};

const TODOS_INTERNOS: PapelUsuario[] = ["admin", "presidente", "secretaria", "juridico"];

/**
 * Fonte única da navegação (frontend.md §2). O AppShell renderiza apenas os
 * itens cujo `roles` inclui o papel do usuário; o RoleGate reforça no acesso.
 */
export const NAV: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", roles: TODOS_INTERNOS, icon: LayoutDashboard, grupo: "principal" },
  { path: "/trabalhadores", label: "Trabalhadores", roles: TODOS_INTERNOS, icon: Users, grupo: "principal" },
  { path: "/empresas", label: "Empresas", roles: TODOS_INTERNOS, icon: Building2, grupo: "principal" },
  { path: "/convencoes", label: "Convenções", roles: TODOS_INTERNOS, icon: ScrollText, grupo: "principal" },
  { path: "/cartas", label: "Cartas de oposição", roles: TODOS_INTERNOS, icon: FileText, grupo: "principal" },
  { path: "/juridico", label: "Jurídico", roles: TODOS_INTERNOS, icon: Scale, grupo: "principal" },

  { path: "/parceiros", label: "Parceiros", roles: ["admin", "presidente", "secretaria"], icon: Handshake, grupo: "principal" },
  { path: "/beneficios", label: "Benefícios", roles: ["admin", "presidente", "secretaria"], icon: Gift, grupo: "principal" },
  { path: "/servicos", label: "Solicitações", roles: ["admin", "presidente", "secretaria"], icon: ConciergeBell, grupo: "principal" },

  { path: "/financeiro/faturas", label: "Faturas", roles: ["admin", "presidente", "secretaria"], icon: Receipt, grupo: "financeiro" },
  { path: "/financeiro/guias", label: "Guias de pagamento", roles: ["admin", "presidente", "secretaria"], icon: Banknote, grupo: "financeiro" },

  { path: "/aprovacoes", label: "Aprovações", roles: ["admin", "secretaria"], icon: ClipboardCheck, grupo: "administracao" },
  { path: "/fila-admin", label: "Fila do Admin", roles: ["admin", "presidente", "secretaria", "juridico", "parceiro"], icon: Inbox, grupo: "administracao" },
  { path: "/importacao", label: "Importação", roles: ["admin"], icon: Upload, grupo: "administracao" },
  // ETAPA 08: a fila de revisão da coleta externa. Secretaria entra porque é
  // a Denise quem revisa — Admin também, mas a tela é do dia a dia dela.
  { path: "/remessas", label: "Remessas recebidas", roles: ["admin", "secretaria"], icon: FileSpreadsheet, grupo: "administracao" },
  // ETAPA 08 (08.11): quais contabilidades ainda não mandaram, e o que falta
  // em cada uma. Presidente entra como leitura (mesmo recorte de quem lê
  // `envios_campanha` hoje); só Admin revoga token, controlado na própria tela.
  { path: "/cobertura", label: "Cobertura da coleta", roles: ["admin", "presidente", "secretaria"], icon: BarChart3, grupo: "administracao" },
  { path: "/notificacoes", label: "Notificações", roles: ["admin", "presidente", "secretaria", "juridico", "parceiro"], icon: Bell, grupo: "administracao" },
  { path: "/configuracoes", label: "Configurações", roles: ["admin"], icon: Settings, grupo: "administracao" },

  { path: "/portal", label: "Fila do parceiro", roles: ["parceiro"], icon: Inbox, grupo: "portal" },
  { path: "/portal/beneficios", label: "Meus benefícios", roles: ["parceiro"], icon: Gift, grupo: "portal" },
  { path: "/portal/recepcionistas", label: "Meus recepcionistas", roles: ["parceiro"], icon: Users, grupo: "portal" },
];

/** Rota inicial pós-login por papel (frontend.md §2.2). */
export function homeDoRole(role: PapelUsuario | null): string {
  if (role === "parceiro") return "/portal";
  if (role === "juridico") return "/juridico";
  return "/dashboard";
}

export function podeAcessar(role: PapelUsuario | null, roles: PapelUsuario[]): boolean {
  return role !== null && roles.includes(role);
}
