import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useNotificacoes, useMarcarComoLida, useMarcarTodasComoLidas } from "./api";

type FiltroNotificacoes = "todas" | "nao-lidas";

export function NotificacoesPage() {
  const notificacoes = useNotificacoes();
  const marcarLida = useMarcarComoLida();
  const marcarTodasLidas = useMarcarTodasComoLidas();
  const [filtro, setFiltro] = useState<FiltroNotificacoes>("todas");

  const naoLidas = (notificacoes.data ?? []).filter((n) => !n.lida).length;
  const exibidas =
    filtro === "nao-lidas"
      ? (notificacoes.data ?? []).filter((n) => !n.lida)
      : notificacoes.data ?? [];

  async function handleMarcarComoLida(id: string) {
    await marcarLida.mutateAsync(id);
  }

  async function handleMarcarTodasComoLidas() {
    await marcarTodasLidas.mutateAsync();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Notificações</h1>
        {naoLidas > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleMarcarTodasComoLidas()}
            disabled={marcarTodasLidas.isPending}
          >
            {marcarTodasLidas.isPending ? "Marcando…" : "Marcar todas como lidas"}
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filtro === "todas" ? "default" : "outline"}
          onClick={() => setFiltro("todas")}
        >
          Todas
        </Button>
        <Button
          size="sm"
          variant={filtro === "nao-lidas" ? "default" : "outline"}
          onClick={() => setFiltro("nao-lidas")}
        >
          Não lidas ({naoLidas})
        </Button>
      </div>

      {notificacoes.isLoading && (
        <p className="text-texto-2">Carregando…</p>
      )}

      {notificacoes.isError && (
        <p className="text-estado-erro">{mensagemErro(notificacoes.error)}</p>
      )}

      {notificacoes.data && exibidas.length === 0 && (
        <p className="text-sm text-texto-2">
          {filtro === "nao-lidas"
            ? "Nenhuma notificação não lida."
            : "Nenhuma notificação."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {exibidas.map((notif) => (
          <Card key={notif.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-texto-1">{notif.titulo}</h3>
                  {!notif.lida && (
                    <Badge variant="default" className="text-xs">
                      Não lida
                    </Badge>
                  )}
                </div>
                {notif.mensagem && (
                  <p className="text-sm text-texto-2 mt-2">{notif.mensagem}</p>
                )}
                <p className="text-xs text-texto-3 mt-2">
                  {formatarDataBR(notif.created_at)}
                </p>
              </div>
              {!notif.lida && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleMarcarComoLida(notif.id)}
                  disabled={marcarLida.isPending}
                >
                  Marcar como lida
                </Button>
              )}
            </div>

            {notif.referencia_tabela === "solicitacoes_admin" && notif.referencia_id && (
              <div className="text-xs">
                <Link
                  to="/fila-admin"
                  className="font-bold text-realce hover:underline"
                >
                  Ver solicitação →
                </Link>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
