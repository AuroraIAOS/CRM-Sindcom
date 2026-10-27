import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Camada de acesso da tela INTERNA de descadastros (ETAPA 09 · Subetapa 9.2).
 *
 * POR QUE ESTA PASTA É SEPARADA DE `features/descadastro/` (singular)
 * Aquela é a página PÚBLICA que o destinatário abre pelo link do e-mail, e a
 * primeira regra dela é não usar `supabase-js`: quem chega ali não tem sessão e
 * não deve alcançar tabela nenhuma, nem para ler. Esta aqui é o oposto — é a
 * leitura autenticada de quem opera a campanha. Juntar as duas no mesmo módulo
 * colocaria um cliente do banco dentro do arquivo cuja regra é não ter um.
 *
 * QUEM LÊ: a policy `pol_descadastros_select` (sql/24) libera SELECT para
 * Admin, Presidente e Secretaria. A tela não repete essa condição em lugar
 * nenhum — quem decide é o Postgres, e o menu apenas evita oferecer uma aba que
 * voltaria vazia.
 *
 * PAGINAÇÃO EXPLÍCITA, e não por zelo: o PostgREST corta em 1000 linhas SEM
 * AVISAR (orientacoes.md §2.4). São 9.186 caixas na campanha; um dia esta
 * tabela passa de mil, e no dia em que passar a tela mostraria um total errado
 * com cara de certo. O laço abaixo é a correção documentada.
 */

export const MOTIVOS = [
  "nao_sou_mais_contador",
  "ja_enviei",
  "mensagens_demais",
  "nao_entendi",
  "prefiro_telefone",
  "discordo",
  "outro",
] as const;
export type MotivoDescadastro = (typeof MOTIVOS)[number];

/**
 * O rótulo de cada motivo, e — no `acao` — a razão de ele existir. Cada opção
 * do formulário foi criada porque leva a uma AÇÃO diferente (plano, 9.00); sem
 * isso na tela, a distribuição vira gráfico bonito e ninguém sabe o que fazer
 * com ele.
 */
export const MOTIVO_INFO: Record<MotivoDescadastro, { rotulo: string; acao: string }> = {
  nao_sou_mais_contador: {
    rotulo: "Não sou mais o contador",
    acao: "Higiene de base — o cadastro da RFB está desatualizado",
  },
  ja_enviei: {
    rotulo: "Já enviei os dados",
    acao: "Qualidade de dado — se enviou e a cobertura não registra, há defeito no caminho",
  },
  mensagens_demais: {
    rotulo: "Mensagens demais",
    acao: "Ritmo — a cadência da trilha está errada",
  },
  nao_entendi: {
    rotulo: "Não entendi o pedido",
    acao: "Copy — o texto falhou, e isso se conserta",
  },
  prefiro_telefone: {
    rotulo: "Prefiro telefone",
    acao: "Canal — vira lista de ligação, não de e-mail",
  },
  discordo: {
    rotulo: "Discordo do pedido",
    acao: "Jurídico — a única que pede resposta nominal",
  },
  outro: {
    rotulo: "Outro",
    acao: "Ler o texto livre",
  },
};

export const ROTULO_VIA: Record<string, string> = {
  formulario: "Formulário",
  um_clique: "Um clique",
};

export type LinhaDescadastro = {
  id: string;
  quando: string;
  /** Nome da contabilidade ou razão social da empresa; e-mail quando o token não resolveu. */
  quem: string;
  tipo: "Contabilidade" | "Empresa" | "Não identificado";
  email: string;
  campanha: string;
  via: string;
  motivo: MotivoDescadastro | null;
  motivoLivre: string | null;
  /** `null` com `brevoErro` preenchido = ainda na lista da Brevo, pendente de repetição. */
  brevoRemovidoEm: string | null;
  brevoErro: string | null;
};

type Crua = {
  id: string;
  created_at: string;
  via: string;
  motivo: MotivoDescadastro | null;
  motivo_livre: string | null;
  email: string | null;
  brevo_removido_em: string | null;
  brevo_erro: string | null;
  envios_campanha: {
    email: string;
    campanhas: { nome: string } | null;
    contabilidades: { nome: string } | null;
    estabelecimentos: {
      nome_fantasia: string | null;
      empresas: { razao_social: string } | null;
    } | null;
  } | null;
};

const SELECT =
  "id, created_at, via, motivo, motivo_livre, email, brevo_removido_em, brevo_erro, " +
  "envios_campanha(email, campanhas(nome), contabilidades(nome), estabelecimentos(nome_fantasia, empresas(razao_social)))";

export function useDescadastros() {
  return useQuery<LinhaDescadastro[]>({
    queryKey: ["descadastros", "lista"],
    queryFn: async () => {
      const TAMANHO = 1000;
      let todas: Crua[] = [];
      for (let pagina = 0; ; pagina += 1) {
        const de = pagina * TAMANHO;
        const { data, error } = await supabase
          .from("descadastros_campanha")
          .select(SELECT)
          .order("created_at", { ascending: false })
          .range(de, de + TAMANHO - 1);
        if (error) throw error;
        const lote = (data ?? []) as unknown as Crua[];
        todas = todas.concat(lote);
        if (lote.length < TAMANHO) break;
      }

      return todas.map((d) => {
        const envio = d.envios_campanha;
        const contab = envio?.contabilidades?.nome ?? null;
        const empresa =
          envio?.estabelecimentos?.empresas?.razao_social ??
          envio?.estabelecimentos?.nome_fantasia ??
          null;
        const email = d.email ?? envio?.email ?? "—";
        return {
          id: d.id,
          quando: d.created_at,
          quem: contab ?? empresa ?? email,
          tipo: contab ? "Contabilidade" : empresa ? "Empresa" : "Não identificado",
          email,
          campanha: envio?.campanhas?.nome ?? "—",
          via: d.via,
          motivo: d.motivo,
          motivoLivre: d.motivo_livre,
          brevoRemovidoEm: d.brevo_removido_em,
          brevoErro: d.brevo_erro,
        } satisfies LinhaDescadastro;
      });
    },
  });
}

/**
 * O denominador. Sem ele, "3 descadastros" não diz nada — 3 em 9.186 é ruído,
 * 3 em 12 é a campanha inteira dando errado. É `head: true`: só o número volta.
 */
export function useTotalEnviados() {
  return useQuery<number>({
    queryKey: ["descadastros", "total-enviados"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("envios_campanha")
        .select("id", { count: "exact", head: true })
        .not("enviado_em", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
