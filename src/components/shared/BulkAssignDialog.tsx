import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { mensagemErro } from "@/lib/mensagens";

export type CampoAtribuicaoLote =
  | { name: string; label: string; tipo: "text" }
  | { name: string; label: string; tipo: "number" }
  | { name: string; label: string; tipo: "select"; opcoes: { value: string; label: string }[] };

/**
 * Popup genérico de "Atribuir em massa" (Tarefa 01.2). Só os campos
 * efetivamente preenchidos pelo usuário são enviados ao `onConfirmar` — os
 * demais registros selecionados não têm esses campos tocados. Segunda etapa
 * via `ConfirmDialog` é obrigatória antes de disparar a mutation.
 */
export function BulkAssignDialog({
  open,
  onOpenChange,
  titulo,
  count,
  campos,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  count: number;
  campos: CampoAtribuicaoLote[];
  onConfirmar: (valoresPreenchidos: Record<string, string>) => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function handleChange(name: string, v: string) {
    setValores((prev) => ({ ...prev, [name]: v }));
  }

  const preenchidos = Object.fromEntries(
    Object.entries(valores).filter(([, v]) => v !== "" && v !== undefined),
  );
  const podeContinuar = Object.keys(preenchidos).length > 0;

  function fechar() {
    setValores({});
    setErro(null);
    setConfirmando(false);
    onOpenChange(false);
  }

  async function confirmarFinal() {
    setErro(null);
    setCarregando(true);
    try {
      await onConfirmar(preenchidos);
      fechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <Dialog open={open && !confirmando} onOpenChange={(o) => !o && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-texto-2">
            Só os campos preenchidos abaixo serão atualizados nos {count} registro
            {count > 1 ? "s" : ""} selecionado{count > 1 ? "s" : ""}. Campos deixados em branco não
            alteram o valor atual dos registros.
          </p>
          <div className="flex flex-col gap-4">
            {campos.map((campo) => (
              <div key={campo.name} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-texto-1">{campo.label}</label>
                {campo.tipo === "select" ? (
                  <Select
                    value={valores[campo.name] ?? ""}
                    onValueChange={(v) => handleChange(campo.name, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Não alterar" />
                    </SelectTrigger>
                    <SelectContent>
                      {campo.opcoes.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={campo.tipo === "number" ? "number" : "text"}
                    value={valores[campo.name] ?? ""}
                    onChange={(e) => handleChange(campo.name, e.target.value)}
                    placeholder="Não alterar"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button disabled={!podeContinuar} onClick={() => setConfirmando(true)}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={(o) => !o && setConfirmando(false)}
        titulo="Confirmar atribuição em massa"
        descricao={
          <>
            Os {count} registro{count > 1 ? "s" : ""} selecionado{count > 1 ? "s" : ""} receberão os
            novos valores preenchidos. Essa ação é irreversível. Deseja prosseguir?
            {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
          </>
        }
        carregando={carregando}
        textoConfirmar="Confirmar atribuição"
        onConfirmar={confirmarFinal}
      />
    </>
  );
}
