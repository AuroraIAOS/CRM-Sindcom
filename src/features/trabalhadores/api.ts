import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { apenasDigitos } from "@/lib/validators";
import type { Database, Enums } from "@/lib/database.types";
import type { TablesInsert } from "@/lib/database.types";
import * as bulk from "./bulk";
import type {
  BeneficiadoFormValues,
  CartaFormValues,
  TrabalhadorFormValues,
  VinculoFormValues,
} from "./schemas";

/**
 * Camada única de acesso ao domínio "trabalhadores" (frontend.md §5): todo
 * componente consome estes hooks TanStack Query, nunca chama supabase-js
 * diretamente. Nível é coluna `generated always` no banco — nenhum hook aqui
 * escreve nela diretamente; a única forma deliberada de mudar o nível é
 * registrar uma carta de oposição (useRegistrarCarta), que também zera as
 * flags de recolhimento.
 */

/** "" do formulário → null para colunas date/text opcionais do banco. */
function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

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
// Criação de trabalhador
// ---------------------------------------------------------------------------

/**
 * Monta o payload de INSERT a partir do formulário. Usado tanto pelo INSERT
 * direto do Admin (useCriarTrabalhador) quanto pela fila-admin (payload da
 * solicitacoes_admin da Secretária) — o mesmo objeto vira `jsonb` na fila e é
 * reexecutado como INSERT real quando o Admin aprova. `status_cadastro` e
 * `origem_cadastro` são fixos: criação manual é ato deliberado (= aprovado).
 */
export function montarPayloadTrabalhador(v: TrabalhadorFormValues): TablesInsert<"trabalhadores"> {
  return {
    cpf: apenasDigitos(v.cpf),
    nome: v.nome.trim(),
    data_nascimento: vazio(v.data_nascimento),
    telefone_whatsapp: vazio(v.telefone_whatsapp),
    email: vazio(v.email),
    municipio_id: v.municipio_id ?? null,
    recolhe_contribuicao_sindical: v.recolhe_contribuicao_sindical,
    recolhe_mensalidade_convenio: v.recolhe_mensalidade_convenio,
    forma_pagamento_preferida: v.forma_pagamento_preferida,
    status_cadastro: "aprovado",
    origem_cadastro: "manual",
  };
}

/** INSERT direto — só o Admin passa no RLS (pol_trab_insert). */
export function useCriarTrabalhador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: TrabalhadorFormValues) => {
      const { error } = await supabase.from("trabalhadores").insert(montarPayloadTrabalhador(valores));
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "lista"] });
    },
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

export function useCriarVinculo(trabalhadorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: VinculoFormValues) => {
      const { error } = await supabase.from("vinculos_empregaticios").insert({
        trabalhador_id: trabalhadorId,
        estabelecimento_id: valores.estabelecimento_id,
        funcao: vazio(valores.funcao),
        data_admissao: vazio(valores.data_admissao),
        data_desligamento: vazio(valores.data_desligamento),
        salario_informado: valores.salario_informado ?? null,
        principal: valores.principal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "vinculos", trabalhadorId] });
    },
  });
}

export function useAtualizarVinculo(trabalhadorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: VinculoFormValues }) => {
      const { error } = await supabase
        .from("vinculos_empregaticios")
        .update({
          estabelecimento_id: valores.estabelecimento_id,
          funcao: vazio(valores.funcao),
          data_admissao: vazio(valores.data_admissao),
          data_desligamento: vazio(valores.data_desligamento),
          salario_informado: valores.salario_informado ?? null,
          principal: valores.principal,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "vinculos", trabalhadorId] });
    },
  });
}

export function useExcluirVinculo(trabalhadorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vinculos_empregaticios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "vinculos", trabalhadorId] });
    },
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

export function useCriarBeneficiado(titularId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: BeneficiadoFormValues) => {
      const { error } = await supabase.from("beneficiados").insert({
        titular_id: titularId,
        nome: valores.nome.trim(),
        cpf: apenasDigitos(valores.cpf),
        data_nascimento: vazio(valores.data_nascimento),
        parentesco: valores.parentesco ?? null,
        tipo: valores.tipo,
        status_cadastro: "aprovado",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "beneficiados", titularId] });
    },
  });
}

export function useAtualizarBeneficiado(titularId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: BeneficiadoFormValues }) => {
      const { error } = await supabase
        .from("beneficiados")
        .update({
          nome: valores.nome.trim(),
          cpf: apenasDigitos(valores.cpf),
          data_nascimento: vazio(valores.data_nascimento),
          parentesco: valores.parentesco ?? null,
          tipo: valores.tipo,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "beneficiados", titularId] });
    },
  });
}

export function useExcluirBeneficiado(titularId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("beneficiados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "beneficiados", titularId] });
    },
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

/**
 * Registra a carta de oposição E, no mesmo ato, zera as duas flags de
 * recolhimento (o trabalhador vira Bronze) — é a única forma deliberada de
 * baixar o nível nesta subetapa (frontend.md: nível nunca é campo editável
 * solto). As duas escritas são sequenciais (sem RPC transacional ainda); se a
 * 2ª falhar, a carta fica registrada mas o nível não muda — o erro é reportado
 * para nova tentativa.
 */
export function useRegistrarCarta(trabalhadorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: CartaFormValues) => {
      const { error: erroCarta } = await supabase.from("cartas_oposicao").insert({
        trabalhador_id: trabalhadorId,
        ano_base: valores.ano_base,
        data_entrega: valores.data_entrega,
        forma: valores.forma,
        comprovante_url: vazio(valores.comprovante_url),
      });
      if (erroCarta) throw erroCarta;

      const { error: erroFlags } = await supabase
        .from("trabalhadores")
        .update({ recolhe_contribuicao_sindical: false, recolhe_mensalidade_convenio: false })
        .eq("id", trabalhadorId);
      if (erroFlags) throw erroFlags;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "cartas", trabalhadorId] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "ficha", trabalhadorId] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "lista"] });
    },
  });
}

export function useExcluirCarta(trabalhadorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cartas_oposicao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores", "cartas", trabalhadorId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Ações em massa (Tarefa 01) — caminho DIRETO do Admin. A Secretária usa os
// mesmos executores puros (bulk.ts) via fila-admin (solicitacoes_admin).
// ---------------------------------------------------------------------------

/** Exclusão em massa — admin direto por RLS; cascade nativo do schema apaga
 *  vínculos/beneficiados/cartas relacionados. */
export function useExcluirTrabalhadoresEmLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulk.executarLoteExcluir(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

/** Atribuição em massa de campos de DADOS (colunas de trabalhadores). */
export function useAtribuirDadosEmLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, valores }: { ids: string[]; valores: bulk.DadosLote }) =>
      bulk.executarLoteDados(ids, valores),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

/** Atribuição em massa de campos de VÍNCULO — resolve os vínculos principais
 *  ativos dos trabalhadores e atualiza esses vínculos. */
export function useAtribuirVinculosEmLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      trabalhadorIds,
      valores,
    }: {
      trabalhadorIds: string[];
      valores: bulk.VinculoLote;
    }) => {
      const vinculoIds = await bulk.resolverVinculosPrincipais(trabalhadorIds);
      return bulk.executarLoteVinculos(vinculoIds, valores);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

/** Registro de carta em massa — rebaixa todos os selecionados a Bronze; pula
 *  duplicatas de ano-base. */
export function useRegistrarCartasEmLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, valores }: { ids: string[]; valores: bulk.CartaLote }) =>
      bulk.executarLoteCartas(ids, valores),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
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
