import { Download, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Barra de ações em massa (Tarefa 01) — some quando `count === 0`. Cada tela
 * passa só as ações que fazem sentido para aquela entidade (ex.: Empresas não
 * passa `onExcluir`, pois a exclusão em massa é restrita a Trabalhadores).
 */
export function BulkActionsBar({
  count,
  onBaixar,
  onAtribuir,
  onExcluir,
}: {
  count: number;
  onBaixar?: () => void;
  onAtribuir?: () => void;
  onExcluir?: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-realce/30 bg-realce/5 px-4 py-2">
      <span className="text-sm font-semibold text-texto-1">
        {count} selecionado{count > 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex gap-2">
        {onBaixar && (
          <Button variant="outline" size="sm" onClick={onBaixar}>
            <Download className="mr-1 h-4 w-4" /> Baixar
          </Button>
        )}
        {onAtribuir && (
          <Button variant="outline" size="sm" onClick={onAtribuir}>
            <Pencil className="mr-1 h-4 w-4" /> Atribuir
          </Button>
        )}
        {onExcluir && (
          <Button variant="destructive" size="sm" onClick={onExcluir}>
            <Trash2 className="mr-1 h-4 w-4" /> Deletar
          </Button>
        )}
      </div>
    </div>
  );
}
