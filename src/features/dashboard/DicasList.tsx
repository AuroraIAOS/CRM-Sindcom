import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDicas, type Dica } from "./api";

/**
 * D1 — dicas estratégicas (specs/dashboard.md §2, linha 3).
 *
 * As 11 regras vivem na view `v_dash_dicas`, ordenadas por severidade. Regra
 * nova = um `UNION ALL` a mais no SQL, zero mudança aqui: este componente não
 * conhece nenhum código de dica, só severidade, texto e rota de ação.
 */

const ESTILO_SEVERIDADE = {
  critica: {
    rotulo: "Crítica",
    icone: AlertCircle,
    classeIcone: "text-estado-erro",
    classeBorda: "border-l-4 border-l-estado-erro",
  },
  atencao: {
    rotulo: "Atenção",
    icone: AlertTriangle,
    classeIcone: "text-estado-alerta",
    classeBorda: "border-l-4 border-l-estado-alerta",
  },
  oportunidade: {
    rotulo: "Oportunidade",
    icone: Lightbulb,
    classeIcone: "text-estado-sucesso",
    classeBorda: "border-l-4 border-l-estado-sucesso",
  },
} as const;

type Severidade = keyof typeof ESTILO_SEVERIDADE;

function estiloDe(severidade: string | null) {
  return ESTILO_SEVERIDADE[(severidade ?? "") as Severidade] ?? ESTILO_SEVERIDADE.atencao;
}

export function DicasList({ habilitado = true }: { habilitado?: boolean }) {
  const { data, isPending, error } = useDicas(habilitado);
  const dicas = data ?? [];

  const criticas = dicas.filter((d) => d.severidade === "critica").length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="font-titulo text-base text-texto-1">Dicas estratégicas</CardTitle>
        <p className="text-xs text-texto-2">
          {isPending
            ? "Analisando a base…"
            : criticas > 0
              ? `${criticas} item(ns) crítico(s) exigindo ação`
              : "Nenhuma pendência crítica no momento"}
        </p>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 overflow-y-auto pb-4">
        {isPending ? (
          <div className="flex h-24 items-center justify-center text-texto-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
          </div>
        ) : error ? (
          <p className="text-sm text-estado-erro">
            Não foi possível carregar as dicas: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : dicas.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-6 w-6 text-estado-sucesso" aria-hidden />
            <p className="text-sm text-texto-2">
              Nenhuma dica ativa — as 11 regras de acompanhamento passaram sem apontar pendência.
            </p>
          </div>
        ) : (
          dicas.map((dica) => <ItemDica key={dica.codigo} dica={dica} />)
        )}
      </CardContent>
    </Card>
  );
}

function ItemDica({ dica }: { dica: Dica }) {
  const estilo = estiloDe(dica.severidade);
  const Icone = estilo.icone;

  const corpo = (
    <div className={cn("rounded-md bg-fundo-1 p-3", estilo.classeBorda)}>
      <div className="flex items-start gap-2">
        <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", estilo.classeIcone)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto-1">
            {dica.titulo}
            {dica.quantidade !== null && dica.quantidade > 0 ? (
              <span className="ml-1 font-normal text-texto-2">({dica.quantidade})</span>
            ) : null}
          </p>
          {dica.detalhe ? <p className="mt-0.5 text-xs text-texto-2">{dica.detalhe}</p> : null}
        </div>
        {dica.rota ? (
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-texto-2" aria-hidden />
        ) : null}
      </div>
      <span className="sr-only">Severidade: {estilo.rotulo}</span>
    </div>
  );

  return dica.rota ? (
    <Link to={dica.rota} className="block transition-opacity hover:opacity-80">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
