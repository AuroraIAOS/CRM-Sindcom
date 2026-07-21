import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/**
 * Estado de conexão via `onlineManager` do próprio TanStack Query — não um
 * listener paralelo de `navigator.onLine`. É a MESMA fonte que decide se
 * queries pausam e se `networkMode` das mutations importa, então a UI nunca
 * diverge do que o Query realmente está fazendo (Subetapa 03.3).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
    () => true, // SSR/primeira renderização no servidor: assume online
  );
}
