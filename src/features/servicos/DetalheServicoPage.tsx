import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { formatarCpf, formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useAtualizarResolucaoAnalise, useCancelarSolicitacao, useSolicitacao } from "./api";

const PODE_OPERAR = ["admin", "secretaria"] as const;
/** Estados em que a guia ainda não foi processada — mesma janela que
 *  `fn_registrar_checkin` aceita para check-in. */
const CANCELAVEIS = ["solicitada", "pendente_confirmacao"];

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return `${formatarDataBR(valor)} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function DetalheServicoPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const podeOperar = role !== null && (PODE_OPERAR as readonly string[]).includes(role);
  const solicitacao = useSolicitacao(id);
  const cancelar = useCancelarSolicitacao();
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (solicitacao.isLoading) return <p className="text-texto-2">Carregando solicitação…</p>;
  if (solicitacao.isError)
    return <p className="text-estado-erro">{mensagemErro(solicitacao.error)}</p>;
  if (!solicitacao.data) return null;

  const s = solicitacao.data;
  const interessado = s.beneficiado?.nome ?? s.trabalhador?.nome ?? "—";
  const economia =
    s.valor_particular != null && s.valor_convenio != null
      ? s.valor_particular - s.valor_convenio
      : null;

  async function confirmarCancelamento() {
    setErro(null);
    try {
      await cancelar.mutateAsync(id as string);
      setConfirmandoCancelamento(false);
    } catch (e) {
      setErro(mensagemErro(e));
      setConfirmandoCancelamento(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/servicos" className="text-sm text-realce hover:underline">
            ← Voltar às solicitações
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-texto-1">Guia {s.numero_guia}</h1>
            <StatusBadge status={s.status} />
          </div>
        </div>
        {podeOperar && (
          <div className="flex items-center gap-2">
            {CANCELAVEIS.includes(s.status) && (
              <Button variant="outline" onClick={() => setConfirmandoCancelamento(true)}>
                <Ban className="mr-1 h-4 w-4" /> Cancelar solicitação
              </Button>
            )}
            <Button asChild>
              <Link to={`/servicos/${s.id}/guia`}>
                <Printer className="mr-1 h-4 w-4" /> Imprimir guia
              </Link>
            </Button>
          </div>
        )}
      </div>

      {erro && <p className="text-sm text-estado-erro">{erro}</p>}

      <Card className="flex flex-col gap-4 p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-texto-2">Interessado</dt>
            <dd className="text-texto-1">{interessado}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Titular</dt>
            <dd className="flex items-center gap-2 text-texto-1">
              {s.trabalhador ? (
                <Link to={`/trabalhadores/${s.trabalhador.id}`} className="text-realce hover:underline">
                  {s.trabalhador.nome}
                </Link>
              ) : (
                "—"
              )}
              {s.trabalhador?.nivel && <NivelBadge nivel={s.trabalhador.nivel} />}
            </dd>
          </div>
          <div>
            <dt className="text-texto-2">CPF do titular</dt>
            <dd className="text-texto-1">{formatarCpf(s.trabalhador?.cpf)}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Parceiro</dt>
            <dd className="text-texto-1">{s.parceiro?.nome ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Benefício</dt>
            <dd className="text-texto-1">{s.beneficio?.nome ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Data agendada</dt>
            <dd className="text-texto-1">
              {formatarDataBR(s.data_agendada)}
              {s.horario ? ` às ${s.horario.slice(0, 5)}` : ""}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-1 gap-4 rounded-md border border-black/10 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-texto-2">Valor particular</p>
            <p className="text-lg font-semibold text-texto-1">
              {formatarMoeda(s.valor_particular) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-texto-2">Valor convênio</p>
            <p className="text-lg font-semibold text-texto-1">
              {formatarMoeda(s.valor_convenio) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-texto-2">Economia do filiado</p>
            <p className="text-lg font-semibold text-estado-sucesso">
              {economia != null ? formatarMoeda(economia) : "—"}
            </p>
          </div>
        </div>

        {s.observacoes && (
          <div>
            <p className="text-xs text-texto-2">Observações</p>
            <p className="text-sm text-texto-1">{s.observacoes}</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold text-texto-1">Linha do tempo</h2>
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex flex-col">
            <span className="font-medium text-texto-1">Solicitação registrada</span>
            <span className="text-texto-2">{formatarDataHora(s.created_at)}</span>
          </li>
          {s.status === "pendente_confirmacao" && (
            <li className="flex flex-col">
              <span className="font-medium text-texto-1">Aguardando confirmação do parceiro</span>
              <span className="text-texto-2">
                A data agendada passou sem check-in — o parceiro confirma no portal.
              </span>
            </li>
          )}
          {s.checkin_em && (
            <li className="flex flex-col">
              <span className="font-medium text-texto-1">
                Check-in — {s.status === "executada" ? "atendido" : "recusado"}
              </span>
              <span className="text-texto-2">
                {formatarDataHora(s.checkin_em)}
                {s.recepcionista?.nome ? ` · por ${s.recepcionista.nome}` : ""}
              </span>
              {s.checkin_justificativa && (
                <span className="text-texto-2">Justificativa: {s.checkin_justificativa}</span>
              )}
            </li>
          )}
          {s.confirmada_em && (
            <li className="flex flex-col">
              <span className="font-medium text-texto-1">Confirmada pelo parceiro</span>
              <span className="text-texto-2">{formatarDataHora(s.confirmada_em)}</span>
            </li>
          )}
          {s.status === "cancelada" && (
            <li className="flex flex-col">
              <span className="font-medium text-texto-1">Solicitação cancelada</span>
              <span className="text-texto-2">{formatarDataHora(s.updated_at)}</span>
            </li>
          )}
        </ol>
        {s.motivo_rejeicao && (
          <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
            Motivo da recusa: {s.motivo_rejeicao}
          </p>
        )}
      </Card>

      {s.status === "rejeitada" && podeOperar && (
        <AnaliseRejeicao id={s.id} inicial={s.resolucao_analise} />
      )}

      <ConfirmDialog
        open={confirmandoCancelamento}
        onOpenChange={setConfirmandoCancelamento}
        titulo="Cancelar solicitação"
        descricao={`A guia ${s.numero_guia} deixa de valer e não poderá receber check-in. Esta ação não pode ser desfeita.`}
        textoConfirmar="Cancelar solicitação"
        textoCancelar="Voltar"
        destrutivo
        carregando={cancelar.isPending}
        onConfirmar={() => void confirmarCancelamento()}
      />
    </div>
  );
}

/** Tratamento das rejeitadas (frontend.md §2.2) — a Denise registra o desfecho
 *  da análise; o status permanece o que o parceiro decidiu. */
function AnaliseRejeicao({ id, inicial }: { id: string; inicial: string | null }) {
  const salvar = useAtualizarResolucaoAnalise(id);
  const [texto, setTexto] = useState(inicial ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function submeter() {
    setErro(null);
    setSalvo(false);
    try {
      await salvar.mutateAsync(texto);
      setSalvo(true);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="text-lg font-semibold text-texto-1">Análise da rejeição</h2>
      <p className="text-sm text-texto-2">
        Registre o desfecho: contato com o trabalhador, reagendamento, orientação dada.
      </p>
      <Textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setSalvo(false);
        }}
        rows={3}
      />
      {erro && <p className="text-sm text-estado-erro">{erro}</p>}
      {salvo && <p className="text-sm text-estado-sucesso">Análise registrada.</p>}
      <div>
        <Button onClick={() => void submeter()} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar análise"}
        </Button>
      </div>
    </Card>
  );
}
