import { cn } from "@/lib/utils";

type Tom = "sucesso" | "alerta" | "erro" | "neutro";

const TOM_CLASSE: Record<Tom, string> = {
  sucesso: "bg-estado-sucesso/10 text-estado-sucesso",
  alerta: "bg-estado-alerta/10 text-estado-alerta",
  erro: "bg-estado-erro/10 text-estado-erro",
  neutro: "bg-estado-neutro/10 text-estado-neutro",
};

/**
 * Mapa central de status → rótulo + tom. Cobre os enums de status usados na
 * Fase 1 (status_cadastro, status_solicitacao, status_solicitacao_admin).
 * Fonte de cor: design-tokens §7 (estados semânticos). Um status desconhecido
 * cai em "neutro" com o próprio texto — nunca quebra a tela.
 */
const MAPA: Record<string, { label: string; tom: Tom }> = {
  // status_cadastro
  pendente: { label: "Pendente", tom: "alerta" },
  aprovado: { label: "Aprovado", tom: "sucesso" },
  rejeitado: { label: "Rejeitado", tom: "erro" },
  inativo: { label: "Inativo", tom: "neutro" },
  // status_solicitacao_admin
  aprovada: { label: "Aprovada", tom: "sucesso" },
  rejeitada: { label: "Rejeitada", tom: "erro" },
  cancelada: { label: "Cancelada", tom: "neutro" },
  // status_solicitacao (serviço)
  solicitada: { label: "Solicitada", tom: "alerta" },
  pendente_confirmacao: { label: "Pendente de confirmação", tom: "alerta" },
  executada: { label: "Executada", tom: "sucesso" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const info = MAPA[status] ?? { label: status, tom: "neutro" as Tom };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        TOM_CLASSE[info.tom],
        className,
      )}
    >
      {info.label}
    </span>
  );
}
