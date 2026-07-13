import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import { useAuth } from "@/lib/auth";
import { useMunicipiosBase } from "@/features/municipios/api";
import { useTrabalhadores, type TrabalhadorListItem, type TrabalhadoresFiltros } from "./api";
import { TrabalhadorFormDialog } from "./TrabalhadorFormDialog";

const PODE_CRIAR = ["admin", "secretaria"] as const;

const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;
const ROTULO_STATUS = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  inativo: "Inativo",
} as const;
const ROTULO_PAGAMENTO = { holerite: "Holerite", boleto_direto: "Boleto direto" } as const;

export function ListaTrabalhadoresPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const podeCriar = role !== null && (PODE_CRIAR as readonly string[]).includes(role);
  const [criando, setCriando] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<TrabalhadoresFiltros["nivel"]>("todos");
  const [municipioId, setMunicipioId] = useState<string>("todos");
  const [statusCadastro, setStatusCadastro] =
    useState<TrabalhadoresFiltros["statusCadastro"]>("todos");

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
  const trabalhadores = useTrabalhadores(pagination, sorting, filtros);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
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
        id: "municipio",
        header: "Município",
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original.municipio;
          return m ? `${m.nome}/${m.uf}` : "—";
        },
      },
      {
        accessorKey: "status_cadastro",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "forma_pagamento_preferida",
        header: "Pagamento",
        enableSorting: false,
        cell: ({ getValue }) => ROTULO_PAGAMENTO[getValue<"holerite" | "boleto_direto">()],
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

      <DataTable
        columns={columns}
        data={trabalhadores.data?.linhas ?? []}
        total={trabalhadores.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        carregando={trabalhadores.isLoading}
        onLinhaClick={(linha) => navigate(`/trabalhadores/${linha.id}`)}
        vazio="Nenhum trabalhador encontrado com estes filtros."
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
    </div>
  );
}
