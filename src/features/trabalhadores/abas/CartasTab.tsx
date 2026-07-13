import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useCartasTrabalhador } from "../api";

const ROTULO_FORMA = {
  presencial: "Presencial",
  email: "E-mail",
  correio: "Correio",
  outro: "Outro",
} as const;

/** Somente leitura (Fase 1.1) — registro de novas cartas chega na subetapa 01.2. */
export function CartasTab({ trabalhadorId }: { trabalhadorId: string }) {
  const cartas = useCartasTrabalhador(trabalhadorId);

  if (cartas.isLoading) return <p className="text-texto-2">Carregando cartas…</p>;
  if (cartas.isError) return <p className="text-estado-erro">{mensagemErro(cartas.error)}</p>;
  const linhas = cartas.data ?? [];
  if (linhas.length === 0) {
    return <p className="text-sm text-texto-2">Nenhuma carta de oposição registrada.</p>;
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ano-base</TableHead>
            <TableHead>Data de entrega</TableHead>
            <TableHead>Forma</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.ano_base}</TableCell>
              <TableCell>{formatarDataBR(c.data_entrega)}</TableCell>
              <TableCell>{ROTULO_FORMA[c.forma]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
