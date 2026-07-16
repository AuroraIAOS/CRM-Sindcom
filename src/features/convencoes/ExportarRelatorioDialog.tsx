import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { mascararCpf } from "@/lib/formatters";
import { useRegistrarImportacao } from "@/features/importacao/api";
import type { TrabalhadorRelatorio } from "./api";

const ROTULO_PAGAMENTO: Record<string, string> = {
  holerite: "Holerite",
  boleto_direto: "Boleto direto",
};

const COLUNAS_BASE: ColunaCsv<TrabalhadorRelatorio>[] = [
  { titulo: "Nome", valor: (l) => l.trabalhador ?? "" },
  { titulo: "Nível", valor: (l) => l.nivel ?? "" },
  {
    titulo: "Forma de pagamento",
    valor: (l) =>
      l.forma_pagamento_preferida ? ROTULO_PAGAMENTO[l.forma_pagamento_preferida] : "",
  },
  // Todos os vínculos, como na tela: `estabelecimento` sozinho traria só o do
  // primeiro vínculo e sumiria com os demais no CSV que vai para o RH.
  { titulo: "Estabelecimento", valor: (l) => l.estabelecimentos.join(", ") },
  { titulo: "Empresa", valor: (l) => l.empresa ?? "" },
];

/**
 * specs/importacao.md §8: escolha explícita entre dados crus (Admin, logada em
 * importacoes_csv como `export:relatorio-cct`) e mascarados (qualquer papel com
 * select). Recebe as linhas já deduplicadas pela aba — a query do hook já
 * paginou a view inteira, então não há refetch aqui.
 */
export function ExportarRelatorioDialog({
  linhas,
  nomeConvencao,
  anoBase,
  onOpenChange,
}: {
  linhas: TrabalhadorRelatorio[];
  nomeConvencao: string;
  anoBase: number;
  onOpenChange: (open: boolean) => void;
}) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const registrarLog = useRegistrarImportacao();
  const [carregando, setCarregando] = useState<"crua" | "mascarada" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar(tipo: "crua" | "mascarada") {
    setErro(null);
    setCarregando(tipo);
    try {
      const colunas: ColunaCsv<TrabalhadorRelatorio>[] =
        tipo === "crua"
          ? [{ titulo: "CPF", valor: (l) => l.cpf ?? "" }, ...COLUNAS_BASE]
          : [{ titulo: "CPF", valor: (l) => mascararCpf(l.cpf) }, ...COLUNAS_BASE];

      exportarCsv(`relatorio_cct_${anoBase}_${tipo}`, linhas, colunas);

      if (tipo === "crua") {
        await registrarLog.mutateAsync({
          entidade: "export:relatorio-cct",
          arquivo_nome: `relatorio_cct_${anoBase}_crua_${new Date().toISOString().slice(0, 10)}.csv`,
          total_linhas: linhas.length,
          inseridos: 0,
          atualizados: 0,
          erros: [],
        });
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(null);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar relatório da CCT</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-texto-2">
          {linhas.length} trabalhador(es) regido(s) por "{nomeConvencao}" (ano-base {anoBase}).
        </p>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border p-3">
            <p className="font-semibold text-texto-1">Dados mascarados (divulgação)</p>
            <p className="text-sm text-texto-2">
              CPF parcial. Seguro para compartilhar com o RH das empresas.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => exportar("mascarada")}
              disabled={carregando !== null}
            >
              {carregando === "mascarada" ? "Exportando…" : "Exportar mascarado"}
            </Button>
          </div>

          {ehAdmin && (
            <div className="rounded-md border p-3">
              <p className="font-semibold text-texto-1">Dados crus (tratamento)</p>
              <p className="text-sm text-texto-2">
                CPF completo, para conferência interna e cruzamento com a folha. Fica registrado
                com data/hora e usuário em <code>importacoes_csv</code>.
              </p>
              <Button className="mt-2" onClick={() => exportar("crua")} disabled={carregando !== null}>
                {carregando === "crua" ? "Exportando…" : "Exportar cru"}
              </Button>
            </div>
          )}
        </div>
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={carregando !== null}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
