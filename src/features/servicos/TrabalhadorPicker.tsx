import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { formatarCpf } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { useBuscarTrabalhadores, type TrabalhadorOpcao } from "./api";

/**
 * Seletor de titular por busca. Um `<Select>` comum não serve: a base tem
 * ~24.500 trabalhadores. Combobox montado à mão sobre Popover + Input porque o
 * projeto não usa cmdk — mantém a superfície de dependências enxuta.
 *
 * Aceita nome ou CPF (a heurística de qual campo consultar é do hook).
 */
export function TrabalhadorPicker({
  selecionado,
  onSelecionar,
}: {
  selecionado: TrabalhadorOpcao | null;
  onSelecionar: (t: TrabalhadorOpcao) => void;
}) {
  const [termo, setTermo] = useState("");
  const [termoDebounced, setTermoDebounced] = useState("");
  const [aberto, setAberto] = useState(false);

  // Sem lib de debounce no projeto — 300ms locais evitam uma consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setTermoDebounced(termo), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const resultados = useBuscarTrabalhadores(termoDebounced);
  const linhas = resultados.data ?? [];
  const buscando = termoDebounced.trim().length >= 3;

  function escolher(t: TrabalhadorOpcao) {
    onSelecionar(t);
    setTermo("");
    setTermoDebounced("");
    setAberto(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={aberto && buscando} onOpenChange={setAberto}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-2" />
            <Input
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                setAberto(true);
              }}
              onFocus={() => setAberto(true)}
              placeholder="Buscar por nome ou CPF (mín. 3 caracteres)…"
              className="pl-9"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-1"
          // Mantém o cursor no campo de busca ao abrir a lista.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {resultados.isLoading && <p className="p-2 text-sm text-texto-2">Buscando…</p>}
          {resultados.isError && (
            <p className="p-2 text-sm text-estado-erro">{mensagemErro(resultados.error)}</p>
          )}
          {!resultados.isLoading && !resultados.isError && linhas.length === 0 && (
            <p className="p-2 text-sm text-texto-2">Nenhum trabalhador encontrado.</p>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {linhas.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => escolher(t)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm",
                    "hover:bg-black/5 focus:bg-black/5 focus:outline-none",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="text-texto-1">{t.nome}</span>
                    <span className="text-xs text-texto-2">{formatarCpf(t.cpf)}</span>
                  </span>
                  {t.nivel && <NivelBadge nivel={t.nivel} />}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      {selecionado && (
        <div className="flex items-center gap-2 rounded-md border border-black/10 bg-fundo-2 px-3 py-2 text-sm">
          <Check className="h-4 w-4 shrink-0 text-estado-sucesso" />
          <span className="font-medium text-texto-1">{selecionado.nome}</span>
          <span className="text-xs text-texto-2">{formatarCpf(selecionado.cpf)}</span>
          {selecionado.nivel && <NivelBadge nivel={selecionado.nivel} className="ml-auto" />}
        </div>
      )}
    </div>
  );
}
