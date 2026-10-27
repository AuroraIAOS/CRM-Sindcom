import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Camada de acesso do painel de campanhas (ETAPA 09 · Subetapa 9.2).
 *
 * O PAINEL TEM DUAS FONTES, E ELAS RESPONDEM PERGUNTAS DIFERENTES:
 *
 * 1. **O CRM** sabe o que aconteceu DEPOIS do e-mail: quem abriu o link, quem
 *    mandou planilha, quem pediu para sair. É o funil que interessa ao
 *    sindicato, e ele existe mesmo que a Brevo esteja fora do ar.
 *
 * 2. **A Brevo** sabe o que aconteceu ANTES: quantos foram entregues, quantos
 *    abriram, quantos deram bounce, quantos marcaram spam. Sem isso não se
 *    enxerga entregabilidade — e entregabilidade é o que decide se a próxima
 *    onda sai ou não (copies §10: nunca subir volume com rejeição acima de 2%).
 *
 * As duas convivem sem se misturar de propósito. Somar "entregues" da Brevo com
 * "remessas" do CRM num único número produziria uma taxa que não significa
 * nada, porque os denominadores são diferentes: a Brevo conta MENSAGENS, o CRM
 * conta ESTABELECIMENTOS.
 */

// ---------------------------------------------------------------------------
// 1. Funil do próprio CRM — sempre disponível, sem dependência externa
// ---------------------------------------------------------------------------

export type FunilCampanha = {
  enviosTotal: number;
  enviosDisparados: number;
  comRemessa: number;
  descadastrados: number;
  tokensRevogados: number;
  remessasAbertas: number;
  remessasImportadas: number;
  remessasRejeitadas: number;
};

/**
 * `head: true` em todas as contagens: só o cabeçalho com o número volta,
 * nenhuma linha viaja. `envios_campanha` guarda token, e não há motivo para
 * trazer 9.186 linhas com credencial para desenhar oito quadradinhos.
 *
 * As oito consultas são escritas por extenso, sem helper genérico: um
 * intermediário para variar filtro sobre tabelas diferentes só se escreve à
 * custa de `any`, e trocar oito linhas legíveis por tipagem perdida é mau
 * negócio num arquivo que decide o que a tela mostra.
 */
const CONTAGEM = { count: "exact", head: true } as const;

export function useFunilCampanha() {
  return useQuery<FunilCampanha>({
    queryKey: ["campanhas", "funil"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [
        enviosTotal,
        enviosDisparados,
        comRemessa,
        descadastrados,
        tokensRevogados,
        remessasAbertas,
        remessasImportadas,
        remessasRejeitadas,
      ] = await Promise.all([
        supabase.from("envios_campanha").select("id", CONTAGEM),
        supabase.from("envios_campanha").select("id", CONTAGEM).not("enviado_em", "is", null),
        supabase.from("envios_campanha").select("id", CONTAGEM).not("primeira_remessa_em", "is", null),
        supabase.from("envios_campanha").select("id", CONTAGEM).not("descadastrado_em", "is", null),
        supabase.from("envios_campanha").select("id", CONTAGEM).not("token_revogado_em", "is", null),
        supabase.from("remessas_dados").select("id", CONTAGEM).in("status", ["recebida", "validada"]),
        supabase.from("remessas_dados").select("id", CONTAGEM).eq("status", "importada"),
        supabase.from("remessas_dados").select("id", CONTAGEM).eq("status", "rejeitada"),
      ]);

      for (const r of [
        enviosTotal,
        enviosDisparados,
        comRemessa,
        descadastrados,
        tokensRevogados,
        remessasAbertas,
        remessasImportadas,
        remessasRejeitadas,
      ]) {
        if (r.error) throw r.error;
      }
      return {
        enviosTotal: enviosTotal.count ?? 0,
        enviosDisparados: enviosDisparados.count ?? 0,
        comRemessa: comRemessa.count ?? 0,
        descadastrados: descadastrados.count ?? 0,
        tokensRevogados: tokensRevogados.count ?? 0,
        remessasAbertas: remessasAbertas.count ?? 0,
        remessasImportadas: remessasImportadas.count ?? 0,
        remessasRejeitadas: remessasRejeitadas.count ?? 0,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// 2. KPIs da Brevo — via Edge Function, nunca direto do navegador
// ---------------------------------------------------------------------------

export type CampanhaBrevo = {
  id: number;
  nome: string;
  assunto: string | null;
  status: string | null;
  enviadaEm: string | null;
  enviados: number;
  entregues: number;
  aberturasUnicas: number;
  aberturas: number;
  cliquesUnicos: number;
  cliques: number;
  rejeicoesDuras: number;
  rejeicoesLeves: number;
  spam: number;
  descadastros: number;
  /**
   * As estatísticas CRUAS da Brevo, como ela devolveu. Existem porque o
   * vocabulário dela é ambíguo e já custou uma leitura errada: medido na
   * Trilha A da Onda 00, com **2 entregues**, vieram `uniqueClicks: 10` e
   * `clickers: 20` — os dois maiores que o número de destinatários, logo
   * nenhum deles é "pessoas que clicaram". A tela lê daqui em vez de confiar
   * no campo já interpretado.
   */
  bruto?: Record<string, number>;
};

export type RespostaBrevo =
  | { ok: true; total: number; campanhas: CampanhaBrevo[] }
  | { ok: false; erro: string; detalhe?: string; configuravel?: boolean };

/**
 * A `BREVO_API_KEY` NUNCA passa por aqui. Esta chamada leva apenas o JWT da
 * sessão; quem conhece a chave é a Edge Function, no servidor.
 *
 * `ok: false` não é `error` — a função devolve HTTP 200 com o motivo legível
 * (chave ausente, chave recusada, Brevo fora do ar), pelo mesmo motivo do
 * §2.18: tratar recusa de negócio como exceção faz a tela mentir. Aqui a
 * consequência seria pior que mentir — seria mostrar "sem campanhas" quando o
 * que houve foi uma chave sem permissão.
 */
export function useKpisBrevo() {
  return useQuery<RespostaBrevo>({
    queryKey: ["campanhas", "brevo"],
    // A Brevo tem limite de chamadas por hora e estes números mudam devagar:
    // 5 minutos de frescor é mais do que suficiente para um painel diário.
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("brevo-campanhas");
      if (error) {
        // 404 aqui significa função ainda não publicada — mensagem específica,
        // porque é exatamente o estado em que este painel nasce.
        const msg = error.message ?? String(error);
        return {
          ok: false,
          erro: /not found|404/i.test(msg)
            ? "A função `brevo-campanhas` ainda não foi publicada no Supabase."
            : `Não foi possível falar com a função: ${msg}`,
          configuravel: true,
        };
      }
      return data as RespostaBrevo;
    },
  });
}

/**
 * REJEIÇÕES — a lista de quem NÃO recebeu, com o que a abordagem por outra via
 * exige (Subetapa 9.2).
 *
 * POR QUE VEM DO SUPABASE E NÃO DA BREVO, sendo um dado do ESP
 * A API da Brevo devolve, no relatório de campanha, apenas o TOTAL de
 * `hardBounces`/`softBounces`. Para a lista nominal existe
 * `POST /v3/emailCampaigns/{id}/exportRecipients`, que é assíncrono (devolve um
 * `processId`, exige polling, entrega um CSV) e traz só o endereço, sem motivo.
 *
 * E mesmo que fosse síncrono, não responderia a pergunta que este painel
 * existe para responder. A pergunta não é "quantos rejeitaram" — é **"para quem
 * eu ligo amanhã"**, e isso exige cruzar o endereço com razão social, CNPJ,
 * TELEFONE e município, que só existem dentro do CRM. Um e-mail solto numa
 * exportação do ESP não inicia abordagem nenhuma.
 *
 * Então o evento chega por webhook e é gravado, como já se faz com o
 * descadastro desde a 9.00; a view `v_rejeicoes_para_contato` faz a junção.
 */
export type RejeicaoContato = {
  id: string;
  email: string;
  tipo: "hard" | "soft" | "bloqueado" | "spam";
  motivo: string | null;
  ocorridoEm: string;
  campanha: string | null;
  nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  municipio: string | null;
  temEnvio: boolean;
  /** 'contabilidade' | 'empresa' | 'desconhecido' — contador e empresa não se abordam igual. */
  tipoDestinatario: string;
  /** Quantas empresas ficam sem o link por causa desta rejeição. É por aqui que a fila se ordena. */
  estabelecimentosAtendidos: number;
  /** 'propria' | 'carteira' | null — de onde saiu o telefone mostrado (sql/32). */
  telefoneOrigem: string | null;
  /** Em quantas empresas da carteira o mesmo número aparece. 1 é palpite; 7 é o escritório. */
  telefoneEmNEmpresas: number | null;
};

/** O que cada tipo PEDE — a coluna existe para virar decisão, não rótulo. */
export const ACAO_POR_TIPO: Record<RejeicaoContato["tipo"], { rotulo: string; acao: string }> = {
  hard: { rotulo: "Caixa inexistente", acao: "Não reenviar. Telefone, carta ou visita." },
  soft: { rotulo: "Falha temporária", acao: "Caixa cheia ou servidor fora. Vale tentar de novo antes de ligar." },
  bloqueado: { rotulo: "Remetente bloqueado", acao: "Insistir por e-mail piora a reputação do domínio. Outro canal." },
  spam: { rotulo: "Marcou como spam", acao: "Nunca reenviar. Rever a copy antes da onda seguinte." },
};

export function useRejeicoes() {
  return useQuery<RejeicaoContato[]>({
    queryKey: ["campanhas", "rejeicoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_rejeicoes_para_contato")
        .select("id, email, tipo, motivo, ocorrido_em, campanha, nome, cnpj_completo, telefone, municipio, tem_envio, tipo_destinatario, estabelecimentos_atendidos, telefone_origem, telefone_em_n_empresas")
        .order("ocorrido_em", { ascending: false })
        .limit(1000); // §2.4: o PostgREST trunca em 1000 sem avisar — melhor pedir o teto de propósito
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        email: r.email as string,
        tipo: r.tipo as RejeicaoContato["tipo"],
        motivo: (r.motivo as string | null) ?? null,
        ocorridoEm: r.ocorrido_em as string,
        campanha: (r.campanha as string | null) ?? null,
        nome: (r.nome as string | null) ?? null,
        cnpj: (r.cnpj_completo as string | null) ?? null,
        telefone: (r.telefone as string | null) ?? null,
        municipio: (r.municipio as string | null) ?? null,
        temEnvio: !!r.tem_envio,
        tipoDestinatario: (r.tipo_destinatario as string | null) ?? "desconhecido",
        estabelecimentosAtendidos: Number(r.estabelecimentos_atendidos ?? 0),
        telefoneOrigem: (r.telefone_origem as string | null) ?? null,
        telefoneEmNEmpresas:
          r.telefone_em_n_empresas === null || r.telefone_em_n_empresas === undefined
            ? null
            : Number(r.telefone_em_n_empresas),
      }));
    },
  });
}

/**
 * Campanha de TESTE, pelo nome que ela tem na Brevo (Subetapa 9.2).
 *
 * A Onda 00 foi a prova ponta a ponta feita em caixas do próprio Maxwell, com
 * contabilidades e empresas fictícias. Os 7 enviados e 12 cliques dela são
 * reais — só não são da campanha real, e somá-los ao painel faz a primeira onda
 * de verdade nascer com números que não são dela.
 *
 * POR QUE FILTRAR AQUI E NÃO APAGAR NA BREVO. Apagar as campanhas resolveria o
 * painel e **destruiria a evidência da 9.1** — os prints, as taxas de entrega e
 * a prova de autenticação que autorizaram tudo o que veio depois. O plano trata
 * essa evidência como entrega da subetapa. Filtrar na leitura preserva as duas
 * coisas, e é reversível com um clique na tela.
 *
 * O casamento é por PREFIXO (`Onda 00`), nunca por "contém": filtrar por
 * conteúdo já pegou `contabilidademontanari` e `diegomarademorais` na limpeza
 * da base, os dois reais (orientacoes.md §7.3).
 */
export function ehCampanhaDeTeste(nome: string): boolean {
  return /^\s*onda\s*0+\s*[-–—·:]?\s/i.test(nome);
}

/** Taxa em % sobre um denominador, protegendo contra divisão por zero. */
export function taxa(parte: number, total: number): number | null {
  return total > 0 ? (parte / total) * 100 : null;
}
