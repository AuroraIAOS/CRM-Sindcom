import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { NovoAtendimentoDialog } from "@/features/juridico/NovoAtendimentoDialog";
import { DetalheAtendimentoDialog } from "@/features/juridico/DetalheAtendimentoDialog";
import {
  ROTULO_TIPO,
  useAtendimentosTrabalhador,
  type AtendimentoListItem,
  type TrabalhadorOpcao,
} from "@/features/juridico/api";

const PODE_REGISTRAR = ["admin", "juridico"] as const;

/**
 * Atendimentos jurídicos do trabalhador, dentro da ficha (Subetapa 04.1).
 * Reaproveita os diálogos de `features/juridico` — a tela transversal e a
 * ficha compartilham exatamente o mesmo formulário e as mesmas regras.
 */
export function AtendimentosTab({ trabalhador }: { trabalhador: TrabalhadorOpcao }) {
  const { role } = useAuth();
  const podeRegistrar = role !== null && (PODE_REGISTRAR as readonly string[]).includes(role);
  const podeExcluir = role === "admin";

  const atendimentos = useAtendimentosTrabalhador(trabalhador.id);
  const [criando, setCriando] = useState(false);
  const [selecionado, setSelecionado] = useState<AtendimentoListItem | null>(null);

  if (atendimentos.isLoading) return <p className="text-texto-2">Carregando atendimentos…</p>;
  if (atendimentos.isError)
    return <p className="text-estado-erro">{mensagemErro(atendimentos.error)}</p>;

  const linhas = atendimentos.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeRegistrar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo atendimento
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum atendimento jurídico registrado.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Responsável</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => setSelecionado({ ...a, trabalhador })}
                >
                  <TableCell>{formatarDataBR(a.data)}</TableCell>
                  <TableCell>{ROTULO_TIPO[a.tipo]}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>{a.responsavel_perfil?.nome ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {criando && (
        <NovoAtendimentoDialog trabalhadorFixo={trabalhador} onOpenChange={setCriando} />
      )}

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
