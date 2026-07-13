import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * Fila de cadastros pendentes (frontend.md §2.2): trabalhadores com
 * `status_cadastro = 'pendente'` — em produção, os que entram pelo formulário
 * do site via service_role (Etapa 03). Aprovar/rejeitar é um UPDATE, autonomia
 * que a Secretária tem no RLS (pol_trab_update) — não passa pela fila-admin.
 */

export type CadastroPendente = Pick<
  Database["public"]["Tables"]["trabalhadores"]["Row"],
  "id" | "cpf" | "nome" | "nivel" | "origem_cadastro" | "created_at"
> & {
  municipio: { nome: string; uf: string } | null;
};

export function useCadastrosPendentes() {
  return useQuery({
    queryKey: ["aprovacoes", "pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trabalhadores")
        .select("id, cpf, nome, nivel, origem_cadastro, created_at, municipio:municipios(nome, uf)")
        .eq("status_cadastro", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CadastroPendente[];
    },
  });
}

async function uidAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useAprovarCadastro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, observacao }: { id: string; observacao?: string }) => {
      const uid = await uidAtual();
      const { error } = await supabase
        .from("trabalhadores")
        .update({
          status_cadastro: "aprovado",
          aprovado_por: uid,
          aprovado_em: new Date().toISOString(),
          observacao_aprovacao: observacao?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

export function useRejeitarCadastro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, observacao }: { id: string; observacao?: string }) => {
      const uid = await uidAtual();
      const { error } = await supabase
        .from("trabalhadores")
        .update({
          status_cadastro: "rejeitado",
          aprovado_por: uid,
          aprovado_em: new Date().toISOString(),
          observacao_aprovacao: observacao?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}
