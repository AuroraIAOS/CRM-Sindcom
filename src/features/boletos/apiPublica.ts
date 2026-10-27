import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * API da página pública `/responder/:token`. NÃO usa supabase-js: quem abre o
 * link não tem sessão e só alcança a Edge Function `receber-dados-boleto`, onde
 * o token é a credencial. `ok:false` (HTTP 200) é recusa de negócio, não erro de
 * rede — por isso vira exceção aqui, e a página nunca diz "enviado" para um
 * envio recusado.
 */

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receber-dados-boleto`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ItemDoLink = {
  boleto_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  editavel: boolean;
  quantidade: number | null;
  cnpj_confirmado: boolean | null;
  cnpj_incorreto_obs: string | null;
};

export type CicloDoLink = {
  ciclo_id: string;
  nome: string;
  tipo: string;
  referencia: string | null;
  prazo_resposta: string | null;
  itens: ItemDoLink[];
};

export type RespostaDoItem = {
  boleto_id: string;
  quantidade: number;
  cnpj_confirmado: boolean;
  cnpj_incorreto_obs?: string;
};

export type ResultadoEnvio = {
  gravadas: number;
  recusadas: Array<{ boleto_id: string; motivo: string }>;
};

const MSG_REDE = "Não foi possível falar com o sindicato agora. Verifique sua conexão e tente de novo.";

async function chamar<T>(url: string, init: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, init);
  } catch {
    throw new Error(MSG_REDE);
  }
  let corpo: { ok: boolean; erro?: string } & Record<string, unknown>;
  try {
    corpo = await resposta.json();
  } catch {
    throw new Error(MSG_REDE);
  }
  if (!corpo.ok) throw new Error(corpo.erro ?? MSG_REDE);
  return corpo as unknown as T;
}

export function useSolicitacoesDoLink(token: string) {
  return useQuery<CicloDoLink[]>({
    queryKey: ["boletos-publico", token],
    enabled: token.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const r = await chamar<{ ciclos: CicloDoLink[] }>(`${URL_FUNCAO}?token=${encodeURIComponent(token)}`, {
        headers: { apikey: ANON },
      });
      return r.ciclos;
    },
  });
}

export function useResponderLink(token: string) {
  const queryClient = useQueryClient();
  return useMutation<ResultadoEnvio, Error, RespostaDoItem[]>({
    mutationFn: async (respostas) => {
      const r = await chamar<ResultadoEnvio>(URL_FUNCAO, {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ token, respostas }),
      });
      return { gravadas: r.gravadas, recusadas: r.recusadas ?? [] };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boletos-publico", token] }),
  });
}
