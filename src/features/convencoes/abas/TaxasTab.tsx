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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAtualizarTaxa,
  useCriarTaxa,
  useExcluirTaxa,
  useTaxasConvencao,
  type Taxa,
} from "../api";
import { taxaSchema, type TaxaFormValues } from "../schemas";

const PODE_ESCREVER = ["admin", "juridico"] as const;

const ROTULO_TIPO_BOLETO: Record<string, string> = { taf: "TAF", pamed: "PAMED" };
const SEM_TIPO = "nenhuma";

/** Multas/acordos/taxas adicionais previstas na CCT — base de valores para as
 *  faturas excepcionais da Secretaria (Etapa 02); aqui é só o cadastro. */
export function TaxasTab({ convencaoId }: { convencaoId: string }) {
  const { role } = useAuth();
  const podeEscrever = role !== null && (PODE_ESCREVER as readonly string[]).includes(role);

  const taxas = useTaxasConvencao(convencaoId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Taxa | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Taxa | null>(null);

  if (taxas.isLoading) return <p className="text-texto-2">Carregando taxas…</p>;
  if (taxas.isError) return <p className="text-estado-erro">{mensagemErro(taxas.error)}</p>;

  const linhas = taxas.data ?? [];

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
            <Plus className="mr-1 h-4 w-4" /> Nova taxa
          </Button>
        </div>
      )}

      <PainelBoleto taxas={linhas} />

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhuma taxa cadastrada.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Boleto</TableHead>
              <TableHead>Observações</TableHead>
              {podeEscrever && <TableHead className="w-24">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.nome}</TableCell>
                <TableCell>{t.valor != null ? formatarMoeda(t.valor) : "—"}</TableCell>
                <TableCell>
                  {t.tipo_boleto ? (
                    <Badge variant="outline">{ROTULO_TIPO_BOLETO[t.tipo_boleto] ?? t.tipo_boleto}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{t.observacoes ?? "—"}</TableCell>
                {podeEscrever && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEmEdicao(t);
                          setDialogAberto(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setParaExcluir(t)}>
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
        <TaxaFormDialog
          convencaoId={convencaoId}
          taxa={emEdicao}
          onOpenChange={setDialogAberto}
        />
      )}

      <ExcluirTaxaDialog
        convencaoId={convencaoId}
        taxa={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function PainelBoleto({ taxas }: { taxas: Taxa[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-borda bg-fundo-2 p-3 text-sm">
      <span className="font-semibold text-texto-2">Valor-base dos boletos:</span>
      {(["taf", "pamed"] as const).map((tipo) => {
        const taxa = taxas.find((x) => x.tipo_boleto === tipo);
        const ok = taxa?.valor != null;
        return (
          <Badge key={tipo} variant="outline" className={ok ? "" : "border-estado-alerta text-estado-alerta"}>
            {ROTULO_TIPO_BOLETO[tipo]}: {ok ? formatarMoeda(taxa.valor as number) : "não cadastrada"}
          </Badge>
        );
      })}
      <span className="text-xs text-texto-2">CA e CN: valor digitado por boleto.</span>
    </div>
  );
}

function TaxaFormDialog({
  convencaoId,
  taxa,
  onOpenChange,
}: {
  convencaoId: string;
  taxa: Taxa | null;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarTaxa(convencaoId);
  const atualizar = useAtualizarTaxa(convencaoId);
  const [erro, setErro] = useState<string | null>(null);
  const salvando = criar.isPending || atualizar.isPending;

  const valoresIniciais: TaxaFormValues = {
    nome: taxa?.nome ?? "",
    valor: taxa?.valor ?? undefined,
    observacoes: taxa?.observacoes ?? "",
    tipo_boleto: taxa?.tipo_boleto === "taf" || taxa?.tipo_boleto === "pamed" ? taxa.tipo_boleto : "",
  };

  async function salvar(valores: TaxaFormValues) {
    setErro(null);
    try {
      if (taxa) {
        await atualizar.mutateAsync({ id: taxa.id, valores });
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
          <DialogTitle>{taxa ? "Editar taxa" : "Nova taxa"}</DialogTitle>
        </DialogHeader>
        <EntityForm id="form-taxa" schema={taxaSchema} valoresIniciais={valoresIniciais} onSubmit={salvar}>
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex.: Multa por atraso" />
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
                    <FormLabel>Valor (opcional) — por trabalhador, se usada em boleto</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipo_boleto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usada para boleto de</FormLabel>
                    <Select
                      value={field.value === "" ? SEM_TIPO : field.value}
                      onValueChange={(v) => field.onChange(v === SEM_TIPO ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SEM_TIPO}>Nenhuma</SelectItem>
                        <SelectItem value="taf">TAF</SelectItem>
                        <SelectItem value="pamed">PAMED</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-texto-2">
                      O boleto de TAF ou PAMED é calculado como este valor × nº de trabalhadores. CA e CN têm
                      o valor digitado em cada boleto.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
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
          <Button type="submit" form="form-taxa" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirTaxaDialog({
  convencaoId,
  taxa,
  onOpenChange,
}: {
  convencaoId: string;
  taxa: Taxa | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirTaxa(convencaoId);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!taxa) return;
    setErro(null);
    try {
      await excluir.mutateAsync(taxa.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!taxa}
      onOpenChange={onOpenChange}
      titulo="Excluir taxa"
      descricao={
        <>
          Remover a taxa "{taxa?.nome}"?
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
