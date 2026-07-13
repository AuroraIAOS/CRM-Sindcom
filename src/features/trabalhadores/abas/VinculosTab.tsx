import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarCnpj, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useVinculosTrabalhador } from "../api";

/** Somente leitura (Fase 1.1) — CRUD de vínculos chega na subetapa 01.2. */
export function VinculosTab({ trabalhadorId }: { trabalhadorId: string }) {
  const vinculos = useVinculosTrabalhador(trabalhadorId);

  if (vinculos.isLoading) return <p className="text-texto-2">Carregando vínculos…</p>;
  if (vinculos.isError) {
    return <p className="text-estado-erro">{mensagemErro(vinculos.error)}</p>;
  }
  const linhas = vinculos.data ?? [];
  if (linhas.length === 0) {
    return <p className="text-sm text-texto-2">Nenhum vínculo empregatício registrado.</p>;
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estabelecimento</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Admissão</TableHead>
            <TableHead>Desligamento</TableHead>
            <TableHead>Principal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((v) => (
            <TableRow key={v.id}>
              <TableCell>{v.estabelecimento?.nome_fantasia ?? "—"}</TableCell>
              <TableCell>{formatarCnpj(v.estabelecimento?.cnpj_completo)}</TableCell>
              <TableCell>{v.funcao ?? "—"}</TableCell>
              <TableCell>{formatarDataBR(v.data_admissao) || "—"}</TableCell>
              <TableCell>{formatarDataBR(v.data_desligamento) || "—"}</TableCell>
              <TableCell>{v.principal ? "Sim" : "Não"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
