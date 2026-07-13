import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAprovarCadastro,
  useCadastrosPendentes,
  useRejeitarCadastro,
  type CadastroPendente,
} from "./api";

const ROTULO_ORIGEM: Record<string, string> = {
  formulario_site: "Formulário do site",
  manual: "Manual",
  csv: "Importação CSV",
  agente_whatsapp: "Agente WhatsApp",
};

export function AprovacoesPage() {
  const navigate = useNavigate();
  const pendentes = useCadastrosPendentes();
  const [rejeitando, setRejeitando] = useState<CadastroPendente | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Aprovações de cadastro</h1>
      <p className="text-sm text-texto-2">
        Cadastros com status pendente (formulários do site e afins). Aprovar ou rejeitar é ato da
        Secretaria — não passa pela fila do Admin.
      </p>

      {pendentes.isError && <p className="text-estado-erro">{mensagemErro(pendentes.error)}</p>}

      <Card className="p-0">
        {pendentes.isLoading ? (
          <p className="p-4 text-texto-2">Carregando…</p>
        ) : (pendentes.data?.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-texto-2">Nenhum cadastro pendente.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Município</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead className="w-52">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pendentes.data ?? []).map((c) => (
                <LinhaPendente
                  key={c.id}
                  cadastro={c}
                  onAbrir={() => navigate(`/trabalhadores/${c.id}`)}
                  onRejeitar={() => setRejeitando(c)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {rejeitando && (
        <RejeitarCadastroDialog
          cadastro={rejeitando}
          onOpenChange={(o) => !o && setRejeitando(null)}
        />
      )}
    </div>
  );
}

function LinhaPendente({
  cadastro,
  onAbrir,
  onRejeitar,
}: {
  cadastro: CadastroPendente;
  onAbrir: () => void;
  onRejeitar: () => void;
}) {
  const aprovar = useAprovarCadastro();
  const [erro, setErro] = useState<string | null>(null);

  async function aprovarCadastro() {
    setErro(null);
    try {
      await aprovar.mutateAsync({ id: cadastro.id });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <button className="text-realce hover:underline" onClick={onAbrir}>
          {cadastro.nome}
        </button>
      </TableCell>
      <TableCell>{formatarCpf(cadastro.cpf)}</TableCell>
      <TableCell>{cadastro.nivel ? <NivelBadge nivel={cadastro.nivel} /> : "—"}</TableCell>
      <TableCell>
        {cadastro.municipio ? `${cadastro.municipio.nome}/${cadastro.municipio.uf}` : "—"}
      </TableCell>
      <TableCell>{ROTULO_ORIGEM[cadastro.origem_cadastro] ?? cadastro.origem_cadastro}</TableCell>
      <TableCell>{formatarDataBR(cadastro.created_at)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Button size="sm" onClick={aprovarCadastro} disabled={aprovar.isPending}>
              Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={onRejeitar}>
              Rejeitar
            </Button>
          </div>
          {erro && <span className="text-xs text-estado-erro">{erro}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function RejeitarCadastroDialog({
  cadastro,
  onOpenChange,
}: {
  cadastro: CadastroPendente;
  onOpenChange: (open: boolean) => void;
}) {
  const rejeitar = useRejeitarCadastro();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    try {
      await rejeitar.mutateAsync({ id: cadastro.id, observacao });
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar cadastro de {cadastro.nome}</DialogTitle>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          Motivo (opcional)
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rejeitar.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={rejeitar.isPending}>
            {rejeitar.isPending ? "Rejeitando…" : "Rejeitar cadastro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
