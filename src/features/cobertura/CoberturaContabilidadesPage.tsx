import { Fragment, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ChevronDown, ChevronUp, Download, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import {
  useCoberturaContabilidades,
  usePendentesDaContabilidade,
  useRevogarToken,
  type EstabelecimentoPendente,
  type LinhaCobertura,
} from "./api";

/**
 * `/cobertura` — quais contabilidades ainda não mandaram, e o que falta em
 * cada uma (Subetapa 08.11, D4). Substitui o cruzamento manual repetido a
 * cada rodada de cobrança.
 *
 * O TOKEN NUNCA APARECE AQUI — nem para o Admin. "Revogar" só marca a linha
 * antiga e cria uma nova (que recebe token por DEFAULT do banco); ver
 * `api.ts` para o porquê disso ser suficiente para o critério de conclusão
 * sem depender da view de mascaramento (sql/22_cobertura_08_11.sql, Parte 2)
 * que ainda aguarda revisão de Maxwell.
 */
const PODE_REVOGAR = ["admin"] as const;

const COLUNAS_CSV_PENDENTES: ColunaCsv<EstabelecimentoPendente>[] = [
  { titulo: "CNPJ", valor: (l) => l.cnpj },
  { titulo: "Razão social", valor: (l) => l.razaoSocial },
  { titulo: "Nome fantasia", valor: (l) => l.nomeFantasia ?? "" },
];

function percentual(l: LinhaCobertura): number {
  return l.totalEstabelecimentos > 0
    ? Math.round((l.estabelecimentosCobertos / l.totalEstabelecimentos) * 100)
    : 0;
}

export function CoberturaContabilidadesPage() {
  const { role } = useAuth();
  const podeRevogar = role !== null && (PODE_REVOGAR as readonly string[]).includes(role);
  const cobertura = useCoberturaContabilidades();
  const [aberta, setAberta] = useState<string | null>(null);
  const [paraRevogar, setParaRevogar] = useState<LinhaCobertura | null>(null);

  const linhas = cobertura.data ?? [];
  const semNenhuma = linhas.filter((l) => l.estabelecimentosCobertos === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">Cobertura por contabilidade</h1>
        <p className="text-sm text-texto-2">
          {linhas.length > 0 && (
            <>
              <strong>{linhas.length}</strong> contabilidades · <strong>{semNenhuma}</strong> ainda sem
              nenhum estabelecimento coberto.{" "}
            </>
          )}
          Ordenado da pior para a melhor cobertura — é quem precisa de follow-up primeiro.
        </p>
      </header>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contabilidade</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cobertura.isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-texto-2">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {cobertura.isError && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-estado-erro">
                  {mensagemErro(cobertura.error)}
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              const perc = percentual(l);
              return (
                <Fragment key={l.contabilidadeId}>
                  <TableRow>
                    <TableCell>{l.nome}</TableCell>
                    <TableCell className="text-texto-2">{l.email}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-medium",
                          perc === 0 && "text-estado-erro",
                          perc > 0 && perc < 100 && "text-estado-alerta",
                          perc === 100 && "text-estado-sucesso",
                        )}
                      >
                        {l.estabelecimentosCobertos} de {l.totalEstabelecimentos} ({perc}%)
                      </span>
                    </TableCell>
                    <TableCell className="flex items-center justify-end gap-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAberta(aberta === l.contabilidadeId ? null : l.contabilidadeId)}
                      >
                        {aberta === l.contabilidadeId ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        Ver pendentes
                      </Button>
                      {podeRevogar && (
                        <Button variant="outline" size="sm" onClick={() => setParaRevogar(l)}>
                          <ShieldAlert className="h-4 w-4" />
                          Revogar token
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {aberta === l.contabilidadeId && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-fundo-2/40">
                        <PendentesDaContabilidade contabilidade={l} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!cobertura.isLoading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-texto-2">
                  Nenhuma contabilidade semeada ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <RevogarTokenDialog contabilidade={paraRevogar} onOpenChange={(open) => !open && setParaRevogar(null)} />
    </div>
  );
}

function PendentesDaContabilidade({ contabilidade }: { contabilidade: LinhaCobertura }) {
  const pendentes = usePendentesDaContabilidade(contabilidade.contabilidadeId);
  const linhas = pendentes.data ?? [];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-texto-1">
          Estabelecimentos ainda sem trabalhador vinculado ({linhas.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={linhas.length === 0}
          onClick={() => exportarCsv(`pendentes-${contabilidade.nome}`, linhas, COLUNAS_CSV_PENDENTES)}
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {pendentes.isLoading && (
        <p className="flex items-center gap-2 text-sm text-texto-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {pendentes.isError && <p className="text-sm text-estado-erro">{mensagemErro(pendentes.error)}</p>}
      {!pendentes.isLoading && linhas.length === 0 && (
        <p className="text-sm text-estado-sucesso">Todos os estabelecimentos desta contabilidade já têm trabalhador vinculado.</p>
      )}

      {linhas.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
          {linhas.map((e) => (
            <li key={e.cnpj} className="flex flex-wrap items-baseline gap-2 border-b py-1 last:border-0">
              <span className="font-mono text-xs text-texto-2">{e.cnpj}</span>
              <span className="text-texto-1">{e.razaoSocial}</span>
              {e.nomeFantasia && <span className="text-xs text-texto-2">({e.nomeFantasia})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevogarTokenDialog({
  contabilidade,
  onOpenChange,
}: {
  contabilidade: LinhaCobertura | null;
  onOpenChange: (open: boolean) => void;
}) {
  const revogar = useRevogarToken();
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!contabilidade) return;
    setErro(null);
    try {
      await revogar.mutateAsync(contabilidade.contabilidadeId);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!contabilidade}
      onOpenChange={onOpenChange}
      titulo="Revogar token"
      descricao={
        <>
          O link enviado a <strong>{contabilidade?.nome}</strong> deixa de funcionar imediatamente, e um
          novo link é gerado para a próxima comunicação. O histórico de remessas já recebidas não é
          apagado.
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      destrutivo
      carregando={revogar.isPending}
      textoConfirmar="Revogar"
      onConfirmar={confirmar}
    />
  );
}
