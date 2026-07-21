import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Bloco de KPI do dashboard (specs/dashboard.md §2, linha 1).
 *
 * Regra de honestidade do painel: um KPI só existe se for rastreável a uma
 * query. Quando o número não puder ser apurado para o papel de quem olha, a
 * tela NÃO renderiza o card — nunca mostra zero no lugar (ver o bloco de
 * atenção em `features/dashboard/api.ts`).
 */

export type Tendencia = {
  /** Variação percentual vs. período anterior. `null` = sem base de comparação. */
  variacao: number | null;
  descricao: string;
};

type Props = {
  titulo: string;
  valor: ReactNode;
  /** Linha de apoio: composição do número, unidade, recorte temporal. */
  detalhe?: ReactNode;
  icone?: ReactNode;
  tendencia?: Tendencia;
  /** Torna o card clicável (K1 → lista filtrada, K5 → fila). */
  para?: string;
  destaque?: "neutro" | "alerta" | "erro";
  className?: string;
};

const DESTAQUES: Record<NonNullable<Props["destaque"]>, string> = {
  neutro: "",
  alerta: "border-l-4 border-l-estado-alerta",
  erro: "border-l-4 border-l-estado-erro",
};

export function KpiCard({
  titulo,
  valor,
  detalhe,
  icone,
  tendencia,
  para,
  destaque = "neutro",
  className,
}: Props) {
  const conteudo = (
    <Card
      className={cn(
        "h-full transition-shadow",
        DESTAQUES[destaque],
        para && "hover:shadow-md",
        className,
      )}
    >
      <CardContent className="flex h-full flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-texto-2">{titulo}</span>
          {icone ? <span className="text-texto-2">{icone}</span> : null}
        </div>

        <span className="font-titulo text-3xl leading-tight text-texto-1">{valor}</span>

        {detalhe ? <div className="text-xs text-texto-2">{detalhe}</div> : null}

        {tendencia ? <IndicadorTendencia {...tendencia} /> : null}
      </CardContent>
    </Card>
  );

  return para ? (
    <Link to={para} className="block h-full focus:outline-none focus:ring-2 focus:ring-realce">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function IndicadorTendencia({ variacao, descricao }: Tendencia) {
  if (variacao === null) {
    return <span className="text-xs text-texto-2">{descricao}</span>;
  }
  const subiu = variacao > 0;
  const estavel = variacao === 0;
  const Icone = estavel ? Minus : subiu ? TrendingUp : TrendingDown;
  const cor = estavel ? "text-texto-2" : subiu ? "text-estado-sucesso" : "text-estado-erro";

  return (
    <span className={cn("mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold", cor)}>
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {estavel ? "estável" : `${subiu ? "+" : ""}${variacao.toFixed(0)}%`}
      <span className="font-normal text-texto-2">{descricao}</span>
    </span>
  );
}
