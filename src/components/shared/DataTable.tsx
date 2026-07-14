import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Rows2,
  Rows3,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Tabela de dados server-side (frontend.md): a paginação (`.range()`), ordenação
 * e filtros são resolvidos no hook de `features/<domínio>/api.ts` — este
 * componente é controlado. A exportação CSV respeita a RLS por construção
 * (quem chama exporta o resultado da query atual, não a página visível).
 */
export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Total de linhas no servidor (para calcular o número de páginas). */
  total: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  carregando?: boolean;
  /** Slot de filtros à esquerda da barra de ferramentas. */
  toolbar?: ReactNode;
  /** Mensagem quando não há linhas. */
  vazio?: ReactNode;
  /** Handler do botão "Exportar CSV" (respeita RLS). Ausente = sem botão. */
  onExportar?: () => void;
  exportando?: boolean;
  onLinhaClick?: (linha: T) => void;
  /** Ativa a coluna de checkbox (seleção múltipla — Tarefa 01, restrita a ADMIN
   *  pela tela que usa o DataTable). Exige `getRowId`. */
  enableSelection?: boolean;
  getRowId?: (linha: T) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
};

export function DataTable<T>({
  columns,
  data,
  total,
  pagination,
  onPaginationChange,
  sorting = [],
  onSortingChange,
  carregando = false,
  toolbar,
  vazio = "Nenhum registro encontrado.",
  onExportar,
  exportando = false,
  onLinhaClick,
  enableSelection = false,
  getRowId,
  rowSelection = {},
  onRowSelectionChange,
}: DataTableProps<T>) {
  const [compacto, setCompacto] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  const colunasComSelecao: ColumnDef<T, unknown>[] = enableSelection
    ? [
        {
          id: "__selecao__",
          header: ({ table }) => (
            <Checkbox
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
              aria-label="Selecionar tudo"
              onClick={(e) => e.stopPropagation()}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              aria-label="Selecionar linha"
              onClick={(e) => e.stopPropagation()}
            />
          ),
          enableSorting: false,
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: colunasComSelecao,
    pageCount,
    state: { pagination, sorting, rowSelection },
    onPaginationChange,
    onSortingChange,
    onRowSelectionChange,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: enableSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });

  const paginaAtual = pagination.pageIndex + 1;
  const inicio = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const fim = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);
  const cellPad = compacto ? "py-1.5" : "py-3";

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de ferramentas: filtros à esquerda, densidade + export à direita */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            title={compacto ? "Densidade confortável" : "Densidade compacta"}
            onClick={() => setCompacto((v) => !v)}
          >
            {compacto ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
          </Button>
          {onExportar && (
            <Button variant="outline" size="sm" onClick={onExportar} disabled={exportando}>
              <Download className="mr-2 h-4 w-4" />
              {exportando ? "Exportando…" : "Exportar CSV"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const podeOrdenar = header.column.getCanSort();
                  const ordem = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : podeOrdenar ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {ordem === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : ordem === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={colunasComSelecao.length} className="h-24 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunasComSelecao.length} className="h-24 text-center text-muted-foreground">
                  {vazio}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onLinhaClick ? () => onLinhaClick(row.original) : undefined}
                  className={cn(onLinhaClick && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cellPad}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total === 0 ? "0 registros" : `${inicio}–${fim} de ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <span>
            Página {paginaAtual} de {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || carregando}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage() || carregando}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
