import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type {
  ConvencaoFormValues,
  PisoFormValues,
  TaxaFormValues,
} from "./schemas";

/**
 * Camada única de acesso a convenções coletivas (CCT), pisos, taxas e a
 * migração em lote de estabelecimentos (frontend.md §5). Dataset pequeno
 * (dezenas de convenções) — sem paginação server-side nas listas.
 */

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Convenções
// ---------------------------------------------------------------------------

export type Convencao = Database["public"]["Tables"]["convencoes_coletivas"]["Row"];

export function useConvencoes() {
  return useQuery({
    queryKey: ["convencoes", "lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convencoes_coletivas")
        .select("*")
        .order("ano_base", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data as Convencao[];
    },
  });
}

export function useConvencao(id: string | undefined) {
  return useQuery({
    queryKey: ["convencoes", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convencoes_coletivas")
        .select("*")
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as Convencao;
    },
    enabled: !!id,
  });
}

export function useCriarConvencao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: ConvencaoFormValues) => {
      const { data, error } = await supabase
        .from("convencoes_coletivas")
        .insert({
          nome: valores.nome.trim(),
          ano_base: valores.ano_base,
          data_inicio_vigencia: valores.data_inicio_vigencia,
          data_fim_vigencia: vazio(valores.data_fim_vigencia),
          data_limite_oposicao: vazio(valores.data_limite_oposicao),
          documento_url: vazio(valores.documento_url),
          observacoes: vazio(valores.observacoes),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "lista"] });
    },
  });
}

export function useAtualizarConvencao(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: ConvencaoFormValues) => {
      const { error } = await supabase
        .from("convencoes_coletivas")
        .update({
          nome: valores.nome.trim(),
          ano_base: valores.ano_base,
          data_inicio_vigencia: valores.data_inicio_vigencia,
          data_fim_vigencia: vazio(valores.data_fim_vigencia),
          data_limite_oposicao: vazio(valores.data_limite_oposicao),
          documento_url: vazio(valores.documento_url),
          observacoes: vazio(valores.observacoes),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "lista"] });
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "ficha", id] });
    },
  });
}

export function useExcluirConvencao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("convencoes_coletivas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "lista"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Pisos por função
// ---------------------------------------------------------------------------

export type Piso = Database["public"]["Tables"]["pisos_convencao"]["Row"];

export function usePisosConvencao(convencaoId: string | undefined) {
  return useQuery({
    queryKey: ["convencoes", "pisos", convencaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pisos_convencao")
        .select("*")
        .eq("convencao_id", convencaoId as string)
        .order("funcao", { nullsFirst: true });
      if (error) throw error;
      return data as Piso[];
    },
    enabled: !!convencaoId,
  });
}

export function useCriarPiso(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: PisoFormValues) => {
      const { error } = await supabase.from("pisos_convencao").insert({
        convencao_id: convencaoId,
        funcao: vazio(valores.funcao),
        valor: valores.valor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "pisos", convencaoId] });
    },
  });
}

export function useAtualizarPiso(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: PisoFormValues }) => {
      const { error } = await supabase
        .from("pisos_convencao")
        .update({ funcao: vazio(valores.funcao), valor: valores.valor })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "pisos", convencaoId] });
    },
  });
}

export function useExcluirPiso(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pisos_convencao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "pisos", convencaoId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Taxas (multas/acordos/taxas adicionais previstas na CCT)
// ---------------------------------------------------------------------------

export type Taxa = Database["public"]["Tables"]["taxas_convencao"]["Row"];

export function useTaxasConvencao(convencaoId: string | undefined) {
  return useQuery({
    queryKey: ["convencoes", "taxas", convencaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("taxas_convencao")
        .select("*")
        .eq("convencao_id", convencaoId as string)
        .order("nome");
      if (error) throw error;
      return data as Taxa[];
    },
    enabled: !!convencaoId,
  });
}

export function useCriarTaxa(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: TaxaFormValues) => {
      const { error } = await supabase.from("taxas_convencao").insert({
        convencao_id: convencaoId,
        nome: valores.nome.trim(),
        valor: valores.valor ?? null,
        observacoes: vazio(valores.observacoes),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "taxas", convencaoId] });
    },
  });
}

export function useAtualizarTaxa(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: TaxaFormValues }) => {
      const { error } = await supabase
        .from("taxas_convencao")
        .update({
          nome: valores.nome.trim(),
          valor: valores.valor ?? null,
          observacoes: vazio(valores.observacoes),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "taxas", convencaoId] });
    },
  });
}

export function useExcluirTaxa(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("taxas_convencao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "taxas", convencaoId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Estabelecimentos vinculados + migração em lote
// ---------------------------------------------------------------------------

export type EstabelecimentoVinculado = Pick<
  Database["public"]["Tables"]["estabelecimentos"]["Row"],
  "id" | "nome_fantasia" | "cnpj_completo"
>;

export function useEstabelecimentosDaConvencao(convencaoId: string | undefined) {
  return useQuery({
    queryKey: ["convencoes", "estabelecimentos", convencaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estabelecimentos")
        .select("id, nome_fantasia, cnpj_completo")
        .eq("convencao_id", convencaoId as string)
        .order("nome_fantasia");
      if (error) throw error;
      return data as EstabelecimentoVinculado[];
    },
    enabled: !!convencaoId,
  });
}

export type EstabelecimentoParaMigracao = Pick<
  Database["public"]["Tables"]["estabelecimentos"]["Row"],
  "id" | "nome_fantasia" | "cnpj_completo" | "convencao_id"
> & {
  convencao: { nome: string } | null;
};

/** Todos os estabelecimentos, com a CCT atual (se houver) — alimenta o
 *  seletor de "migrar em lote". */
export function useEstabelecimentosParaMigracao() {
  return useQuery({
    queryKey: ["convencoes", "estabelecimentos-migracao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estabelecimentos")
        .select("id, nome_fantasia, cnpj_completo, convencao_id, convencao:convencoes_coletivas(nome)")
        .order("nome_fantasia");
      if (error) throw error;
      return data as EstabelecimentoParaMigracao[];
    },
  });
}

/**
 * Migração em lote: ato deliberado e auditável (plano_fases.md 01.3) — feita
 * numa única chamada `.in()`, sempre atrás de confirmação explícita na UI.
 * Retorna a contagem migrada para o relatório na tela.
 */
export function useMigrarEstabelecimentos(convencaoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (estabelecimentoIds: string[]) => {
      const { error, count } = await supabase
        .from("estabelecimentos")
        .update({ convencao_id: convencaoId }, { count: "exact" })
        .in("id", estabelecimentoIds);
      if (error) throw error;
      return count ?? estabelecimentoIds.length;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "estabelecimentos", convencaoId] });
      void queryClient.invalidateQueries({ queryKey: ["convencoes", "estabelecimentos-migracao"] });
      void queryClient.invalidateQueries({ queryKey: ["empresas", "estabelecimentos"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Relatório da CCT + organização interna (plano_fases.md 02.5)
// ---------------------------------------------------------------------------

export type LinhaRelatorioConvencao =
  Database["public"]["Views"]["v_relatorio_convencao"]["Row"];

/** Uma linha por TRABALHADOR: o resultado de deduplicar a view por
 *  `trabalhador_id`, com os estabelecimentos de todos os vínculos reunidos. */
export type TrabalhadorRelatorio = LinhaRelatorioConvencao & { estabelecimentos: string[] };

const TAMANHO_PAGINA = 1000;

/**
 * Base do relatório de organização interna (04_dashboard.sql D7).
 *
 * A view devolve UMA LINHA POR VÍNCULO, não por trabalhador: quem tem dois
 * vínculos ativos na mesma CCT aparece duas vezes. Quem consome tem de
 * deduplicar por `trabalhador_id` antes de contar — a própria
 * `fn_reclassificar_convencao` usa `select distinct t.id` pelo mesmo motivo, e
 * contar linhas aqui faria o total divergir dos deltas da RPC.
 *
 * Pagina em lotes porque o cap padrão do PostgREST trunca em 1000 linhas
 * silenciosamente. O `order` precisa ser determinístico até o desempate, senão
 * a fronteira entre lotes repete ou pula registros.
 */
export function useRelatorioConvencao(convencaoId: string | undefined) {
  return useQuery({
    queryKey: ["convencoes", "relatorio", convencaoId],
    queryFn: async () => {
      let todas: LinhaRelatorioConvencao[] = [];
      let pagina = 0;
      for (;;) {
        const from = pagina * TAMANHO_PAGINA;
        const { data, error } = await supabase
          .from("v_relatorio_convencao")
          .select("*")
          .eq("convencao_id", convencaoId as string)
          .order("trabalhador")
          .order("trabalhador_id")
          .order("estabelecimento_id")
          .range(from, from + TAMANHO_PAGINA - 1);
        if (error) throw error;
        const linhas = (data ?? []) as LinhaRelatorioConvencao[];
        todas = todas.concat(linhas);
        if (linhas.length < TAMANHO_PAGINA) break;
        pagina += 1;
      }
      return todas;
    },
    enabled: !!convencaoId,
  });
}

export type ResultadoReclassificacao = { para_bronze: number; para_prata: number };

/**
 * Organização interna da CCT (fluxo de convenções 5.1–5.3): quem entregou carta
 * no ano-base vira Bronze, quem não entregou vira Prata, Ouro fica intocado.
 *
 * Os números devolvidos são DELTAS (quem de fato mudou), não totais — a função é
 * idempotente no banco (só altera a flag divergente), então uma segunda execução
 * retornando `0, 0` é sucesso, não erro. Quem chama não precisa se proteger de
 * duplo clique: a garantia é do Postgres.
 */
export function useReclassificarConvencao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (convencaoId: string): Promise<ResultadoReclassificacao> => {
      const { data, error } = await supabase.rpc("fn_reclassificar_convencao", {
        p_convencao_id: convencaoId,
      });
      if (error) throw error;
      return data?.[0] ?? { para_bronze: 0, para_prata: 0 };
    },
    onSuccess: () => {
      // Prefixo: cobre lista, ficha e relatório (reclassificada_em muda em todos).
      void queryClient.invalidateQueries({ queryKey: ["convencoes"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    },
  });
}
