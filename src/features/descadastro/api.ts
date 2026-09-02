import { useMutation, useQuery } from "@tanstack/react-query";

/**
 * Camada de acesso da página pública de descadastro (ETAPA 09 · Subetapa 9.00).
 *
 * Segue as duas regras incomuns de `features/coleta/api.ts`, e pelos mesmos
 * motivos:
 *
 * 1. **Não usa `supabase-js`.** Quem abre `/descadastrar/:token` não tem sessão
 *    e não deve alcançar tabela nenhuma — nem para ler. O token é a credencial,
 *    e ele vale exclusivamente na Edge Function `descadastrar`.
 *
 * 2. **`ok: false` não é `error`.** A função devolve HTTP 200 com
 *    `{ok:false, erro:"..."}` para toda recusa de negócio. Confiar só em `error`
 *    faria a página dizer "descadastrado" para um pedido recusado
 *    (orientacoes.md §2.18).
 *
 * E uma regra própria desta feature, que é a decisão (b) da subetapa:
 * **o envio do motivo nunca é condição da saída.** Por isso `useDescadastrar`
 * manda motivo e descadastro no MESMO pedido: não existe um estado em que o
 * motivo foi para o servidor e a saída não. Do lado do servidor, a gravação do
 * motivo pode falhar e o descadastro segue — ver a Edge Function.
 */

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/descadastrar`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ContextoDescadastro = {
  nome: string;
  email: string;
  jaDescadastrado: boolean;
};

type RespostaConsulta =
  | { ok: true; nome: string; email: string; ja_descadastrado: boolean }
  | { ok: false; erro: string };

type RespostaSaida =
  | { ok: true; ja_estava: boolean; mensagem: string }
  | { ok: false; erro: string };

/** Erro de negócio devolvido pela função (link inválido, freio de varredura). */
export class RecusaDoDescadastro extends Error {}

/**
 * As sete opções, na ordem em que a tela as mostra.
 *
 * Elas não são genéricas: cada uma existe porque leva a uma AÇÃO diferente do
 * Sindcom (plano, Subetapa 9.00). A primeira é a mais valiosa — é higiene da
 * base da Receita, que está desatualizada — e por isso abre a lista.
 */
export const MOTIVOS = [
  {
    valor: "nao_sou_mais_contador",
    rotulo: "Não sou mais o contador desta empresa, ou a empresa encerrou as atividades",
  },
  { valor: "ja_enviei", rotulo: "Já enviei os dados solicitados" },
  { valor: "mensagens_demais", rotulo: "Recebo mensagens demais deste remetente" },
  { valor: "nao_entendi", rotulo: "Não entendi o que o sindicato está pedindo" },
  { valor: "prefiro_telefone", rotulo: "Prefiro tratar por telefone ou pessoalmente" },
  { valor: "discordo", rotulo: "Discordo do pedido ou o considero indevido" },
  { valor: "outro", rotulo: "Outro motivo" },
] as const;

export type MotivoDescadastro = (typeof MOTIVOS)[number]["valor"];

/**
 * Quem é o destinatário deste token e se ele já saiu.
 *
 * Devolve nome e e-mail — a mesma exposição que `/enviar-dados/:token` já faz,
 * e pelo mesmo fundamento: são dado público da Receita. Nada de trabalhador,
 * nada de CPF.
 */
export function useContextoDescadastro(token: string) {
  return useQuery<ContextoDescadastro>({
    queryKey: ["descadastro", "contexto", token],
    enabled: token.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const resposta = await fetch(`${URL_FUNCAO}?token=${encodeURIComponent(token)}`, {
        headers: { apikey: ANON },
      });
      const corpo = (await resposta.json()) as RespostaConsulta;
      if (!corpo.ok) throw new RecusaDoDescadastro(corpo.erro);
      return { nome: corpo.nome, email: corpo.email, jaDescadastrado: corpo.ja_descadastrado };
    },
  });
}

export type PedidoDeSaida = {
  token: string;
  motivo: MotivoDescadastro;
  motivoLivre: string;
};

export function useDescadastrar() {
  return useMutation<{ jaEstava: boolean; mensagem: string }, Error, PedidoDeSaida>({
    mutationFn: async ({ token, motivo, motivoLivre }) => {
      const resposta = await fetch(URL_FUNCAO, {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ token, motivo, motivo_livre: motivoLivre }),
      });
      const dados = (await resposta.json()) as RespostaSaida;
      if (!dados.ok) throw new RecusaDoDescadastro(dados.erro);
      return { jaEstava: dados.ja_estava, mensagem: dados.mensagem };
    },
  });
}
