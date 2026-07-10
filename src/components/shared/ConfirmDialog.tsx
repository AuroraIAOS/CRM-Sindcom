import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Diálogo de confirmação reaproveitável para ações sensíveis (exclusão, baixa,
 * aprovação). Controlado pelo chamador via `open`/`onOpenChange`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destrutivo = false,
  carregando = false,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao?: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  destrutivo?: boolean;
  carregando?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={carregando}
          >
            {textoCancelar}
          </Button>
          <Button
            variant={destrutivo ? "destructive" : "default"}
            onClick={onConfirmar}
            disabled={carregando}
          >
            {carregando ? "Processando…" : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
