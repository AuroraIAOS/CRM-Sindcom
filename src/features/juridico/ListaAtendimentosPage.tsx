import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { NovoAtendimentoDialog } from "./NovoAtendimentoDialog";
import { DetalheAtendimentoDialog } from "./DetalheAtendimentoDialog";
import {
  FILTROS_VAZIOS,
  ROTULO_STATUS,
  ROTULO_TIPO,
  useAtendimentos,
  type AtendimentoListItem,
  type AtendimentosFiltros,
  type StatusAtendimento,
  type TipoAtendimento,
} from "./api";

/**
 * `/juridico` — Atendimentos jurídicos (specs/frontend.md §2.2).
 *
 * Papéis (sql/03_rls.sql §13): todos os internos LEEM; só admin e jurídico
 * REGISTRAM e EDITAM; só admin EXCLUI. A Secretaria é leitora aqui — inverso
 * do papel dela nas demais telas, e isso é deliberado.
 */
const PODE_REGISTRAR = ["admin", "juridico"] as const;

/** Mesmo rótulo da tela no arquivo exportado (`orientacoes.md` §4.4). */
const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

const COLUNAS_CSV: ColunaCsv<AtendimentoListItem>[] = [
  { titulo: "Data", valor: (a) => formatarDataBR(a.data) },
  { titulo: "Trabalhador", valor: (a) => a.trabalhador?.nome ?? "" },
  { titulo: "CPF", valor: (a) => formatarCpf(a.trabalhador?.cpf) },
  {
    titulo: "Nível",
    valor: (a) => (a.trabalhador?.nivel ? ROTULO_NIVEL[a.trabalhador.nivel] : ""),
  },
  { titulo: "Tipo", valor: (a) => ROTULO_TIPO[a.tipo] },
  { titulo: "Situação", valor: (a) => ROTULO_STATUS[a.status as StatusAtendimento] ?? a.status },
  { titulo: "Responsável", valor: (a) => a.responsavel_perfil?.nome ?? "" },
  { titulo: "Resumo", valor: (a) => a.resumo ?? "" },
];

export function ListaAtendimentosPage() {
  const { role } = useAuth();
  const podeRegistrar = role !== null && (PODE_REGISTRAR as readonly string[]).includes(role);
  const podeExcluir = role === "admin";

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filtros, setFiltros] = useState<AtendimentosFiltros>(FILTROS_VAZIOS);
  const [criando, setCriando] = useState(false);
  const [selecionado, setSelecionado] = useState<AtendimentoListItem | null>(null);
  const [exportando, setExportando] = useState(false);

  const atendimentos = useAtendimentos(pagination, sorting, filtros);

  function aoMudarFiltro<K extends keyof AtendimentosFiltros>(
    chave: K,
    valor: AtendimentosFiltros[K],
  ) {
    setFiltros((f) => ({ ...f, [chave]: valor }));
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function exportar() {
    setExportando(true);
    try {
      // Exporta o que a tela está mostrando — mesma estrutura já montada pelo
      // hook, nunca uma segunda consulta (orientacoes.md §4.4).
      exportarCsv("atendimentos-juridicos", atendimentos.data?.linhas ?? [], COLUNAS_CSV);
    } finally {
      setExportando(false);
    }
  }

  const columns = useMemo<ColumnDef<AtendimentoListItem, unknown>[]>(
    () => [
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ getValue }) => formatarDataBR(getValue<string>()),
      },
      {
        id: "trabalhador",
        header: "Trabalhador",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-texto-1">{row.original.trabalhador?.nome ?? "—"}</span>
            <span className="text-xs text-texto-2">
              {formatarCpf(row.original.trabalhador?.cpf)}
            </span>
          </div>
        ),
      },
      {
        id: "nivel",
        header: "Nível",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.trabalhador?.nivel ? (
            <NivelBadge nivel={row.original.trabalhador.nivel} />
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ getValue }) => ROTULO_TIPO[getValue<TipoAtendimento>()],
      },
      {
        accessorKey: "status",
        header: "Situação",
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        id: "responsavel",
        header: "Responsável",
        enableSorting: false,
        cell: ({ row }) => row.original.responsavel_perfil?.nome ?? "—",
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-texto-1">Atendimentos jurídicos</h1>
          <p className="text-sm text-texto-2">
            Orientação geral é livre para qualquer nível. Homologação, processo e demais
            assistências individuais exigem nível Prata e contribuição em dia.
          </p>
        </div>
        {podeRegistrar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo atendimento
          </Button>
        )}
      </div>

      {atendimentos.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(atendimentos.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={atendimentos.data?.linhas ?? []}
        total={atendimentos.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={atendimentos.isLoading}
        onLinhaClick={(linha) => setSelecionado(linha)}
        onExportar={exportar}
        exportando={exportando}
        vazio="Nenhum atendimento jurídico registrado."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome ou CPF…"
              value={filtros.busca}
              onChange={(e) => aoMudarFiltro("busca", e.target.value)}
              className="w-56"
            />
            <Select
              value={filtros.tipo}
              onValueChange={(v) => aoMudarFiltro("tipo", v as AtendimentosFiltros["tipo"])}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {(Object.keys(ROTULO_TIPO) as TipoAtendimento[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filtros.status}
              onValueChange={(v) => aoMudarFiltro("status", v as AtendimentosFiltros["status"])}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as situações</SelectItem>
                {(Object.keys(ROTULO_STATUS) as StatusAtendimento[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {ROTULO_STATUS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="Data inicial"
              value={filtros.de}
              onChange={(e) => aoMudarFiltro("de", e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              aria-label="Data final"
              value={filtros.ate}
              onChange={(e) => aoMudarFiltro("ate", e.target.value)}
              className="w-40"
            />
          </div>
        }
      />

      {criando && <NovoAtendimentoDialog onOpenChange={setCriando} />}

      {selecionado && (
        <DetalheAtendimentoDialog
          key={selecionado.id}
          atendimento={selecionado}
          podeEditar={podeRegistrar}
          podeExcluir={podeExcluir}
          onOpenChange={(open) => !open && setSelecionado(null)}
        />
      )}
    </div>
  );
}
