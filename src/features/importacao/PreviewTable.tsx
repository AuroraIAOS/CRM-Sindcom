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
import { cn } from "@/lib/utils";
import type { LinhaPreview, StatusLinha } from "./parsers";

const ESTILO_STATUS: Record<StatusLinha, { rotulo: string; classe: string; fundoLinha: string }> = {
  inserir: { rotulo: "Inserir", classe: "bg-estado-sucesso/15 text-estado-sucesso", fundoLinha: "" },
  atualizar: { rotulo: "Atualizar", classe: "bg-estado-alerta/15 text-estado-alerta", fundoLinha: "" },
  aviso: { rotulo: "Aviso", classe: "bg-estado-alerta/15 text-estado-alerta", fundoLinha: "" },
  rejeitada: { rotulo: "Rejeitada", classe: "bg-estado-erro/15 text-estado-erro", fundoLinha: "bg-estado-erro/5" },
};

/**
 * Tabela de preview da importação (specs/importacao.md §6): 🟢 inserir ·
 * 🟡 atualizar/aviso · 🔴 rejeitada, com filtro "só problemas". Cada domínio
 * (empresas/estabelecimentos/trabalhadores/beneficiados) passa sua própria
 * função de resumo — os campos variam demais entre entidades para uma grade
 * de colunas genérica.
 */
export function PreviewTable<T>({
  preview,
  resumoLinha,
}: {
  preview: LinhaPreview<T>[];
  resumoLinha: (linha: LinhaPreview<T>) => string;
}) {
  const [soProblemas, setSoProblemas] = useState(false);
  const linhas = soProblemas
    ? preview.filter((l) => l.status === "rejeitada" || l.status === "aviso")
    : preview;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setSoProblemas((v) => !v)}>
          {soProblemas ? "Mostrar todas" : "Só problemas"}
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-16">Linha</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Resumo</TableHead>
              <TableHead>Mensagens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-texto-2">
                  Nenhuma linha para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => {
                const estilo = ESTILO_STATUS[l.status];
                return (
                  <TableRow key={l.linha} className={estilo.fundoLinha}>
                    <TableCell>{l.linha}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", estilo.classe)}>
                        {estilo.rotulo}
                      </span>
                    </TableCell>
                    <TableCell>{resumoLinha(l)}</TableCell>
                    <TableCell className="text-xs text-texto-2">{l.mensagens.join(" · ")}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
