import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useAuth } from "@/lib/auth";
import { useBeneficiosProprios } from "./api";

/**
 * Catálogo do próprio parceiro, somente leitura (frontend.md §2.2). RLS
 * (pol_beneficios_insert/update/delete) só permite escrita a Admin/Secretária
 * — não há "Novo benefício" aqui; cadastro passa pela Secretária/Admin.
 */
export function PortalBeneficiosPage() {
  const { perfil } = useAuth();
  const beneficios = useBeneficiosProprios(perfil?.parceiro_id ?? undefined);

  if (beneficios.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (beneficios.isError) return <p className="text-estado-erro">{mensagemErro(beneficios.error)}</p>;

  const linhas = beneficios.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Meus benefícios</h1>

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum benefício cadastrado ainda.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Nível mínimo</TableHead>
                <TableHead>Valor particular</TableHead>
                <TableHead>Valor convênio</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.nome}</TableCell>
                  <TableCell>{b.categoria ?? "—"}</TableCell>
                  <TableCell>
                    <NivelBadge nivel={b.nivel_minimo} />
                  </TableCell>
                  <TableCell>{formatarMoeda(b.valor_particular) || "—"}</TableCell>
                  <TableCell>{formatarMoeda(b.valor_convenio) || "—"}</TableCell>
                  <TableCell>{b.ativo ? "Sim" : "Não"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
