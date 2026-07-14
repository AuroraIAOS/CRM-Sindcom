import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAtualizarPiso,
  useCriarPiso,
  useExcluirPiso,
  usePisosConvencao,
  type Piso,
} from "../api";
import { pisoSchema, type PisoFormValues } from "../schemas";

const PODE_ESCREVER = ["admin", "juridico"] as const;

export function PisosTab({ convencaoId }: { convencaoId: string }) {
  const { role } = useAuth();
  const podeEscrever = role !== null && (PODE_ESCREVER as readonly string[]).includes(role);

  const pisos = usePisosConvencao(convencaoId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Piso | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Piso | null>(null);

  if (pisos.isLoading) return <p className="text-texto-2">Carregando pisos…</p>;
  if (pisos.isError) return <p className="text-estado-erro">{mensagemErro(pisos.error)}</p>;

  const linhas = pisos.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeEscrever && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setEmEdicao(null);
              setDialogAberto(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo piso
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum piso cadastrado.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Função</TableHead>
              <TableHead>Valor</TableHead>
              {podeEscrever && <TableHead className="w-24">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.funcao ?? "Piso geral da categoria"}</TableCell>
                <TableCell>{formatarMoeda(p.valor)}</TableCell>
                {podeEscrever && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEmEdicao(p);
                          setDialogAberto(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setParaExcluir(p)}>
                        <Trash2 className="h-4 w-4 text-estado-erro" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dialogAberto && (
        <PisoFormDialog
          convencaoId={convencaoId}
          piso={emEdicao}
          onOpenChange={setDialogAberto}
        />
      )}

      <ExcluirPisoDialog
        convencaoId={convencaoId}
        piso={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function PisoFormDialog({
  convencaoId,
  piso,
  onOpenChange,
}: {
  convencaoId: string;
  piso: Piso | null;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarPiso(convencaoId);
  const atualizar = useAtualizarPiso(convencaoId);
  const [erro, setErro] = useState<string | null>(null);
  const salvando = criar.isPending || atualizar.isPending;

  const valoresIniciais: PisoFormValues = {
    funcao: piso?.funcao ?? "",
    valor: piso?.valor ?? 0,
  };

  async function salvar(valores: PisoFormValues) {
    setErro(null);
    try {
      if (piso) {
        await atualizar.mutateAsync({ id: piso.id, valores });
      } else {
        await criar.mutateAsync(valores);
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{piso ? "Editar piso" : "Novo piso"}</DialogTitle>
        </DialogHeader>
        <EntityForm id="form-piso" schema={pisoSchema} valoresIniciais={valoresIniciais} onSubmit={salvar}>
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="funcao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função (vazio = piso geral da categoria)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex.: Operador de caixa" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-piso" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirPisoDialog({
  convencaoId,
  piso,
  onOpenChange,
}: {
  convencaoId: string;
  piso: Piso | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirPiso(convencaoId);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!piso) return;
    setErro(null);
    try {
      await excluir.mutateAsync(piso.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!piso}
      onOpenChange={onOpenChange}
      titulo="Excluir piso"
      descricao={
        <>
          Remover o piso de {piso?.funcao ?? "piso geral"}?
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      destrutivo
      carregando={excluir.isPending}
      textoConfirmar="Excluir"
      onConfirmar={confirmar}
    />
  );
}
