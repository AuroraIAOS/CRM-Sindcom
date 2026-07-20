import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mensagemErro } from "@/lib/mensagens";
import { formatarMoeda } from "@/lib/formatters";
import {
  useGerarFaturasMensalidade,
  useGerarGuias,
  type ResultadoGeracaoFaturas,
  type ResultadoGeracaoGuias,
} from "./api";
import type { Database } from "@/lib/database.types";

type TipoFatura = Database["public"]["Enums"]["tipo_fatura"];

/** "AAAA-MM" do mês corrente — valor do <input type="month">. */
function mesAtual(): string {
  return new Date().toLocaleDateString("sv-SE").slice(0, 7);
}

/** O banco espera `date`: a competência é sempre o 1º do mês. */
function competenciaISO(mes: string): string {
  return `${mes}-01`;
}

/**
 * Resultado de uma geração de faturas.
 *
 * `geradas: 0` é sucesso, não falha — a idempotência é do banco (unique em
 * trabalhador_id+tipo+competencia), então reexecutar não duplica cobrança.
 * Os pulados aparecem nominalmente: são quem não tem base de cálculo (sem piso
 * na CCT e sem salário informado) e precisa de correção no cadastro.
 */
export function ResultadoFaturas({ resultado }: { resultado: ResultadoGeracaoFaturas }) {
  const nada = resultado.geradas === 0 && resultado.puladas === 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
        {nada
          ? "Nenhuma fatura nova — a competência já estava gerada."
          : `${resultado.geradas} fatura(s) gerada(s).`}
        {resultado.geradas === 0 && !nada
          ? " As faturas desta competência já existiam."
          : ""}
      </p>

      {resultado.puladas > 0 && (
        <div className="rounded-md bg-estado-alerta/10 p-3 text-sm">
          <p className="font-semibold text-texto-1">
            {resultado.puladas} trabalhador(es) sem base de cálculo — não cobrado(s)
          </p>
          <p className="text-texto-2">
            Sem piso na CCT para a função e sem salário informado, não há como calcular o
            valor. Corrija o cadastro (piso da convenção ou salário no vínculo) e gere de
            novo — quem já tem fatura não será duplicado.
          </p>
          <ul className="mt-2 list-disc pl-5 text-texto-2">
            {resultado.pulados.map((p) => (
              <li key={p.trabalhador_id}>{p.nome}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Gera as faturas de mensalidade do convênio (mensal, só Ouro). */
export function GerarMensalidadeDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const gerar = useGerarFaturasMensalidade();
  const [mes, setMes] = useState(mesAtual());
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoGeracaoFaturas | null>(null);

  async function executar() {
    setErro(null);
    try {
      setResultado(await gerar.mutateAsync(competenciaISO(mes)));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar mensalidades do convênio</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <ResultadoFaturas resultado={resultado} />
        ) : (
          <>
            <p className="text-sm text-texto-2">
              Cria uma fatura de mensalidade por trabalhador <strong>Ouro</strong> aprovado, com
              vencimento em 30 dias. Reexecutar não duplica cobrança.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-texto-1" htmlFor="competencia-mensalidade">
                Competência
              </label>
              <Input
                id="competencia-mensalidade"
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>
          </>
        )}

        {erro && <p className="text-sm text-estado-erro">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerar.isPending}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={executar} disabled={gerar.isPending || !mes}>
              {gerar.isPending ? "Gerando…" : "Gerar mensalidades"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Agrupa as faturas `holerite` da competência em guias por empresa. */
export function GerarGuiasDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const gerar = useGerarGuias();
  const [tipo, setTipo] = useState<TipoFatura>("mensalidade_convenio");
  const [mes, setMes] = useState(mesAtual());
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoGeracaoGuias | null>(null);

  async function executar() {
    setErro(null);
    try {
      setResultado(await gerar.mutateAsync({ tipo, competencia: competenciaISO(mes) }));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar guias de pagamento</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="flex flex-col gap-2">
            <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
              {resultado.guias_criadas === 0 && resultado.faturas_vinculadas === 0
                ? "Nenhuma guia nova — a competência já estava agrupada."
                : `${resultado.guias_criadas} guia(s) criada(s) · ${resultado.faturas_vinculadas} fatura(s) vinculada(s).`}
              <br />
              Total em guias nesta competência: {formatarMoeda(resultado.valor_total)}.
            </p>

            {resultado.bloqueadas > 0 && (
              <div className="rounded-md bg-estado-alerta/10 p-3 text-sm">
                <p className="font-semibold text-texto-1">
                  {resultado.bloqueadas} fatura(s) fora de guia
                </p>
                <p className="text-texto-2">
                  A guia da empresa nesta competência já está <strong>recebida</strong>. Somar
                  faturas novas mudaria um documento já quitado, então elas ficaram de fora —
                  cobre à parte ou lance na competência seguinte.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-texto-2">
              Agrupa por empresa as faturas de <strong>holerite</strong> ainda sem guia, com
              vencimento em 30 dias. Faturas de boleto direto não entram (são cobrança pessoal).
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-texto-1">Tipo de cobrança</label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoFatura)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensalidade_convenio">Mensalidade do convênio</SelectItem>
                    <SelectItem value="contribuicao_sindical">Contribuição sindical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-texto-1" htmlFor="competencia-guias">
                  Competência
                </label>
                <Input
                  id="competencia-guias"
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                />
                <p className="text-xs text-texto-2">
                  Contribuição sindical é anual: use janeiro do ano-base da CCT.
                </p>
              </div>
            </div>
          </>
        )}

        {erro && <p className="text-sm text-estado-erro">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerar.isPending}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={executar} disabled={gerar.isPending || !mes}>
              {gerar.isPending ? "Gerando…" : "Gerar guias"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
