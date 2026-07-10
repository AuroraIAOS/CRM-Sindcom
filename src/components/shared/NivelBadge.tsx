import { cn } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type Nivel = Database["public"]["Enums"]["nivel_protecao"];

const ESTILOS: Record<Nivel, { label: string; classe: string }> = {
  bronze: { label: "Bronze", classe: "bg-nivel-bronze-bg text-nivel-bronze-fg" },
  prata: { label: "Prata", classe: "bg-nivel-prata-bg text-nivel-prata-fg" },
  ouro: { label: "Ouro", classe: "bg-nivel-ouro-bg text-nivel-ouro-fg" },
};

/**
 * Selo do nível de proteção (Bronze/Prata/Ouro). Cores em design-tokens §7.
 * O nível é coluna gerada no banco — este componente apenas exibe, nunca decide.
 */
export function NivelBadge({ nivel, className }: { nivel: Nivel; className?: string }) {
  const { label, classe } = ESTILOS[nivel];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        classe,
        className,
      )}
    >
      {label}
    </span>
  );
}
