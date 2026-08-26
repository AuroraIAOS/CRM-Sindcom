import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Camada de acesso do domínio "cobertura por contabilidade" (ETAPA 08 ·
 * Subetapa 08.11).
 *
 * Cobertura é QUERY, nunca campo materializado — um `respondido_em` booleano
 * esconderia as empresas que faltam, e é justamente esse número que dirige o
 * follow-up (D4). `v_cobertura_contabilidades` (sql/22_cobertura_08_11.sql)
 * faz a agregação no banco: 950 contabilidades cabem numa única página do
 * PostgREST (orientacoes.md §2.4), então nada aqui precisa paginar.
 *
 * O TOKEN NUNCA É LIDO NESTA FEATURE. `envios_campanha.token` é lido em claro
 * por Presidente e Secretaria via RLS hoje (RLS restringe LINHAS, nunca
 * COLUNAS — sql/20_comunicacao_externa.sql linhas 384-403); fechar essa
 * brecha é decisão de segurança que aguarda revisão de Maxwell
 * (sql/22_cobertura_08_11.sql, Parte 2 — não aplicada). `useRevogarToken`
 * abaixo só ESCREVE (marca revogado, insere um novo — que recebe token por
 * DEFAULT do banco): em nenhum passo o valor do token entra numa resposta
 * que este código leia.
 */

export type LinhaCobertura = {
  contabilidadeId: string;
  nome: string;
  email: string;
  totalEstabelecimentos: number;
  estabelecimentosCobertos: number;
};

export function useCoberturaContabilidades() {
  return useQuery<LinhaCobertura[]>({
    queryKey: ["cobertura", "contabilidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cobertura_contabilidades")
        .select("contabilidade_id, nome, email, total_estabelecimentos, estabelecimentos_cobertos");
      if (error) throw error;
      const linhas = (data ?? []).map((r) => ({
        contabilidadeId: r.contabilidade_id as string,
        nome: r.nome as string,
        email: r.email as string,
        totalEstabelecimentos: r.total_estabelecimentos as number,
        estabelecimentosCobertos: r.estabelecimentos_cobertos as number,
      }));
      // Pior cobertura primeiro — é quem precisa de follow-up com mais urgência.
      return linhas.sort((a, b) => {
        const percA = a.totalEstabelecimentos > 0 ? a.estabelecimentosCobertos / a.totalEstabelecimentos : 0;
        const percB = b.totalEstabelecimentos > 0 ? b.estabelecimentosCobertos / b.totalEstabelecimentos : 0;
        return percA - percB || a.nome.localeCompare(b.nome);
      });
    },
  });
}

export type EstabelecimentoPendente = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
};

/** Lista NOMINAL dos estabelecimentos de uma contabilidade que ainda não têm
 *  trabalhador vinculado — o que a Denise precisa para cobrar especificamente. */
export function usePendentesDaContabilidade(contabilidadeId: string | null) {
  return useQuery<EstabelecimentoPendente[]>({
    queryKey: ["cobertura", "pendentes", contabilidadeId],
    enabled: !!contabilidadeId,
    queryFn: async () => {
      const { data: vinculos, error: erroVinculos } = await supabase
        .from("contabilidade_estabelecimentos")
        .select("estabelecimento_id")
        .eq("contabilidade_id", contabilidadeId as string);
      if (erroVinculos) throw erroVinculos;
      const ids = (vinculos ?? []).map((v) => v.estabelecimento_id as string);
      if (ids.length === 0) return [];

      const [{ data: estabs, error: erroEstabs }, { data: cobertos, error: erroCobertos }] = await Promise.all([
        supabase
          .from("estabelecimentos")
          .select("id, cnpj_completo, nome_fantasia, empresas(razao_social)")
          .in("id", ids),
        supabase.from("vinculos_empregaticios").select("estabelecimento_id").in("estabelecimento_id", ids),
      ]);
      if (erroEstabs) throw erroEstabs;
      if (erroCobertos) throw erroCobertos;

      const idsCobertos = new Set((cobertos ?? []).map((v) => v.estabelecimento_id as string));
      return (estabs ?? [])
        .filter((e) => !idsCobertos.has(e.id as string))
        .map((e) => ({
          cnpj: e.cnpj_completo as string,
          razaoSocial: (e.empresas as { razao_social?: string } | null)?.razao_social ?? "",
          nomeFantasia: (e.nome_fantasia as string) ?? null,
        }))
        .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial));
    },
  });
}

/**
 * Revoga o link ativo de uma contabilidade e emite um novo, SEM apagar
 * histórico (spec 08.11): a linha antiga fica com `token_revogado_em`
 * preenchido — é o que faz a página pública recusá-la — e uma linha NOVA
 * nasce para a mesma contabilidade/campanha, com token novo por DEFAULT do
 * banco. Dois passos sequenciais, não uma transação (o projeto não expõe RPC
 * para isto): se o 2º passo falhar depois do 1º ter sucedido, a contabilidade
 * fica sem link ativo até alguém repetir a ação — janela pequena, aceitável
 * para uma ação manual e rara de Admin, e sinalizada aqui em vez de escondida.
 */
export function useRevogarToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contabilidadeId: string) => {
      const { data: ativo, error: erroBusca } = await supabase
        .from("envios_campanha")
        .select("id, campanha_id, contabilidade_id, estabelecimento_id, email")
        .eq("contabilidade_id", contabilidadeId)
        .is("token_revogado_em", null)
        .maybeSingle();
      if (erroBusca) throw erroBusca;
      if (!ativo) throw new Error("Nenhum link ativo encontrado para esta contabilidade.");

      const { data: revogado, error: erroRevoga } = await supabase
        .from("envios_campanha")
        .update({ token_revogado_em: new Date().toISOString() })
        .eq("id", ativo.id as string)
        .select("id");
      if (erroRevoga) throw erroRevoga;
      // UPDATE barrado por RLS não dá erro — só afeta zero linhas (orientacoes.md §2.6d).
      if (!revogado || revogado.length === 0) {
        throw new Error("Sem permissão para revogar este link (restrito ao Admin).");
      }

      const { error: erroNovo } = await supabase.from("envios_campanha").insert({
        campanha_id: ativo.campanha_id,
        contabilidade_id: ativo.contabilidade_id,
        estabelecimento_id: ativo.estabelecimento_id,
        email: ativo.email,
      });
      if (erroNovo) throw erroNovo;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobertura"] });
    },
  });
}
