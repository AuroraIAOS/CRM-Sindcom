import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useAuth } from "@/lib/auth";
import { PayloadView } from "./PayloadView";
import {
  useAprovarSolicitacao,
  useCancelarSolicitacao,
  useRejeitarSolicitacao,
  useSolicitacoesAdmin,
  useTempoMedioAprovacao,
  type SolicitacaoAdmin,
} from "./api";

const ROTULO_OP: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

export function FilaAdminPage() {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  return ehAdmin ? <VisaoAdmin /> : <VisaoSolicitante />;
}

// ---------------------------------------------------------------------------
// Admin: analisa e decide
// ---------------------------------------------------------------------------

function VisaoAdmin() {
  const pendentes = useSolicitacoesAdmin(true);
  const tempo = useTempoMedioAprovacao();
  const [aprovar, setAprovar] = useState<SolicitacaoAdmin | null>(null);
  const [rejeitar, setRejeitar] = useState<SolicitacaoAdmin | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Fila do Admin</h1>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-texto-2">Pendentes</p>
          <p className="text-2xl font-bold text-texto-1">{pendentes.data?.length ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-texto-2">Tempo médio de aprovação</p>
          <p className="text-2xl font-bold text-texto-1">
            {tempo.data?.horas != null ? `${tempo.data.horas.toFixed(1)} h` : "—"}
          </p>
          <p className="text-xs text-texto-2">
            {tempo.data?.amostra ? `${tempo.data.amostra} analisada(s)` : "sem histórico"}
          </p>
        </Card>
      </div>

      {pendentes.isLoading && <p className="text-texto-2">Carregando…</p>}
      {pendentes.isError && <p className="text-estado-erro">{mensagemErro(pendentes.error)}</p>}
      {pendentes.data && pendentes.data.length === 0 && (
        <p className="text-sm text-texto-2">Nenhuma solicitação pendente.</p>
      )}

      <div className="flex flex-col gap-3">
        {(pendentes.data ?? []).map((sol) => (
          <Card key={sol.id} className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-realce/10 px-2 py-0.5 text-xs font-bold text-realce">
                {ROTULO_OP[sol.operacao] ?? sol.operacao} · {sol.tabela_alvo}
              </span>
              <span className="text-sm text-texto-2">
                por {sol.solicitante_perfil?.nome ?? "—"} em {formatarDataBR(sol.created_at)}
              </span>
            </div>

            {sol.justificativa && <p className="text-sm text-texto-1">{sol.justificativa}</p>}

            <div className="rounded-md border border-black/10 bg-fundo-2 p-3">
              <PayloadView payload={sol.payload} />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setAprovar(sol)}>Aprovar e executar</Button>
              <Button variant="outline" onClick={() => setRejeitar(sol)}>
                Rejeitar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {aprovar && (
        <AprovarDialog solicitacao={aprovar} onOpenChange={(o) => !o && setAprovar(null)} />
      )}
      {rejeitar && (
        <RejeitarDialog solicitacao={rejeitar} onOpenChange={(o) => !o && setRejeitar(null)} />
      )}
    </div>
  );
}

function AprovarDialog({
  solicitacao,
  onOpenChange,
}: {
  solicitacao: SolicitacaoAdmin;
  onOpenChange: (open: boolean) => void;
}) {
  const aprovar = useAprovarSolicitacao();
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    try {
      await aprovar.mutateAsync({ sol: solicitacao });
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      titulo="Aprovar e executar"
      descricao={
        <>
          A operação <strong>{ROTULO_OP[solicitacao.operacao] ?? solicitacao.operacao}</strong> em{" "}
          <strong>{solicitacao.tabela_alvo}</strong> será executada de verdade agora, com a sua
          sessão de Admin.
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      textoConfirmar="Aprovar e executar"
      carregando={aprovar.isPending}
      onConfirmar={confirmar}
    />
  );
}

function RejeitarDialog({
  solicitacao,
  onOpenChange,
}: {
  solicitacao: SolicitacaoAdmin;
  onOpenChange: (open: boolean) => void;
}) {
  const rejeitar = useRejeitarSolicitacao();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    try {
      await rejeitar.mutateAsync({ id: solicitacao.id, observacao });
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar solicitação</DialogTitle>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          Motivo (opcional — vai como notificação ao solicitante)
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rejeitar.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={rejeitar.isPending}>
            {rejeitar.isPending ? "Rejeitando…" : "Rejeitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Solicitante: acompanha e cancela as próprias
// ---------------------------------------------------------------------------

function VisaoSolicitante() {
  const solicitacoes = useSolicitacoesAdmin(false);
  const cancelar = useCancelarSolicitacao();
  const [cancelando, setCancelando] = useState<SolicitacaoAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmarCancelamento() {
    if (!cancelando) return;
    setErro(null);
    try {
      await cancelar.mutateAsync(cancelando.id);
      setCancelando(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Minhas solicitações ao Admin</h1>

      {solicitacoes.isLoading && <p className="text-texto-2">Carregando…</p>}
      {solicitacoes.isError && <p className="text-estado-erro">{mensagemErro(solicitacoes.error)}</p>}
      {solicitacoes.data && solicitacoes.data.length === 0 && (
        <p className="text-sm text-texto-2">Você ainda não abriu nenhuma solicitação.</p>
      )}

      <div className="flex flex-col gap-3">
        {(solicitacoes.data ?? []).map((sol) => (
          <Card key={sol.id} className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-black/5 px-2 py-0.5 text-xs font-bold">
                {ROTULO_OP[sol.operacao] ?? sol.operacao} · {sol.tabela_alvo}
              </span>
              <StatusBadge status={sol.status} />
              <span className="text-sm text-texto-2">{formatarDataBR(sol.created_at)}</span>
            </div>
            {sol.justificativa && <p className="text-sm text-texto-1">{sol.justificativa}</p>}
            {sol.observacao_analise && (
              <p className="text-sm text-texto-2">Resposta do Admin: {sol.observacao_analise}</p>
            )}
            <div className="rounded-md border border-black/10 bg-fundo-2 p-3">
              <PayloadView payload={sol.payload} />
            </div>
            {sol.status === "pendente" && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setCancelando(sol)}
              >
                Cancelar solicitação
              </Button>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(o) => !o && setCancelando(null)}
        titulo="Cancelar solicitação"
        descricao={
          <>
            Cancelar esta solicitação pendente?
            {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
          </>
        }
        destrutivo
        carregando={cancelar.isPending}
        textoConfirmar="Cancelar solicitação"
        onConfirmar={confirmarCancelamento}
      />
    </div>
  );
}
