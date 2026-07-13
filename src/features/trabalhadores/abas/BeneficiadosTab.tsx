import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useBeneficiadosTrabalhador } from "../api";

const ROTULO_TIPO = { direto: "Direto", indireto: "Indireto", adicional: "Adicional" } as const;

/** Somente leitura (Fase 1.1) — CRUD de beneficiados chega na subetapa 01.2. */
export function BeneficiadosTab({ titularId }: { titularId: string }) {
  const beneficiados = useBeneficiadosTrabalhador(titularId);

  if (beneficiados.isLoading) return <p className="text-texto-2">Carregando beneficiados…</p>;
  if (beneficiados.isError) {
    return <p className="text-estado-erro">{mensagemErro(beneficiados.error)}</p>;
  }
  const linhas = beneficiados.data ?? [];
  if (linhas.length === 0) {
    return <p className="text-sm text-texto-2">Nenhum beneficiado registrado.</p>;
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CPF</TableHead>
            <TableHead>Parentesco</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Nascimento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ativo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.nome}</TableCell>
              <TableCell>{formatarCpf(b.cpf)}</TableCell>
              <TableCell>{b.parentesco ?? "—"}</TableCell>
              <TableCell>{ROTULO_TIPO[b.tipo]}</TableCell>
              <TableCell>{formatarDataBR(b.data_nascimento) || "—"}</TableCell>
              <TableCell><StatusBadge status={b.status_cadastro} /></TableCell>
              <TableCell>{b.ativo ? "Sim" : "Não"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
