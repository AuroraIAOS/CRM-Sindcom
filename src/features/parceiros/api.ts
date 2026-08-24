import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { apenasDigitos } from "@/lib/validators";
import type { Database } from "@/lib/database.types";
import type {
  NovoRecepcionistaFormValues,
  ParceiroFormValues,
  RecepcionistaFormValues,
} from "./schemas";

/**
 * Camada única de acesso a parceiros/recepcionistas (frontend.md §5).
 * RLS: parceiros/recepcionistas são CRU-baixa da Secretária (sql/03_rls.sql
 * §5) — INSERT/DELETE só Admin; UPDATE Admin+Secretária. Criação/exclusão da
 * Secretária passam pela fila-admin (features/fila-admin/api.ts).
 */

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Parceiros (lista mestre)
// ---------------------------------------------------------------------------

export type ParceiroListItem = Database["public"]["Tables"]["parceiros"]["Row"];

/** Lista enxuta (id, nome) para selects/filtros — ex.: escolha de parceiro no
 *  catálogo transversal de benefícios. Mesmo padrão de useMunicipiosBase. */
export function useParceirosSimples() {
  return useQuery({
    queryKey: ["parceiros", "simples"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parceiros").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

const COLUNAS_ORDENAVEIS_PARCEIRO = new Set(["nome", "segmento", "status", "created_at"]);

export function useParceiros(pagination: PaginationState, sorting: SortingState, busca: string) {
  return useQuery({
    queryKey: ["parceiros", "lista", pagination, sorting, busca],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase.from("parceiros").select("*", { count: "exact" });

      const termo = busca.trim();
      if (termo) query = query.ilike("nome", `%${termo}%`);

      const ordenacao = sorting[0];
      const coluna =
        ordenacao && COLUNAS_ORDENAVEIS_PARCEIRO.has(ordenacao.id) ? ordenacao.id : "nome";
      query = query.order(coluna, { ascending: !ordenacao?.desc });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as ParceiroListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useParceiro(id: string | undefined) {
  return useQuery({
    queryKey: ["parceiros", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros")
        .select("*")
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as ParceiroListItem;
    },
    enabled: !!id,
  });
}

/** Exportado para reuso pelo payload da fila-admin (Secretária) — a
 *  solicitação precisa carregar o mesmo formato que o INSERT real usaria. */
export function montarPayloadParceiro(valores: ParceiroFormValues) {
  return {
    nome: valores.nome.trim(),
    segmento: vazio(valores.segmento),
    cnpj: valores.cnpj ? apenasDigitos(valores.cnpj) : null,
    contato_nome: vazio(valores.contato_nome),
    contato_email: vazio(valores.contato_email),
    contato_whatsapp: vazio(valores.contato_whatsapp),
    data_inicio_contrato: vazio(valores.data_inicio_contrato),
    data_fim_contrato: vazio(valores.data_fim_contrato),
    status: valores.status,
    observacoes: vazio(valores.observacoes),
  };
}

/** INSERT direto — admin-only por RLS (pol_parceiros_insert). Secretária cria
 *  via fila-admin (ver ListaParceirosPage). */
export function useCriarParceiro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: ParceiroFormValues) => {
      const { error } = await supabase.from("parceiros").insert(montarPayloadParceiro(valores));
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros", "lista"] });
    },
  });
}

export function useAtualizarParceiro(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: ParceiroFormValues) => {
      const { error } = await supabase.from("parceiros").update(montarPayloadParceiro(valores)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros", "ficha", id] });
      void queryClient.invalidateQueries({ queryKey: ["parceiros", "lista"] });
    },
  });
}

/** DELETE direto — admin-only por RLS (pol_parceiros_delete). */
export function useExcluirParceiro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parceiros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros", "lista"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Recepcionistas (aba "Recepcionistas" dentro do parceiro)
// ---------------------------------------------------------------------------

export type Recepcionista = Database["public"]["Tables"]["recepcionistas"]["Row"];

/**
 * Colunas explícitas, nunca `*` — desde `sql/19_hardening_adversarial.sql`, a
 * coluna `pin_hash` é revogada de `authenticated` (o PIN tem 4 a 6 dígitos e o
 * hash quebra offline). Com o narrowing, `select('*')` devolve
 * `42501 permission denied for table recepcionistas`, que PARECE falha de RLS e
 * manda a investigação para o lado errado. Ver orientacoes.md.
 */
const COLUNAS_RECEPCIONISTA = "id, parceiro_id, nome, ativo, created_at, updated_at";

export function useRecepcionistasDoParceiro(parceiroId: string | undefined) {
  return useQuery({
    queryKey: ["recepcionistas", "do-parceiro", parceiroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recepcionistas")
        .select(COLUNAS_RECEPCIONISTA)
        .eq("parceiro_id", parceiroId as string)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Recepcionista[];
    },
    enabled: !!parceiroId,
  });
}

/** Cria recepcionista com PIN já em hash (sql/11_recepcionista_criacao.sql —
 *  o INSERT genérico não serve: pin_hash é NOT NULL e a anon key não computa
 *  crypt()). RPC guardada a admin; Secretária passa pela fila-admin, que
 *  chama a mesma RPC na aprovação. */
export function useCriarRecepcionista(parceiroId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: NovoRecepcionistaFormValues) => {
      const { error } = await supabase.rpc("fn_criar_recepcionista", {
        p_parceiro_id: parceiroId,
        p_nome: valores.nome.trim(),
        p_pin: valores.pin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recepcionistas", "do-parceiro", parceiroId] });
    },
  });
}

export function useAtualizarRecepcionista(id: string, parceiroId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: RecepcionistaFormValues) => {
      const { error } = await supabase
        .from("recepcionistas")
        .update({ nome: valores.nome.trim(), ativo: valores.ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recepcionistas", "do-parceiro", parceiroId] });
    },
  });
}

/** DELETE direto — admin-only por RLS (pol_recep_delete). */
export function useExcluirRecepcionista(parceiroId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recepcionistas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recepcionistas", "do-parceiro", parceiroId] });
    },
  });
}

/** Redefine o PIN de um recepcionista já existente
 *  (sql/10_recepcionista_pin.sql — admin ou secretária). */
export function useDefinirPinRecepcionista(parceiroId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const { error } = await supabase.rpc("fn_definir_pin_recepcionista", {
        p_recepcionista_id: id,
        p_pin: pin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recepcionistas", "do-parceiro", parceiroId] });
    },
  });
}
