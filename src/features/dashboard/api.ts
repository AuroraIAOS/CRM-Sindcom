import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * Camada única de acesso ao dashboard (specs/dashboard.md).
 *
 * Política de atualização (dashboard.md §1): TanStack Query sobre as views
 * `v_dash_*`, `staleTime` de 5 minutos + botão de refresh. Dashboard
 * estratégico não usa Realtime — só as filas operacionais usam (badge do
 * AppShell), e isso já existe desde a Subetapa 01.6.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ATENÇÃO — por que o Jurídico tem hooks próprios (`useKpisJuridico`)
 *
 * As views são `security_invoker = on`, então respeitam a RLS de quem
 * consulta. Isso NÃO faz a consulta falhar para quem não tem acesso: ela
 * **devolve zero**. Medido em 2026-07-21 com login real do jurídico:
 *
 *   v_dash_kpis  → 1 linha, com `guias_em_atraso: 0` e
 *                  `valor_boletos_inadimplentes: 0` — porque a RLS filtra
 *                  `faturas`/`repasses` (count real = 0 para ele), não
 *                  porque não haja inadimplência.
 *   MRR          → vem de `v_mensalidade_titular`/`v_base_calculo_trabalhador`,
 *                  que são cadastrais; o jurídico lê e vê o valor REAL.
 *
 * Ou seja: renderizar o K4 para o jurídico mostraria "0 guias em atraso"
 * como se fosse fato. É o modo de falha "200 + zero itens"
 * (orientacoes.md §3.2 e §7.2) aplicado à UI. Por isso o Jurídico recebe
 * uma tela própria que consulta `trabalhadores` diretamente e nunca toca
 * em view financeira.
 * ─────────────────────────────────────────────────────────────────────────
 */

const CINCO_MINUTOS = 5 * 60 * 1000;

type Nivel = Database["public"]["Enums"]["nivel_protecao"];

export type Kpis = Database["public"]["Views"]["v_dash_kpis"]["Row"];
export type LinhaEvolucao = Database["public"]["Views"]["v_dash_evolucao_niveis"]["Row"];
export type LinhaConversao = Database["public"]["Views"]["v_dash_conversoes_mensais"]["Row"];
export type LinhaReceita = Database["public"]["Views"]["v_dash_receita_mensal"]["Row"];
export type LinhaMapa = Database["public"]["Views"]["v_dash_mapa"]["Row"];
export type LinhaParceiro = Database["public"]["Views"]["v_dash_top_parceiros"]["Row"];
export type Dica = Database["public"]["Views"]["v_dash_dicas"]["Row"];

/** Severidades do motor de dicas, da mais grave para a menos (dashboard.md §2). */
export const ORDEM_SEVERIDADE = ["critica", "atencao", "oportunidade"] as const;

// ---------------------------------------------------------------------------
// KPIs (K1–K5)
// ---------------------------------------------------------------------------

export function useKpis(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: async (): Promise<Kpis> => {
      const { data, error } = await supabase.from("v_dash_kpis").select("*").single();
      if (error) throw error;
      return data;
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

export type KpisJuridico = {
  bronze: number;
  prata: number;
  ouro: number;
  total: number;
  atendimentos30d: number;
};

/**
 * K1 do Jurídico por consulta direta (dashboard.md §3, nota ¹) + o card
 * "Meus atendimentos (30d)". Nunca chama `v_dash_kpis` — ver o bloco de
 * atenção no topo do arquivo.
 */
export function useKpisJuridico(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "kpis-juridico"],
    queryFn: async (): Promise<KpisJuridico> => {
      const niveis: Nivel[] = ["bronze", "prata", "ouro"];
      const contagens = await Promise.all(
        niveis.map(async (nivel) => {
          const { count, error } = await supabase
            .from("trabalhadores")
            .select("id", { count: "exact", head: true })
            .eq("nivel", nivel)
            .eq("status_cadastro", "aprovado");
          if (error) throw error;
          return count ?? 0;
        }),
      );

      const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: atendimentos, error: erroAtend } = await supabase
        .from("atendimentos_juridicos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", trintaDiasAtras);
      if (erroAtend) throw erroAtend;

      const [bronze, prata, ouro] = contagens;
      return {
        bronze,
        prata,
        ouro,
        total: bronze + prata + ouro,
        atendimentos30d: atendimentos ?? 0,
      };
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

// ---------------------------------------------------------------------------
// Gráficos (G1–G5)
// ---------------------------------------------------------------------------

/** G1 — evolução por nível. Vem dos snapshots mensais (job dia 1, 04h). */
export function useEvolucaoNiveis(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "evolucao-niveis"],
    queryFn: async (): Promise<LinhaEvolucao[]> => {
      const { data, error } = await supabase
        .from("v_dash_evolucao_niveis")
        .select("*")
        .order("data_ref", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

/** Corta a série aos últimos N meses — as views devolvem todo o histórico. */
function ultimosMeses<T extends { mes: string | null }>(linhas: T[], n: number): T[] {
  return linhas
    .filter((l) => l.mes !== null)
    .sort((a, b) => (a.mes! < b.mes! ? -1 : 1))
    .slice(-n);
}

/** G2 — conversões e regressões mensais (12 meses). */
export function useConversoesMensais(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "conversoes-mensais"],
    queryFn: async (): Promise<LinhaConversao[]> => {
      const { data, error } = await supabase
        .from("v_dash_conversoes_mensais")
        .select("*")
        .order("mes", { ascending: true });
      if (error) throw error;
      return ultimosMeses(data ?? [], 12);
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

/** G3 — receita mensal por tipo (12 meses). */
export function useReceitaMensal(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "receita-mensal"],
    queryFn: async (): Promise<LinhaReceita[]> => {
      const { data, error } = await supabase
        .from("v_dash_receita_mensal")
        .select("*")
        .order("mes", { ascending: true });
      if (error) throw error;
      // 12 meses × até 5 tipos de fatura — corta por mês, não por linha.
      const meses = [...new Set((data ?? []).map((l) => l.mes).filter(Boolean))].sort().slice(-12);
      return (data ?? []).filter((l) => l.mes && meses.includes(l.mes));
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

/** G5 — parceiros na janela de 90 dias. */
export function useTopParceiros(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "top-parceiros"],
    queryFn: async (): Promise<LinhaParceiro[]> => {
      const { data, error } = await supabase
        .from("v_dash_top_parceiros")
        .select("*")
        .order("executadas_90d", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

// ---------------------------------------------------------------------------
// Mapa (M1) e dicas (D1)
// ---------------------------------------------------------------------------

export function useMapa(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "mapa"],
    queryFn: async (): Promise<LinhaMapa[]> => {
      const { data, error } = await supabase
        .from("v_dash_mapa")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

/** GeoJSON dos 29 municípios da base territorial (malha IBGE, join por
 *  `codigo_ibge`). Fica em `public/geo/` — servido pelo próprio domínio,
 *  sem CDN externa. */
export function useGeoJson(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "geojson"],
    queryFn: async () => {
      const resp = await fetch(`${import.meta.env.BASE_URL}geo/base-territorial.geojson`);
      if (!resp.ok) throw new Error(`Falha ao carregar a malha municipal (${resp.status})`);
      return (await resp.json()) as GeoJSON.FeatureCollection;
    },
    staleTime: Infinity, // malha territorial não muda entre sessões
    gcTime: Infinity,
    enabled: habilitado,
  });
}

export function useDicas(habilitado = true) {
  return useQuery({
    queryKey: ["dashboard", "dicas"],
    queryFn: async (): Promise<Dica[]> => {
      const { data, error } = await supabase.from("v_dash_dicas").select("*");
      if (error) throw error;
      const peso = (s: string | null) =>
        ORDEM_SEVERIDADE.indexOf((s ?? "") as (typeof ORDEM_SEVERIDADE)[number]);
      return (data ?? []).sort((a, b) => peso(a.severidade) - peso(b.severidade));
    },
    staleTime: CINCO_MINUTOS,
    enabled: habilitado,
  });
}

// ---------------------------------------------------------------------------
// Snapshot manual (Admin) — o cron roda dia 1 às 04h; o botão permite tirar a
// primeira fotografia sem esperar o mês virar (fn_guarda_job barra não-Admin).
// ---------------------------------------------------------------------------

export function useTirarSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("fn_snapshot_dashboard");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "evolucao-niveis"] });
    },
  });
}

/** Invalida tudo do dashboard (botão "Atualizar"). */
export function useAtualizarDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["dashboard"] });
}
