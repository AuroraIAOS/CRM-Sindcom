import { useMutation, useQuery } from "@tanstack/react-query";

/**
 * Camada de acesso do domínio "coleta externa" (ETAPA 08).
 *
 * DUAS COISAS INCOMUNS AQUI, e as duas são deliberadas:
 *
 * 1. **Não usa `supabase-js`.** Toda outra `api.ts` do projeto fala com o
 *    PostgREST pela anon key. Esta fala SÓ com a Edge Function
 *    `receber-remessa`, porque quem abre `/enviar-dados/:token` não tem sessão
 *    e não deve alcançar tabela nenhuma — nem para ler. O token é a credencial,
 *    e ele vale exclusivamente naquele endpoint.
 *
 * 2. **`ok: false` não é `error`.** A função devolve HTTP 200 com
 *    `{ok:false, erro:"..."}` para toda recusa de negócio — link inválido,
 *    expirado, revogado, arquivo errado, excesso de tentativas. Isso não é
 *    estilo: `raise exception` desfaria o registro da própria tentativa e o
 *    freio nunca contaria (orientacoes.md §2.18). Quem chama TEM de olhar
 *    `ok === false`; confiar só em `error` deixaria a página dizer "enviado"
 *    para um envio recusado.
 */

const URL_FUNCOES = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receber-remessa`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type EstabelecimentoDoToken = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  ja_coberto: boolean;
};

export type ContextoToken = {
  nome: string;
  estabelecimentos: EstabelecimentoDoToken[];
};

type RespostaConsulta = { ok: true; nome: string; estabelecimentos: EstabelecimentoDoToken[] } | { ok: false; erro: string };
type RespostaEnvio = { ok: true; remessa_id: string; status: string; mensagem: string } | { ok: false; erro: string };

/** Erro de negócio devolvido pela função (link inválido, freio, arquivo errado). */
export class RecusaDaColeta extends Error {}

/**
 * Quem é o contador deste token e qual é a carteira dele.
 *
 * A carteira é o que permite apontar "este CNPJ não é seu" antes do envio — o
 * erro mais provável do contador (spec §7). Nada de trabalhador vem daqui:
 * CNPJ e razão social são dado público da Receita.
 */
export function useContextoToken(token: string) {
  return useQuery<ContextoToken>({
    queryKey: ["coleta", "contexto", token],
    enabled: token.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const resposta = await fetch(`${URL_FUNCOES}?token=${encodeURIComponent(token)}`, {
        headers: { apikey: ANON },
      });
      const corpo = (await resposta.json()) as RespostaConsulta;
      if (!corpo.ok) throw new RecusaDaColeta(corpo.erro);
      return { nome: corpo.nome, estabelecimentos: corpo.estabelecimentos };
    },
  });
}

export type EnvioDeRemessa = {
  token: string;
  arquivo: File;
  linhasRecebidas: number;
  linhasComErro: number;
  relatorio: unknown;
};

export function useEnviarRemessa() {
  return useMutation<{ remessaId: string; status: string; mensagem: string }, Error, EnvioDeRemessa>({
    mutationFn: async ({ token, arquivo, linhasRecebidas, linhasComErro, relatorio }) => {
      const corpo = new FormData();
      corpo.append("token", token);
      corpo.append("arquivo", arquivo);
      corpo.append("linhas_recebidas", String(linhasRecebidas));
      corpo.append("linhas_com_erro", String(linhasComErro));
      corpo.append("relatorio", JSON.stringify(relatorio));

      const resposta = await fetch(URL_FUNCOES, {
        method: "POST",
        headers: { apikey: ANON },
        body: corpo,
      });
      const dados = (await resposta.json()) as RespostaEnvio;
      if (!dados.ok) throw new RecusaDaColeta(dados.erro);
      return { remessaId: dados.remessa_id, status: dados.status, mensagem: dados.mensagem };
    },
  });
}
