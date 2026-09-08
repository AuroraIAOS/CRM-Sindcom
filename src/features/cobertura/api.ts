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
 * O TOKEN NUNCA É LIDO DA TABELA CRUA NESTA FEATURE — e desde a Subetapa 9.1
 * ele É lido, para o Admin, através de `v_envios_campanha_mascarada`
 * (sql/25_reemissao_token_09_01.sql), onde o próprio Postgres devolve `null`
 * para quem não é Admin. A diferença importa: a regra de quem enxerga a
 * credencial mora no banco, não numa condição de UI que um bug de renderização
 * poderia contornar.
 *
 * POR QUE A LEITURA PASSOU A EXISTIR. Até a 9.1, revogar era uma ação sem
 * saída: o link antigo morria, um novo nascia (por DEFAULT do banco) e ninguém
 * conseguia vê-lo — nenhuma tela mostrava, o CSV não trazia e o CRM não dispara
 * e-mail. Quem pedia a troca do link ficava sem link. Reemitir sem entregar não
 * é reemitir.
 */

export type LinhaCobertura = {
  contabilidadeId: string;
  nome: string;
  email: string;
  totalEstabelecimentos: number;
  estabelecimentosCobertos: number;
  /**
   * Quando a contabilidade pediu para sair da campanha (Subetapa 9.00), ou
   * `null`. Separa "não respondeu" de "pediu para não ser mais contatada E não
   * respondeu" — situações diferentes, encaminhamentos diferentes: a primeira
   * pede novo e-mail, a segunda pede telefone ou via formal.
   *
   * Vem da view por subconsulta escalar sobre `envios_campanha`, que é
   * `security_invoker`: quem não tem policy de SELECT lá (o Jurídico) lê `null`
   * aqui, sem erro e sem ganhar coluna nova.
   */
  descadastradoEm: string | null;
};

export function useCoberturaContabilidades() {
  return useQuery<LinhaCobertura[]>({
    queryKey: ["cobertura", "contabilidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cobertura_contabilidades")
        .select(
          "contabilidade_id, nome, email, total_estabelecimentos, estabelecimentos_cobertos, descadastrado_em",
        );
      if (error) throw error;
      const linhas = (data ?? []).map((r) => ({
        contabilidadeId: r.contabilidade_id as string,
        nome: r.nome as string,
        email: r.email as string,
        totalEstabelecimentos: r.total_estabelecimentos as number,
        estabelecimentosCobertos: r.estabelecimentos_cobertos as number,
        descadastradoEm: (r.descadastrado_em as string | null) ?? null,
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

/** O endereço público do link de coleta, montado a partir da origem servida —
 *  em produção `https://crm.sindcompassos.org`, em desenvolvimento o localhost.
 *  Nunca cravado, para o link copiado nunca apontar para o ambiente errado. */
function montarLink(token: string): string {
  return `${window.location.origin}/enviar-dados/${token}`;
}

export type LinkAtivo = {
  envioId: string;
  /** `null` quando quem consulta não é Admin — o banco é que apaga o valor
   *  (`v_envios_campanha_mascarada`), não a tela. */
  link: string | null;
  expiraEm: string | null;
  criadoEm: string;
};

/**
 * O link ATIVO de uma contabilidade, para reenviar sem precisar revogar nada.
 *
 * Lê a view mascarada, nunca `envios_campanha`: para Presidente e Secretaria a
 * consulta funciona e devolve `link: null` — elas continuam vendo QUE existe um
 * envio ativo, sem receber a credencial. Para o Jurídico e o parceiro, a RLS de
 * origem já zera a linha (§2.6b: a view não nega, ela some com o dado).
 */
export function useLinkAtivo(contabilidadeId: string | null) {
  return useQuery<LinkAtivo | null>({
    queryKey: ["cobertura", "link-ativo", contabilidadeId],
    enabled: !!contabilidadeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_envios_campanha_mascarada")
        .select("id, token, token_expira_em, created_at")
        .eq("contabilidade_id", contabilidadeId as string)
        .is("token_revogado_em", null)
        // Desempate determinístico: se houver mais de um ativo, o mais recente
        // é o que vale — e nunca um erro de "múltiplas linhas" (§2.4).
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const token = (data.token as string | null) ?? null;
      return {
        envioId: data.id as string,
        link: token ? montarLink(token) : null,
        expiraEm: (data.token_expira_em as string | null) ?? null,
        criadoEm: data.created_at as string,
      };
    },
  });
}

/**
 * Revoga o link ativo de uma contabilidade, emite um novo e DEVOLVE o novo
 * link — os três passos, não os dois primeiros.
 *
 * A parte de reemissão sempre funcionou (medido em produção na 9.1: depois de
 * duas revogações, a contabilidade tinha exatamente um envio ativo, com token
 * novo). O que faltava era o terceiro passo: **ler o link recém-criado e
 * entregá-lo a quem vai reenviá-lo.** Sem ele, revogar quebrava o acesso do
 * contador sem oferecer o substituto — o link novo existia só no banco.
 *
 * Histórico preservado (spec 08.11): a linha antiga fica com
 * `token_revogado_em` preenchido — é o que faz a página pública recusá-la — e
 * uma linha NOVA nasce para a mesma contabilidade/campanha. Passos sequenciais,
 * não transação (o projeto não expõe RPC para isto): se a inserção falhar
 * depois da revogação, a contabilidade fica sem link ativo até alguém repetir a
 * ação — janela pequena, aceitável numa ação manual e rara de Admin, e
 * sinalizada em vez de escondida.
 */
export function useRevogarToken() {
  const queryClient = useQueryClient();
  return useMutation<LinkAtivo, Error, string>({
    mutationFn: async (contabilidadeId: string) => {
      const { data: ativo, error: erroBusca } = await supabase
        .from("envios_campanha")
        .select("id, campanha_id, contabilidade_id, estabelecimento_id, email")
        .eq("contabilidade_id", contabilidadeId)
        .is("token_revogado_em", null)
        // Mesmo desempate de `useLinkAtivo`: dois ativos não podem transformar
        // a revogação num erro obscuro de "múltiplas linhas".
        .order("created_at", { ascending: false })
        .limit(1)
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

      const { data: novo, error: erroNovo } = await supabase
        .from("envios_campanha")
        .insert({
          campanha_id: ativo.campanha_id,
          contabilidade_id: ativo.contabilidade_id,
          estabelecimento_id: ativo.estabelecimento_id,
          email: ativo.email,
        })
        .select("id")
        .single();
      if (erroNovo) throw erroNovo;

      // O valor do token vem da view mascarada, nunca do `insert().select()` na
      // tabela crua — assim a regra de quem enxerga a credencial continua sendo
      // do banco, e a guarda de código desta feature continua valendo.
      const { data: emitido, error: erroLeitura } = await supabase
        .from("v_envios_campanha_mascarada")
        .select("id, token, token_expira_em, created_at")
        .eq("id", novo.id as string)
        .maybeSingle();
      if (erroLeitura) throw erroLeitura;

      const token = (emitido?.token as string | null) ?? null;
      return {
        envioId: novo.id as string,
        link: token ? montarLink(token) : null,
        expiraEm: (emitido?.token_expira_em as string | null) ?? null,
        criadoEm: (emitido?.created_at as string) ?? new Date().toISOString(),
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobertura"] });
    },
  });
}
