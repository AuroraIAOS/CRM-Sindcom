import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { Trash2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCnpj } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { useCriarSolicitacaoAdmin } from "@/features/fila-admin/api";
import {
  montarPayloadParceiro,
  useAtualizarParceiro,
  useCriarParceiro,
  useExcluirParceiro,
  useParceiro,
  useParceiros,
  type ParceiroListItem,
} from "./api";
import { parceiroSchema, type ParceiroFormValues } from "./schemas";
import { RecepcionistasTab } from "./abas/RecepcionistasTab";
import { BeneficiosTab } from "./abas/BeneficiosTab";

const PODE_EDITAR = ["admin", "secretaria"] as const;

const COLUNAS_CSV_PARCEIRO: ColunaCsv<ParceiroListItem>[] = [
  { titulo: "Nome", valor: (p) => p.nome },
  { titulo: "Segmento", valor: (p) => p.segmento ?? "" },
  { titulo: "Status", valor: (p) => p.status },
  { titulo: "CNPJ", valor: (p) => (p.cnpj ? formatarCnpj(p.cnpj) : "") },
];

export function ListaParceirosPage() {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const parceiros = useParceiros(pagination, sorting, busca);

  function exportar() {
    setExportando(true);
    try {
      exportarCsv("parceiros", parceiros.data?.linhas ?? [], COLUNAS_CSV_PARCEIRO);
    } finally {
      setExportando(false);
    }
  }

  const columns = useMemo<ColumnDef<ParceiroListItem, unknown>[]>(
    () => [
      { accessorKey: "nome", header: "Nome" },
      { accessorKey: "segmento", header: "Segmento", cell: ({ getValue }) => getValue<string>() ?? "—" },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Parceiros</h1>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo parceiro
          </Button>
        )}
      </div>

      {parceiros.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(parceiros.error)}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <DataTable
          columns={columns}
          data={parceiros.data?.linhas ?? []}
          total={parceiros.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          carregando={parceiros.isLoading}
          onLinhaClick={(linha) => setSelecionado(linha.id)}
          onExportar={ehAdmin ? exportar : undefined}
          exportando={exportando}
          vazio="Nenhum parceiro cadastrado."
          toolbar={
            <Input
              placeholder="Buscar por nome…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              className="w-72"
            />
          }
        />

        {selecionado ? (
          <DetalheParceiro
            id={selecionado}
            podeEditar={podeEditar}
            ehAdmin={ehAdmin}
            onExcluido={() => setSelecionado(null)}
          />
        ) : (
          <Card className="flex items-center justify-center p-8 text-sm text-texto-2">
            Selecione um parceiro na lista para ver dados, benefícios e recepcionistas.
          </Card>
        )}
      </div>

      {criando && <NovoParceiroDialog ehAdmin={ehAdmin} onOpenChange={setCriando} />}
    </div>
  );
}

function NovoParceiroDialog({
  ehAdmin,
  onOpenChange,
}: {
  ehAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarParceiro();
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoParaAprovacao, setEnviadoParaAprovacao] = useState(false);
  const salvando = criar.isPending || criarSolicitacao.isPending;

  const valoresIniciais: ParceiroFormValues = {
    nome: "",
    segmento: "",
    cnpj: "",
    contato_nome: "",
    contato_email: "",
    contato_whatsapp: "",
    data_inicio_contrato: "",
    data_fim_contrato: "",
    status: "ativo",
    observacoes: "",
  };

  async function salvar(valores: ParceiroFormValues) {
    setErro(null);
    try {
      if (ehAdmin) {
        await criar.mutateAsync(valores);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "parceiros",
          operacao: "INSERT",
          payload: montarPayloadParceiro(valores),
          justificativa: `Novo parceiro: ${valores.nome.trim()}`,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo parceiro</DialogTitle>
        </DialogHeader>

        {!ehAdmin && (
          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Como Secretaria, este cadastro é enviado ao Admin para aprovação antes de entrar no
            sistema.
          </p>
        )}

        <EntityForm
          id="form-novo-parceiro"
          schema={parceiroSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={salvar}
        >
          {(form) => <CamposParceiro form={form} />}
        </EntityForm>
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-novo-parceiro" disabled={salvando}>
            {salvando ? "Enviando…" : ehAdmin ? "Cadastrar" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CamposParceiro({
  form,
}: {
  form: import("react-hook-form").UseFormReturn<ParceiroFormValues>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
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
          name="segmento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Segmento</FormLabel>
              <FormControl><Input {...field} placeholder="Ex.: farmácia, ótica…" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="cnpj"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CNPJ (opcional)</FormLabel>
              <FormControl><Input {...field} placeholder="Somente números" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
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
          name="contato_nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contato — nome</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contato_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contato — e-mail</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="contato_whatsapp"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Contato — WhatsApp</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="data_inicio_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Início do contrato</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="data_fim_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fim do contrato (opcional)</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="observacoes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Observações</FormLabel>
            <FormControl><Textarea {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function DetalheParceiro({
  id,
  podeEditar,
  ehAdmin,
  onExcluido,
}: {
  id: string;
  podeEditar: boolean;
  ehAdmin: boolean;
  onExcluido: () => void;
}) {
  const parceiro = useParceiro(id);
  const atualizar = useAtualizarParceiro(id);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  if (parceiro.isLoading) return <p className="text-texto-2">Carregando parceiro…</p>;
  if (parceiro.isError) return <p className="text-estado-erro">{mensagemErro(parceiro.error)}</p>;
  if (!parceiro.data) return null;

  const p = parceiro.data;
  const valoresIniciais: ParceiroFormValues = {
    nome: p.nome,
    segmento: p.segmento ?? "",
    cnpj: p.cnpj ?? "",
    contato_nome: p.contato_nome ?? "",
    contato_email: p.contato_email ?? "",
    contato_whatsapp: p.contato_whatsapp ?? "",
    data_inicio_contrato: p.data_inicio_contrato ?? "",
    data_fim_contrato: p.data_fim_contrato ?? "",
    status: (p.status as ParceiroFormValues["status"]) ?? "ativo",
    observacoes: p.observacoes ?? "",
  };

  async function salvar(valores: ParceiroFormValues) {
    setErro(null);
    try {
      await atualizar.mutateAsync(valores);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-texto-1">{p.nome}</h2>
          {podeEditar && (
            <Button variant="ghost" size="icon" onClick={() => setExcluindo(true)}>
              <Trash2 className="h-4 w-4 text-estado-erro" />
            </Button>
          )}
        </div>

        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
            <TabsTrigger value="recepcionistas">Recepcionistas</TabsTrigger>
          </TabsList>
          <TabsContent value="dados">
            <EntityForm
              id="form-parceiro"
              schema={parceiroSchema}
              valoresIniciais={valoresIniciais}
              onSubmit={salvar}
            >
              {(form) => (
                <div className="flex flex-col gap-4 pt-2">
                  <fieldset disabled={!podeEditar} className="contents">
                    <CamposParceiro form={form} />
                  </fieldset>
                  {erro && <p className="text-sm text-estado-erro">{erro}</p>}
                  {podeEditar && (
                    <Button type="submit" className="self-start" disabled={atualizar.isPending}>
                      {atualizar.isPending ? "Salvando…" : "Salvar"}
                    </Button>
                  )}
                </div>
              )}
            </EntityForm>
          </TabsContent>
          <TabsContent value="beneficios">
            <BeneficiosTab parceiroId={p.id} nomeParceiro={p.nome} />
          </TabsContent>
          <TabsContent value="recepcionistas">
            <RecepcionistasTab parceiroId={p.id} nomeParceiro={p.nome} />
          </TabsContent>
        </Tabs>
      </Card>

      <ExcluirParceiroDialog
        ehAdmin={ehAdmin}
        parceiro={excluindo ? p : null}
        onOpenChange={(open) => {
          setExcluindo(open);
          if (!open) onExcluido();
        }}
      />
    </div>
  );
}

function ExcluirParceiroDialog({
  ehAdmin,
  parceiro,
  onOpenChange,
}: {
  ehAdmin: boolean;
  parceiro: ParceiroListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirParceiro();
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const carregando = excluir.isPending || criarSolicitacao.isPending;

  async function confirmar() {
    if (!parceiro) return;
    setErro(null);
    try {
      if (ehAdmin) {
        await excluir.mutateAsync(parceiro.id);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "parceiros",
          operacao: "DELETE",
          registro_id: parceiro.id,
          justificativa: `Exclusão de parceiro: ${parceiro.nome}`,
        });
        onOpenChange(false);
      }
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!parceiro}
      onOpenChange={(open) => !open && onOpenChange(false)}
      titulo="Excluir parceiro"
      descricao={
        <>
          {ehAdmin
            ? `Remover o parceiro "${parceiro?.nome}"? Isso também apaga benefícios e recepcionistas vinculados.`
            : `Enviar solicitação de exclusão do parceiro "${parceiro?.nome}" ao Admin?`}
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
