import { useState } from "react";
import { Link } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useCriarSolicitacaoAdmin } from "@/features/fila-admin/api";
import {
  montarPayloadBeneficio,
  useAtualizarBeneficio,
  useBeneficiosDoParceiro,
  useCriarBeneficio,
  useExcluirBeneficio,
  type Beneficio,
} from "@/features/beneficios/api";
import { beneficioSchema, type BeneficioFormValues } from "@/features/beneficios/schemas";

const PODE_EDITAR = ["admin", "secretaria"] as const;
const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

const VALORES_INICIAIS_NOVO: BeneficioFormValues = {
  nome: "",
  descricao: "",
  categoria: "",
  valor_particular: undefined,
  valor_convenio: undefined,
  nivel_minimo: "ouro",
  condicoes: "",
  ativo: true,
};

export function BeneficiosTab({ parceiroId, nomeParceiro }: { parceiroId: string; nomeParceiro: string }) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);

  const beneficios = useBeneficiosDoParceiro(parceiroId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Beneficio | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Beneficio | null>(null);

  if (beneficios.isLoading) return <p className="text-texto-2">Carregando benefícios…</p>;
  if (beneficios.isError) return <p className="text-estado-erro">{mensagemErro(beneficios.error)}</p>;

  const linhas = beneficios.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setEmEdicao(null);
              setDialogAberto(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo benefício
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum benefício cadastrado para este parceiro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Nível mínimo</TableHead>
              <TableHead>Particular</TableHead>
              <TableHead>Convênio</TableHead>
              <TableHead>Ativo</TableHead>
              {podeEditar && <TableHead className="w-24">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link to={`/beneficios/${b.id}`} className="text-realce hover:underline">
                    {b.nome}
                  </Link>
                </TableCell>
                <TableCell>{ROTULO_NIVEL[b.nivel_minimo]}</TableCell>
                <TableCell>{formatarMoeda(b.valor_particular) || "—"}</TableCell>
                <TableCell>{formatarMoeda(b.valor_convenio) || "—"}</TableCell>
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
                      <Button variant="ghost" size="icon" onClick={() => setParaExcluir(b)}>
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
        <BeneficioFormDialog
          parceiroId={parceiroId}
          nomeParceiro={nomeParceiro}
          ehAdmin={ehAdmin}
          beneficio={emEdicao}
          onOpenChange={setDialogAberto}
        />
      )}

      <ExcluirBeneficioDialog
        ehAdmin={ehAdmin}
        beneficio={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function BeneficioFormDialog({
  parceiroId,
  nomeParceiro,
  ehAdmin,
  beneficio,
  onOpenChange,
}: {
  parceiroId: string;
  nomeParceiro: string;
  ehAdmin: boolean;
  beneficio: Beneficio | null;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarBeneficio(parceiroId);
  const atualizar = useAtualizarBeneficio(beneficio?.id ?? "");
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoParaAprovacao, setEnviadoParaAprovacao] = useState(false);
  const salvando = criar.isPending || atualizar.isPending || criarSolicitacao.isPending;

  const valoresIniciais: BeneficioFormValues = beneficio
    ? {
        nome: beneficio.nome,
        descricao: beneficio.descricao ?? "",
        categoria: beneficio.categoria ?? "",
        valor_particular: beneficio.valor_particular ?? undefined,
        valor_convenio: beneficio.valor_convenio ?? undefined,
        nivel_minimo: beneficio.nivel_minimo,
        condicoes: beneficio.condicoes ?? "",
        ativo: beneficio.ativo,
      }
    : VALORES_INICIAIS_NOVO;

  async function salvar(valores: BeneficioFormValues) {
    setErro(null);
    try {
      if (beneficio) {
        await atualizar.mutateAsync(valores);
        onOpenChange(false);
      } else if (ehAdmin) {
        await criar.mutateAsync(valores);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "beneficios",
          operacao: "INSERT",
          payload: { ...montarPayloadBeneficio(valores), parceiro_id: parceiroId },
          justificativa: `Novo benefício de ${nomeParceiro}: ${valores.nome.trim()}`,
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
            O benefício foi enviado para a fila de aprovação. Acompanhe em "Fila do Admin".
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{beneficio ? "Editar benefício" : "Novo benefício"}</DialogTitle>
        </DialogHeader>

        {!beneficio && !ehAdmin && (
          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Como Secretaria, este cadastro é enviado ao Admin para aprovação antes de entrar no
            catálogo.
          </p>
        )}

        <EntityForm
          id="form-beneficio"
          schema={beneficioSchema}
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="categoria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nivel_minimo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nível mínimo</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bronze">Bronze</SelectItem>
                          <SelectItem value="prata">Prata</SelectItem>
                          <SelectItem value="ouro">Ouro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valor_particular"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor particular</FormLabel>
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
                  name="valor_convenio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor convênio</FormLabel>
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
              </div>
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="condicoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condições</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
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
                    <FormLabel className="!mt-0">Ativo no catálogo</FormLabel>
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
          <Button type="submit" form="form-beneficio" disabled={salvando}>
            {salvando ? "Salvando…" : !beneficio && !ehAdmin ? "Enviar para aprovação" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirBeneficioDialog({
  ehAdmin,
  beneficio,
  onOpenChange,
}: {
  ehAdmin: boolean;
  beneficio: Beneficio | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirBeneficio();
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const carregando = excluir.isPending || criarSolicitacao.isPending;

  async function confirmar() {
    if (!beneficio) return;
    setErro(null);
    try {
      if (ehAdmin) {
        await excluir.mutateAsync(beneficio.id);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "beneficios",
          operacao: "DELETE",
          registro_id: beneficio.id,
          justificativa: `Exclusão de benefício: ${beneficio.nome}`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!beneficio}
      onOpenChange={onOpenChange}
      titulo="Excluir benefício"
      descricao={
        <>
          {ehAdmin
            ? `Remover o benefício "${beneficio?.nome}"?`
            : `Enviar solicitação de exclusão do benefício "${beneficio?.nome}" ao Admin?`}
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
