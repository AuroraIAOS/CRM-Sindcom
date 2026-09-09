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

/** Taxa em % sobre um denominador, protegendo contra divisão por zero. */
export function taxa(parte: number, total: number): number | null {
  return total > 0 ? (parte / total) * 100 : null;
}
