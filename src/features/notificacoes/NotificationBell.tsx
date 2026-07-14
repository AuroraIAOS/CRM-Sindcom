import { useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatarDataBR } from "@/lib/formatters";
import { useNotificacoes, useMarcarComoLida, useMarcarTodasComoLidas } from "./api";

export function NotificationBell() {
  const notificacoes = useNotificacoes();
  const marcarLida = useMarcarComoLida();
  const marcarTodasLidas = useMarcarTodasComoLidas();
  const [open, setOpen] = useState(false);

  const naoLidas = (notificacoes.data ?? []).filter((n) => !n.lida).length;
  const recentesOito = (notificacoes.data ?? []).slice(0, 8);

  async function handleMarcarComoLida(id: string) {
    await marcarLida.mutateAsync(id);
  }

  async function handleMarcarTodasComoLidas() {
    await marcarTodasLidas.mutateAsync();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notificações"
          className="relative text-texto-2 hover:text-texto-1 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-realce text-xs font-bold text-white">
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="font-semibold">
          Notificações
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notificacoes.isLoading && (
          <div className="px-2 py-4 text-center text-sm text-texto-2">
            Carregando…
          </div>
        )}

        {notificacoes.isError && (
          <div className="px-2 py-4 text-center text-sm text-estado-erro">
            Erro ao carregar notificações
          </div>
        )}

        {notificacoes.data && notificacoes.data.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-texto-2">
            Nenhuma notificação
          </div>
        )}

        {recentesOito.map((notif) => (
          <div
            key={notif.id}
            className={cn(
              "px-2 py-2 cursor-pointer transition-colors hover:bg-black/5",
              !notif.lida && "bg-realce/5",
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {!notif.lida && (
                    <span className="inline-block h-2 w-2 rounded-full bg-realce mt-1" />
                  )}
                  <p className="text-sm font-semibold text-texto-1">
                    {notif.titulo}
                  </p>
                </div>
                {notif.mensagem && (
                  <p className="text-xs text-texto-2 mt-1">
                    {notif.mensagem}
                  </p>
                )}
                <p className="text-xs text-texto-3 mt-1">
                  {formatarDataBR(notif.created_at)}
                </p>
              </div>
              {!notif.lida && (
                <button
                  className="shrink-0 text-xs font-bold text-realce hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleMarcarComoLida(notif.id);
                  }}
                >
                  Marcar
                </button>
              )}
            </div>
          </div>
        ))}

        {recentesOito.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 flex items-center gap-2">
              {naoLidas > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleMarcarTodasComoLidas()}
                  disabled={marcarTodasLidas.isPending}
                  className="text-xs"
                >
                  Marcar todas como lidas
                </Button>
              )}
              <Link
                to="/notificacoes"
                className="text-xs font-bold text-realce hover:underline ml-auto"
                onClick={() => setOpen(false)}
              >
                Ver todas →
              </Link>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
