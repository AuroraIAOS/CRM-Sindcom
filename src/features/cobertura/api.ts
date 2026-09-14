import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * COBERTURA POR EMPRESA ISOLADA (Subetapa 9.1) — e por que ela pagina no
 * servidor enquanto a de contabilidades não.
 *
 * São **8.238 empresas isoladas** contra 953 contabilidades. O PostgREST
 * trunca em 1000 linhas sem avisar (orientacoes.md §2.4): carregar tudo e
 * filtrar no navegador entregaria uma lista silenciosamente incompleta — o
 * pior defeito possível numa tela cuja pergunta é "quem ainda falta".
 */
export type FiltroCobertura = {
  busca: string;
  /** "todas" | "cobertas" (já mandaram) | "sem" (não mandaram nada) */
  cobertura: "todas" | "cobertas" | "sem";
  /** "todas" | "descadastradas" | "ativas" */
  descadastro: "todas" | "descadastradas" | "ativas";
};

export const FILTRO_VAZIO: FiltroCobertura = { busca: "", cobertura: "todas", descadastro: "todas" };

export const EMPRESAS_POR_PAGINA = 50;

export type LinhaCoberturaEmpresa = {
  estabelecimentoId: string;
  envioId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  /**
   * O e-mail do CADASTRO (`estabelecimentos.email`) — o contato de verdade, e
   * o mesmo lugar de onde a tela de contabilidades sempre leu. Até a 9.2 esta
   * tela lia `envios_campanha.email`, e as duas telas irmãs respondiam "qual é
   * o e-mail desta empresa?" a partir de tabelas diferentes.
   */
  email: string;
  /**
   * Para onde o link EFETIVAMENTE saiu. Difere de `email` quando o cadastro foi
   * corrigido à mão depois de o envio ter sido criado — e aí a tela mostra os
   * dois, porque divergência é informação, não ruído a esconder.
   */
  emailEnvio: string;
  coberta: boolean;
  descadastradoEm: string | null;
  linkRevogado: boolean;
};

/** PostgREST usa vírgula e parênteses como sintaxe em `or(...)`; um termo de
 *  busca com esses caracteres viraria filtro malformado (ou, pior, um filtro
 *  diferente do pedido). Só o que é seguro passa. */
function termoSeguro(busca: string): string {
  return busca.trim().replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function useCoberturaEmpresas(filtro: FiltroCobertura, pagina: number) {
  return useQuery<{ linhas: LinhaCoberturaEmpresa[]; total: number }>({
    queryKey: ["cobertura", "empresas", filtro, pagina],
    queryFn: async () => {
      let consulta = supabase
        .from("v_cobertura_empresas")
        .select(
          "estabelecimento_id, envio_id, cnpj_completo, razao_social, nome_fantasia, email, coberta, descadastrado_em, link_revogado, email_envio",
          { count: "exact" },
        );

      const termo = termoSeguro(filtro.busca);
      if (termo) {
        // Só dígitos ⇒ é CNPJ (inteiro ou pedaço). Buscar CNPJ por razão social
        // não acha nada e faz o usuário concluir que a empresa não está na base.
        const digitos = termo.replace(/\D/g, "");
        if (digitos.length >= 3 && digitos.length === termo.replace(/[.\-/\s]/g, "").length) {
          consulta = consulta.ilike("cnpj_completo", `%${digitos}%`);
        } else {
          consulta = consulta.or(
            `razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%,email.ilike.%${termo}%,email_envio.ilike.%${termo}%`,
          );
        }
      }
      if (filtro.cobertura !== "todas") consulta = consulta.eq("coberta", filtro.cobertura === "cobertas");
      if (filtro.descadastro === "descadastradas") consulta = consulta.not("descadastrado_em", "is", null);
      if (filtro.descadastro === "ativas") consulta = consulta.is("descadastrado_em", null);

      const de = pagina * EMPRESAS_POR_PAGINA;
      const { data, error, count } = await consulta
        // Quem não mandou nada primeiro — é a fila de cobrança. `cnpj_completo`
        // desempata para a paginação não repetir nem pular linha (§2.4).
        .order("coberta", { ascending: true })
        .order("razao_social", { ascending: true })
        .order("cnpj_completo", { ascending: true })
        .range(de, de + EMPRESAS_POR_PAGINA - 1);
      if (error) throw error;

      return {
        total: count ?? 0,
        linhas: (data ?? []).map((r) => ({
          estabelecimentoId: r.estabelecimento_id as string,
          envioId: r.envio_id as string,
          cnpj: r.cnpj_completo as string,
          razaoSocial: (r.razao_social as string) ?? "",
          nomeFantasia: (r.nome_fantasia as string | null) ?? null,
          email: (r.email as string) ?? "",
          emailEnvio: (r.email_envio as string) ?? "",
          coberta: (r.coberta as boolean) ?? false,
          descadastradoEm: (r.descadastrado_em as string | null) ?? null,
          linkRevogado: (r.link_revogado as boolean) ?? false,
        })),
      };
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


/** Qual coluna identifica o destinatário do envio. A campanha tem dois tipos
 *  de alvo e exatamente um deles é preenchido por linha (constraint
 *  `chk_envio_tem_destinatario`, sql/20 §5) — então o mesmo código serve aos
 *  dois, trocando só a coluna. */
type AlvoEnvio = { coluna: "contabilidade_id" | "estabelecimento_id"; id: string };

/** Lê o envio ATIVO de um alvo pela view mascarada — nunca pela tabela crua. */
async function buscarLinkAtivo(alvo: AlvoEnvio): Promise<LinkAtivo | null> {
  const { data, error } = await supabase
    .from("v_envios_campanha_mascarada")
    .select("id, token, token_expira_em, created_at")
    .eq(alvo.coluna, alvo.id)
    .is("token_revogado_em", null)
    // Desempate determinístico: se houver mais de um ativo, o mais recente é o
    // que vale — e nunca um erro de "múltiplas linhas" (§2.4).
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
}

/**
 * O link ATIVO de um destinatário, para reenviar sem precisar revogar nada.
 *
 * Lê a view mascarada: para Presidente e Secretaria a consulta funciona e
 * devolve `link: null` — elas continuam vendo QUE existe um envio ativo, sem
 * receber a credencial. Para o Jurídico e o parceiro, a RLS de origem já zera a
 * linha (§2.6b: a view não nega, ela some com o dado).
 */
export function useLinkAtivo(contabilidadeId: string | null) {
  return useQuery<LinkAtivo | null>({
    queryKey: ["cobertura", "link-ativo", "contabilidade", contabilidadeId],
    enabled: !!contabilidadeId,
    queryFn: () => buscarLinkAtivo({ coluna: "contabilidade_id", id: contabilidadeId as string }),
  });
}

/** Idem, para a empresa isolada — o alvo é o estabelecimento. */
export function useLinkAtivoEmpresa(estabelecimentoId: string | null) {
  return useQuery<LinkAtivo | null>({
    queryKey: ["cobertura", "link-ativo", "estabelecimento", estabelecimentoId],
    enabled: !!estabelecimentoId,
    queryFn: () => buscarLinkAtivo({ coluna: "estabelecimento_id", id: estabelecimentoId as string }),
  });
}

/**
 * Revoga o link ativo de um destinatário, emite um novo e DEVOLVE o novo link —
 * os três passos, não os dois primeiros.
 *
 * A reemissão sempre funcionou (medido em produção na 9.1: depois de duas
 * revogações havia exatamente um envio ativo, com token novo). O que faltava era
 * o terceiro passo: **ler o link recém-criado e entregá-lo a quem vai
 * reenviá-lo.** Sem ele, revogar quebrava o acesso do destinatário sem oferecer
 * o substituto — o link novo existia só no banco (orientacoes.md §4.11).
 *
 * Histórico preservado (spec 08.11): a linha antiga fica com `token_revogado_em`
 * preenchido — é o que faz a página pública recusá-la — e uma linha NOVA nasce
 * para o mesmo destinatário/campanha. Passos sequenciais, não transação (o
 * projeto não expõe RPC para isto): se a inserção falhar depois da revogação, o
 * destinatário fica sem link ativo até alguém repetir a ação — janela pequena,
 * aceitável numa ação manual e rara de Admin, e sinalizada em vez de escondida.
 */
async function revogarEEmitir(
  alvo: AlvoEnvio,
  emailNovo?: string,
  cliente: SupabaseClient = supabase,
): Promise<LinkAtivo> {
  const { data: ativo, error: erroBusca } = await cliente
    .from("envios_campanha")
    .select("id, campanha_id, contabilidade_id, estabelecimento_id, email")
    .eq(alvo.coluna, alvo.id)
    .is("token_revogado_em", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroBusca) throw erroBusca;
  if (!ativo) throw new Error("Nenhum link ativo encontrado para este destinatário.");

  const { data: revogado, error: erroRevoga } = await cliente
    .from("envios_campanha")
    .update({ token_revogado_em: new Date().toISOString() })
    .eq("id", ativo.id as string)
    .select("id");
  if (erroRevoga) throw erroRevoga;
  // UPDATE barrado por RLS não dá erro — só afeta zero linhas (orientacoes.md §2.6d).
  if (!revogado || revogado.length === 0) {
    throw new Error("Sem permissão para revogar este link (restrito ao Admin e à Secretaria).");
  }

  const { data: novo, error: erroNovo } = await cliente
    .from("envios_campanha")
    .insert({
      campanha_id: ativo.campanha_id,
      contabilidade_id: ativo.contabilidade_id,
      estabelecimento_id: ativo.estabelecimento_id,
      // O envio novo nasce com o e-mail NOVO quando a reemissão veio de uma
      // troca de endereço — senão o link seria emitido para a caixa que a
      // contabilidade acabou de dizer que não usa mais.
      email: emailNovo ?? ativo.email,
    })
    .select("id")
    .single();
  if (erroNovo) throw erroNovo;

  // O valor do token vem da view mascarada, nunca do `insert().select()` na
  // tabela crua — assim a regra de quem enxerga a credencial continua sendo do
  // banco, e a guarda de código desta feature continua valendo.
  const { data: emitido, error: erroLeitura } = await cliente
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
}

export function useRevogarToken() {
  const queryClient = useQueryClient();
  return useMutation<LinkAtivo, Error, string>({
    mutationFn: (contabilidadeId: string) =>
      revogarEEmitir({ coluna: "contabilidade_id", id: contabilidadeId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobertura"] });
    },
  });
}

/** Formato conservador, igual ao da higienização: recusa só o indefensável. */
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/**
 * TROCAR O E-MAIL DE UMA CONTABILIDADE E REEMITIR O LINK (Subetapa 9.2).
 *
 * POR QUE AS DUAS COISAS SÃO UMA SÓ AÇÃO, e não dois botões
 * A contabilidade avisa que mudou de caixa. Se só o cadastro fosse atualizado,
 * o link que ela tem continuaria apontando para o envio antigo — e o próximo
 * disparo iria para o endereço velho, porque o CSV é montado a partir de
 * `envios_campanha`, não do cadastro. Trocar sem reemitir seria consertar o que
 * se vê e deixar quebrado o que funciona.
 *
 * A ORDEM IMPORTA, e é esta:
 *   1. valida o formato                  — erro aqui não toca em nada
 *   2. recusa e-mail já usado por OUTRO envio ativo (ver abaixo)
 *   3. grava no cadastro                 — se o `unique` do banco reclamar,
 *                                          nada mais aconteceu ainda
 *   4. revoga o link antigo e emite o novo COM o endereço novo
 *
 * A GUARDA DO PASSO 2 CUSTOU CARO PARA SER APRENDIDA (2026-09-10): a Brevo
 * FUNDE contato por e-mail na importação. Dois envios ativos com o mesmo
 * endereço viram um contato só, e o `link` de um deles desaparece — sem erro,
 * sem aviso, e o destinatário fica sem caminho de envio sem ninguém perceber.
 * Por isso a troca é recusada aqui, com o motivo escrito, em vez de produzir um
 * CSV que a exportação vai rejeitar depois.
 */
export async function alterarEmailEReemitir(
  contabilidadeId: string,
  emailNovo: string,
  /** Parâmetro para o teste usar a sessão DELE — o cliente global é o padrão,
   *  mesmo desenho de `importarTrabalhadores` (features/importacao/api.ts). */
  cliente: SupabaseClient = supabase,
): Promise<LinkAtivo> {
  // O banco normaliza por trigger (`trg_contabilidades_normaliza`); fazer o
  // mesmo aqui evita que a comparação da guarda abaixo passe por engano.
  const email = emailNovo.trim().toLowerCase();
  if (!EMAIL_VALIDO.test(email)) {
    throw new Error("E-mail inválido. Confira o endereço informado pela contabilidade.");
  }

  const { data: emUso, error: erroBusca } = await cliente
    .from("envios_campanha")
    .select("id, contabilidade_id, estabelecimento_id")
    .eq("email", email)
    .is("token_revogado_em", null)
    .is("descadastrado_em", null);
  if (erroBusca) throw erroBusca;
  const conflito = (emUso ?? []).filter((e) => e.contabilidade_id !== contabilidadeId);
  if (conflito.length > 0) {
    throw new Error(
      `Já existe um link ativo para ${email} em outro destinatário. ` +
        "Dois links para a mesma caixa fazem a Brevo fundir os contatos e um deles se perde — " +
        "revogue o outro antes, ou use um endereço diferente.",
    );
  }

  const { data: gravado, error: erroUpdate } = await cliente
    .from("contabilidades")
    .update({ email })
    .eq("id", contabilidadeId)
    .select("id");
  if (erroUpdate) throw erroUpdate;
  // UPDATE barrado por RLS não dá erro — afeta zero linhas (§2.6d).
  if (!gravado || gravado.length === 0) {
    throw new Error("Sem permissão para alterar o e-mail (restrito ao Admin e à Secretaria).");
  }

  return revogarEEmitir({ coluna: "contabilidade_id", id: contabilidadeId }, email, cliente);
}

export function useAlterarEmailContabilidade() {
  const queryClient = useQueryClient();
  return useMutation<LinkAtivo, Error, { contabilidadeId: string; emailNovo: string }>({
    mutationFn: ({ contabilidadeId, emailNovo }) => alterarEmailEReemitir(contabilidadeId, emailNovo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobertura"] });
    },
  });
}

export function useRevogarTokenEmpresa() {
  const queryClient = useQueryClient();
  return useMutation<LinkAtivo, Error, string>({
    mutationFn: (estabelecimentoId: string) =>
      revogarEEmitir({ coluna: "estabelecimento_id", id: estabelecimentoId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobertura"] });
    },
  });
}
