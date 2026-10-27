import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { LinhaEmail } from "./csvEmails";
import type { EstadoBoleto, TipoBoleto } from "./rotulos";

/**
 * Camada de acesso do domínio "boletos" (ETAPA 10). Toda query do módulo vive aqui.
 * A segurança é do banco (RLS + GRANT de coluna + triggers): a UI só esconde botão.
 * TAF/PAMED: o banco calcula o valor; CA/CN: o operador digita (`useEditarBoleto`).
 */

type Views = Database["public"]["Views"];
type Tables = Database["public"]["Tables"];

export type Ciclo = Tables["ciclos_boleto"]["Row"];
export type FunilCiclo = Views["v_ciclos_funil"]["Row"];
export type BoletoStatus = Views["v_boletos_status"]["Row"];
export type CaixaCiclo = Views["v_boletos_caixas"]["Row"];
export type LinkCaixa = Views["v_boletos_links"]["Row"];
export type ConvencaoSemValorBase = Views["v_ciclos_sem_valor_base"]["Row"];

export type RelatorioSemeadura = {
  alvo: number;
  criados: number;
  ja_existiam: number;
  sem_email: number;
  email_invalido: number;
  vinculados_a_caixa: number;
};

const CHAVE = "boletos";
const LOTE_IDS = 100;
const PAGINA_EXPORTACAO = 1000;

function vazio(v: string | null | undefined): string | null {
  return v && v.trim() ? v.trim() : null;
}

function usarInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [CHAVE] });
}

/** PostgREST trunca em 1000 linhas: pagina até acabar. */
async function buscarTodas<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA_EXPORTACAO) {
    const { data, error } = await montar(de, de + PAGINA_EXPORTACAO - 1);
    if (error) throw error;
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA_EXPORTACAO) break;
  }
  return todas;
}

// ---------------------------------------------------------------------------
// Ciclos
// ---------------------------------------------------------------------------

export function useCiclos() {
  return useQuery({
    queryKey: [CHAVE, "ciclos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ciclos_boleto")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type NovoCiclo = {
  nome: string;
  tipo: TipoBoleto;
  referencia?: string;
  prazo_resposta?: string;
  data_vencimento: string;
  cnaes: string[];
  observacoes?: string;
  convencaoIds: string[];
};

export function useCriarCiclo() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (v: NovoCiclo) => {
      const { data: ciclo, error } = await supabase
        .from("ciclos_boleto")
        .insert({
          nome: v.nome.trim(),
          tipo: v.tipo,
          referencia: vazio(v.referencia),
          prazo_resposta: vazio(v.prazo_resposta),
          data_vencimento: v.data_vencimento,
          cnaes: v.cnaes,
          observacoes: vazio(v.observacoes),
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: errConv } = await supabase
        .from("ciclo_convencoes")
        .insert(v.convencaoIds.map((convencao_id) => ({ ciclo_id: ciclo.id, convencao_id })));
      if (errConv) throw errConv;

      const { data, error: errSemear } = await supabase.rpc("fn_semear_ciclo_boleto", { p_ciclo: ciclo.id });
      if (errSemear) throw errSemear;
      return { cicloId: ciclo.id, relatorio: data as unknown as RelatorioSemeadura };
    },
    onSettled: invalidar,
  });
}

export function useSemearCiclo() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (cicloId: string) => {
      const { data, error } = await supabase.rpc("fn_semear_ciclo_boleto", { p_ciclo: cicloId });
      if (error) throw error;
      return data as unknown as RelatorioSemeadura;
    },
    onSuccess: invalidar,
  });
}

export function useEncerrarCiclo() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (cicloId: string) => {
      const { error } = await supabase
        .from("ciclos_boleto")
        .update({ encerrado_em: new Date().toISOString() })
        .eq("id", cicloId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useRecalcularValores() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (cicloId: string) => {
      const { data, error } = await supabase.rpc("fn_recalcular_valores_ciclo_boleto", { p_ciclo: cicloId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: invalidar,
  });
}

export function useFunilCiclos() {
  return useQuery({
    queryKey: [CHAVE, "funil"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ciclos_funil")
        .select("*")
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useConvencoesSemValorBase(cicloId: string | undefined) {
  return useQuery({
    queryKey: [CHAVE, "sem-valor-base", cicloId ?? "todos"],
    queryFn: async () => {
      let q = supabase.from("v_ciclos_sem_valor_base").select("*").is("encerrado_em", null);
      if (cicloId) q = q.eq("ciclo_id", cicloId);
      const { data, error } = await q.order("convencao_nome");
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Boletos (status)
// ---------------------------------------------------------------------------

export type FiltrosBoletos = {
  cicloId?: string;
  convencaoId?: string;
  /** estado do boleto ou "atrasado" (tag derivada). */
  tag?: string;
  busca?: string;
  situacaoContato?: string;
  semValor?: boolean;
};

export type Paginacao = { pageIndex: number; pageSize: number };

function aplicarFiltros<Q extends { eq: Function; ilike: Function; or: Function; in: Function }>(q: Q, f: FiltrosBoletos): Q {
  let r = q;
  if (f.cicloId) r = r.eq("ciclo_id", f.cicloId);
  if (f.convencaoId) r = r.eq("convencao_id", f.convencaoId);
  if (f.tag) r = r.eq("tag", f.tag);
  if (f.situacaoContato) r = r.eq("situacao_contato", f.situacaoContato);
  if (f.semValor) r = r.or("sem_valor.eq.true,sem_valor_base.eq.true");
  const busca = f.busca?.trim().replace(/[%,()]/g, " ");
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    r = r.or(
      digitos.length >= 4
        ? `razao_social.ilike.%${busca}%,cnpj_completo.ilike.%${digitos}%`
        : `razao_social.ilike.%${busca}%,nome_fantasia.ilike.%${busca}%`,
    );
  }
  return r;
}

export function useBoletosStatus(filtros: FiltrosBoletos, pagina: Paginacao) {
  return useQuery({
    queryKey: [CHAVE, "status", filtros, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const de = pagina.pageIndex * pagina.pageSize;
      const q = aplicarFiltros(
        supabase.from("v_boletos_status").select("*", { count: "exact" }),
        filtros,
      );
      const { data, error, count } = await q
        .order("razao_social")
        .order("boleto_id")
        .range(de, de + pagina.pageSize - 1);
      if (error) throw error;
      return { linhas: data as BoletoStatus[], total: count ?? 0 };
    },
  });
}

export function useExportarStatus() {
  return useMutation({
    mutationFn: async (filtros: FiltrosBoletos) =>
      buscarTodas<BoletoStatus>((de, ate) =>
        aplicarFiltros(supabase.from("v_boletos_status").select("*"), filtros)
          .order("razao_social")
          .order("boleto_id")
          .range(de, ate),
      ),
  });
}

/** Boletos sem e-mail utilizável: contato manual (telefone/WhatsApp). */
export function useBoletosSemEmail(cicloId: string | undefined) {
  return useQuery({
    queryKey: [CHAVE, "sem-email", cicloId],
    enabled: !!cicloId,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("v_boletos_status")
        .select("boleto_id, cnpj_completo, razao_social, convencao_nome, situacao_contato, caixa_email", {
          count: "exact",
        })
        .eq("ciclo_id", cicloId as string)
        .in("situacao_contato", ["sem_email", "email_invalido"])
        .neq("estado", "cancelado")
        .order("razao_social")
        .limit(200);
      if (error) throw error;
      return { linhas: data, total: count ?? 0 };
    },
  });
}

export type MudancaEstado = {
  ids: string[];
  para: EstadoBoleto;
  motivo?: string;
};

/** UPDATE em lotes de 100 ids. Um lote que falha para a operação e relata quantos passaram. */
export function useAvancarBoletos() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async ({ ids, para, motivo }: MudancaEstado) => {
      let feitos = 0;
      for (let i = 0; i < ids.length; i += LOTE_IDS) {
        const lote = ids.slice(i, i + LOTE_IDS);
        const { error } = await supabase
          .from("boletos")
          .update({ estado: para, ...(para === "cancelado" ? { motivo_cancelamento: motivo ?? null } : {}) })
          .in("id", lote);
        if (error) {
          throw Object.assign(new Error(error.message), {
            code: (error as { code?: string }).code,
            feitos,
          });
        }
        feitos += lote.length;
      }
      return feitos;
    },
    onSettled: invalidar,
  });
}

export type EdicaoBoleto = {
  id: string;
  /** CA/CN: valor digitado. Em TAF/PAMED o banco reverte. */
  valor?: number | null;
  numero_boleto?: string | null;
  vencimento?: string | null;
};

export function useEditarBoleto() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async ({ id, ...campos }: EdicaoBoleto) => {
      const { error } = await supabase.from("boletos").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export type RespostaManual = {
  boleto_id: string;
  quantidade: number;
  cnpj_confirmado: boolean;
  cnpj_incorreto_obs?: string;
};

export function useRegistrarRespostaManual() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (v: RespostaManual) => {
      const { error } = await supabase.from("respostas_boleto").insert({
        boleto_id: v.boleto_id,
        quantidade: v.quantidade,
        cnpj_confirmado: v.cnpj_confirmado,
        cnpj_incorreto_obs: v.cnpj_confirmado ? null : vazio(v.cnpj_incorreto_obs),
        origem: "manual",
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// ---------------------------------------------------------------------------
// Caixas de e-mail e links
// ---------------------------------------------------------------------------

export function useCaixasCiclo(cicloId: string | undefined, apenasCompletas = false) {
  return useQuery({
    queryKey: [CHAVE, "caixas", cicloId, apenasCompletas],
    enabled: !!cicloId,
    queryFn: async () => {
      let q = supabase.from("v_boletos_caixas").select("*").eq("ciclo_id", cicloId as string);
      if (apenasCompletas) q = q.eq("completo", true);
      const { data, error } = await q.order("email").limit(1000);
      if (error) throw error;
      return data;
    },
  });
}

/** Caixas com link trocado e Brevo ainda não atualizada (alerta fixo). */
export function useCaixasBrevoPendente() {
  return useQuery({
    queryKey: [CHAVE, "brevo-pendente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_boletos_caixas")
        .select("caixa_id, email")
        .eq("brevo_pendente", true);
      if (error) throw error;
      const unicas = new Map<string, string>();
      for (const c of data) if (c.caixa_id) unicas.set(c.caixa_id, c.email ?? "");
      return [...unicas].map(([caixa_id, email]) => ({ caixa_id, email }));
    },
  });
}

/** Só Admin e Secretaria recebem linhas (a base é `tokens_boleto`). */
export function useLinksBoleto(habilitado = true) {
  return useQuery({
    queryKey: [CHAVE, "links"],
    enabled: habilitado,
    queryFn: async () =>
      buscarTodas<LinkCaixa>((de, ate) =>
        supabase.from("v_boletos_links").select("*").order("email").range(de, ate),
      ),
  });
}

export function useReemitirToken() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (caixaId: string) => {
      const { error } = await supabase.rpc("fn_reemitir_token_boleto", { p_caixa: caixaId });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useRenovarToken() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (caixaId: string) => {
      const { error } = await supabase.rpc("fn_renovar_token_boleto", { p_caixa: caixaId });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useMarcarBrevoAtualizada() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (caixaId: string) => {
      const { error } = await supabase
        .from("caixas_boleto")
        .update({ brevo_atualizada_em: new Date().toISOString() })
        .eq("id", caixaId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// ---------------------------------------------------------------------------
// Envio (lista de e-mails para a Brevo)
// ---------------------------------------------------------------------------

export type ModoEnvio = "aviso" | "cobranca";

export function urlDoLink(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  return `${window.location.origin}${base}responder/${token}`;
}

export type ExportacaoEmails = { linhas: LinhaEmail[]; caixaIds: string[] };

/**
 * Aviso: caixas ainda não avisadas NESTE ciclo. Cobrança: caixas com CNPJ ainda em
 * `aguardando_dados`. Filtro opcional por convenção. Pagina até acabar.
 */
export function useExportarEmails() {
  return useMutation({
    mutationFn: async (v: { cicloId: string; modo: ModoEnvio; convencaoId?: string }): Promise<ExportacaoEmails> => {
      const todas = await buscarTodas((de, ate) => {
        let q = supabase.from("v_boletos_envio").select("*").eq("ciclo_id", v.cicloId);
        q = v.modo === "aviso" ? q.is("aviso_enviado_em", null) : q.gt("pendentes", 0);
        if (v.convencaoId) q = q.contains("convencao_ids", [v.convencaoId]);
        return q.order("email").range(de, ate);
      });
      const aptas = todas.filter((c) => c.caixa_id && c.email && c.token);
      return {
        caixaIds: aptas.map((c) => c.caixa_id as string),
        linhas: aptas.map((c) => ({
          nome: c.nome_contato ?? "",
          email: c.email as string,
          link: urlDoLink(c.token as string),
          convencoes: c.convencoes ?? "",
          nCnpj: (v.modo === "aviso" ? c.total_cnpj : c.pendentes) ?? 0,
        })),
      };
    },
  });
}

export function useMarcarEnviadas() {
  const invalidar = usarInvalidar();
  return useMutation({
    mutationFn: async (v: { cicloId: string; caixaIds: string[]; modo: ModoEnvio }) => {
      const agora = new Date().toISOString();
      for (let i = 0; i < v.caixaIds.length; i += LOTE_IDS) {
        const { error } = await supabase
          .from("ciclo_caixas")
          .update(v.modo === "aviso" ? { aviso_enviado_em: agora } : { cobranca_enviada_em: agora })
          .eq("ciclo_id", v.cicloId)
          .in("caixa_id", v.caixaIds.slice(i, i + LOTE_IDS));
        if (error) throw error;
      }
      return v.caixaIds.length;
    },
    onSuccess: invalidar,
  });
}
