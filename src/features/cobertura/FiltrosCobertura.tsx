import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTRO_VAZIO, type FiltroCobertura } from "./api";

/**
 * Os filtros das duas telas de cobertura.
 *
 * Eles não são conveniência: a de contabilidades tem 953 linhas e a de empresas
 * 8.238 — em qualquer das duas, "quem ainda falta" é impossível de ler rolando.
 * As três perguntas que a Denise realmente faz viraram os três controles:
 * *quem é* (busca), *já mandou?* (cobertura) e *pediu para não ser mais
 * contatado?* (descadastro) — esta última porque quem se descadastrou se
 * contata por telefone, nunca com outra mensagem (copies §10).
 *
 * Os mesmos controles servem aos dois lados apesar de um filtrar no navegador
 * (contabilidades, que cabem numa página) e o outro no servidor (empresas, que
 * não cabem — orientacoes.md §2.4). A diferença é de execução, não de
 * vocabulário: quem usa a tela vê a mesma pergunta nos dois lugares.
 */

const OPCOES_COBERTURA: { valor: FiltroCobertura["cobertura"]; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "sem", rotulo: "Sem envio" },
  { valor: "cobertas", rotulo: "Já enviaram" },
];

const OPCOES_DESCADASTRO: { valor: FiltroCobertura["descadastro"]; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "ativas", rotulo: "Sem descadastro" },
  { valor: "descadastradas", rotulo: "Descadastradas" },
];

function GrupoBotoes<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-texto-2">{rotulo}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={valor === o.valor}
            onClick={() => onChange(o.valor)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              valor === o.valor
                ? "border-realce bg-realce/10 font-medium text-realce"
                : "border-transparent bg-fundo-2/60 text-texto-2 hover:bg-fundo-2",
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FiltrosCobertura({
  filtro,
  onChange,
  placeholderBusca,
  resultado,
}: {
  filtro: FiltroCobertura;
  onChange: (f: FiltroCobertura) => void;
  placeholderBusca: string;
  /** Texto do tipo "12 de 953" — sempre visível, porque filtro sem contagem
   *  esconde a diferença entre "não há" e "o filtro cortou". */
  resultado: string;
}) {
  const limpo =
    filtro.busca === "" && filtro.cobertura === "todas" && filtro.descadastro === "todas";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-fundo-2/30 p-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-texto-2">Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-2" />
            <Input
              value={filtro.busca}
              onChange={(e) => onChange({ ...filtro, busca: e.target.value })}
              placeholder={placeholderBusca}
              className="pl-9"
            />
          </div>
        </div>

        <GrupoBotoes
          rotulo="Envio de dados"
          opcoes={OPCOES_COBERTURA}
          valor={filtro.cobertura}
          onChange={(v) => onChange({ ...filtro, cobertura: v })}
        />
        <GrupoBotoes
          rotulo="Descadastro"
          opcoes={OPCOES_DESCADASTRO}
          valor={filtro.descadastro}
          onChange={(v) => onChange({ ...filtro, descadastro: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-texto-2">{resultado}</span>
        {!limpo && (
          <Button variant="outline" size="sm" onClick={() => onChange(FILTRO_VAZIO)}>
            <X className="h-4 w-4" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
