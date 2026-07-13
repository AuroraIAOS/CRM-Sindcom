import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Json, TablesInsert, TablesUpdate } from "@/lib/database.types";

/**
 * Fila de solicitações ao Admin (frontend.md §2.2). Qualquer role abre um
 * chamado para operações fora da sua autonomia (em especial os INSERT/DELETE
 * "CRU-baixa" da Secretária). O Admin analisa e, ao aprovar, o FRONTEND executa
 * a operação real com a sessão dele (o RLS continua valendo) e só então marca a
 * solicitação como aprovada. As duas escritas NÃO são atômicas (frontend.md §8
 * risco 1): se a 2ª falhar, a operação já ocorreu e a solicitação segue
 * pendente — reexecutar acusa duplicidade pela constraint UNIQUE.
 */

type OperacaoAuditoria = Database["public"]["Enums"]["operacao_auditoria"];

export type SolicitacaoAdmin =
  Database["public"]["Tables"]["solicitacoes_admin"]["Row"] & {
    solicitante_perfil: { nome: string } | null;
    analisado_perfil: { nome: string } | null;
  };

/** Tabelas que a fila sabe executar hoje. Estender à medida que cada domínio
 *  ganhar uma UI que crie solicitações (por ora só trabalhadores tem). */
const TABELAS_EXECUTAVEIS = new Set(["trabalhadores"]);

async function uidAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export function useSolicitacoesAdmin(apenasPendentes: boolean) {
  return useQuery({
    queryKey: ["fila-admin", "lista", apenasPendentes],
    queryFn: async () => {
      let query = supabase
        .from("solicitacoes_admin")
        .select(
          "*, solicitante_perfil:perfis!solicitacoes_admin_solicitante_fkey(nome), analisado_perfil:perfis!solicitacoes_admin_analisada_por_fkey(nome)",
        )
        .order("created_at", { ascending: false });
      if (apenasPendentes) query = query.eq("status", "pendente");
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SolicitacaoAdmin[];
    },
  });
}

/** Tempo médio (horas) entre abertura e análise — insumo para a válvula de
 *  auto-aprovação da Etapa 04 (plano_fases.md). Só o Admin enxerga todas. */
export function useTempoMedioAprovacao() {
  return useQuery({
    queryKey: ["fila-admin", "tempo-medio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_admin")
        .select("created_at, analisada_em")
        .not("analisada_em", "is", null);
      if (error) throw error;
      const linhas = data ?? [];
      if (linhas.length === 0) return { horas: null as number | null, amostra: 0 };
      const somaMs = linhas.reduce((acc, l) => {
        const abertura = new Date(l.created_at).getTime();
        const analise = new Date(l.analisada_em as string).getTime();
        return acc + (analise - abertura);
      }, 0);
      return { horas: somaMs / linhas.length / 3_600_000, amostra: linhas.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Abertura de chamado (usada pelos domínios: Secretária → fila)
// ---------------------------------------------------------------------------

export type NovaSolicitacao = {
  tabela_alvo: string;
  operacao: OperacaoAuditoria;
  registro_id?: string | null;
  payload?: Json;
  justificativa?: string | null;
};

export function useCriarSolicitacaoAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nova: NovaSolicitacao) => {
      const uid = await uidAtual();
      if (!uid) throw new Error("Sessão expirada. Faça login novamente.");
      const { error } = await supabase.from("solicitacoes_admin").insert({
        solicitante: uid,
        tabela_alvo: nova.tabela_alvo,
        operacao: nova.operacao,
        registro_id: nova.registro_id ?? null,
        payload: nova.payload ?? null,
        justificativa: nova.justificativa ?? null,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fila-admin"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Ações do solicitante e do Admin
// ---------------------------------------------------------------------------

/** Solicitante cancela a própria solicitação pendente (RLS: pendente→cancelada). */
export function useCancelarSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("solicitacoes_admin")
        .update({ status: "cancelada" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fila-admin"] });
    },
  });
}

export function useRejeitarSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, observacao }: { id: string; observacao?: string }) => {
      const uid = await uidAtual();
      const { error } = await supabase
        .from("solicitacoes_admin")
        .update({
          status: "rejeitada",
          observacao_analise: observacao?.trim() || null,
          analisada_por: uid,
          analisada_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fila-admin"] });
    },
  });
}

/** Executa a operação real da solicitação (com a sessão do Admin) contra a
 *  tabela alvo. Hoje só trabalhadores; erro claro para tabelas ainda não
 *  suportadas em vez de tentar um `.from(string)` inseguro. */
async function executarOperacao(sol: SolicitacaoAdmin): Promise<void> {
  if (!TABELAS_EXECUTAVEIS.has(sol.tabela_alvo)) {
    throw new Error(
      `A fila ainda só executa operações em "trabalhadores" (recebido: "${sol.tabela_alvo}").`,
    );
  }
  if (sol.operacao === "INSERT") {
    const { error } = await supabase
      .from("trabalhadores")
      .insert(sol.payload as TablesInsert<"trabalhadores">);
    if (error) throw error;
  } else if (sol.operacao === "UPDATE") {
    if (!sol.registro_id) throw new Error("Solicitação de UPDATE sem registro alvo.");
    const { error } = await supabase
      .from("trabalhadores")
      .update(sol.payload as TablesUpdate<"trabalhadores">)
      .eq("id", sol.registro_id);
    if (error) throw error;
  } else {
    if (!sol.registro_id) throw new Error("Solicitação de DELETE sem registro alvo.");
    const { error } = await supabase.from("trabalhadores").delete().eq("id", sol.registro_id);
    if (error) throw error;
  }
}

export function useAprovarSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sol, observacao }: { sol: SolicitacaoAdmin; observacao?: string }) => {
      // Passo 1 — operação real. Se falhar, a solicitação permanece pendente.
      await executarOperacao(sol);
      // Passo 2 — marcação. Se falhar aqui, a operação já ocorreu (ver §8 risco 1).
      const uid = await uidAtual();
      const { error } = await supabase
        .from("solicitacoes_admin")
        .update({
          status: "aprovada",
          observacao_analise: observacao?.trim() || null,
          analisada_por: uid,
          analisada_em: new Date().toISOString(),
        })
        .eq("id", sol.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fila-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}
