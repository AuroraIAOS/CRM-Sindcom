import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
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
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { useCriarSolicitacaoAdmin } from "@/features/fila-admin/api";
import { useParceirosSimples } from "@/features/parceiros/api";
import {
  montarPayloadBeneficio,
  useBeneficios,
  useCriarBeneficioComParceiro,
  type BeneficioListItem,
  type BeneficiosFiltros,
} from "./api";
import { beneficioComParceiroSchema, type BeneficioComParceiroFormValues } from "./schemas";

const PODE_EDITAR = ["admin", "secretaria"] as const;
const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

const COLUNAS_CSV: ColunaCsv<BeneficioListItem>[] = [
  { titulo: "Nome", valor: (b) => b.nome },
  { titulo: "Parceiro", valor: (b) => b.parceiro?.nome ?? "" },
  { titulo: "Categoria", valor: (b) => b.categoria ?? "" },
  { titulo: "Nível mínimo", valor: (b) => ROTULO_NIVEL[b.nivel_minimo] },
  { titulo: "Valor particular", valor: (b) => formatarMoeda(b.valor_particular) },
  { titulo: "Valor convênio", valor: (b) => formatarMoeda(b.valor_convenio) },
  { titulo: "Ativo", valor: (b) => (b.ativo ? "Sim" : "Não") },
];

const VALORES_INICIAIS: BeneficioComParceiroFormValues = {
  parceiro_id: "",
  nome: "",
  descricao: "",
  categoria: "",
  valor_particular: undefined,
  valor_convenio: undefined,
  nivel_minimo: "ouro",
  condicoes: "",
  ativo: true,
};

export function ListaBeneficiosPage() {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);
  const navigate = useNavigate();

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [parceiroId, setParceiroId] = useState<string>("todos");
  const [categoria, setCategoria] = useState("");
  const [nivelMinimo, setNivelMinimo] = useState<BeneficiosFiltros["nivelMinimo"]>("todos");
  const [ativo, setAtivo] = useState<BeneficiosFiltros["ativo"]>("todos");
  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const parceiros = useParceirosSimples();

  const filtros: BeneficiosFiltros = useMemo(
    () => ({ busca, parceiroId, categoria, nivelMinimo, ativo }),
    [busca, parceiroId, categoria, nivelMinimo, ativo],
  );

  const beneficios = useBeneficios(pagination, sorting, filtros);

  function exportar() {
    setExportando(true);
    try {
      exportarCsv("beneficios", beneficios.data?.linhas ?? [], COLUNAS_CSV);
    } finally {
      setExportando(false);
    }
  }

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo<ColumnDef<BeneficioListItem, unknown>[]>(
    () => [
      { accessorKey: "nome", header: "Nome" },
      {
        id: "parceiro",
        header: "Parceiro",
        enableSorting: false,
        cell: ({ row }) => row.original.parceiro?.nome ?? "—",
      },
      { accessorKey: "categoria", header: "Categoria", cell: ({ getValue }) => getValue<string>() ?? "—" },
      {
        accessorKey: "nivel_minimo",
        header: "Nível mínimo",
        cell: ({ getValue }) => ROTULO_NIVEL[getValue<BeneficioListItem["nivel_minimo"]>()],
      },
      {
        accessorKey: "valor_convenio",
        header: "Valor convênio",
        cell: ({ getValue }) => formatarMoeda(getValue<number | null>()) || "—",
      },
      {
        accessorKey: "ativo",
        header: "Ativo",
        enableSorting: false,
        cell: ({ getValue }) => (getValue<boolean>() ? "Sim" : "Não"),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Catálogo de benefícios</h1>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo benefício
          </Button>
        )}
      </div>

      {beneficios.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(beneficios.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={beneficios.data?.linhas ?? []}
        total={beneficios.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={beneficios.isLoading}
        onLinhaClick={(linha) => navigate(`/beneficios/${linha.id}`)}
        onExportar={ehAdmin ? exportar : undefined}
        exportando={exportando}
        vazio="Nenhum benefício encontrado."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome…"
              value={busca}
              onChange={(e) => aoMudarFiltro(setBusca, e.target.value)}
              className="w-56"
            />
            <Select value={parceiroId} onValueChange={(v) => aoMudarFiltro(setParceiroId, v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Parceiro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os parceiros</SelectItem>
                {(parceiros.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Categoria…"
              value={categoria}
              onChange={(e) => aoMudarFiltro(setCategoria, e.target.value)}
              className="w-36"
            />
            <Select
              value={nivelMinimo}
              onValueChange={(v) => aoMudarFiltro(setNivelMinimo, v as BeneficiosFiltros["nivelMinimo"])}
            >
              <SelectTrigger className="w-40"><SelectValue placeholder="Nível mínimo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os níveis</SelectItem>
                <SelectItem value="bronze">Bronze</SelectItem>
                <SelectItem value="prata">Prata</SelectItem>
                <SelectItem value="ouro">Ouro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ativo} onValueChange={(v) => aoMudarFiltro(setAtivo, v as BeneficiosFiltros["ativo"])}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {criando && <NovoBeneficioDialog ehAdmin={ehAdmin} onOpenChange={setCriando} />}
    </div>
  );
}

function NovoBeneficioDialog({
  ehAdmin,
  onOpenChange,
}: {
  ehAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarBeneficioComParceiro();
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const parceiros = useParceirosSimples();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoParaAprovacao, setEnviadoParaAprovacao] = useState(false);
  const salvando = criar.isPending || criarSolicitacao.isPending;

  async function salvar(valores: BeneficioComParceiroFormValues) {
    setErro(null);
    try {
      if (ehAdmin) {
        await criar.mutateAsync(valores);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "beneficios",
          operacao: "INSERT",
          payload: { ...montarPayloadBeneficio(valores), parceiro_id: valores.parceiro_id },
          justificativa: `Novo benefício: ${valores.nome.trim()}`,
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
          <DialogTitle>Novo benefício</DialogTitle>
        </DialogHeader>

        {!ehAdmin && (
          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Como Secretaria, este cadastro é enviado ao Admin para aprovação antes de entrar no
            catálogo.
          </p>
        )}

        <EntityForm
          id="form-novo-beneficio"
          schema={beneficioComParceiroSchema}
          valoresIniciais={VALORES_INICIAIS}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="parceiro_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parceiro</FormLabel>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(parceiros.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
          <Button type="submit" form="form-novo-beneficio" disabled={salvando}>
            {salvando ? "Enviando…" : ehAdmin ? "Cadastrar" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
