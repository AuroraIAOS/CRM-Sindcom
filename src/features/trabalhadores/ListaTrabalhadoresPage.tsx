import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { Plus, Download, Rows2, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BulkActionsBar } from "@/components/shared/BulkActionsBar";
import { BulkAssignDialog, type SecaoAtribuicao } from "@/components/shared/BulkAssignDialog";
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
import { useCriarSolicitacaoLote } from "@/features/fila-admin/api";
import { resolverVinculosPrincipais } from "./bulk";
import {
  useAtribuirDadosEmLote,
  useAtribuirVinculosEmLote,
  useExcluirTrabalhadoresEmLote,
  useRegistrarCartasEmLote,
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
const ROTULO_PAGAMENTO = { holerite: "Holerite", boleto_direto: "Boleto direto" } as const;
const ROTULO_ORIGEM = {
  formulario_site: "Formulário do site",
  manual: "Cadastro manual",
  csv: "Importação CSV",
  agente_whatsapp: "Agente WhatsApp",
} as const;
const ROTULO_FORMA_CARTA = {
  presencial: "Presencial",
  email: "E-mail",
  correio: "Correio",
  outro: "Outro",
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
  const ehSecretaria = role === "secretaria";
  const podeCriar = role !== null && (PODE_CRIAR as readonly string[]).includes(role);
  const podeBulk = ehAdmin || ehSecretaria;

  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [compacto, setCompacto] = useState(false);
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
  const [erroLote, setErroLote] = useState<string | null>(null);

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
  const atribuirDados = useAtribuirDadosEmLote();
  const atribuirVinculos = useAtribuirVinculosEmLote();
  const registrarCartas = useRegistrarCartasEmLote();
  const excluirEmLote = useExcluirTrabalhadoresEmLote();
  const criarLote = useCriarSolicitacaoLote();

  const idsSelecionados = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  function aoMudarFiltro<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function baixarSelecionados() {
    const linhas = (trabalhadores.data?.linhas ?? []).filter((l) => rowSelection[l.id]);
    exportarCsv("trabalhadores-selecionados", linhas, COLUNAS_CSV_SELECAO);
  }

  // Seções da atribuição em massa (Tarefa 01.2). VÍNCULOS exclui `principal`
  // deliberadamente (flag estrutural — bulk arrisca a unique de vínculo
  // principal ativo / deixar trabalhador sem principal).
  const secoesAtribuicao: SecaoAtribuicao[] = useMemo(
    () => [
      {
        chave: "dados",
        titulo: "Dados",
        campos: [
          {
            name: "municipio_id",
            label: "Município",
            tipo: "select",
            opcoes: (municipios.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
          },
          { name: "data_filiacao", label: "Data de filiação", tipo: "date" },
          {
            name: "forma_pagamento_preferida",
            label: "Forma de pagamento preferida",
            tipo: "select",
            opcoes: Object.entries(ROTULO_PAGAMENTO).map(([value, label]) => ({ value, label })),
          },
          {
            name: "origem_cadastro",
            label: "Origem do cadastro",
            tipo: "select",
            opcoes: Object.entries(ROTULO_ORIGEM).map(([value, label]) => ({ value, label })),
          },
        ],
      },
      {
        chave: "vinculos",
        titulo: "Vínculos (aplica no vínculo principal ativo)",
        campos: [
          {
            name: "estabelecimento_id",
            label: "Estabelecimento",
            tipo: "select",
            opcoes: (estabelecimentos.data ?? []).map((e) => ({
              value: e.id,
              label: `${e.empresa?.razao_social ?? "—"} — ${e.nome_fantasia ?? e.cnpj_completo}`,
            })),
          },
          { name: "funcao", label: "Função", tipo: "text" },
          { name: "data_admissao", label: "Admissão", tipo: "date" },
          { name: "data_desligamento", label: "Desligamento", tipo: "date" },
          { name: "salario_informado", label: "Salário (override do piso)", tipo: "number" },
        ],
      },
      {
        chave: "cartas",
        titulo: "Cartas de oposição (registra e rebaixa a Bronze)",
        campos: [
          { name: "ano_base", label: "Ano-base", tipo: "number" },
          { name: "data_entrega", label: "Data de entrega", tipo: "date" },
          {
            name: "forma",
            label: "Forma de entrega",
            tipo: "select",
            opcoes: Object.entries(ROTULO_FORMA_CARTA).map(([value, label]) => ({ value, label })),
          },
          { name: "comprovante_url", label: "Comprovante (link)", tipo: "text" },
        ],
      },
    ],
    [municipios.data, estabelecimentos.data],
  );

  async function confirmarAtribuicao(porSecao: Record<string, Record<string, string>>) {
    const ids = idsSelecionados;
    if (ehAdmin) {
      if (porSecao.dados) await atribuirDados.mutateAsync({ ids, valores: porSecao.dados });
      if (porSecao.vinculos)
        await atribuirVinculos.mutateAsync({ trabalhadorIds: ids, valores: porSecao.vinculos });
      if (porSecao.cartas) await registrarCartas.mutateAsync({ ids, valores: porSecao.cartas });
    } else {
      // Secretária: 1 solicitação de lote por seção preenchida (fila-admin).
      if (porSecao.dados)
        await criarLote.mutateAsync({
          lote: { tipo: "dados", ids, valores: porSecao.dados },
          tabela_alvo: "trabalhadores",
          operacao: "UPDATE",
          justificativa: "Atribuição em massa — Dados",
        });
      if (porSecao.vinculos) {
        const vinculoIds = await resolverVinculosPrincipais(ids);
        await criarLote.mutateAsync({
          lote: { tipo: "vinculos", vinculoIds, valores: porSecao.vinculos },
          tabela_alvo: "vinculos_empregaticios",
          operacao: "UPDATE",
          justificativa: "Atribuição em massa — Vínculos",
        });
      }
      if (porSecao.cartas)
        await criarLote.mutateAsync({
          lote: { tipo: "cartas", ids, valores: porSecao.cartas },
          tabela_alvo: "cartas_oposicao",
          operacao: "INSERT",
          justificativa: "Registro de cartas em massa",
        });
      toast("Solicitação enviada ao Admin para aprovação.");
    }
    setRowSelection({});
  }

  async function confirmarExclusaoLote() {
    setErroLote(null);
    try {
      if (ehAdmin) {
        await excluirEmLote.mutateAsync(idsSelecionados);
      } else {
        await criarLote.mutateAsync({
          lote: { tipo: "excluir", ids: idsSelecionados },
          tabela_alvo: "trabalhadores",
          operacao: "DELETE",
          justificativa: "Exclusão em massa",
        });
        toast("Solicitação de exclusão enviada ao Admin para aprovação.");
      }
      const removidos = idsSelecionados;
      setRowSelection({});
      setExcluindo(false);
      if (ehAdmin && selecionado && removidos.includes(selecionado)) setSelecionado(null);
    } catch (e) {
      setErroLote(mensagemErro(e));
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

      {/* Barra superior de largura total (Tarefa 02.1): filtros à esquerda,
          densidade + export à direita. A coluna mestre fica só com a lista. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            title={compacto ? "Densidade confortável" : "Densidade compacta"}
            onClick={() => setCompacto((v) => !v)}
          >
            {compacto ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
          </Button>
          {ehAdmin && (
            <Button variant="outline" size="sm" onClick={() => setExportando(true)}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {trabalhadores.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(trabalhadores.error)}</p>
      )}

      {criando && <TrabalhadorFormDialog onOpenChange={setCriando} />}
      {exportando && (
        <ExportarTrabalhadoresDialog filtros={filtros} onOpenChange={setExportando} />
      )}

      {podeBulk && (
        <BulkActionsBar
          count={idsSelecionados.length}
          onBaixar={ehAdmin ? baixarSelecionados : undefined}
          onAtribuir={() => setAtribuindo(true)}
          onExcluir={() => setExcluindo(true)}
        />
      )}

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
          vazio="Nenhum trabalhador encontrado com estes filtros."
          ocultarBarraFerramentas
          compacto={compacto}
          onCompactoChange={setCompacto}
          enableSelection={podeBulk}
          getRowId={(l) => l.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
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
        titulo={ehSecretaria ? "Atribuir em massa (envia para aprovação)" : "Atribuir em massa"}
        count={idsSelecionados.length}
        secoes={secoesAtribuicao}
        avisos={{
          cartas:
            "Registrar carta rebaixa TODOS os selecionados a Bronze (zera as duas flags de recolhimento). Duplicatas de ano-base são puladas.",
        }}
        onConfirmar={confirmarAtribuicao}
      />

      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        titulo="Excluir trabalhadores selecionados"
        descricao={
          <>
            {ehSecretaria
              ? `Enviar uma solicitação de exclusão de ${idsSelecionados.length} trabalhador(es) para o Admin aprovar?`
              : `Remover ${idsSelecionados.length} trabalhador(es)? Isso também apaga em cascata os vínculos, beneficiados, cartas de oposição e faturas relacionados. Essa ação é irreversível.`}
            {erroLote && <p className="mt-2 text-estado-erro">{erroLote}</p>}
          </>
        }
        destrutivo={ehAdmin}
        carregando={excluirEmLote.isPending || criarLote.isPending}
        textoConfirmar={ehSecretaria ? "Enviar para aprovação" : "Excluir"}
        onConfirmar={confirmarExclusaoLote}
      />
    </div>
  );
}
