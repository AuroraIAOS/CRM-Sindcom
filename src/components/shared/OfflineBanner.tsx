import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { formatarHora } from "@/lib/formatters";

/**
 * Banner de leitura offline (Subetapa 03.3, frontend.md §6): "dados de
 * {timestamp} — reconectando". Só aparece quando offline — online, a tela
 * não carrega peso nenhum de UI extra.
 *
 * O timestamp é o mais recente `dataUpdatedAt` entre as queries com dado em
 * cache (memória + restauradas do IndexedDB), não um relógio da página —
 * é literalmente "de quando são os dados que você está vendo agora".
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  const ultimaAtualizacao = useSyncExternalStore(
    (callback) => queryClient.getQueryCache().subscribe(callback),
    () => {
      let maisRecente = 0;
      for (const query of queryClient.getQueryCache().getAll()) {
        if (query.state.dataUpdatedAt > maisRecente) maisRecente = query.state.dataUpdatedAt;
      }
      return maisRecente;
    },
    () => 0,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-estado-alerta/15 px-4 py-2 text-sm font-medium text-texto-1 print:hidden"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-estado-alerta" aria-hidden />
      {ultimaAtualizacao > 0
        ? `Você está offline — mostrando dados de ${formatarHora(ultimaAtualizacao)}. Reconectando…`
        : "Você está offline. Reconectando…"}
    </div>
  );
}
