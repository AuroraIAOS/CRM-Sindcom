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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useCartasTrabalhador, useExcluirCarta, useRegistrarCarta } from "../api";
import { cartaSchema, type CartaFormValues } from "../schemas";
import type { Database } from "@/lib/database.types";

type Carta = Database["public"]["Tables"]["cartas_oposicao"]["Row"];

const ROTULO_FORMA = {
  presencial: "Presencial",
  email: "E-mail",
  correio: "Correio",
  outro: "Outro",
} as const;

const PODE_REGISTRAR = ["admin", "secretaria"] as const;

/** Registrar carta é a ÚNICA forma deliberada de baixar o nível para Bronze
 *  nesta subetapa — por isso o fluxo passa por uma confirmação explícita. */
export function CartasTab({ trabalhadorId }: { trabalhadorId: string }) {
  const { role } = useAuth();
  const podeRegistrar = role !== null && (PODE_REGISTRAR as readonly string[]).includes(role);

  const cartas = useCartasTrabalhador(trabalhadorId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Carta | null>(null);

  if (cartas.isLoading) return <p className="text-texto-2">Carregando cartas…</p>;
  if (cartas.isError) return <p className="text-estado-erro">{mensagemErro(cartas.error)}</p>;

  const linhas = cartas.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeRegistrar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogAberto(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar carta de oposição
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhuma carta de oposição registrada.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ano-base</TableHead>
                <TableHead>Data de entrega</TableHead>
                <TableHead>Forma</TableHead>
                {role === "admin" && <TableHead className="w-16">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.ano_base}</TableCell>
                  <TableCell>{formatarDataBR(c.data_entrega)}</TableCell>
                  <TableCell>{ROTULO_FORMA[c.forma]}</TableCell>
                  {role === "admin" && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setParaExcluir(c)}>
                        <Trash2 className="h-4 w-4 text-estado-erro" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogAberto && (
        <RegistrarCartaDialog trabalhadorId={trabalhadorId} onOpenChange={setDialogAberto} />
      )}

      <ExcluirCartaDialog
        trabalhadorId={trabalhadorId}
        carta={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function RegistrarCartaDialog({
  trabalhadorId,
  onOpenChange,
}: {
  trabalhadorId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const registrar = useRegistrarCarta(trabalhadorId);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<CartaFormValues | null>(null);

  const valoresIniciais: CartaFormValues = {
    ano_base: new Date().getFullYear(),
    data_entrega: new Date().toISOString().slice(0, 10),
    forma: "presencial",
    comprovante_url: "",
  };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      await registrar.mutateAsync(pendente);
      setPendente(null);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
      <Dialog open={!pendente} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar carta de oposição</DialogTitle>
          </DialogHeader>

          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Registrar esta carta define <strong>recolhe contribuição sindical</strong> e{" "}
            <strong>recolhe mensalidade do convênio</strong> como "Não" — o trabalhador passa a
            Bronze. Esta é a única forma de baixar o nível nesta tela; confira antes de confirmar.
          </p>

          <EntityForm
            id="form-carta"
            schema={cartaSchema}
            valoresIniciais={valoresIniciais}
            onSubmit={(valores) => setPendente(valores)}
          >
            {(form) => (
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="ano_base"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano-base</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data_entrega"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de entrega</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forma"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de entrega</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(ROTULO_FORMA).map(([valor, rotulo]) => (
                            <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="comprovante_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comprovante (link — opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://…" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </EntityForm>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-carta">
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendente}
        onOpenChange={(open) => !open && setPendente(null)}
        titulo="Confirmar registro e mudança para Bronze"
        descricao={
          <>
            Ao confirmar, a carta de oposição {pendente?.ano_base} é registrada e este trabalhador
            passa para o nível Bronze imediatamente.
            {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
          </>
        }
        textoConfirmar="Confirmar e definir Bronze"
        carregando={registrar.isPending}
        onConfirmar={confirmar}
      />
    </>
  );
}

function ExcluirCartaDialog({
  trabalhadorId,
  carta,
  onOpenChange,
}: {
  trabalhadorId: string;
  carta: Carta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirCarta(trabalhadorId);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!carta) return;
    setErro(null);
    try {
      await excluir.mutateAsync(carta.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!carta}
      onOpenChange={onOpenChange}
      titulo="Excluir carta de oposição"
      descricao={
        <>
          Remover o registro da carta {carta?.ano_base}? Isso <strong>não</strong> restaura
          automaticamente o nível anterior — se necessário, isso exige uma edição deliberada à
          parte.
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
