import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { AtendimentoFormValues, EdicaoAtendimentoFormValues } from "./schemas";

/**
 * Camada única de acesso a `atendimentos_juridicos` (frontend.md §5).
 *
 * Matriz de permissão (sql/03_rls.sql §13) — a UI só reflete, o banco decide:
 *   SELECT  admin · presidente · secretaria · juridico
 *   INSERT  admin · juridico              ← a Secretaria NÃO registra
 *   UPDATE  admin · juridico
 *   DELETE  admin
 *
 * Atenção ao ponto contraintuitivo: nas demais telas a Secretaria é quem opera
 * o cadastro; aqui ela é leitora. Não "corrigir" isso no frontend — é a regra
 * do sindicato (atendimento jurídico é ato do jurídico).
 */

export type TipoAtendimento = Database["public"]["Enums"]["tipo_atend_juridico"];
export type StatusAtendimento = "aberto" | "em_andamento" | "concluido" | "arquivado";

/** Vocabulário fechado por `chk_status_atendimento` (sql/16_juridico.sql).
 *  Valor sem acento no banco, rótulo com acento na tela. */
export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export const ROTULO_TIPO: Record<TipoAtendimento, string> = {
  orientacao: "Orientação",
  homologacao: "Homologação",
  processo: "Processo",
  outro: "Outro",
};

/** Tipos que o trigger `fn_valida_atendimento_juridico` submete ao gate de
 *  nível/inadimplência. 'orientacao' é exceção deliberada — orientação geral
 *  é para todos os níveis (FAQ 07). */
export function exigeNivelPrata(tipo: TipoAtendimento): boolean {
  return tipo !== "orientacao";
}

/** `nivel` é coluna GERADA no banco e vem tipada como nullable pelos tipos
 *  gerados — na prática o `case` sempre resolve, mas o front não inventa valor:
 *  guarda com `&&` na renderização, como já faz `DetalheTrabalhador.tsx`. */
export type Nivel = Database["public"]["Enums"]["nivel_protecao"] | null;

export type AtendimentoListItem = Database["public"]["Tables"]["atendimentos_juridicos"]["Row"] & {
  trabalhador: {
    id: string;
    nome: string;
    cpf: string;
    nivel: Nivel;
  } | null;
  responsavel_perfil: { nome: string } | null;
};

export type AtendimentosFiltros = {
  /** Busca por nome OU CPF do trabalhador. */
  busca: string;
  tipo: TipoAtendimento | "todos";
  status: StatusAtendimento | "todos";
  /** Recorte por data do atendimento (ISO, inclusivo). Vazio = sem limite. */
  de: string;
  ate: string;
};

export const FILTROS_VAZIOS: AtendimentosFiltros = {
  busca: "",
  tipo: "todos",
  status: "todos",
  de: "",
  ate: "",
};

const COLUNAS_ORDENAVEIS = new Set(["data", "tipo", "status", "created_at"]);

const SELECT_LISTA =
  "*, trabalhador:trabalhadores(id, nome, cpf, nivel), responsavel_perfil:perfis!atendimentos_juridicos_responsavel_fkey(nome)";

/**
 * Filtro de busca para o PostgREST. O nome/CPF vivem na tabela EMBUTIDA
 * `trabalhadores`, então o filtro vai com `referencedTable` — e o embed vira
 * `!inner` na query, senão o PostgREST filtraria o embed sem descartar a linha
 * pai (devolveria atendimentos com `trabalhador: null` em vez de omiti-los).
 *
 * Quando o termo tem 3+ dígitos, busca por CPF (o usuário digitou documento,
 * com ou sem pontuação); senão, por nome.
 */
function filtroBusca(termo: string): string {
  const somenteDigitos = termo.replace(/\D/g, "");
  return somenteDigitos.length >= 3
    ? `cpf.ilike.%${somenteDigitos}%`
    : `nome.ilike.%${termo}%`;
}

export function useAtendimentos(
  pagination: PaginationState,
  sorting: SortingState,
  filtros: AtendimentosFiltros,
) {
  return useQuery({
    queryKey: ["juridico", "lista", pagination, sorting, filtros],
    queryFn: async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      const termo = filtros.busca.trim();
      const select = termo
        ? SELECT_LISTA.replace("trabalhador:trabalhadores(", "trabalhador:trabalhadores!inner(")
        : SELECT_LISTA;

      let query = supabase
        .from("atendimentos_juridicos")
        .select(select, { count: "exact" });

      if (termo) query = query.or(filtroBusca(termo), { referencedTable: "trabalhadores" });
      if (filtros.tipo !== "todos") query = query.eq("tipo", filtros.tipo);
      if (filtros.status !== "todos") query = query.eq("status", filtros.status);
      if (filtros.de) query = query.gte("data", filtros.de);
      if (filtros.ate) query = query.lte("data", filtros.ate);

      const ordenacao = sorting[0];
      const coluna = ordenacao && COLUNAS_ORDENAVEIS.has(ordenacao.id) ? ordenacao.id : "data";
      // Desempate estável: sem ele, a fronteira entre páginas pode repetir ou
      // pular linhas com a mesma data (orientacoes.md §2.4).
      query = query.order(coluna, { ascending: ordenacao ? !ordenacao.desc : false }).order("id");

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as AtendimentoListItem[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

/** Atendimentos de um trabalhador (acordeão da ficha). */
export function useAtendimentosTrabalhador(trabalhadorId: string | undefined) {
  return useQuery({
    queryKey: ["juridico", "do-trabalhador", trabalhadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos_juridicos")
        .select("*, responsavel_perfil:perfis!atendimentos_juridicos_responsavel_fkey(nome)")
        .eq("trabalhador_id", trabalhadorId as string)
        .order("data", { ascending: false })
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as AtendimentoListItem[];
    },
    enabled: !!trabalhadorId,
  });
}

/**
 * INSERT direto — admin/juridico por RLS (pol_atend_insert). O `responsavel`
 * recebe o próprio usuário logado: quem registra é quem atendeu.
 *
 * O trigger `fn_valida_atendimento_juridico` pode recusar (P0001) com a
 * mensagem de negócio já em pt-BR; ela sobe intacta pelo `mensagemErro`.
 */
export function useCriarAtendimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: AtendimentoFormValues) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase.from("atendimentos_juridicos").insert({
        trabalhador_id: valores.trabalhador_id,
        data: valores.data,
        tipo: valores.tipo,
        resumo: valores.resumo?.trim() || null,
        status: valores.status,
        responsavel: sessao.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["juridico"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis-juridico"] });
    },
  });
}

/**
 * UPDATE — admin/juridico por RLS (pol_atend_update).
 *
 * `.select()` encadeado NÃO é enfeite: a policy de UPDATE filtra por `USING`,
 * e quem não passa recebe `error: null` + zero linhas, HTTP 200 — "atualizar
 * zero linhas que não existem" não é violação (orientacoes.md §2.6d). Sem esta
 * checagem, a tela diria "salvo" para uma operação que não mudou nada.
 */
export function useAtualizarAtendimento(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (valores: EdicaoAtendimentoFormValues) => {
      const { data, error } = await supabase
        .from("atendimentos_juridicos")
        .update({
          data: valores.data,
          tipo: valores.tipo,
          resumo: valores.resumo?.trim() || null,
          status: valores.status,
        })
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para alterar este atendimento.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["juridico"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis-juridico"] });
    },
  });
}

/** DELETE — admin-only por RLS (pol_atend_delete). Mesma armadilha do UPDATE:
 *  sem `.select()`, um DELETE barrado volta como sucesso silencioso. */
export function useExcluirAtendimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("atendimentos_juridicos")
        .delete()
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para excluir este atendimento.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["juridico"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis-juridico"] });
    },
  });
}

/** Busca de trabalhador para o seletor do formulário (nome ou CPF). */
export type TrabalhadorOpcao = {
  id: string;
  nome: string;
  cpf: string;
  nivel: Nivel;
};

export function useBuscaTrabalhadores(termo: string) {
  const busca = termo.trim();
  return useQuery({
    queryKey: ["juridico", "busca-trabalhadores", busca],
    queryFn: async () => {
      const somenteDigitos = busca.replace(/\D/g, "");
      let query = supabase
        .from("trabalhadores")
        .select("id, nome, cpf, nivel")
        .eq("status_cadastro", "aprovado");

      query =
        somenteDigitos.length >= 3
          ? query.ilike("cpf", `%${somenteDigitos}%`)
          : query.ilike("nome", `%${busca}%`);

      const { data, error } = await query.order("nome").limit(20);
      if (error) throw error;
      return (data ?? []) as TrabalhadorOpcao[];
    },
    enabled: busca.length >= 2,
  });
}
