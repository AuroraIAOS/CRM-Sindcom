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
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Plus, Trash2, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { useCriarSolicitacaoAdmin } from "@/features/fila-admin/api";
import {
  useAtualizarRecepcionista,
  useCriarRecepcionista,
  useDefinirPinRecepcionista,
  useExcluirRecepcionista,
  useRecepcionistasDoParceiro,
  type Recepcionista,
} from "../api";
import {
  novoRecepcionistaSchema,
  pinSchema,
  recepcionistaSchema,
  type NovoRecepcionistaFormValues,
  type PinFormValues,
  type RecepcionistaFormValues,
} from "../schemas";

const PODE_EDITAR = ["admin", "secretaria"] as const;

export function RecepcionistasTab({
  parceiroId,
  nomeParceiro,
}: {
  parceiroId: string;
  nomeParceiro: string;
}) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);

  const recepcionistas = useRecepcionistasDoParceiro(parceiroId);
  const [criando, setCriando] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Recepcionista | null>(null);
  const [definindoPin, setDefinindoPin] = useState<Recepcionista | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Recepcionista | null>(null);

  if (recepcionistas.isLoading) return <p className="text-texto-2">Carregando recepcionistas…</p>;
  if (recepcionistas.isError)
    return <p className="text-estado-erro">{mensagemErro(recepcionistas.error)}</p>;

  const linhas = recepcionistas.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo recepcionista
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum recepcionista cadastrado.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Ativo</TableHead>
              {podeEditar && <TableHead className="w-32">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.nome}</TableCell>
                <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => setEmEdicao(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Definir PIN"
                        onClick={() => setDefinindoPin(r)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => setParaExcluir(r)}>
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

      {criando && (
        <NovoRecepcionistaDialog
          parceiroId={parceiroId}
          nomeParceiro={nomeParceiro}
          ehAdmin={ehAdmin}
          onOpenChange={setCriando}
        />
      )}

      {emEdicao && (
        <EditarRecepcionistaDialog
          parceiroId={parceiroId}
          recepcionista={emEdicao}
          onOpenChange={(open) => !open && setEmEdicao(null)}
        />
      )}

      {definindoPin && (
        <DefinirPinDialog
          parceiroId={parceiroId}
          recepcionista={definindoPin}
          onOpenChange={(open) => !open && setDefinindoPin(null)}
        />
      )}

      <ExcluirRecepcionistaDialog
        parceiroId={parceiroId}
        ehAdmin={ehAdmin}
        recepcionista={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function NovoRecepcionistaDialog({
  parceiroId,
  nomeParceiro,
  ehAdmin,
  onOpenChange,
}: {
  parceiroId: string;
  nomeParceiro: string;
  ehAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarRecepcionista(parceiroId);
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoParaAprovacao, setEnviadoParaAprovacao] = useState(false);
  const salvando = criar.isPending || criarSolicitacao.isPending;

  const valoresIniciais: NovoRecepcionistaFormValues = { nome: "", pin: "" };

  async function salvar(valores: NovoRecepcionistaFormValues) {
    setErro(null);
    try {
      if (ehAdmin) {
        await criar.mutateAsync(valores);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "recepcionistas",
          operacao: "INSERT",
          payload: { parceiro_id: parceiroId, nome: valores.nome.trim(), pin: valores.pin },
          justificativa: `Novo recepcionista de ${nomeParceiro}: ${valores.nome.trim()}`,
        });
        setEnviadoParaAprovacao(true);
      }
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (enviadoParaAprovacao) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitação enviada ao Admin</DialogTitle>
          </DialogHeader>
          <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
            O cadastro foi enviado para a fila de aprovação. Acompanhe em "Fila do Admin".
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo recepcionista</DialogTitle>
        </DialogHeader>

        {!ehAdmin && (
          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Como Secretaria, este cadastro é enviado ao Admin para aprovação antes de entrar no
            sistema.
          </p>
        )}

        <EntityForm
          id="form-novo-recepcionista"
          schema={novoRecepcionistaSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PIN inicial (4 a 6 dígitos)</FormLabel>
                    <FormControl><Input {...field} inputMode="numeric" placeholder="Ex.: 1234" /></FormControl>
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
          <Button type="submit" form="form-novo-recepcionista" disabled={salvando}>
            {salvando ? "Enviando…" : ehAdmin ? "Cadastrar" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarRecepcionistaDialog({
  parceiroId,
  recepcionista,
  onOpenChange,
}: {
  parceiroId: string;
  recepcionista: Recepcionista;
  onOpenChange: (open: boolean) => void;
}) {
  const atualizar = useAtualizarRecepcionista(recepcionista.id, parceiroId);
  const [erro, setErro] = useState<string | null>(null);

  const valoresIniciais: RecepcionistaFormValues = {
    nome: recepcionista.nome,
    ativo: recepcionista.ativo,
  };

  async function salvar(valores: RecepcionistaFormValues) {
    setErro(null);
    try {
      await atualizar.mutateAsync(valores);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar recepcionista</DialogTitle>
        </DialogHeader>
        <EntityForm
          id="form-editar-recepcionista"
          schema={recepcionistaSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Ativo (pode fazer check-in)</FormLabel>
                  </FormItem>
                )}
              />
              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={atualizar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-editar-recepcionista" disabled={atualizar.isPending}>
            {atualizar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefinirPinDialog({
  parceiroId,
  recepcionista,
  onOpenChange,
}: {
  parceiroId: string;
  recepcionista: Recepcionista;
  onOpenChange: (open: boolean) => void;
}) {
  const definirPin = useDefinirPinRecepcionista(parceiroId);
  const [erro, setErro] = useState<string | null>(null);

  const valoresIniciais: PinFormValues = { pin: "", confirmarPin: "" };

  async function salvar(valores: PinFormValues) {
    setErro(null);
    try {
      await definirPin.mutateAsync({ id: recepcionista.id, pin: valores.pin });
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir PIN — {recepcionista.nome}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-texto-2">
          O PIN novo substitui o atual imediatamente e é gravado com hash — ninguém no CRM volta a
          vê-lo em texto puro.
        </p>
        <EntityForm id="form-pin" schema={pinSchema} valoresIniciais={valoresIniciais} onSubmit={salvar}>
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PIN (4 a 6 dígitos)</FormLabel>
                    <FormControl><Input {...field} inputMode="numeric" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmarPin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar PIN</FormLabel>
                    <FormControl><Input {...field} inputMode="numeric" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={definirPin.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-pin" disabled={definirPin.isPending}>
            {definirPin.isPending ? "Salvando…" : "Salvar PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirRecepcionistaDialog({
  parceiroId,
  ehAdmin,
  recepcionista,
  onOpenChange,
}: {
  parceiroId: string;
  ehAdmin: boolean;
  recepcionista: Recepcionista | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirRecepcionista(parceiroId);
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const carregando = excluir.isPending || criarSolicitacao.isPending;

  async function confirmar() {
    if (!recepcionista) return;
    setErro(null);
    try {
      if (ehAdmin) {
        await excluir.mutateAsync(recepcionista.id);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "recepcionistas",
          operacao: "DELETE",
          registro_id: recepcionista.id,
          justificativa: `Exclusão de recepcionista: ${recepcionista.nome}`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!recepcionista}
      onOpenChange={onOpenChange}
      titulo="Excluir recepcionista"
      descricao={
        <>
          {ehAdmin
            ? `Remover o recepcionista "${recepcionista?.nome}"?`
            : `Enviar solicitação de exclusão do recepcionista "${recepcionista?.nome}" ao Admin?`}
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      destrutivo
      carregando={carregando}
      textoConfirmar={ehAdmin ? "Excluir" : "Enviar solicitação"}
      onConfirmar={confirmar}
    />
  );
}
