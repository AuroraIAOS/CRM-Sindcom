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
import { useFaturasTrabalhador } from "../api";

const ROTULO_TIPO = {
  contribuicao_sindical: "Contribuição sindical",
  mensalidade_convenio: "Mensalidade do convênio",
  multa: "Multa",
  acordo: "Acordo",
  taxa_adicional: "Taxa adicional",
} as const;

/** Somente leitura — fica vazia até o motor de cobrança da Etapa 02 gerar faturas. */
export function FaturasTab({ trabalhadorId }: { trabalhadorId: string }) {
  const faturas = useFaturasTrabalhador(trabalhadorId);

  if (faturas.isLoading) return <p className="text-texto-2">Carregando faturas…</p>;
  if (faturas.isError) return <p className="text-estado-erro">{mensagemErro(faturas.error)}</p>;
  const linhas = faturas.data ?? [];
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-texto-2">
        Nenhuma fatura gerada ainda — o motor de cobrança entra na Etapa 02.
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Competência</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((f) => (
            <TableRow key={f.id}>
              <TableCell>{ROTULO_TIPO[f.tipo]}</TableCell>
              <TableCell>{formatarDataBR(f.competencia)}</TableCell>
              <TableCell>{formatarMoeda(f.valor)}</TableCell>
              <TableCell>{formatarDataBR(f.data_vencimento) || "—"}</TableCell>
              <TableCell><StatusBadge status={f.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
