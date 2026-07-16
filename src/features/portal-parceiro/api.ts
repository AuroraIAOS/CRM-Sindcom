import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * Camada única de acesso ao portal do parceiro (frontend.md §2.2, Subetapa 02.3).
 *
 * `v_fila_parceiro` já filtra por `fn_parceiro_id()` e nunca expõe CPF (view
 * definida em sql/03_rls.sql §17) — não há necessidade de repetir o escopo
 * aqui. A confirmação em lote escreve direto em `solicitacoes_servico`; quem
 * garante que o parceiro só evolui `solicitada`/`pendente_confirmacao` para
 * `executada`/`rejeitada`, e só nesses dois campos, é o trigger
 * `fn_guarda_parceiro_solicitacao` — o frontend não reimplementa essa regra.
 */

type StatusSolicitacao = Database["public"]["Enums"]["status_solicitacao"];
type SolicitacaoUpdate = Database["public"]["Tables"]["solicitacoes_servico"]["Update"];

/** A view tipa tudo como nullable (limitação do gerador de tipos do Supabase
 *  para views); `id`/`numero_guia`/`interessado`/`status`/`data_agendada` são
 *  colunas NOT NULL na tabela de origem — recorta o tipo para refletir isso. */
export type FilaParceiroLinha = Omit<
  Database["public"]["Views"]["v_fila_parceiro"]["Row"],
  "id" | "numero_guia" | "interessado" | "status" | "data_agendada"
> & {
  id: string;
  numero_guia: string;
  interessado: string;
  status: StatusSolicitacao;
  data_agendada: string;
};

export type FilaParceiroFiltros = {
  status: StatusSolicitacao | "todos";
  /** Período por `data_agendada` — "" = sem limite. */
  de: string;
  ate: string;
};

const COLUNAS_ORDENAVEIS = new Set(["numero_guia", "data_agendada", "status", "created_at"]);

export function useFilaParceiro(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: FilaParceiroFiltros,
) {
  return useQuery({
    queryKey: ["portal-parceiro", "fila", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase.from("v_fila_parceiro").select("*", { count: "exact" });
      if (filtros.status !== "todos") query = query.eq("status", filtros.status);
      if (filtros.de) query = query.gte("data_agendada", filtros.de);
      if (filtros.ate) query = query.lte("data_agendada", filtros.ate);

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS.has(ordenacao.id) ? ordenacao.id : "data_agendada";
      query = query.order(coluna, { ascending: ordenacao ? !ordenacao.desc : false });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as FilaParceiroLinha[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * Confirmação em lote (contra-referência mensal — frontend.md §2.2): o
 * parceiro reconcilia guias `pendente_confirmacao` que não passaram pelo
 * check-in físico do QR. Um único UPDATE com `.in()` atualiza todas as linhas
 * selecionadas; o trigger de guarda roda por linha e rejeita qualquer uma que
 * não esteja em condição de evoluir — o restante do lote ainda é aplicado.
 */
export function useConfirmarEmLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      resultado,
      motivo,
    }: {
      ids: string[];
      resultado: "executada" | "rejeitada";
      motivo?: string;
    }) => {
      const payload: SolicitacaoUpdate = { status: resultado };
      if (resultado === "rejeitada") payload.motivo_rejeicao = motivo?.trim() || null;

      const { error } = await supabase.from("solicitacoes_servico").update(payload).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portal-parceiro"] });
    },
  });
}

// ---------------------------------------------------------------------------
// "Meus benefícios" / "Meus recepcionistas" — leitura própria (sem CRUD: RLS
// só permite INSERT/UPDATE/DELETE dessas tabelas a Admin/Secretária).
// ---------------------------------------------------------------------------

export type BeneficioProprio = Database["public"]["Tables"]["beneficios"]["Row"];

export function useBeneficiosProprios(parceiroId: string | undefined) {
  return useQuery({
    queryKey: ["portal-parceiro", "beneficios", parceiroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficios")
        .select("*")
        .eq("parceiro_id", parceiroId as string)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as BeneficioProprio[];
    },
    enabled: !!parceiroId,
  });
}

export type RecepcionistaProprio = { id: string; nome: string; ativo: boolean };

export function useRecepcionistasProprios(parceiroId: string | undefined) {
  return useQuery({
    queryKey: ["portal-parceiro", "recepcionistas", parceiroId],
    queryFn: async () => {
      // Seleção explícita: nunca trazer pin_hash para o cliente do parceiro.
      const { data, error } = await supabase
        .from("recepcionistas")
        .select("id, nome, ativo")
        .eq("parceiro_id", parceiroId as string)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as RecepcionistaProprio[];
    },
    enabled: !!parceiroId,
  });
}
