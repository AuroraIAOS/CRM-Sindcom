import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { apenasDigitos } from "@/lib/validators";
import type { Database } from "@/lib/database.types";
import type { SolicitacaoFormValues } from "./schemas";

/**
 * Camada única de acesso a `solicitacoes_servico` (frontend.md §5) — a demanda
 * ("carrinho" que vira guia), distinta de `beneficios` (catálogo/oferta).
 *
 * RLS (sql/03_rls.sql §11): Admin e Secretária fazem INSERT/UPDATE/DELETE
 * DIRETO — diferente de trabalhadores/empresas/parceiros/benefícios, aqui a
 * Secretária NÃO passa pela fila-admin. Parceiro só evolui status (guardado
 * por `fn_guarda_parceiro_solicitacao`) — isso é a Subetapa 02.3.
 */

type StatusSolicitacao = Database["public"]["Enums"]["status_solicitacao"];

function vazio(v: string | undefined | null): string | null {
  return v ? v : null;
}

/** Escapa o que quebraria a gramática do `.or()` do PostgREST (vírgula fecha
 *  condição; parênteses agrupam). O termo é texto livre digitado pela Denise. */
function termoSeguro(termo: string): string {
  return termo.replace(/[,()]/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Lista (/servicos)
// ---------------------------------------------------------------------------

export type SolicitacaoListItem = Database["public"]["Tables"]["solicitacoes_servico"]["Row"] & {
  trabalhador: { nome: string } | null;
  beneficiado: { nome: string } | null;
  parceiro: { nome: string } | null;
  beneficio: { nome: string } | null;
};

export type SolicitacoesFiltros = {
  /** Busca por número da guia OU nome do titular/beneficiado. */
  busca: string;
  status: StatusSolicitacao | "todos";
};

const COLUNAS_ORDENAVEIS = new Set(["numero_guia", "data_agendada", "status", "created_at"]);

/**
 * Busca por nome exige duas etapas: o PostgREST não filtra `ilike` em coluna de
 * tabela unida, então resolvemos os ids de trabalhadores/beneficiados que casam
 * com o termo e filtramos as solicitações por eles (+ número da guia) no `.or()`.
 */
async function idsPorNome(tabela: "trabalhadores" | "beneficiados", termo: string) {
  const { data, error } = await supabase
    .from(tabela)
    .select("id")
    .ilike("nome", `%${termo}%`)
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export function useSolicitacoes(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: SolicitacoesFiltros,
) {
  return useQuery({
    queryKey: ["servicos", "lista", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let query = supabase
        .from("solicitacoes_servico")
        .select(
          "*, trabalhador:trabalhadores(nome), beneficiado:beneficiados(nome), parceiro:parceiros(nome), beneficio:beneficios(nome)",
          { count: "exact" },
        );

      const termo = termoSeguro(filtros.busca ?? "");
      if (termo) {
        const [idsTrabalhador, idsBeneficiado] = await Promise.all([
          idsPorNome("trabalhadores", termo),
          idsPorNome("beneficiados", termo),
        ]);
        const condicoes = [`numero_guia.ilike.*${termo}*`];
        if (idsTrabalhador.length) condicoes.push(`trabalhador_id.in.(${idsTrabalhador.join(",")})`);
        if (idsBeneficiado.length) condicoes.push(`beneficiado_id.in.(${idsBeneficiado.join(",")})`);
        query = query.or(condicoes.join(","));
      }

      if (filtros.status !== "todos") query = query.eq("status", filtros.status);

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS.has(ordenacao.id) ? ordenacao.id : "created_at";
      query = query.order(coluna, { ascending: ordenacao ? !ordenacao.desc : false });

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as SolicitacaoListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Detalhe (/servicos/:id e /servicos/:id/guia)
// ---------------------------------------------------------------------------

export type SolicitacaoFicha = Database["public"]["Tables"]["solicitacoes_servico"]["Row"] & {
  trabalhador: { id: string; nome: string; cpf: string; nivel: Database["public"]["Enums"]["nivel_protecao"] | null } | null;
  beneficiado: { id: string; nome: string } | null;
  parceiro: {
    id: string;
    nome: string;
    segmento: string | null;
    contato_whatsapp: string | null;
  } | null;
  beneficio: { id: string; nome: string; descricao: string | null; condicoes: string | null } | null;
  recepcionista: { nome: string } | null;
};

export function useSolicitacao(id: string | undefined) {
  return useQuery({
    queryKey: ["servicos", "ficha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_servico")
        .select(
          "*, trabalhador:trabalhadores(id, nome, cpf, nivel), beneficiado:beneficiados(id, nome), parceiro:parceiros(id, nome, segmento, contato_whatsapp), beneficio:beneficios(id, nome, descricao, condicoes), recepcionista:recepcionistas!solicitacoes_servico_checkin_por_fkey(nome)",
        )
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as unknown as SolicitacaoFicha;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

type InsertSolicitacao = Database["public"]["Tables"]["solicitacoes_servico"]["Insert"];

/** Builder puro do payload de INSERT. Não carrega `valor_particular`/
 *  `valor_convenio`: o snapshot de preço é do trigger `fn_valida_solicitacao`. */
export function montarPayloadSolicitacao(valores: SolicitacaoFormValues, registradaPor: string | null) {
  return {
    trabalhador_id: valores.trabalhador_id,
    beneficiado_id: valores.beneficiado_id ?? null,
    parceiro_id: valores.parceiro_id,
    beneficio_id: valores.beneficio_id,
    data_agendada: valores.data_agendada,
    horario: vazio(valores.horario),
    observacoes: vazio(valores.observacoes),
    registrada_por: registradaPor,
  };
}

/** INSERT direto — Admin e Secretária por RLS (pol_solic_insert). O trigger
 *  rejeita nível insuficiente, beneficiado de outro titular e inadimplência. */
export function useCriarSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      valores,
      registradaPor,
    }: {
      valores: SolicitacaoFormValues;
      registradaPor: string | null;
    }) => {
      // `numero_guia` NÃO vai no payload, e o cast existe por causa disso.
      // Ele deixou de ser `DEFAULT` de coluna na ETAPA 07 (orientacoes.md
      // §2.17: `fn_gera_numero_guia` era chamável por RPC e cada chamada
      // queimava a numeração das guias) e passou a ser preenchido por um
      // trigger `BEFORE INSERT` SECURITY DEFINER. O gerador de tipos do
      // Supabase não enxerga trigger — só `column_default` —, então ele marca a
      // coluna como obrigatória no Insert. Quem manda `numero_guia` daqui é que
      // estaria errado: a numeração é do banco.
      const { data, error } = await supabase
        .from("solicitacoes_servico")
        .insert(montarPayloadSolicitacao(valores, registradaPor) as unknown as InsertSolicitacao)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
    },
  });
}

/** Cancelamento pela Secretária/Admin — só faz sentido antes do check-in. */
export function useCancelarSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("solicitacoes_servico")
        .update({ status: "cancelada" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
    },
  });
}

/** Tratamento das rejeitadas (frontend.md §2.2: "fila de rejeitadas para
 *  análise") — a Denise registra o desfecho sem alterar o status do parceiro. */
export function useAtualizarResolucaoAnalise(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resolucao: string) => {
      const { error } = await supabase
        .from("solicitacoes_servico")
        .update({ resolucao_analise: vazio(resolucao) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Apoio ao formulário
// ---------------------------------------------------------------------------

/**
 * Pré-validação de UX que espelha o trigger (frontend.md §6): mensalidade
 * inadimplente bloqueia o Convênio. O trigger continua sendo o gate real — isto
 * só evita que a Denise descubra o bloqueio depois de preencher tudo.
 */
export function useVerificarBloqueio(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["servicos", "bloqueio", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_titular_bloqueado", {
        p_trabalhador_id: trabalhadorId as string,
        p_tipo: "mensalidade_convenio",
      });
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!trabalhadorId,
  });
}

export type TrabalhadorOpcao = {
  id: string;
  nome: string;
  cpf: string;
  nivel: Database["public"]["Enums"]["nivel_protecao"] | null;
};

/**
 * Busca enxuta para o seletor de titular. A base tem ~24.500 trabalhadores —
 * carregar tudo num select não é opção, então busca sob demanda com teto.
 * Mesma heurística de `trabalhadores/api.ts`: 3+ dígitos = CPF, senão nome.
 */
export function useBuscarTrabalhadores(termo: string) {
  const busca = termo.trim();
  return useQuery({
    queryKey: ["servicos", "busca-trabalhadores", busca],
    queryFn: async () => {
      const digitos = apenasDigitos(busca);
      let query = supabase.from("trabalhadores").select("id, nome, cpf, nivel");
      query =
        digitos.length >= 3
          ? query.ilike("cpf", `${digitos}%`)
          : query.ilike("nome", `%${busca}%`);
      const { data, error } = await query.order("nome").limit(15);
      if (error) throw error;
      return (data ?? []) as TrabalhadorOpcao[];
    },
    enabled: busca.length >= 3,
  });
}

// ---------------------------------------------------------------------------
// Ficha do trabalhador (acordeão "Solicitações")
// ---------------------------------------------------------------------------

export type SolicitacaoDoTrabalhador = {
  id: string;
  numero_guia: string;
  data_agendada: string;
  status: StatusSolicitacao;
  valor_convenio: number | null;
  beneficiado: { nome: string } | null;
  parceiro: { nome: string } | null;
  beneficio: { nome: string } | null;
};

/** Mora aqui (e não em trabalhadores/api.ts) pelo mesmo critério de
 *  `useHistoricoSolicitacoesBeneficio`: a tabela é o domínio de servicos. */
export function useSolicitacoesTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["servicos", "do-trabalhador", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_servico")
        .select(
          "id, numero_guia, data_agendada, status, valor_convenio, beneficiado:beneficiados(nome), parceiro:parceiros(nome), beneficio:beneficios(nome)",
        )
        .eq("trabalhador_id", trabalhadorId as string)
        .order("data_agendada", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SolicitacaoDoTrabalhador[];
    },
    enabled: !!trabalhadorId,
  });
}
