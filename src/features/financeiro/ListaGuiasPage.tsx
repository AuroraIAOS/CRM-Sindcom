import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAtualizarStatusRepasse,
  useFaturasDoRepasse,
  useRepasses,
  type RepasseListItem,
  type RepassesFiltros,
} from "./api";
import { GerarGuiasDialog } from "./GerarCobrancasDialog";
import type { Database } from "@/lib/database.types";

type StatusRepasse = Database["public"]["Enums"]["status_repasse"];

const PODE_EDITAR = ["admin", "secretaria"] as const;

const ROTULO_TIPO: Record<string, string> = {
  contribuicao_sindical: "Contribuição sindical",
  mensalidade_convenio: "Mensalidade do convênio",
  multa: "Multa",
  acordo: "Acordo",
  taxa_adicional: "Taxa adicional",
};

/** Ciclo linear (frontend.md §2.2): previsto → enviado → recebido, com
 *  em_atraso como desvio possível a partir de enviado. */
const TRANSICOES: Record<StatusRepasse, StatusRepasse[]> = {
  previsto: ["enviado"],
  enviado: ["recebido", "em_atraso"],
  em_atraso: ["recebido"],
  recebido: [],
};

const ROTULO_STATUS_ACAO: Record<StatusRepasse, string> = {
  previsto: "prevista",
  enviado: "enviada",
  recebido: "recebida",
  em_atraso: "em atraso",
};

export function ListaGuiasPage() {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [status, setStatus] = useState<RepassesFiltros["status"]>("todos");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const filtros: RepassesFiltros = useMemo(() => ({ status }), [status]);
  const repasses = useRepasses(pagination, sorting, filtros);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo<ColumnDef<RepasseListItem, unknown>[]>(
    () => [
      { accessorKey: "numero_guia_pagamento", header: "Guia" },
      {
        id: "empresa",
        header: "Empresa",
        enableSorting: false,
        cell: ({ row }) => row.original.empresa?.razao_social ?? "—",
      },
      {
        id: "tipo",
        header: "Tipo",
        cell: ({ row }) => ROTULO_TIPO[row.original.tipo] ?? row.original.tipo,
      },
      {
        accessorKey: "competencia",
        header: "Competência",
        cell: ({ getValue }) => formatarDataBR(getValue<string>()),
      },
      {
        accessorKey: "valor_total",
        header: "Valor",
        cell: ({ getValue }) => formatarMoeda(getValue<number>()),
      },
      {
        accessorKey: "data_vencimento",
        header: "Vencimento",
        cell: ({ getValue }) => formatarDataBR(getValue<string | null>()) || "—",
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
        <h1 className="text-3xl font-semibold text-texto-1">Guias de pagamento</h1>
        {ehAdmin && (
          <Button onClick={() => setGerando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Gerar guias
          </Button>
        )}
      </div>

      {repasses.isError && <p className="text-sm text-estado-erro">{mensagemErro(repasses.error)}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <DataTable
          columns={columns}
          data={repasses.data?.linhas ?? []}
          total={repasses.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          carregando={repasses.isLoading}
          onLinhaClick={(linha) => setSelecionada(linha.id)}
          vazio="Nenhuma guia encontrada. Guias nascem do motor de cobrança (Subetapa 02.6) agregando as faturas holerite por empresa."
          toolbar={
            <Select
              value={status}
              onValueChange={(v) => aoMudarFiltro(setStatus, v as RepassesFiltros["status"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="previsto">Previsto</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
                <SelectItem value="em_atraso">Em atraso</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {selecionada ? (
          <DetalheGuia
            repasse={(repasses.data?.linhas ?? []).find((r) => r.id === selecionada) ?? null}
          />
        ) : (
          <Card className="flex items-center justify-center p-8 text-sm text-texto-2">
            Selecione uma guia para ver as faturas agregadas e a conciliação.
          </Card>
        )}
      </div>

      {gerando && <GerarGuiasDialog onOpenChange={setGerando} />}
    </div>
  );
}

function DetalheGuia({ repasse }: { repasse: RepasseListItem | null }) {
  const { role } = useAuth();
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);
  const faturas = useFaturasDoRepasse(repasse?.id);
  const atualizar = useAtualizarStatusRepasse(repasse?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);

  if (!repasse) return null;

  const somaFaturas = (faturas.data ?? []).reduce((acc, f) => acc + Number(f.valor), 0);
  const conciliado = Math.abs(somaFaturas - Number(repasse.valor_total)) < 0.01;
  const opcoes = TRANSICOES[repasse.status];

  async function mudar(novo: StatusRepasse) {
    setErro(null);
    try {
      await atualizar.mutateAsync(novo);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-texto-1">{repasse.numero_guia_pagamento}</h2>
          <p className="text-sm text-texto-2">{repasse.empresa?.razao_social ?? "—"}</p>
        </div>
        {podeEditar && opcoes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={atualizar.isPending}>
                <StatusBadge status={repasse.status} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {opcoes.map((op) => (
                <DropdownMenuItem key={op} onClick={() => void mudar(op)}>
                  Marcar como {ROTULO_STATUS_ACAO[op]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(!podeEditar || opcoes.length === 0) && <StatusBadge status={repasse.status} />}
      </div>

      {erro && <p className="text-sm text-estado-erro">{erro}</p>}

      <div
        className={`flex items-center gap-2 rounded-md p-3 text-sm ${
          conciliado ? "bg-estado-sucesso/10 text-estado-sucesso" : "bg-estado-erro/10 text-estado-erro"
        }`}
      >
        {conciliado ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          {conciliado
            ? `Conciliado — Σ faturas = ${formatarMoeda(somaFaturas)}`
            : `Divergência: guia ${formatarMoeda(repasse.valor_total)} × Σ faturas ${formatarMoeda(somaFaturas)}`}
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-texto-2">Faturas agregadas</p>
        {faturas.isLoading && <p className="text-sm text-texto-2">Carregando…</p>}
        {faturas.data && faturas.data.length === 0 && (
          <p className="text-sm text-texto-2">Nenhuma fatura vinculada a esta guia.</p>
        )}
        {faturas.data && faturas.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabalhador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faturas.data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.trabalhador?.nome ?? "—"}</TableCell>
                  <TableCell>{ROTULO_TIPO[f.tipo] ?? f.tipo}</TableCell>
                  <TableCell>{formatarMoeda(f.valor)}</TableCell>
                  <TableCell>
                    <StatusBadge status={f.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}
