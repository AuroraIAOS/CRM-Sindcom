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
import { ConfirmarEdicaoDialog } from "@/components/shared/ConfirmarEdicaoDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import type { Database } from "@/lib/database.types";
import {
  useAtualizarBeneficiado,
  useBeneficiadosTrabalhador,
  useCriarBeneficiado,
  useExcluirBeneficiado,
} from "../api";
import { beneficiadoSchema, PARENTESCO_OPCOES, type BeneficiadoFormValues } from "../schemas";

type Beneficiado = Database["public"]["Tables"]["beneficiados"]["Row"];

const ROTULO_TIPO = { direto: "Direto", indireto: "Indireto", adicional: "Adicional" } as const;
const ROTULO_PARENTESCO: Record<(typeof PARENTESCO_OPCOES)[number], string> = {
  "progenitor/a": "Progenitor/a",
  "irmão/a": "Irmão/ã",
  "filho/a": "Filho/a",
  "sogro/a": "Sogro/a",
  "enteado/a": "Enteado/a",
  independentes: "Independentes",
  "cônjuge": "Cônjuge",
};

/** Criar/excluir é privilégio do Admin (RLS: pol_benef_insert/delete); editar é
 *  também da Secretária (RLS: pol_benef_update) — CRU-baixa igual a trabalhadores. */
export function BeneficiadosTab({ titularId }: { titularId: string }) {
  const { role } = useAuth();
  const podeCriar = role === "admin";
  const podeEditar = role === "admin" || role === "secretaria";

  const beneficiados = useBeneficiadosTrabalhador(titularId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Beneficiado | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Beneficiado | null>(null);

  if (beneficiados.isLoading) return <p className="text-texto-2">Carregando beneficiados…</p>;
  if (beneficiados.isError) {
    return <p className="text-estado-erro">{mensagemErro(beneficiados.error)}</p>;
  }

  const linhas = beneficiados.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeCriar && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setEmEdicao(null);
              setDialogAberto(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo beneficiado
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum beneficiado registrado.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Parentesco</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ativo</TableHead>
                {podeEditar && <TableHead className="w-24">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.nome}</TableCell>
                  <TableCell>{formatarCpf(b.cpf)}</TableCell>
                  <TableCell>{b.parentesco ? ROTULO_PARENTESCO[b.parentesco] : "—"}</TableCell>
                  <TableCell>{ROTULO_TIPO[b.tipo]}</TableCell>
                  <TableCell>{formatarDataBR(b.data_nascimento) || "—"}</TableCell>
                  <TableCell><StatusBadge status={b.status_cadastro} /></TableCell>
                  <TableCell>{b.ativo ? "Sim" : "Não"}</TableCell>
                  {podeEditar && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEmEdicao(b);
                            setDialogAberto(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {role === "admin" && (
                          <Button variant="ghost" size="icon" onClick={() => setParaExcluir(b)}>
                            <Trash2 className="h-4 w-4 text-estado-erro" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogAberto && (
        <BeneficiadoFormDialog
          titularId={titularId}
          beneficiado={emEdicao}
          onOpenChange={setDialogAberto}
        />
      )}

      <ExcluirBeneficiadoDialog
        titularId={titularId}
        beneficiado={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function BeneficiadoFormDialog({
  titularId,
  beneficiado,
  onOpenChange,
}: {
  titularId: string;
  beneficiado: Beneficiado | null;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarBeneficiado(titularId);
  const atualizar = useAtualizarBeneficiado(titularId);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<BeneficiadoFormValues | null>(null);
  const salvando = criar.isPending || atualizar.isPending;

  const valoresIniciais: BeneficiadoFormValues = {
    nome: beneficiado?.nome ?? "",
    cpf: beneficiado?.cpf ?? "",
    data_nascimento: beneficiado?.data_nascimento ?? "",
    parentesco: beneficiado?.parentesco ?? undefined,
    tipo: beneficiado?.tipo ?? "direto",
  };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      if (beneficiado) {
        await atualizar.mutateAsync({ id: beneficiado.id, valores: pendente });
      } else {
        await criar.mutateAsync(pendente);
      }
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
          <DialogTitle>{beneficiado ? "Editar beneficiado" : "Novo beneficiado"}</DialogTitle>
        </DialogHeader>

        <EntityForm
          id="form-beneficiado"
          schema={beneficiadoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={(valores) => setPendente(valores)}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Somente números" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parentesco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parentesco</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PARENTESCO_OPCOES.map((valor) => (
                          <SelectItem key={valor} value={valor}>
                            {ROTULO_PARENTESCO[valor]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="data_nascimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
                          <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
          <Button type="submit" form="form-beneficiado" disabled={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmarEdicaoDialog
      open={!!pendente}
      onOpenChange={(o) => !o && setPendente(null)}
      carregando={salvando}
      erro={erro}
      onConfirmar={confirmar}
    />
    </>
  );
}

function ExcluirBeneficiadoDialog({
  titularId,
  beneficiado,
  onOpenChange,
}: {
  titularId: string;
  beneficiado: Beneficiado | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirBeneficiado(titularId);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!beneficiado) return;
    setErro(null);
    try {
      await excluir.mutateAsync(beneficiado.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!beneficiado}
      onOpenChange={onOpenChange}
      titulo="Excluir beneficiado"
      descricao={
        <>
          Remover {beneficiado?.nome} da lista de beneficiados?
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
