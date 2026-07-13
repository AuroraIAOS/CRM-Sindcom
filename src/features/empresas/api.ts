import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { apenasDigitos } from "@/lib/validators";
import type { Database } from "@/lib/database.types";
import type { EmpresaFormValues, EstabelecimentoFormValues } from "./schemas";

/**
 * Camada única de acesso a empresas/estabelecimentos (frontend.md §5).
 * Subetapa 01.3: leitura + atualização apenas — criação chega via importação
 * CSV (01.5), onde a empresa precisa existir antes do estabelecimento.
 */

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Empresas (lista mestre)
// ---------------------------------------------------------------------------

export type EmpresaListItem = Database["public"]["Tables"]["empresas"]["Row"];

const COLUNAS_ORDENAVEIS_EMPRESA = new Set(["razao_social", "cnpj_basico", "created_at"]);

export function useEmpresas(pagination: PaginationState, sorting: SortingState, busca: string) {
  return useQuery({
    queryKey: ["empresas", "lista", pagination, sorting, busca],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase.from("empresas").select("*", { count: "exact" });

      const termo = busca.trim();
      if (termo) {
        const digitos = apenasDigitos(termo);
        query =
          digitos.length >= 3
            ? query.ilike("cnpj_basico", `${digitos}%`)
            : query.ilike("razao_social", `%${termo}%`);
      }

      const ordenacao = sorting[0];
      const coluna =
        ordenacao && COLUNAS_ORDENAVEIS_EMPRESA.has(ordenacao.id) ? ordenacao.id : "razao_social";
      query = query.order(coluna, { ascending: !ordenacao?.desc });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as EmpresaListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export type EmpresaFicha = Database["public"]["Tables"]["empresas"]["Row"] & {
  natureza: { descricao: string } | null;
  qualificacao: { descricao: string } | null;
};

export function useEmpresa(cnpjBasico: string | undefined) {
  return useQuery({
    queryKey: ["empresas", "ficha", cnpjBasico],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("*, natureza:naturezas_juridicas(descricao), qualificacao:qualificacoes_responsavel(descricao)")
        .eq("cnpj_basico", cnpjBasico as string)
        .single();
      if (error) throw error;
      return data as EmpresaFicha;
    },
    enabled: !!cnpjBasico,
  });
}

export function useAtualizarEmpresa(cnpjBasico: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: EmpresaFormValues) => {
      const { error } = await supabase
        .from("empresas")
        .update({
          razao_social: valores.razao_social.trim(),
          porte: vazio(valores.porte),
          capital_social: valores.capital_social ?? null,
        })
        .eq("cnpj_basico", cnpjBasico);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["empresas", "ficha", cnpjBasico] });
      void queryClient.invalidateQueries({ queryKey: ["empresas", "lista"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Estabelecimentos (detalhe, dentro da empresa)
// ---------------------------------------------------------------------------

export type EstabelecimentoDaEmpresa =
  Database["public"]["Tables"]["estabelecimentos"]["Row"] & {
    municipio: { nome: string; uf: string } | null;
    convencao: { nome: string } | null;
  };

export function useEstabelecimentosDaEmpresa(cnpjBasico: string | undefined) {
  return useQuery({
    queryKey: ["empresas", "estabelecimentos", cnpjBasico],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estabelecimentos")
        .select("*, municipio:municipios(nome, uf), convencao:convencoes_coletivas(nome)")
        .eq("cnpj_basico", cnpjBasico as string)
        .order("nome_fantasia");
      if (error) throw error;
      return (data ?? []) as EstabelecimentoDaEmpresa[];
    },
    enabled: !!cnpjBasico,
  });
}

export type EstabelecimentoFicha = Database["public"]["Tables"]["estabelecimentos"]["Row"] & {
  municipio: { nome: string; uf: string } | null;
  convencao: { nome: string } | null;
  cnae: { descricao: string } | null;
  motivo: { descricao: string } | null;
};

export function useEstabelecimento(id: string | undefined) {
  return useQuery({
    queryKey: ["estabelecimentos", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estabelecimentos")
        .select(
          "*, municipio:municipios(nome, uf), convencao:convencoes_coletivas(nome), cnae:cnaes(descricao), motivo:motivos_situacao_cadastral(descricao)",
        )
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as EstabelecimentoFicha;
    },
    enabled: !!id,
  });
}

export function useAtualizarEstabelecimento(id: string, cnpjBasico: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: EstabelecimentoFormValues) => {
      const { error } = await supabase
        .from("estabelecimentos")
        .update({
          nome_fantasia: vazio(valores.nome_fantasia),
          tipo_logradouro: vazio(valores.tipo_logradouro),
          logradouro: vazio(valores.logradouro),
          numero: vazio(valores.numero),
          complemento: vazio(valores.complemento),
          bairro: vazio(valores.bairro),
          cep: vazio(valores.cep),
          municipio_id: valores.municipio_id ?? null,
          ddd_1: vazio(valores.ddd_1),
          telefone_1: vazio(valores.telefone_1),
          ddd_2: vazio(valores.ddd_2),
          telefone_2: vazio(valores.telefone_2),
          email: vazio(valores.email),
          convencao_id: vazio(valores.convencao_id),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["estabelecimentos", "ficha", id] });
      void queryClient.invalidateQueries({ queryKey: ["empresas", "estabelecimentos", cnpjBasico] });
    },
  });
}
