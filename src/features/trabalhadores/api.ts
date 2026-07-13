import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { apenasDigitos } from "@/lib/validators";
import type { Database, Enums } from "@/lib/database.types";

/**
 * Camada única de acesso ao domínio "trabalhadores" (frontend.md §5): todo
 * componente consome estes hooks TanStack Query, nunca chama supabase-js
 * diretamente. Nível é coluna `generated always` no banco — nenhum hook aqui
 * escreve nela; a Fase 1.1 é somente leitura (lista + ficha).
 */

// ---------------------------------------------------------------------------
// Lista (DataTable server-side)
// ---------------------------------------------------------------------------

export type TrabalhadorListItem = Pick<
  Database["public"]["Tables"]["trabalhadores"]["Row"],
  "id" | "cpf" | "nome" | "nivel" | "status_cadastro" | "forma_pagamento_preferida"
> & {
  municipio: { nome: string; uf: string } | null;
};

export type TrabalhadoresFiltros = {
  busca?: string;
  nivel?: Enums<"nivel_protecao"> | "todos";
  municipioId?: number | "todos";
  statusCadastro?: Enums<"status_cadastro"> | "todos";
};

const COLUNAS_LISTA =
  "id, cpf, nome, nivel, status_cadastro, forma_pagamento_preferida, municipio:municipios(nome, uf)";

/** Colunas ordenáveis pela DataTable (evita `order()` em coluna de join). */
const COLUNAS_ORDENAVEIS = new Set(["nome", "cpf", "nivel", "status_cadastro", "created_at"]);

export function useTrabalhadores(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: TrabalhadoresFiltros,
) {
  return useQuery({
    queryKey: ["trabalhadores", "lista", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase.from("trabalhadores").select(COLUNAS_LISTA, { count: "exact" });

      const busca = (filtros.busca ?? "").trim();
      if (busca) {
        const digitos = apenasDigitos(busca);
        query =
          digitos.length >= 3
            ? query.ilike("cpf", `${digitos}%`)
            : query.ilike("nome", `%${busca}%`);
      }
      if (filtros.nivel && filtros.nivel !== "todos") {
        query = query.eq("nivel", filtros.nivel);
      }
      if (filtros.municipioId && filtros.municipioId !== "todos") {
        query = query.eq("municipio_id", filtros.municipioId);
      }
      if (filtros.statusCadastro && filtros.statusCadastro !== "todos") {
        query = query.eq("status_cadastro", filtros.statusCadastro);
      }

      const ordenacao = sorting[0];
      const colunaOrdenacao =
        ordenacao && COLUNAS_ORDENAVEIS.has(ordenacao.id) ? ordenacao.id : "nome";
      query = query.order(colunaOrdenacao, { ascending: !ordenacao?.desc });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as TrabalhadorListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Ficha (Dados + abas)
// ---------------------------------------------------------------------------

export type TrabalhadorFicha = Database["public"]["Tables"]["trabalhadores"]["Row"] & {
  municipio: { nome: string; uf: string } | null;
};

export function useTrabalhador(id: string | undefined) {
  return useQuery({
    queryKey: ["trabalhadores", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trabalhadores")
        .select("*, municipio:municipios(nome, uf)")
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as TrabalhadorFicha;
    },
    enabled: !!id,
  });
}

export type VinculoComEstabelecimento =
  Database["public"]["Tables"]["vinculos_empregaticios"]["Row"] & {
    estabelecimento: { nome_fantasia: string | null; cnpj_completo: string | null } | null;
  };

export function useVinculosTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["trabalhadores", "vinculos", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vinculos_empregaticios")
        .select("*, estabelecimento:estabelecimentos(nome_fantasia, cnpj_completo)")
        .eq("trabalhador_id", trabalhadorId as string)
        .order("principal", { ascending: false })
        .order("data_admissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VinculoComEstabelecimento[];
    },
    enabled: !!trabalhadorId,
  });
}

export function useBeneficiadosTrabalhador(titularId: string | undefined) {
  return useQuery({
    queryKey: ["trabalhadores", "beneficiados", titularId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficiados")
        .select("*")
        .eq("titular_id", titularId as string)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!titularId,
  });
}

export function useCartasTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["trabalhadores", "cartas", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartas_oposicao")
        .select("*")
        .eq("trabalhador_id", trabalhadorId as string)
        .order("ano_base", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!trabalhadorId,
  });
}

/** Fica vazia até o motor de geração de cobranças (Etapa 02) existir. */
export function useFaturasTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["trabalhadores", "faturas", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas")
        .select("*")
        .eq("trabalhador_id", trabalhadorId as string)
        .order("competencia", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!trabalhadorId,
  });
}
