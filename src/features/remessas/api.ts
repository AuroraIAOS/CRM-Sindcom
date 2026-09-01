import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { lerPlanilhaXlsx } from "@/features/coleta/lerPlanilha";
import type { ParseResultado } from "@/features/importacao/parsers";

/**
 * Camada de acesso do domínio "remessas" (ETAPA 08 · Subetapa 08.10).
 *
 * Este é o ÚNICO ponto do sistema em que dado vindo de fora vira cadastro — e
 * ele é HUMANO por construção. Nada aqui importa nada sozinho: quem grava é a
 * `useImportarTrabalhadores` de `features/importacao/api.ts`, chamada pela tela
 * depois de um clique explícito na revisão.
 */

/** Minutos de vida da URL assinada. Curto de propósito: o objeto é planilha
 *  com CPF, e um link que não expira vira link que circula. */
const MINUTOS_URL_ASSINADA = 5;

export type StatusRemessa = "recebida" | "validada" | "importada" | "rejeitada";

export const ROTULO_STATUS: Record<StatusRemessa, string> = {
  recebida: "Recebida",
  validada: "Validada pelo contador",
  importada: "Importada",
  rejeitada: "Rejeitada",
};

export type Remessa = {
  id: string;
  status: StatusRemessa;
  arquivo_path: string;
  linhas_recebidas: number | null;
  linhas_com_erro: number | null;
  ip_origem: string | null;
  recebida_em: string;
  processada_em: string | null;
  processada_por: string | null;
  remetente: string;
  campanha: string;
};

type LinhaCrua = {
  id: string;
  status: StatusRemessa;
  arquivo_path: string;
  linhas_recebidas: number | null;
  linhas_com_erro: number | null;
  ip_origem: string | null;
  recebida_em: string;
  processada_em: string | null;
  processada_por: string | null;
  envios_campanha: {
    email: string;
    contabilidades: { nome: string } | null;
    campanhas: { nome: string } | null;
  } | null;
};

export function useRemessas() {
  return useQuery<Remessa[]>({
    queryKey: ["remessas", "lista"],
    queryFn: async () => {
      // O `token` NÃO entra no select. Ele é credencial de envio e não tem
      // função nenhuma nesta tela — o mínimo necessário é a regra, mesmo
      // quando a RLS permitiria trazer a linha inteira.
      const { data, error } = await supabase
        .from("remessas_dados")
        .select(
          "id, status, arquivo_path, linhas_recebidas, linhas_com_erro, ip_origem, recebida_em, processada_em, processada_por, envios_campanha(email, contabilidades(nome), campanhas(nome))",
        )
        .order("recebida_em", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as LinhaCrua[]).map((r) => ({
        id: r.id,
        status: r.status,
        arquivo_path: r.arquivo_path,
        linhas_recebidas: r.linhas_recebidas,
        linhas_com_erro: r.linhas_com_erro,
        ip_origem: r.ip_origem,
        recebida_em: r.recebida_em,
        processada_em: r.processada_em,
        processada_por: r.processada_por,
        remetente: r.envios_campanha?.contabilidades?.nome ?? r.envios_campanha?.email ?? "—",
        campanha: r.envios_campanha?.campanhas?.nome ?? "—",
      }));
    },
  });
}

/**
 * Baixa a planilha da remessa por URL ASSINADA e devolve o `ParseResultado`.
 *
 * A URL assinada é o ponto: o bucket é privado, e a única forma de a tela ler o
 * arquivo é pedir um link temporário — que expira em minutos. Nunca existe URL
 * pública para uma planilha com CPF.
 */
export function useArquivoDaRemessa(caminho: string | null) {
  return useQuery<ParseResultado>({
    queryKey: ["remessas", "arquivo", caminho],
    enabled: !!caminho,
    retry: false,
    // Não guarda em cache entre aberturas: o link expira, e reusar um resultado
    // velho esconderia uma falha de permissão real.
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("remessas")
        .createSignedUrl(caminho!, MINUTOS_URL_ASSINADA * 60);
      if (error) throw error;

      const resposta = await fetch(data.signedUrl);
      if (!resposta.ok) throw new Error(`Não foi possível baixar o arquivo (HTTP ${resposta.status}).`);
      const blob = await resposta.blob();
      const arquivo = new File([blob], caminho!.split("/").pop() ?? "remessa.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      return lerPlanilhaXlsx(arquivo);
    },
  });
}

/**
 * Marca a remessa como processada. Chamada DEPOIS da gravação em
 * `trabalhadores`, nunca antes — se a ordem se invertesse e a gravação
 * falhasse, ficaria uma remessa dizendo "importada" sem ninguém cadastrado.
 */
export function useMarcarRemessa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "importada" | "rejeitada" }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("remessas_dados")
        .update({ status, processada_em: new Date().toISOString(), processada_por: user?.id ?? null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      // `.select()` + checagem de linha não é zelo: UPDATE barrado por RLS
      // devolve `error: null` com ZERO linhas, e a tela diria "salvo com
      // sucesso" para uma operação que não mudou nada (orientacoes.md §2.6d).
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para concluir esta remessa.");
      }
      return data[0].id as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["remessas"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}
