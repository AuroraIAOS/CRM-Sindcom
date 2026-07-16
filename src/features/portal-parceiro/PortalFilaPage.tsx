import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useConfirmarEmLote,
  useFilaParceiro,
  type FilaParceiroFiltros,
  type FilaParceiroLinha,
} from "./api";

/**
 * Fila do parceiro (frontend.md §2.2): consome `v_fila_parceiro` — já
 * escopada por `fn_parceiro_id()` e sem CPF. Filtro por status/período +
 * confirmação em lote (contra-referência mensal) para guias que não
 * passaram pelo check-in físico do QR.
 */
export function PortalFilaPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [status, setStatus] = useState<FilaParceiroFiltros["status"]>("pendente_confirmacao");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirmando, setConfirmando] = useState<"executada" | "rejeitada" | null>(null);

  const filtros: FilaParceiroFiltros = useMemo(() => ({ status, de, ate }), [status, de, ate]);
  const fila = useFilaParceiro(pagination, sorting, filtros);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const linhas = fila.data?.linhas ?? [];
  const selecionadas = linhas.filter((l) => rowSelection[l.id]);
  // A guarda do trigger só evolui pendente_confirmacao/solicitada → executada/
  // rejeitada; barrar aqui evita mandar um lote misto que o banco rejeitaria
  // linha a linha sem dar contexto claro do porquê.
  const podeConfirmar =
    selecionadas.length > 0 &&
    selecionadas.every((l) => l.status === "pendente_confirmacao" || l.status === "solicitada");

  const columns = useMemo<ColumnDef<FilaParceiroLinha, unknown>[]>(
    () => [
      { accessorKey: "numero_guia", header: "Guia" },
      { accessorKey: "interessado", header: "Interessado" },
      { accessorKey: "servico", header: "Serviço" },
      {
        accessorKey: "data_agendada",
        header: "Data agendada",
        cell: ({ getValue }) => formatarDataBR(getValue<string>()),
      },
      {
        accessorKey: "valor_convenio",
        header: "Valor convênio",
        cell: ({ getValue }) => formatarMoeda(getValue<number | null>()) || "—",
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
      <h1 className="text-3xl font-semibold text-texto-1">Fila de atendimento</h1>

      {fila.isError && <p className="text-sm text-estado-erro">{mensagemErro(fila.error)}</p>}

      {selecionadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-realce/30 bg-realce/5 px-4 py-2">
          <span className="text-sm font-semibold text-texto-1">
            {selecionadas.length} selecionada{selecionadas.length > 1 ? "s" : ""}
          </span>
          {!podeConfirmar && (
            <span className="text-sm text-estado-alerta">
              Só é possível confirmar guias que ainda não foram processadas.
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!podeConfirmar}
              onClick={() => setConfirmando("executada")}
            >
              <Check className="mr-1 h-4 w-4" /> Confirmar atendidas
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!podeConfirmar}
              onClick={() => setConfirmando("rejeitada")}
            >
              <X className="mr-1 h-4 w-4" /> Confirmar recusadas
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={linhas}
        total={fila.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={fila.isLoading}
        vazio="Nenhuma solicitação encontrada com estes filtros."
        enableSelection
        getRowId={(l) => l.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onValueChange={(v) => aoMudarFiltro(setStatus, v as FilaParceiroFiltros["status"])}
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
            <Input
              type="date"
              value={de}
              onChange={(e) => aoMudarFiltro(setDe, e.target.value)}
              className="w-40"
              title="De"
            />
            <Input
              type="date"
              value={ate}
              onChange={(e) => aoMudarFiltro(setAte, e.target.value)}
              className="w-40"
              title="Até"
            />
          </div>
        }
      />

      {confirmando && (
        <ConfirmarEmLoteDialog
          ids={selecionadas.map((l) => l.id)}
          resultado={confirmando}
          onFechar={() => {
            setConfirmando(null);
            setRowSelection({});
          }}
        />
      )}
    </div>
  );
}

function ConfirmarEmLoteDialog({
  ids,
  resultado,
  onFechar,
}: {
  ids: string[];
  resultado: "executada" | "rejeitada";
  onFechar: () => void;
}) {
  const confirmar = useConfirmarEmLote();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function confirmarLote() {
    setErro(null);
    try {
      await confirmar.mutateAsync({ ids, resultado, motivo });
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {resultado === "executada"
              ? `Confirmar ${ids.length} guia${ids.length > 1 ? "s" : ""} como atendida${ids.length > 1 ? "s" : ""}`
              : `Confirmar ${ids.length} guia${ids.length > 1 ? "s" : ""} como recusada${ids.length > 1 ? "s" : ""}`}
          </DialogTitle>
        </DialogHeader>

        {resultado === "rejeitada" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm text-texto-2">Motivo (opcional, aplicado a todas)</label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </div>
        )}

        {erro && <p className="text-sm text-estado-erro">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={confirmar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmarLote()} disabled={confirmar.isPending}>
            {confirmar.isPending ? "Confirmando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
