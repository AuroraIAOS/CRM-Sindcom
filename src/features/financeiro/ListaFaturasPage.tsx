import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
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
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { TrabalhadorPicker } from "@/features/servicos/TrabalhadorPicker";
import type { TrabalhadorOpcao } from "@/features/servicos/api";
import {
  useAtualizarStatusFatura,
  useBaseCalculoTrabalhador,
  useCriarFaturaExcepcional,
  useFaturas,
  type FaturaListItem,
  type FaturasFiltros,
} from "./api";
import { faturaExcepcionalSchema, type FaturaExcepcionalFormValues } from "./schemas";
import type { Database } from "@/lib/database.types";

type StatusFatura = Database["public"]["Enums"]["status_fatura"];

const PODE_EDITAR = ["admin", "secretaria"] as const;

const ROTULO_TIPO: Record<string, string> = {
  contribuicao_sindical: "Contribuição sindical",
  mensalidade_convenio: "Mensalidade do convênio",
  multa: "Multa",
  acordo: "Acordo",
  taxa_adicional: "Taxa adicional",
};

/** Transições manuais sensatas por status atual — a RLS permite qualquer
 *  UPDATE de admin/secretaria, isto é só para não oferecer um clique sem
 *  sentido (ex.: "reabrir" uma fatura paga não é uma ação desta tela). */
const TRANSICOES: Record<StatusFatura, StatusFatura[]> = {
  aberta: ["paga", "inadimplente", "isenta", "cancelada"],
  inadimplente: ["paga", "cancelada"],
  paga: [],
  isenta: [],
  cancelada: [],
};

const VALORES_INICIAIS: FaturaExcepcionalFormValues = {
  trabalhador_id: "",
  tipo: "multa",
  competencia: new Date().toISOString().slice(0, 10),
  valor: undefined as unknown as number,
  forma_cobranca: "holerite",
  data_vencimento: "",
  observacoes: "",
};

export function ListaFaturasPage() {
  const { role } = useAuth();
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [tipo, setTipo] = useState<FaturasFiltros["tipo"]>("todos");
  const [status, setStatus] = useState<FaturasFiltros["status"]>("todos");
  const [criando, setCriando] = useState(false);
  const [erroLinha, setErroLinha] = useState<string | null>(null);

  const filtros: FaturasFiltros = useMemo(
    () => ({ trabalhadorId: "todos", tipo, status }),
    [tipo, status],
  );
  const faturas = useFaturas(pagination, sorting, filtros);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo<ColumnDef<FaturaListItem, unknown>[]>(
    () => [
      {
        id: "trabalhador",
        header: "Trabalhador",
        enableSorting: false,
        cell: ({ row }) => row.original.trabalhador?.nome ?? "—",
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
        accessorKey: "valor",
        header: "Valor",
        cell: ({ getValue }) => formatarMoeda(getValue<number>()),
      },
      {
        accessorKey: "data_vencimento",
        header: "Vencimento",
        cell: ({ getValue }) => formatarDataBR(getValue<string | null>()) || "—",
      },
      {
        id: "guia",
        header: "Guia",
        enableSorting: false,
        cell: ({ row }) => row.original.repasse?.numero_guia_pagamento ?? "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <LinhaStatus
            fatura={row.original}
            podeEditar={podeEditar}
            onErro={setErroLinha}
          />
        ),
      },
    ],
    [podeEditar],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Faturas</h1>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova fatura excepcional
          </Button>
        )}
      </div>

      {faturas.isError && <p className="text-sm text-estado-erro">{mensagemErro(faturas.error)}</p>}
      {erroLinha && <p className="text-sm text-estado-erro">{erroLinha}</p>}

      <DataTable
        columns={columns}
        data={faturas.data?.linhas ?? []}
        total={faturas.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={faturas.isLoading}
        vazio="Nenhuma fatura encontrada. As faturas de contribuição/mensalidade nascem com o motor de cobrança (Subetapa 02.6) — enquanto isso, só faturas excepcionais aparecem aqui."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tipo} onValueChange={(v) => aoMudarFiltro(setTipo, v as FaturasFiltros["tipo"])}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="contribuicao_sindical">Contribuição sindical</SelectItem>
                <SelectItem value="mensalidade_convenio">Mensalidade do convênio</SelectItem>
                <SelectItem value="multa">Multa</SelectItem>
                <SelectItem value="acordo">Acordo</SelectItem>
                <SelectItem value="taxa_adicional">Taxa adicional</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => aoMudarFiltro(setStatus, v as FaturasFiltros["status"])}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="inadimplente">Inadimplente</SelectItem>
                <SelectItem value="isenta">Isenta</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {criando && <NovaFaturaExcepcionalDialog onOpenChange={setCriando} />}
    </div>
  );
}

function LinhaStatus({
  fatura,
  podeEditar,
  onErro,
}: {
  fatura: FaturaListItem;
  podeEditar: boolean;
  onErro: (msg: string | null) => void;
}) {
  const atualizar = useAtualizarStatusFatura(fatura.id);
  const opcoes = TRANSICOES[fatura.status];

  async function mudar(novo: StatusFatura) {
    onErro(null);
    try {
      await atualizar.mutateAsync(novo);
    } catch (e) {
      onErro(mensagemErro(e));
    }
  }

  if (!podeEditar || opcoes.length === 0) {
    return <StatusBadge status={fatura.status} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer" disabled={atualizar.isPending}>
          <StatusBadge status={fatura.status} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {opcoes.map((op) => (
          <DropdownMenuItem key={op} onClick={() => void mudar(op)}>
            Marcar como {ROTULO_STATUS_ACAO[op]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROTULO_STATUS_ACAO: Record<StatusFatura, string> = {
  aberta: "aberta",
  paga: "paga",
  inadimplente: "inadimplente",
  isenta: "isenta",
  cancelada: "cancelada",
};

function NovaFaturaExcepcionalDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const criar = useCriarFaturaExcepcional();
  const [titular, setTitular] = useState<TrabalhadorOpcao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const baseCalculo = useBaseCalculoTrabalhador(titular?.id);

  async function salvar(valores: FaturaExcepcionalFormValues) {
    setErro(null);
    try {
      await criar.mutateAsync(valores);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        // Mesmo caso de ListaServicosPage: o popover do TrabalhadorPicker é
        // portalizado para fora do Dialog — sem esta guarda, um clique num
        // resultado da busca pode ser lido como "clicou fora" e fechar tudo.
        onInteractOutside={(e) => {
          const alvo = e.target as Element | null;
          if (alvo?.closest("[data-radix-popper-content-wrapper]")) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Nova fatura excepcional</DialogTitle>
        </DialogHeader>

        <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
          Multa, acordo ou taxa adicional — cobranças de contribuição sindical e mensalidade do
          convênio nascem automaticamente do motor de cobrança.
        </p>

        <EntityForm
          id="form-fatura-excepcional"
          schema={faturaExcepcionalSchema}
          valoresIniciais={VALORES_INICIAIS}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="trabalhador_id"
                render={() => (
                  <FormItem>
                    <FormLabel>Trabalhador</FormLabel>
                    <TrabalhadorPicker
                      selecionado={titular}
                      onSelecionar={(t) => {
                        setTitular(t);
                        form.setValue("trabalhador_id", t.id, { shouldValidate: true });
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {titular && baseCalculo.data && (
                <p className="text-xs text-texto-2">
                  Referência: salário-base {formatarMoeda(baseCalculo.data.salario_base)} · teto da
                  contribuição anual {formatarMoeda(baseCalculo.data.valor_contribuicao_anual)}.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
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
                          <SelectItem value="multa">Multa</SelectItem>
                          <SelectItem value="acordo">Acordo</SelectItem>
                          <SelectItem value="taxa_adicional">Taxa adicional</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forma_cobranca"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de cobrança</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="holerite">Holerite</SelectItem>
                          <SelectItem value="boleto_direto">Boleto direto</SelectItem>
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
                  name="competencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competência</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
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
                      <FormLabel>Valor</FormLabel>
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
                name="data_vencimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimento (opcional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-fatura-excepcional" disabled={criar.isPending}>
            {criar.isPending ? "Salvando…" : "Criar fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
