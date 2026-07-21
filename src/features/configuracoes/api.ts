import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { PerfilFormValues } from "./schemas";

/**
 * Camada única de acesso a `/configuracoes` (frontend.md §5): parâmetros
 * operacionais + gestão de perfis. RLS (sql/04_dashboard.sql §A,
 * sql/01_schema.sql §6): qualquer autenticado LÊ `configuracoes`; só Admin
 * escreve nela e em `perfis` (SELECT de perfis é a própria linha OU Admin).
 */

export type Configuracao = Database["public"]["Tables"]["configuracoes"]["Row"];
export type Perfil = Database["public"]["Tables"]["perfis"]["Row"];

// ---------------------------------------------------------------------------
// Parâmetros (configuracoes)
// ---------------------------------------------------------------------------

export function useConfiguracoes() {
  return useQuery({
    queryKey: ["configuracoes"],
    queryFn: async (): Promise<Configuracao[]> => {
      const { data, error } = await supabase.from("configuracoes").select("*").order("chave");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAtualizarConfiguracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: string }) => {
      // `.select()` + checagem de linha é deliberado: um UPDATE bloqueado
      // pela RLS de `pol_config_admin` não devolve erro (a policy é só
      // `USING`, sem exceção para o próprio dono) — devolve 200 com array
      // vazio, sucesso disfarçado (tests/rls/configuracoes.spec.ts). Sem
      // essa checagem, um clique "sem efeito" pareceria ter salvo.
      const { data, error } = await supabase
        .from("configuracoes")
        .update({ valor })
        .eq("chave", chave)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Não foi possível salvar: você não tem permissão para esta operação.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
      // dias_alerta_carta muda a janela da dica CARTA_PENDENTE (R2);
      // dias_vencimento_boleto muda o vencimento calculado nas fn_gerar_*
      // da próxima geração — nenhuma delas roda aqui, mas a leitura das
      // dicas deve refletir o novo parâmetro na próxima consulta.
      qc.invalidateQueries({ queryKey: ["dashboard", "dicas"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Perfis
// ---------------------------------------------------------------------------

export function usePerfis() {
  return useQuery({
    queryKey: ["configuracoes", "perfis"],
    queryFn: async (): Promise<Perfil[]> => {
      const { data, error } = await supabase.from("perfis").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAtualizarPerfil(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: PerfilFormValues) => {
      // Mesma checagem de linha afetada que em `useAtualizarConfiguracao` —
      // `pol_perfis_admin_all` também é só `USING`, mesmo risco de "sucesso"
      // silencioso com zero linhas.
      const { data, error } = await supabase
        .from("perfis")
        .update({
          nome: valores.nome,
          role: valores.role,
          parceiro_id: valores.role === "parceiro" ? valores.parceiro_id || null : null,
          ativo: valores.ativo,
        })
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Não foi possível salvar: você não tem permissão para esta operação.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configuracoes", "perfis"] });
    },
  });
}
