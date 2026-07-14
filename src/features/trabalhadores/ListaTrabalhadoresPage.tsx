import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BulkActionsBar } from "@/components/shared/BulkActionsBar";
import { BulkAssignDialog } from "@/components/shared/BulkAssignDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarCpf } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { useAuth } from "@/lib/auth";
import { useMunicipiosBase } from "@/features/municipios/api";
import { useEstabelecimentosSimples } from "@/features/estabelecimentos/api";
import {
  useAtribuirEstabelecimentoEmLote,
  useExcluirTrabalhadoresEmLote,
  useTrabalhadores,
  type TrabalhadorListItem,
  type TrabalhadoresFiltros,
} from "./api";
import { TrabalhadorFormDialog } from "./TrabalhadorFormDialog";
import { ExportarTrabalhadoresDialog } from "./ExportarTrabalhadoresDialog";
import { DetalheTrabalhador } from "./DetalheTrabalhador";

const PODE_CRIAR = ["admin", "secretaria"] as const;

const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;
const ROTULO_STATUS = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  inativo: "Inativo",
} as const;
const COLUNAS_CSV_SELECAO: ColunaCsv<TrabalhadorListItem>[] = [
  { titulo: "Nome", valor: (l) => l.nome },
  { titulo: "CPF", valor: (l) => formatarCpf(l.cpf) },
  { titulo: "Nível", valor: (l) => (l.nivel ? ROTULO_NIVEL[l.nivel] : "") },
  { titulo: "Município", valor: (l) => (l.municipio ? `${l.municipio.nome}/${l.municipio.uf}` : "") },
  { titulo: "Status", valor: (l) => ROTULO_STATUS[l.status_cadastro] },
];

export function ListaTrabalhadoresPage({ idInicial }: { idInicial?: string } = {}) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const podeCriar = role !== null && (PODE_CRIAR as readonly string[]).includes(role);
  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<TrabalhadoresFiltros["nivel"]>("todos");
  const [municipioId, setMunicipioId] = useState<string>("todos");
  const [statusCadastro, setStatusCadastro] =
    useState<TrabalhadoresFiltros["statusCadastro"]>("todos");
  const [selecionado, setSelecionado] = useState<string | null>(idInicial ?? null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [atribuindo, setAtribuindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const filtros: TrabalhadoresFiltros = useMemo(
    () => ({
      busca,
      nivel,
      municipioId: municipioId === "todos" ? "todos" : Number(municipioId),
      statusCadastro,
    }),
    [busca, nivel, municipioId, statusCadastro],
  );

  const municipios = useMunicipiosBase();
  const estabelecimentos = useEstabelecimentosSimples();
  const trabalhadores = useTrabalhadores(pagination, sorting, filtros);
  const atribuirEstabelecimento = useAtribuirEstabelecimentoEmLote();
  const excluirEmLote = useExcluirTrabalhadoresEmLote();

  const idsSelecionados = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function baixarSelecionados() {
    const linhas = (trabalhadores.data?.linhas ?? []).filter((l) => rowSelection[l.id]);
    exportarCsv("trabalhadores-selecionados", linhas, COLUNAS_CSV_SELECAO);
  }

  async function confirmarExclusaoLote() {
    try {
      await excluirEmLote.mutateAsync(idsSelecionados);
      setRowSelection({});
      setExcluindo(false);
      if (selecionado && idsSelecionados.includes(selecionado)) setSelecionado(null);
    } catch {
      // mensagem já exibida no ConfirmDialog via erro do hook — mantém aberto
    }
  }

  const columns = useMemo<ColumnDef<TrabalhadorListItem, unknown>[]>(
    () => [
      { accessorKey: "nome", header: "Nome" },
      {
        accessorKey: "cpf",
        header: "CPF",
        cell: ({ getValue }) => formatarCpf(getValue<string>()),
      },
      {
        accessorKey: "nivel",
        header: "Nível",
        cell: ({ getValue }) => {
          const nivel = getValue<TrabalhadorListItem["nivel"]>();
          return nivel ? <NivelBadge nivel={nivel} /> : "—";
        },
      },
      {
        accessorKey: "status_cadastro",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Trabalhadores</h1>
        {podeCriar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo trabalhador
          </Button>
        )}
      </div>

      {trabalhadores.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(trabalhadores.error)}</p>
      )}

      {criando && <TrabalhadorFormDialog onOpenChange={setCriando} />}
      {exportando && (
        <ExportarTrabalhadoresDialog filtros={filtros} onOpenChange={setExportando} />
      )}

      {ehAdmin && <BulkActionsBar
        count={idsSelecionados.length}
        onBaixar={baixarSelecionados}
        onAtribuir={() => setAtribuindo(true)}
        onExcluir={() => setExcluindo(true)}
      />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <DataTable
          columns={columns}
          data={trabalhadores.data?.linhas ?? []}
          total={trabalhadores.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          carregando={trabalhadores.isLoading}
          onLinhaClick={(linha) => setSelecionado(linha.id)}
          onExportar={() => setExportando(true)}
          vazio="Nenhum trabalhador encontrado com estes filtros."
          enableSelection={ehAdmin}
          getRowId={(l) => l.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          toolbar={
            <>
              <Input
                placeholder="Buscar por nome ou CPF…"
                value={busca}
                onChange={(e) => aoMudarFiltro(setBusca, e.target.value)}
                className="w-64"
              />
              <Select
                value={nivel}
                onValueChange={(v) => aoMudarFiltro(setNivel, v as TrabalhadoresFiltros["nivel"])}
              >
                <SelectTrigger className="w-32"><SelectValue placeholder="Nível" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os níveis</SelectItem>
                  {Object.entries(ROTULO_NIVEL).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusCadastro}
                onValueChange={(v) =>
                  aoMudarFiltro(setStatusCadastro, v as TrabalhadoresFiltros["statusCadastro"])
                }
              >
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={municipioId} onValueChange={(v) => aoMudarFiltro(setMunicipioId, v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Município" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os municípios</SelectItem>
                  {(municipios.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />

        {selecionado ? (
          <DetalheTrabalhador trabalhadorId={selecionado} />
        ) : (
          <Card className="flex items-center justify-center p-8 text-sm text-texto-2">
            Selecione um trabalhador na lista para ver a ficha completa.
          </Card>
        )}
      </div>

      <BulkAssignDialog
        open={atribuindo}
        onOpenChange={setAtribuindo}
        titulo="Atribuir estabelecimento em massa"
        count={idsSelecionados.length}
        campos={[
          {
            name: "estabelecimento_id",
            label: "Estabelecimento",
            tipo: "select",
            opcoes: (estabelecimentos.data ?? []).map((e) => ({
              value: e.id,
              label: `${e.empresa?.razao_social ?? "—"} — ${e.nome_fantasia ?? e.cnpj_completo}`,
            })),
          },
        ]}
        onConfirmar={async (valores) => {
          if (!valores.estabelecimento_id) return;
          await atribuirEstabelecimento.mutateAsync({
            trabalhadorIds: idsSelecionados,
            estabelecimentoId: valores.estabelecimento_id,
          });
          setRowSelection({});
        }}
      />

      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        titulo="Excluir trabalhadores selecionados"
        descricao={
          <>
            Remover {idsSelecionados.length} trabalhador(es)? Isso também apaga em cascata os
            vínculos, beneficiados, cartas de oposição e faturas relacionados. Essa ação é
            irreversível.
            {excluirEmLote.isError && (
              <p className="mt-2 text-estado-erro">{mensagemErro(excluirEmLote.error)}</p>
            )}
          </>
        }
        destrutivo
        carregando={excluirEmLote.isPending}
        textoConfirmar="Excluir"
        onConfirmar={confirmarExclusaoLote}
      />
    </div>
  );
}
