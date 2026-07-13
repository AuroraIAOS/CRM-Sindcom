import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EmpresaPayload } from "./validarEmpresas";
import type { EstabelecimentoPayload } from "./validarEstabelecimentos";
import { normalizarCabecalho } from "./parsers";
import type { TrabalhadorPreviewDados } from "./validarTrabalhadores";
import type { BeneficiadoPayload } from "./validarBeneficiados";

/**
 * Camada de acesso do domínio "importação" (frontend.md §5). Gravação direto
 * do frontend com a sessão do Admin — decisão de escopo da subetapa 01.5
 * (sem Edge Function/service_role nesta rodada; ver CLAUDE.md/histórico).
 * Lotes de 500 linhas, como o spec pede, mesmo que os volumes de teste sejam
 * pequenos — a função já fica correta para quando a base real chegar.
 */
const TAMANHO_LOTE = 500;

function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

type RespostaPaginavel<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Busca TODAS as linhas de uma tabela de referência/contexto, paginando em
 * lotes de 1000 — sem isso, o cap padrão de linhas do PostgREST trunca
 * silenciosamente qualquer tabela maior (ex.: 5.570 municípios, 1.359 CNAEs),
 * e as validações de FK passam a rejeitar linhas válidas por "não encontrado".
 */
async function buscarTodasAsLinhas<T>(
  construirQuery: (from: number, to: number) => RespostaPaginavel<T>,
): Promise<T[]> {
  const TAMANHO_PAGINA = 1000;
  let todas: T[] = [];
  let pagina = 0;
  for (;;) {
    const from = pagina * TAMANHO_PAGINA;
    const to = from + TAMANHO_PAGINA - 1;
    const { data, error } = await construirQuery(from, to);
    if (error) throw new Error(error.message);
    todas = todas.concat(data ?? []);
    if (!data || data.length < TAMANHO_PAGINA) break;
    pagina += 1;
  }
  return todas;
}

// ---------------------------------------------------------------------------
// Contexto de validação: dados já existentes no banco (referência + duplicatas)
// ---------------------------------------------------------------------------

export function useContextoEmpresas() {
  return useQuery({
    queryKey: ["importacao", "contexto-empresas"],
    queryFn: async () => {
      const [naturezas, qualificacoes, empresas] = await Promise.all([
        buscarTodasAsLinhas((from, to) =>
          supabase.from("naturezas_juridicas").select("codigo").range(from, to),
        ),
        buscarTodasAsLinhas((from, to) =>
          supabase.from("qualificacoes_responsavel").select("codigo").range(from, to),
        ),
        buscarTodasAsLinhas((from, to) => supabase.from("empresas").select("cnpj_basico").range(from, to)),
      ]);
      return {
        naturezasValidas: new Set(naturezas.map((n) => n.codigo)),
        qualificacoesValidas: new Set(qualificacoes.map((q) => q.codigo)),
        cnpjBasicosExistentes: new Set(empresas.map((e) => e.cnpj_basico)),
      };
    },
  });
}

export function useImportarEmpresas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linhas: EmpresaPayload[]) => {
      let gravados = 0;
      for (const lote of emLotes(linhas)) {
        const { error } = await supabase.from("empresas").upsert(lote, { onConflict: "cnpj_basico" });
        if (error) throw error;
        gravados += lote.length;
      }
      return gravados;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importacao"] });
      void queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
  });
}

export function useContextoEstabelecimentos() {
  return useQuery({
    queryKey: ["importacao", "contexto-estabelecimentos"],
    queryFn: async () => {
      const [empresas, cnaes, motivos, municipios, estabelecimentos] = await Promise.all([
        buscarTodasAsLinhas((from, to) => supabase.from("empresas").select("cnpj_basico").range(from, to)),
        buscarTodasAsLinhas((from, to) => supabase.from("cnaes").select("codigo").range(from, to)),
        buscarTodasAsLinhas((from, to) =>
          supabase.from("motivos_situacao_cadastral").select("codigo").range(from, to),
        ),
        buscarTodasAsLinhas((from, to) =>
          supabase
            .from("municipios")
            .select("id, codigo_rfb")
            .not("codigo_rfb", "is", null)
            .range(from, to),
        ),
        buscarTodasAsLinhas((from, to) =>
          supabase.from("estabelecimentos").select("cnpj_completo").range(from, to),
        ),
      ]);

      const municipioIdPorCodigoRfb = new Map<number, number>();
      for (const m of municipios) {
        if (m.codigo_rfb !== null) municipioIdPorCodigoRfb.set(m.codigo_rfb, m.id);
      }

      return {
        empresasExistentes: new Set(empresas.map((e) => e.cnpj_basico)),
        cnaesValidos: new Set(cnaes.map((c) => c.codigo)),
        motivosValidos: new Set(motivos.map((m) => m.codigo)),
        municipioIdPorCodigoRfb,
        cnpjCompletosExistentes: new Set(
          estabelecimentos.map((e) => e.cnpj_completo).filter((v): v is string => v !== null),
        ),
      };
    },
  });
}

export function useImportarEstabelecimentos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linhas: EstabelecimentoPayload[]) => {
      let gravados = 0;
      for (const lote of emLotes(linhas)) {
        const { error } = await supabase
          .from("estabelecimentos")
          .upsert(lote, { onConflict: "cnpj_basico,cnpj_ordem,cnpj_dv" });
        if (error) throw error;
        gravados += lote.length;
      }
      return gravados;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importacao"] });
      void queryClient.invalidateQueries({ queryKey: ["empresas"] });
      void queryClient.invalidateQueries({ queryKey: ["estabelecimentos"] });
    },
  });
}

export function useContextoTrabalhadores() {
  return useQuery({
    queryKey: ["importacao", "contexto-trabalhadores"],
    queryFn: async () => {
      const [trabalhadores, municipios, estabelecimentos] = await Promise.all([
        buscarTodasAsLinhas((from, to) => supabase.from("trabalhadores").select("cpf").range(from, to)),
        buscarTodasAsLinhas((from, to) =>
          supabase.from("municipios").select("id, nome, uf, codigo_ibge").range(from, to),
        ),
        buscarTodasAsLinhas((from, to) =>
          supabase.from("estabelecimentos").select("id, cnpj_completo").range(from, to),
        ),
      ]);

      const municipioIdPorNomeNormalizado = new Map<string, number>();
      const municipioIdPorCodigoIbge = new Map<number, number>();
      for (const m of municipios) {
        municipioIdPorNomeNormalizado.set(normalizarCabecalho(m.nome), m.id);
        if (m.codigo_ibge !== null) municipioIdPorCodigoIbge.set(m.codigo_ibge, m.id);
      }
      const estabelecimentoIdPorCnpjCompleto = new Map<string, string>();
      for (const e of estabelecimentos) {
        if (e.cnpj_completo) estabelecimentoIdPorCnpjCompleto.set(e.cnpj_completo, e.id);
      }

      return {
        cpfsExistentes: new Set(trabalhadores.map((t) => t.cpf)),
        municipioIdPorNomeNormalizado,
        municipioIdPorCodigoIbge,
        estabelecimentoIdPorCnpjCompleto,
      };
    },
  });
}

export function useImportarTrabalhadores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linhas: TrabalhadorPreviewDados[]) => {
      const novos = linhas.filter((l) => l.tipo === "novo");
      const contatos = linhas.filter((l) => l.tipo === "contato");
      let inseridos = 0;
      let atualizados = 0;

      for (const lote of emLotes(novos)) {
        const payload = lote.map(({ valores }) => {
          const { vinculo: _vinculo, ...semVinculo } = valores;
          return semVinculo;
        });
        const { data, error } = await supabase
          .from("trabalhadores")
          .upsert(payload, { onConflict: "cpf" })
          .select("id, cpf");
        if (error) throw error;
        inseridos += lote.length;

        const idPorCpf = new Map((data ?? []).map((t) => [t.cpf, t.id]));
        const vinculosParaCriar = lote
          .filter((l) => l.valores.vinculo !== null)
          .map((l) => {
            const trabalhador_id = idPorCpf.get(l.valores.cpf);
            if (!trabalhador_id) return null;
            const v = l.valores.vinculo!;
            return {
              trabalhador_id,
              estabelecimento_id: v.estabelecimento_id,
              funcao: v.funcao,
              data_admissao: v.data_admissao,
              salario_informado: v.salario_informado,
              principal: true,
            };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);

        // Best-effort: um vínculo problemático (ex.: já tem principal ativo)
        // não deve derrubar o lote de trabalhadores, que já foi gravado.
        for (const vinculo of vinculosParaCriar) {
          const { error: erroVinculo } = await supabase.from("vinculos_empregaticios").insert(vinculo);
          if (erroVinculo) {
            console.error("Vínculo não criado na importação:", erroVinculo.message);
          }
        }
      }

      // Atualização de contato: cada objeto exclui estruturalmente as 3 flags
      // de nível — impossível sobrescrevê-las por este caminho (ver schemas).
      for (const lote of emLotes(contatos)) {
        for (const linha of lote) {
          const { cpf, ...dadosContato } = linha.valores;
          const { error } = await supabase.from("trabalhadores").update(dadosContato).eq("cpf", cpf);
          if (error) throw error;
          atualizados += 1;
        }
      }

      return { inseridos, atualizados };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importacao"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

export function useContextoBeneficiados() {
  return useQuery({
    queryKey: ["importacao", "contexto-beneficiados"],
    queryFn: async () => {
      const [trabalhadores, beneficiados] = await Promise.all([
        buscarTodasAsLinhas((from, to) =>
          supabase.from("trabalhadores").select("id, cpf, nivel").range(from, to),
        ),
        buscarTodasAsLinhas((from, to) => supabase.from("beneficiados").select("cpf").range(from, to)),
      ]);

      const titularPorCpf = new Map<string, { id: string; ouro: boolean }>();
      for (const t of trabalhadores) {
        titularPorCpf.set(t.cpf, { id: t.id, ouro: t.nivel === "ouro" });
      }

      return {
        titularPorCpf,
        cpfsExistentes: new Set(beneficiados.map((b) => b.cpf)),
      };
    },
  });
}

export function useImportarBeneficiados() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linhas: BeneficiadoPayload[]) => {
      let gravados = 0;
      for (const lote of emLotes(linhas)) {
        const { error } = await supabase.from("beneficiados").upsert(lote, { onConflict: "cpf" });
        if (error) throw error;
        gravados += lote.length;
      }
      return gravados;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importacao"] });
      void queryClient.invalidateQueries({ queryKey: ["trabalhadores"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Log de importações (importacoes_csv)
// ---------------------------------------------------------------------------

export type RegistroImportacao = {
  entidade: string;
  arquivo_nome: string;
  total_linhas: number;
  inseridos: number;
  atualizados: number;
  erros: Array<{ linha: number; mensagem: string }>;
};

export function useRegistrarImportacao() {
  return useMutation({
    mutationFn: async (registro: RegistroImportacao) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("importacoes_csv").insert({
        entidade: registro.entidade,
        arquivo_nome: registro.arquivo_nome,
        total_linhas: registro.total_linhas,
        inseridos: registro.inseridos,
        atualizados: registro.atualizados,
        erros: registro.erros,
        importado_por: user?.id ?? null,
      });
      if (error) throw error;
    },
  });
}
