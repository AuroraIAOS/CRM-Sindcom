import { useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";

export type Notificacao = Database["public"]["Tables"]["notificacoes"]["Row"];

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export function useNotificacoes() {
  return useQuery({
    queryKey: ["notificacoes", "lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notificacao[];
    },
  });
}

export function useNotificacoesNaoLidas() {
  return useQuery({
    queryKey: ["notificacoes", "nao-lidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*", { count: "exact" })
        .eq("lida", false);
      if (error) throw error;
      return (data ?? []).length;
    },
    refetchInterval: 5000,
  });
}

// ---------------------------------------------------------------------------
// Mutações
// ---------------------------------------------------------------------------

export function useMarcarComoLida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    },
  });
}

export function useMarcarTodasComoLidas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Realtime (sem retorno de dados — apenas side-effect de invalidação)
// ---------------------------------------------------------------------------

export function useNotificacoesRealtime() {
  const { perfil, role } = useAuth();
  const queryClient = useQueryClient();

  const handleNovaNotificacao = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
  }, [queryClient]);

  useEffect(() => {
    if (!perfil?.id || !role) return;

    const canal = supabase
      .channel(`notificacoes:${perfil.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `destinatario_perfil_id=eq.${perfil.id}`,
        },
        (payload) => {
          const notif = payload.new as Notificacao;
          toast(notif.titulo, { description: notif.mensagem });
          handleNovaNotificacao();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `destinatario_role=eq.${role}`,
        },
        (payload) => {
          const notif = payload.new as Notificacao;
          toast(notif.titulo, { description: notif.mensagem });
          handleNovaNotificacao();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [perfil?.id, role, handleNovaNotificacao]);
}
