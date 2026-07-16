import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mensagemErro } from "@/lib/mensagens";
import { useAuth } from "@/lib/auth";
import { useRecepcionistasProprios } from "./api";

/**
 * Equipe credenciada do próprio parceiro, somente leitura (frontend.md §2.2).
 * Cadastro/PIN é gerido por Admin/Secretária em `/parceiros` — o PIN nunca é
 * lido de volta (é hash) nem exposto nesta tela.
 */
export function PortalRecepcionistasPage() {
  const { perfil } = useAuth();
  const recepcionistas = useRecepcionistasProprios(perfil?.parceiro_id ?? undefined);

  if (recepcionistas.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (recepcionistas.isError)
    return <p className="text-estado-erro">{mensagemErro(recepcionistas.error)}</p>;

  const linhas = recepcionistas.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Meus recepcionistas</h1>

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum recepcionista cadastrado ainda.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
