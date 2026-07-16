import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { FaturaExcepcionalFormValues } from "./schemas";

/**
 * Camada única de acesso ao financeiro (frontend.md §5). `faturas` = cobrança
 * nominal do trabalhador; `repasses` = guia de pagamento da empresa que
 * agrega as faturas `holerite` (sql/01_schema.sql §10).
 *
 * RLS (sql/03_rls.sql §12): Admin e Secretária têm CRUD direto nas duas
 * tabelas — sem fila-admin, mesmo padrão de `solicitacoes_servico`.
 */

type TipoFatura = Database["public"]["Enums"]["tipo_fatura"];
type StatusFatura = Database["public"]["Enums"]["status_fatura"];
type StatusRepasse = Database["public"]["Enums"]["status_repasse"];
type FormaCobranca = Database["public"]["Enums"]["forma_cobranca"];
type FaturaUpdate = Database["public"]["Tables"]["faturas"]["Update"];
type RepasseUpdate = Database["public"]["Tables"]["repasses"]["Update"];

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Faturas (/financeiro/faturas)
// ---------------------------------------------------------------------------

export type FaturaListItem = Database["public"]["Tables"]["faturas"]["Row"] & {
  trabalhador: { id: string; nome: string; cpf: string } | null;
  repasse: { numero_guia_pagamento: string | null } | null;
};

export type FaturasFiltros = {
  trabalhadorId: string | "todos";
  tipo: TipoFatura | "todos";
  status: StatusFatura | "todos";
};

const COLUNAS_ORDENAVEIS_FATURA = new Set(["competencia", "valor", "data_vencimento", "status", "created_at"]);

export function useFaturas(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: FaturasFiltros,
) {
  return useQuery({
    queryKey: ["financeiro", "faturas", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase
        .from("faturas")
        .select(
          "*, trabalhador:trabalhadores(id, nome, cpf), repasse:repasses(numero_guia_pagamento)",
          { count: "exact" },
        );

      if (filtros.trabalhadorId !== "todos") query = query.eq("trabalhador_id", filtros.trabalhadorId);
      if (filtros.tipo !== "todos") query = query.eq("tipo", filtros.tipo);
      if (filtros.status !== "todos") query = query.eq("status", filtros.status);

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS_FATURA.has(ordenacao.id) ? ordenacao.id : "created_at";
      query = query.order(coluna, { ascending: ordenacao ? !ordenacao.desc : false });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as FaturaListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

/** Referência de valores para a Secretária conferir a fatura excepcional
 *  contra o salário-base do trabalhador (frontend.md: "valores conferem com
 *  as views de base de cálculo") — não há fórmula fixa para multa/acordo, o
 *  valor da cláusula da CCT é digitado; isto é só apoio visual. */
export function useBaseCalculoTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["financeiro", "base-calculo", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_base_calculo_trabalhador")
        .select("salario_base, valor_contribuicao_anual")
        .eq("trabalhador_id", trabalhadorId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!trabalhadorId,
  });
}

function montarPayloadFaturaExcepcional(valores: FaturaExcepcionalFormValues) {
  return {
    trabalhador_id: valores.trabalhador_id,
    tipo: valores.tipo,
    competencia: valores.competencia,
    valor: valores.valor,
    forma_cobranca: valores.forma_cobranca as FormaCobranca,
    data_vencimento: vazio(valores.data_vencimento),
    observacoes: vazio(valores.observacoes),
  };
}

/** INSERT direto — Admin/Secretária (pol_faturas_insert). Restrito na UI aos
 *  3 tipos excepcionais; `contribuicao_sindical`/`mensalidade_convenio` só a
 *  engine da 02.6 cria (mesma tabela, sem trigger que imponha isso hoje —
 *  a disciplina é do formulário, não do banco). */
export function useCriarFaturaExcepcional() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: FaturaExcepcionalFormValues) => {
      const { error } = await supabase.from("faturas").insert(montarPayloadFaturaExcepcional(valores));
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financeiro", "faturas"] });
      // A aba "Faturas" da ficha do trabalhador lê a mesma tabela.
      void queryClient.invalidateQueries({ queryKey: ["servicos", "do-trabalhador"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "faturas"] });
    },
  });
}

/** Baixa/alteração manual de status (sql/01_schema.sql §11: a via
 *  'inadimplente' manual é explicitamente prevista quando o desconto em
 *  folha comprovadamente não ocorreu). */
export function useAtualizarStatusFatura(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (novoStatus: StatusFatura) => {
      const payload: FaturaUpdate = { status: novoStatus };
      if (novoStatus === "paga") {
        payload.data_pagamento = new Date().toISOString().slice(0, 10);
        payload.origem_baixa = "manual";
      }
      const { error } = await supabase.from("faturas").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "faturas"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Guias de pagamento / repasses (/financeiro/guias)
// ---------------------------------------------------------------------------

export type RepasseListItem = Database["public"]["Tables"]["repasses"]["Row"] & {
  empresa: { razao_social: string } | null;
};

export type RepassesFiltros = {
  status: StatusRepasse | "todos";
};

const COLUNAS_ORDENAVEIS_REPASSE = new Set(["competencia", "valor_total", "data_vencimento", "status", "created_at"]);

export function useRepasses(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: RepassesFiltros,
) {
  return useQuery({
    queryKey: ["financeiro", "repasses", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase
        .from("repasses")
        .select("*, empresa:empresas(razao_social)", { count: "exact" });
      if (filtros.status !== "todos") query = query.eq("status", filtros.status);

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS_REPASSE.has(ordenacao.id) ? ordenacao.id : "created_at";
      query = query.order(coluna, { ascending: ordenacao ? !ordenacao.desc : false });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as RepasseListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export type FaturaDoRepasse = {
  id: string;
  trabalhador: { nome: string } | null;
  tipo: TipoFatura;
  competencia: string;
  valor: number;
  status: StatusFatura;
};

/** Base da conciliação (frontend.md: "valor guia × soma de faturas"). */
export function useFaturasDoRepasse(repasseId: string | undefined) {
  return useQuery({
    queryKey: ["financeiro", "faturas-do-repasse", repasseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas")
        .select("id, trabalhador:trabalhadores(nome), tipo, competencia, valor, status")
        .eq("repasse_id", repasseId as string)
        .order("competencia");
      if (error) throw error;
      return (data ?? []) as unknown as FaturaDoRepasse[];
    },
    enabled: !!repasseId,
  });
}

/** Ciclo previsto → enviado → recebido/em_atraso (UI restringe as transições
 *  visíveis por status atual — a criação da guia em si é exclusiva da
 *  engine automática, Subetapa 02.6). */
export function useAtualizarStatusRepasse(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (novoStatus: StatusRepasse) => {
      const payload: RepasseUpdate = { status: novoStatus };
      if (novoStatus === "recebido") payload.recebido_em = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("repasses").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financeiro", "repasses"] });
    },
  });
}
