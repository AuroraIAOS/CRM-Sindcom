import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/lib/auth";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useCriarSolicitacao,
  useSolicitacoes,
  type SolicitacaoListItem,
  type SolicitacoesFiltros,
} from "./api";
import type { SolicitacaoFormValues } from "./schemas";
import { SolicitacaoServicoForm } from "./SolicitacaoServicoForm";

/** RLS pol_solic_insert: Admin e Secretária inserem direto — sem fila-admin.
 *  Presidente tem a tela em modo leitura (frontend.md §2.2). */
const PODE_REGISTRAR = ["admin", "secretaria"] as const;

export function ListaServicosPage() {
  const { role } = useAuth();
  const podeRegistrar = role !== null && (PODE_REGISTRAR as readonly string[]).includes(role);
  const navigate = useNavigate();

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<SolicitacoesFiltros["status"]>("todos");
  const [criando, setCriando] = useState(false);

  const filtros: SolicitacoesFiltros = useMemo(() => ({ busca, status }), [busca, status]);
  const solicitacoes = useSolicitacoes(pagination, sorting, filtros);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo<ColumnDef<SolicitacaoListItem, unknown>[]>(
    () => [
      { accessorKey: "numero_guia", header: "Guia" },
      {
        id: "interessado",
        header: "Interessado",
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          // Beneficiado quando houver; senão o próprio titular (mesma regra de
          // `fn_dados_guia_publica`, que é o que a guia impressa mostra).
          return s.beneficiado?.nome ?? s.trabalhador?.nome ?? "—";
        },
      },
      {
        id: "parceiro",
        header: "Parceiro",
        enableSorting: false,
        cell: ({ row }) => row.original.parceiro?.nome ?? "—",
      },
      {
        id: "beneficio",
        header: "Benefício",
        enableSorting: false,
        cell: ({ row }) => row.original.beneficio?.nome ?? "—",
      },
      {
        accessorKey: "data_agendada",
        header: "Data agendada",
        cell: ({ getValue }) => formatarDataBR(getValue<string>()),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Solicitações de serviço</h1>
        {podeRegistrar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova solicitação
          </Button>
        )}
      </div>

      {solicitacoes.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(solicitacoes.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={solicitacoes.data?.linhas ?? []}
        total={solicitacoes.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={solicitacoes.isLoading}
        onLinhaClick={(linha) => navigate(`/servicos/${linha.id}`)}
        vazio="Nenhuma solicitação encontrada."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por guia ou nome…"
              value={busca}
              onChange={(e) => aoMudarFiltro(setBusca, e.target.value)}
              className="w-64"
            />
            <Select
              value={status}
              onValueChange={(v) => aoMudarFiltro(setStatus, v as SolicitacoesFiltros["status"])}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="solicitada">Solicitada</SelectItem>
                <SelectItem value="pendente_confirmacao">Pendente de confirmação</SelectItem>
                <SelectItem value="executada">Executada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {criando && <NovaSolicitacaoDialog onOpenChange={setCriando} />}
    </div>
  );
}

function NovaSolicitacaoDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const criar = useCriarSolicitacao();
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(valores: SolicitacaoFormValues) {
    setErro(null);
    try {
      const criada = await criar.mutateAsync({ valores, registradaPor: perfil?.id ?? null });
      onOpenChange(false);
      // A guia é o próximo passo natural do fluxo da Denise (registra → imprime).
      navigate(`/servicos/${criada.id}`);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        // O popover de busca do titular é portalizado para fora do Dialog: sem
        // esta guarda o Radix lê o clique num resultado como "clicou fora" e
        // fecha o formulário inteiro.
        onInteractOutside={(e) => {
          const alvo = e.target as Element | null;
          if (alvo?.closest("[data-radix-popper-content-wrapper]")) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Nova solicitação de serviço</DialogTitle>
        </DialogHeader>

        <SolicitacaoServicoForm id="form-nova-solicitacao" onSubmit={salvar} erro={erro} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-nova-solicitacao" disabled={criar.isPending}>
            {criar.isPending ? "Registrando…" : "Registrar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
