import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useSolicitacoesTrabalhador } from "@/features/servicos/api";

/** Somente leitura — o registro de novas solicitações é em /servicos, onde o
 *  formulário tem a pré-validação de nível e bloqueio. */
export function SolicitacoesTab({ trabalhadorId }: { trabalhadorId: string }) {
  const solicitacoes = useSolicitacoesTrabalhador(trabalhadorId);

  if (solicitacoes.isLoading) return <p className="text-texto-2">Carregando solicitações…</p>;
  if (solicitacoes.isError)
    return <p className="text-estado-erro">{mensagemErro(solicitacoes.error)}</p>;

  const linhas = solicitacoes.data ?? [];
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-texto-2">
        Nenhuma solicitação de serviço registrada para este trabalhador.
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Guia</TableHead>
            <TableHead>Interessado</TableHead>
            <TableHead>Benefício</TableHead>
            <TableHead>Parceiro</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Valor convênio</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link to={`/servicos/${s.id}`} className="text-realce hover:underline">
                  {s.numero_guia}
                </Link>
              </TableCell>
              <TableCell>{s.beneficiado?.nome ?? "Titular"}</TableCell>
              <TableCell>{s.beneficio?.nome ?? "—"}</TableCell>
              <TableCell>{s.parceiro?.nome ?? "—"}</TableCell>
              <TableCell>{formatarDataBR(s.data_agendada)}</TableCell>
              <TableCell>{formatarMoeda(s.valor_convenio) || "—"}</TableCell>
              <TableCell>
                <StatusBadge status={s.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
