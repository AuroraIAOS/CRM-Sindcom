import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Moldura dos gráficos do dashboard (specs/dashboard.md §2, linha 2).
 *
 * Concentra os três estados que todo gráfico precisa tratar — carregando,
 * erro e vazio — para que nenhum deles vire "gráfico em branco sem
 * explicação". O estado vazio recebe texto próprio de cada widget: um painel
 * sem dados tem que dizer POR QUE está sem dados (ex.: G1 antes do segundo
 * snapshot).
 */

type Props = {
  titulo: string;
  descricao?: ReactNode;
  /** Controles do próprio widget (filtros, seletor de métrica). */
  acoes?: ReactNode;
  carregando?: boolean;
  erro?: unknown;
  /** Quando true, mostra `mensagemVazio` no lugar do gráfico. */
  vazio?: boolean;
  mensagemVazio?: ReactNode;
  altura?: number;
  className?: string;
  children: ReactNode;
};

export function ChartCard({
  titulo,
  descricao,
  acoes,
  carregando = false,
  erro,
  vazio = false,
  mensagemVazio = "Sem dados no período.",
  altura = 280,
  className,
  children,
}: Props) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="font-titulo text-base text-texto-1">{titulo}</CardTitle>
          {descricao ? <p className="mt-0.5 text-xs text-texto-2">{descricao}</p> : null}
        </div>
        {acoes ? <div className="shrink-0">{acoes}</div> : null}
      </CardHeader>

      <CardContent className="flex-1 pb-4">
        <div style={{ height: altura }} className="w-full">
          <EstadoDoGrafico carregando={carregando} erro={erro} vazio={vazio} mensagemVazio={mensagemVazio}>
            {children}
          </EstadoDoGrafico>
        </div>
      </CardContent>
    </Card>
  );
}

function EstadoDoGrafico({
  carregando,
  erro,
  vazio,
  mensagemVazio,
  children,
}: Pick<Props, "carregando" | "erro" | "vazio" | "mensagemVazio" | "children">) {
  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-texto-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  if (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertTriangle className="h-5 w-5 text-estado-erro" aria-hidden />
        <p className="text-sm font-semibold text-texto-1">Não foi possível carregar este gráfico</p>
        <p className="text-xs text-texto-2">{mensagem}</p>
      </div>
    );
  }

  if (vazio) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-texto-2">
        {mensagemVazio}
      </div>
    );
  }

  return <>{children}</>;
}
