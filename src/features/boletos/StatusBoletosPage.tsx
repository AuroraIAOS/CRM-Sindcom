import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ColumnDef, PaginationState, RowSelectionState } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { DataTable } from "@/components/shared/DataTable";
import { baixarCsv, gerarCsv, type ColunaCsv } from "@/lib/csv";
import { formatarCnpj, formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAvancarBoletos,
  useBoletosStatus,
  useEditarBoleto,
  useExportarStatus,
  type BoletoStatus,
  type FiltrosBoletos,
} from "./api";
import { ROTULO_CONTATO, SeletorCiclo, TagBoleto, useCicloSelecionado, usePodeOperarBoletos } from "./comum";
import {
  ESTADO_ANTERIOR,
  PROXIMO_ESTADO,
  ROTULO_ESTADO,
  rotuloTipo,
  TAG,
  type EstadoBoleto,
} from "./rotulos";

const TODAS = "todas";
const ESTADOS_COM_VALOR_CONGELADO: string[] = ["enviar", "enviado", "pago"];

const COLUNAS_CSV: ColunaCsv<BoletoStatus>[] = [
  { titulo: "ciclo", valor: (b) => b.ciclo_nome },
  { titulo: "tipo", valor: (b) => rotuloTipo(b.tipo) },
  { titulo: "convencao", valor: (b) => b.convencao_nome },
  { titulo: "cnpj", valor: (b) => formatarCnpj(b.cnpj_completo) },
  { titulo: "razao_social", valor: (b) => b.razao_social },
  { titulo: "situacao", valor: (b) => TAG[b.tag ?? ""]?.rotulo ?? b.tag },
  { titulo: "quantidade", valor: (b) => b.quantidade },
  { titulo: "valor", valor: (b) => (b.valor == null ? "" : b.valor.toFixed(2).replace(".", ",")) },
  { titulo: "vencimento", valor: (b) => formatarDataBR(b.vencimento) },
  { titulo: "numero_boleto", valor: (b) => b.numero_boleto },
  { titulo: "email", valor: (b) => b.caixa_email },
  { titulo: "contato", valor: (b) => ROTULO_CONTATO[b.situacao_contato ?? ""] ?? b.situacao_contato },
];

/** `/boletos/status` — a fila de trabalho: fazer → enviar → enviado → pago. */
export function StatusBoletosPage() {
  const podeOperar = usePodeOperarBoletos();
  const { cicloId, lista, escolher } = useCicloSelecionado();
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag") ?? TODAS;
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [paginacao, setPaginacao] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [selecao, setSelecao] = useState<RowSelectionState>({});
  const [cancelando, setCancelando] = useState<BoletoStatus[] | null>(null);
  const [editando, setEditando] = useState<BoletoStatus | null>(null);

  const filtros: FiltrosBoletos = useMemo(
    () => ({ cicloId, tag: tag === TODAS ? undefined : tag, busca: buscaAplicada }),
    [cicloId, tag, buscaAplicada],
  );

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    setPaginacao((p) => ({ ...p, pageIndex: 0 }));
    setSelecao({});
  }, [cicloId, tag, buscaAplicada]);

  useEffect(() => setSelecao({}), [paginacao.pageIndex, paginacao.pageSize]);

  const consulta = useBoletosStatus(filtros, paginacao);
  const avancar = useAvancarBoletos();
  const exportar = useExportarStatus();
  const linhas = consulta.data?.linhas ?? [];
  const selecionados = linhas.filter((l) => selecao[l.boleto_id as string]);
  const estados = new Set(selecionados.map((s) => s.estado));
  const estadoUnico = estados.size === 1 ? ([...estados][0] as EstadoBoleto) : null;
  const proximo = estadoUnico ? PROXIMO_ESTADO[estadoUnico] : undefined;
  const anterior = estadoUnico ? ESTADO_ANTERIOR[estadoUnico] : undefined;

  function mudarTag(v: string) {
    const novo = new URLSearchParams(params);
    if (v === TODAS) novo.delete("tag");
    else novo.set("tag", v);
    setParams(novo, { replace: true });
  }

  async function mover(para: EstadoBoleto) {
    try {
      const n = await avancar.mutateAsync({ ids: selecionados.map((s) => s.boleto_id as string), para });
      toast.success(`${n} ${n === 1 ? "boleto movido" : "boletos movidos"} para “${ROTULO_ESTADO[para]}”.`);
      setSelecao({});
    } catch (e) {
      const feitos = (e as { feitos?: number }).feitos;
      toast.error(`${mensagemErro(e)}${feitos ? ` (${feitos} já tinham sido movidos antes do erro.)` : ""}`);
    }
  }

  async function baixar() {
    try {
      const todas = await exportar.mutateAsync(filtros);
      baixarCsv("boletos-status", gerarCsv(todas, COLUNAS_CSV));
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  const colunas = useMemo<ColumnDef<BoletoStatus, unknown>[]>(
    () => [
      {
        id: "empresa",
        header: "Empresa",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.razao_social}</div>
            <div className="text-xs text-texto-2">{formatarCnpj(row.original.cnpj_completo)}</div>
          </div>
        ),
      },
      {
        id: "tipo",
        header: "Ciclo",
        cell: ({ row }) => (
          <div>
            {rotuloTipo(row.original.tipo)}
            <div className="text-xs text-texto-2">{row.original.convencao_nome}</div>
          </div>
        ),
      },
      { id: "tag", header: "Situação", cell: ({ row }) => <TagBoleto tag={row.original.tag} /> },
      { id: "qtd", header: "Qtd.", cell: ({ row }) => row.original.quantidade ?? "—" },
      {
        id: "valor",
        header: "Valor",
        cell: ({ row }) => {
          const b = row.original;
          if (b.valor != null) return formatarMoeda(b.valor);
          if (b.sem_valor_base) return <span className="text-estado-alerta">Sem valor-base</span>;
          return <span className="text-texto-2">—</span>;
        },
      },
      { id: "venc", header: "Vencimento", cell: ({ row }) => formatarDataBR(row.original.vencimento) },
      { id: "num", header: "Nº do boleto", cell: ({ row }) => row.original.numero_boleto ?? "—" },
      ...(podeOperar
        ? [
            {
              id: "acoes",
              header: "",
              cell: ({ row }: { row: { original: BoletoStatus } }) => (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Editar boleto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditando(row.original);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ),
            } as ColumnDef<BoletoStatus, unknown>,
          ]
        : []),
    ],
    [podeOperar],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold text-texto-1">Status dos boletos</h1>
        <SeletorCiclo cicloId={cicloId} lista={lista} onEscolher={escolher} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={tag} onValueChange={mudarTag}>
          <SelectTrigger className="w-48" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as situações</SelectItem>
            {Object.entries(TAG).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-72"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por razão social ou CNPJ"
        />
      </div>

      {podeOperar && selecionados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-fundo-2 p-2 text-sm">
          <span className="font-medium">{selecionados.length} selecionados</span>
          {estadoUnico ? (
            <>
              {proximo && (
                <Button size="sm" disabled={avancar.isPending} onClick={() => mover(proximo)}>
                  Avançar para “{ROTULO_ESTADO[proximo]}”
                </Button>
              )}
              {anterior && (
                <Button size="sm" variant="outline" disabled={avancar.isPending} onClick={() => mover(anterior)}>
                  Voltar para “{ROTULO_ESTADO[anterior]}”
                </Button>
              )}
              {estadoUnico !== "cancelado" && estadoUnico !== "pago" && (
                <Button size="sm" variant="ghost" onClick={() => setCancelando(selecionados)}>
                  Cancelar boletos
                </Button>
              )}
            </>
          ) : (
            <span className="text-texto-2">Selecione boletos na mesma situação para mover.</span>
          )}
        </div>
      )}

      <DataTable
        columns={colunas}
        data={linhas}
        total={consulta.data?.total ?? 0}
        pagination={paginacao}
        onPaginationChange={setPaginacao}
        carregando={consulta.isLoading}
        enableSelection={podeOperar}
        getRowId={(b) => b.boleto_id as string}
        rowSelection={selecao}
        onRowSelectionChange={setSelecao}
        onExportar={baixar}
        exportando={exportar.isPending}
        vazio={consulta.isError ? mensagemErro(consulta.error) : "Nenhum boleto com esses filtros."}
      />

      {cancelando && (
        <CancelarDialog
          boletos={cancelando}
          onFechar={() => setCancelando(null)}
          aoConcluir={() => setSelecao({})}
        />
      )}
      {editando && <EditarDialog boleto={editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function CancelarDialog({
  boletos,
  onFechar,
  aoConcluir,
}: {
  boletos: BoletoStatus[];
  onFechar: () => void;
  aoConcluir: () => void;
}) {
  const avancar = useAvancarBoletos();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    try {
      await avancar.mutateAsync({
        ids: boletos.map((b) => b.boleto_id as string),
        para: "cancelado",
        motivo: motivo.trim(),
      });
      toast.success(boletos.length === 1 ? "Boleto cancelado." : `${boletos.length} boletos cancelados.`);
      aoConcluir();
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar {boletos.length === 1 ? "boleto" : `${boletos.length} boletos`}</DialogTitle>
          <DialogDescription>O motivo fica registrado na auditoria.</DialogDescription>
        </DialogHeader>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" maxLength={300} />
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={avancar.isPending}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={avancar.isPending}>
            {avancar.isPending ? "Cancelando…" : "Cancelar boletos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({ boleto, onFechar }: { boleto: BoletoStatus; onFechar: () => void }) {
  const editar = useEditarBoleto();
  const manual = boleto.tipo === "ca" || boleto.tipo === "cn";
  const congelado = ESTADOS_COM_VALOR_CONGELADO.includes(boleto.estado ?? "");
  const [valor, setValor] = useState(boleto.valor == null ? "" : String(boleto.valor));
  const [numero, setNumero] = useState(boleto.numero_boleto ?? "");
  const [venc, setVenc] = useState(boleto.vencimento ?? "");
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    const campos: Parameters<typeof editar.mutateAsync>[0] = {
      id: boleto.boleto_id as string,
      numero_boleto: numero.trim() || null,
      vencimento: venc || null,
    };
    if (manual && !congelado) {
      const n = valor.trim() === "" ? null : Number(valor.replace(",", "."));
      if (n !== null && (!Number.isFinite(n) || n < 0)) return setErro("Valor inválido.");
      campos.valor = n;
    }
    try {
      await editar.mutateAsync(campos);
      toast.success("Boleto atualizado.");
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{boleto.razao_social}</DialogTitle>
          <DialogDescription>
            {rotuloTipo(boleto.tipo)} · {formatarCnpj(boleto.cnpj_completo)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-texto-1">Valor</span>
            {manual ? (
              <Input
                inputMode="decimal"
                value={valor}
                disabled={congelado}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            ) : (
              <Input value={boleto.valor == null ? "" : formatarMoeda(boleto.valor)} disabled />
            )}
            <span className="text-xs text-texto-2">
              {manual
                ? congelado
                  ? "O valor não muda depois que o boleto está pronto para envio."
                  : "CA e CN: o valor é digitado por boleto."
                : "TAF e PAMED: calculado pelo sistema (valor-base × trabalhadores)."}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-texto-1">Nº do boleto</span>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-texto-1">Vencimento</span>
            <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
          </label>
          {erro && <p className="text-estado-erro">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={editar.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={editar.isPending}>
            {editar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
