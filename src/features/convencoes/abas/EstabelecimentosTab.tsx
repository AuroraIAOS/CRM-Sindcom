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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ArrowRightLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCnpj } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useEstabelecimentosDaConvencao,
  useEstabelecimentosParaMigracao,
  useMigrarEstabelecimentos,
} from "../api";

const PODE_MIGRAR = ["admin", "juridico"] as const;

/**
 * Migração em lote (plano_fases.md 01.3): ato deliberado e auditável — sempre
 * atrás de seleção explícita + confirmação, nunca automática. O "relatório"
 * exigido pela subetapa é o resumo exibido logo após a execução.
 */
export function EstabelecimentosTab({
  convencaoId,
  nomeConvencao,
}: {
  convencaoId: string;
  nomeConvencao: string;
}) {
  const { role } = useAuth();
  const podeMigrar = role !== null && (PODE_MIGRAR as readonly string[]).includes(role);

  const vinculados = useEstabelecimentosDaConvencao(convencaoId);
  const [dialogAberto, setDialogAberto] = useState(false);

  if (vinculados.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (vinculados.isError) return <p className="text-estado-erro">{mensagemErro(vinculados.error)}</p>;

  const linhas = vinculados.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeMigrar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogAberto(true)}>
            <ArrowRightLeft className="mr-1 h-4 w-4" /> Migrar estabelecimentos
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum estabelecimento vinculado a esta CCT ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome fantasia</TableHead>
              <TableHead>CNPJ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.nome_fantasia ?? "—"}</TableCell>
                <TableCell>{formatarCnpj(e.cnpj_completo)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dialogAberto && (
        <MigracaoDialog
          convencaoId={convencaoId}
          nomeConvencao={nomeConvencao}
          onOpenChange={setDialogAberto}
        />
      )}
    </div>
  );
}

function MigracaoDialog({
  convencaoId,
  nomeConvencao,
  onOpenChange,
}: {
  convencaoId: string;
  nomeConvencao: string;
  onOpenChange: (open: boolean) => void;
}) {
  const estabelecimentos = useEstabelecimentosParaMigracao();
  const migrar = useMigrarEstabelecimentos(convencaoId);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [relatorio, setRelatorio] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function confirmarMigracao() {
    setErro(null);
    try {
      const total = await migrar.mutateAsync(Array.from(selecionados));
      setRelatorio(total);
      setConfirmando(false);
    } catch (e) {
      setErro(mensagemErro(e));
      setConfirmando(false);
    }
  }

  if (relatorio !== null) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Migração concluída</DialogTitle>
          </DialogHeader>
          <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
            {relatorio} estabelecimento(s) migrado(s) para "{nomeConvencao}".
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={!confirmando} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Migrar estabelecimentos para "{nomeConvencao}"</DialogTitle>
          </DialogHeader>

          {estabelecimentos.isLoading && <p className="text-texto-2">Carregando…</p>}
          {estabelecimentos.isError && (
            <p className="text-estado-erro">{mensagemErro(estabelecimentos.error)}</p>
          )}

          {estabelecimentos.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome fantasia</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>CCT atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estabelecimentos.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Checkbox
                        checked={selecionados.has(e.id)}
                        onCheckedChange={() => alternar(e.id)}
                      />
                    </TableCell>
                    <TableCell>{e.nome_fantasia ?? "—"}</TableCell>
                    <TableCell>{formatarCnpj(e.cnpj_completo)}</TableCell>
                    <TableCell>{e.convencao?.nome ?? "Nenhuma"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={selecionados.size === 0}
              onClick={() => setConfirmando(true)}
            >
              Migrar {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        titulo="Confirmar migração em lote"
        descricao={`${selecionados.size} estabelecimento(s) serão movidos para a CCT "${nomeConvencao}". Esta ação altera o piso e as taxas aplicáveis a cada um imediatamente.`}
        textoConfirmar="Confirmar migração"
        carregando={migrar.isPending}
        onConfirmar={confirmarMigracao}
      />
    </>
  );
}
