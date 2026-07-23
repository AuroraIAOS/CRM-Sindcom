import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { formatarCpf } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { useBuscaTrabalhadores, type TrabalhadorOpcao } from "./api";

/**
 * Seletor de trabalhador por nome ou CPF. Busca no servidor (mínimo 2
 * caracteres) em vez de carregar a base inteira — com ~24.500 trabalhadores
 * um `<Select>` comum seria inviável, e o PostgREST truncaria em 1000 linhas
 * sem avisar (orientacoes.md §2.4).
 */
export function SeletorTrabalhador({
  selecionado,
  onSelecionar,
}: {
  selecionado: TrabalhadorOpcao | null;
  onSelecionar: (t: TrabalhadorOpcao | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const resultados = useBuscaTrabalhadores(termo);

  if (selecionado) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-fundo-2 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-estado-sucesso" />
          <span className="font-medium text-texto-1">{selecionado.nome}</span>
          <span className="text-texto-2">{formatarCpf(selecionado.cpf)}</span>
          {selecionado.nivel && <NivelBadge nivel={selecionado.nivel} />}
        </div>
        <button
          type="button"
          className="text-sm text-realce hover:underline"
          onClick={() => {
            onSelecionar(null);
            setTermo("");
          }}
        >
          Trocar
        </button>
      </div>
    );
  }

  const linhas = resultados.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-2" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome ou CPF…"
          className="pl-8"
        />
      </div>

      {resultados.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(resultados.error)}</p>
      )}

      {termo.trim().length >= 2 && (
        <div className="max-h-48 overflow-y-auto rounded-md border">
          {resultados.isLoading ? (
            <p className="p-3 text-sm text-texto-2">Buscando…</p>
          ) : linhas.length === 0 ? (
            <p className="p-3 text-sm text-texto-2">
              Nenhum trabalhador aprovado encontrado para "{termo.trim()}".
            </p>
          ) : (
            linhas.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelecionar(t)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0",
                  "hover:bg-black/5",
                )}
              >
                <span className="text-texto-1">{t.nome}</span>
                <span className="flex items-center gap-2">
                  <span className="text-texto-2">{formatarCpf(t.cpf)}</span>
                  {t.nivel && <NivelBadge nivel={t.nivel} />}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
