import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { BeneficioComParceiroFormValues, BeneficioFormValues } from "./schemas";

/**
 * Camada única de acesso ao catálogo de benefícios (frontend.md §5).
 * `beneficios` = catálogo (oferta) — distinto de `solicitacoes_servico`
 * ("carrinho" que vira guia). Ver frontend.md §2.2 para o vocabulário canônico.
 */

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

/** Exportado para reuso pelo payload da fila-admin (Secretária) — a
 *  solicitação precisa carregar o mesmo formato que o INSERT real usaria. */
export function montarPayloadBeneficio(valores: BeneficioFormValues) {
  return {
    nome: valores.nome.trim(),
    descricao: vazio(valores.descricao),
    categoria: vazio(valores.categoria),
    valor_particular: valores.valor_particular ?? null,
    valor_convenio: valores.valor_convenio ?? null,
    nivel_minimo: valores.nivel_minimo,
    condicoes: vazio(valores.condicoes),
    ativo: valores.ativo,
  };
}

// ---------------------------------------------------------------------------
// Catálogo transversal (/beneficios)
// ---------------------------------------------------------------------------

export type BeneficioListItem = Database["public"]["Tables"]["beneficios"]["Row"] & {
  parceiro: { nome: string } | null;
};

export type BeneficiosFiltros = {
  busca: string;
  parceiroId: string | "todos";
  /** Filtro por trecho da categoria (texto livre no banco) — vazio = sem filtro. */
  categoria: string;
  nivelMinimo: Database["public"]["Enums"]["nivel_protecao"] | "todos";
  ativo: "todos" | "ativo" | "inativo";
};

const COLUNAS_ORDENAVEIS = new Set(["nome", "categoria", "nivel_minimo", "created_at"]);

export function useBeneficios(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: BeneficiosFiltros,
) {
  return useQuery({
    queryKey: ["beneficios", "lista", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase.from("beneficios").select("*, parceiro:parceiros(nome)", { count: "exact" });

      const termo = filtros.busca.trim();
      if (termo) query = query.ilike("nome", `%${termo}%`);
      if (filtros.parceiroId !== "todos") query = query.eq("parceiro_id", filtros.parceiroId);
      if (filtros.categoria.trim()) query = query.ilike("categoria", `%${filtros.categoria.trim()}%`);
      if (filtros.nivelMinimo !== "todos") query = query.eq("nivel_minimo", filtros.nivelMinimo);
      if (filtros.ativo !== "todos") query = query.eq("ativo", filtros.ativo === "ativo");

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS.has(ordenacao.id) ? ordenacao.id : "nome";
      query = query.order(coluna, { ascending: !ordenacao?.desc });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as BeneficioListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export type BeneficioFicha = Database["public"]["Tables"]["beneficios"]["Row"] & {
  parceiro: { id: string; nome: string } | null;
};

export function useBeneficio(id: string | undefined) {
  return useQuery({
    queryKey: ["beneficios", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficios")
        .select("*, parceiro:parceiros(id, nome)")
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as unknown as BeneficioFicha;
    },
    enabled: !!id,
  });
}

/** INSERT direto — admin-only por RLS (pol_beneficios_insert). Usado pela
 *  tela transversal /beneficios, onde o parceiro é escolhido no formulário. */
export function useCriarBeneficioComParceiro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: BeneficioComParceiroFormValues) => {
      const { error } = await supabase
        .from("beneficios")
        .insert({ ...montarPayloadBeneficio(valores), parceiro_id: valores.parceiro_id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["beneficios"] });
    },
  });
}

export function useAtualizarBeneficio(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: BeneficioFormValues) => {
      const { error } = await supabase.from("beneficios").update(montarPayloadBeneficio(valores)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["beneficios"] });
    },
  });
}

/** DELETE direto — admin-only por RLS (pol_beneficios_delete). */
export function useExcluirBeneficio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("beneficios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["beneficios"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Escopo por parceiro (aba "Benefícios" dentro de /parceiros)
// ---------------------------------------------------------------------------

export type Beneficio = Database["public"]["Tables"]["beneficios"]["Row"];

export function useBeneficiosDoParceiro(parceiroId: string | undefined) {
  return useQuery({
    queryKey: ["beneficios", "do-parceiro", parceiroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficios")
        .select("*")
        .eq("parceiro_id", parceiroId as string)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Beneficio[];
    },
    enabled: !!parceiroId,
  });
}

/** INSERT direto — admin-only por RLS. Usado na aba do parceiro (parceiro_id
 *  fixo pelo contexto). Secretária cria via fila-admin (ver ListaParceirosPage). */
export function useCriarBeneficio(parceiroId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: BeneficioFormValues) => {
      const { error } = await supabase
        .from("beneficios")
        .insert({ ...montarPayloadBeneficio(valores), parceiro_id: parceiroId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["beneficios"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Histórico e utilização (detalhe do benefício — frontend.md §2.2)
// ---------------------------------------------------------------------------

export type SolicitacaoDoBeneficio = {
  id: string;
  numero_guia: string;
  data_agendada: string;
  status: Database["public"]["Enums"]["status_solicitacao"];
  valor_particular: number | null;
  valor_convenio: number | null;
  trabalhador: { nome: string } | null;
  beneficiado: { nome: string } | null;
};

export function useHistoricoSolicitacoesBeneficio(beneficioId: string | undefined) {
  return useQuery({
    queryKey: ["beneficios", "historico", beneficioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_servico")
        .select(
          "id, numero_guia, data_agendada, status, valor_particular, valor_convenio, trabalhador:trabalhadores(nome), beneficiado:beneficiados(nome)",
        )
        .eq("beneficio_id", beneficioId as string)
        .order("data_agendada", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SolicitacaoDoBeneficio[];
    },
    enabled: !!beneficioId,
  });
}

/** Indicador de utilização 90d: quantas solicitações desse benefício nos
 *  últimos 90 dias, e quantas foram efetivamente executadas. */
export function useUtilizacaoBeneficio90d(beneficioId: string | undefined) {
  return useQuery({
    queryKey: ["beneficios", "utilizacao-90d", beneficioId],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 90);
      const { data, error } = await supabase
        .from("solicitacoes_servico")
        .select("status")
        .eq("beneficio_id", beneficioId as string)
        .gte("data_agendada", desde.toISOString().slice(0, 10));
      if (error) throw error;
      const linhas = data ?? [];
      return {
        total: linhas.length,
        executadas: linhas.filter((l) => l.status === "executada").length,
      };
    },
    enabled: !!beneficioId,
  });
}
