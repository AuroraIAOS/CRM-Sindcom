import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * Visão anual de cartas de oposição (`/cartas` — specs/frontend.md §2.2).
 *
 * Fonte: `v_cartas_ano_base` (sql/17_cartas.sql), que herda o universo de
 * `v_relatorio_convencao` — o MESMO de `fn_reclassificar_convencao`. Por isso
 * os números desta tela batem com a aba Relatório da CCT por construção.
 *
 * Duas armadilhas tratadas aqui, ambas já documentadas em orientacoes.md:
 *  §2.2 — a view devolve UMA LINHA POR VÍNCULO. Sem deduplicar, quem tem dois
 *         vínculos ativos na mesma CCT conta duas vezes.
 *  §2.4 — o PostgREST trunca em 1000 linhas SEM ERRO. Com 24.500 trabalhadores,
 *         uma CCT grande estouraria isso e a tela mostraria "faltam" a menos —
 *         exatamente o número que ninguém confere. Daí a paginação explícita.
 */

type LinhaView = Database["public"]["Views"]["v_cartas_ano_base"]["Row"];

/**
 * As 4 situações possíveis ao fim do prazo (regras 5.1/5.2/5.3 do fluxo de
 * convenções). NÃO são 2: "entregou/não entregou" esconde o caso que exige
 * ação humana.
 */
export type SituacaoCarta =
  /** 5.1 — entregou carta e regride para Bronze. */
  | "regride_bronze"
  /** 5.3 — não entregou; segue (ou volta a ser) Prata. */
  | "mantem_prata"
  /** 5.2 — Ouro sem carta: renovação anual automática do convênio. */
  | "ouro_renovado"
  /** 5.2 + FAQ 15 — Ouro COM carta: NÃO regride até cancelar a adesão. */
  | "ouro_pendente";

export const ROTULO_SITUACAO: Record<SituacaoCarta, string> = {
  regride_bronze: "Entregou → Bronze",
  mantem_prata: "Sem carta → Prata",
  ouro_renovado: "Ouro sem carta",
  ouro_pendente: "Ouro com carta — pendente",
};

export type TrabalhadorCarta = {
  trabalhador_id: string;
  trabalhador: string;
  cpf: string;
  nivel: Database["public"]["Enums"]["nivel_protecao"] | null;
  convencao_id: string;
  convencao: string;
  ano_base: number;
  data_limite_oposicao: string | null;
  reclassificada_em: string | null;
  carta_id: string | null;
  data_entrega: string | null;
  /** Todos os estabelecimentos do trabalhador dentro do recorte (§2.2). */
  estabelecimentos: string[];
  empresas: string[];
  situacao: SituacaoCarta;
  /** True quando o nível atual JÁ não corresponde ao que a regra determina —
   *  é o "vai mudar" que a organização interna executaria. */
  mudaDeNivel: boolean;
};

function classificar(linha: LinhaView): SituacaoCarta {
  const temCarta = linha.carta_id !== null;
  if (linha.nivel === "ouro") return temCarta ? "ouro_pendente" : "ouro_renovado";
  return temCarta ? "regride_bronze" : "mantem_prata";
}

/**
 * Nível que a organização interna aplicaria. Ouro fica fora do universo do
 * motor (`where t.nivel <> 'ouro'`), então para ele o alvo é o próprio Ouro.
 */
function nivelAlvo(situacao: SituacaoCarta): "bronze" | "prata" | "ouro" {
  if (situacao === "regride_bronze") return "bronze";
  if (situacao === "mantem_prata") return "prata";
  return "ouro";
}

export type CartasFiltros = {
  anoBase: number | null;
  convencaoId: string | "todas";
  situacao: SituacaoCarta | "todas";
  busca: string;
};

export type ResumoCartas = {
  linhas: TrabalhadorCarta[];
  totais: Record<SituacaoCarta, number>;
  totalPessoas: number;
  /** Quantas pessoas efetivamente mudariam de nível na organização interna. */
  totalMudam: number;
  /** Prazos das CCTs no recorte — usado para dizer se a contagem é parcial. */
  prazos: Array<{ convencao: string; dataLimite: string | null; encerrado: boolean }>;
  /** True se QUALQUER CCT do recorte ainda está com prazo aberto. */
  parcial: boolean;
};

const TAMANHO_PAGINA = 1000;

/** Ano-base local em ISO, sem `new Date()` na comparação (orientacoes.md §4.2). */
function hojeIso(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export function useVisaoAnualCartas(filtros: CartasFiltros) {
  return useQuery({
    queryKey: ["cartas", "visao-anual", filtros],
    queryFn: async (): Promise<ResumoCartas> => {
      // Paginação explícita: o PostgREST corta em 1000 sem avisar (§2.4).
      const todas: LinhaView[] = [];
      for (let pagina = 0; ; pagina++) {
        let query = supabase.from("v_cartas_ano_base").select("*");
        if (filtros.anoBase !== null) query = query.eq("ano_base", filtros.anoBase);
        if (filtros.convencaoId !== "todas")
          query = query.eq("convencao_id", filtros.convencaoId);

        const { data, error } = await query
          .order("trabalhador")
          .order("trabalhador_id")
          .range(pagina * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA + TAMANHO_PAGINA - 1);
        if (error) throw error;
        todas.push(...(data ?? []));
        if ((data?.length ?? 0) < TAMANHO_PAGINA) break;
      }

      // Deduplica por (trabalhador, convenção): a view é por vínculo (§2.2).
      const porPessoa = new Map<string, TrabalhadorCarta>();
      for (const l of todas) {
        if (!l.trabalhador_id || !l.convencao_id) continue;
        const chave = `${l.trabalhador_id}::${l.convencao_id}`;
        const existente = porPessoa.get(chave);
        if (existente) {
          if (l.estabelecimento && !existente.estabelecimentos.includes(l.estabelecimento))
            existente.estabelecimentos.push(l.estabelecimento);
          if (l.empresa && !existente.empresas.includes(l.empresa))
            existente.empresas.push(l.empresa);
          continue;
        }
        const situacao = classificar(l);
        porPessoa.set(chave, {
          trabalhador_id: l.trabalhador_id,
          trabalhador: l.trabalhador ?? "—",
          cpf: l.cpf ?? "",
          nivel: l.nivel,
          convencao_id: l.convencao_id,
          convencao: l.convencao ?? "—",
          ano_base: l.ano_base ?? 0,
          data_limite_oposicao: l.data_limite_oposicao,
          reclassificada_em: l.reclassificada_em,
          carta_id: l.carta_id,
          data_entrega: l.data_entrega,
          estabelecimentos: l.estabelecimento ? [l.estabelecimento] : [],
          empresas: l.empresa ? [l.empresa] : [],
          situacao,
          mudaDeNivel: l.nivel !== nivelAlvo(situacao),
        });
      }

      let linhas = [...porPessoa.values()];

      // Filtros que agem sobre a linha já agregada (não dá para empurrar ao
      // servidor sem reimplementar a classificação em SQL — e duas
      // implementações da mesma regra é exatamente o defeito que originou
      // esta subetapa).
      if (filtros.situacao !== "todas")
        linhas = linhas.filter((l) => l.situacao === filtros.situacao);

      const termo = filtros.busca.trim().toLowerCase();
      if (termo) {
        const digitos = termo.replace(/\D/g, "");
        linhas = linhas.filter(
          (l) =>
            l.trabalhador.toLowerCase().includes(termo) ||
            (digitos.length >= 3 && l.cpf.includes(digitos)),
        );
      }

      linhas.sort((a, b) => a.trabalhador.localeCompare(b.trabalhador, "pt-BR"));

      const totais: Record<SituacaoCarta, number> = {
        regride_bronze: 0,
        mantem_prata: 0,
        ouro_renovado: 0,
        ouro_pendente: 0,
      };
      for (const l of linhas) totais[l.situacao] += 1;

      // Prazos por CCT: computados sobre TODAS as linhas do recorte (não sobre
      // `linhas`, que pode estar filtrada por situação/busca).
      const prazosMap = new Map<string, string | null>();
      for (const l of todas) {
        if (l.convencao) prazosMap.set(l.convencao, l.data_limite_oposicao);
      }
      const hoje = hojeIso();
      const prazos = [...prazosMap.entries()].map(([convencao, dataLimite]) => ({
        convencao,
        dataLimite,
        // Comparação string × string, sem `new Date()` (§4.2).
        encerrado: dataLimite !== null && dataLimite < hoje,
      }));

      return {
        linhas,
        totais,
        totalPessoas: linhas.length,
        totalMudam: linhas.filter((l) => l.mudaDeNivel).length,
        prazos,
        parcial: prazos.some((p) => !p.encerrado),
      };
    },
  });
}

/** CCTs disponíveis para os seletores de ano-base e convenção. */
export type ConvencaoOpcao = {
  id: string;
  nome: string;
  ano_base: number;
  data_limite_oposicao: string | null;
  reclassificada_em: string | null;
};

export function useConvencoesParaCartas() {
  return useQuery({
    queryKey: ["cartas", "convencoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convencoes_coletivas")
        .select("id, nome, ano_base, data_limite_oposicao, reclassificada_em")
        .order("ano_base", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ConvencaoOpcao[];
    },
  });
}
