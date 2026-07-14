import { supabase } from "@/lib/supabase";
import type { Database, Enums } from "@/lib/database.types";

/**
 * Executores puros de ações em massa (Tarefa 01). São compartilhados por DOIS
 * caminhos, sem duplicar lógica:
 *  - Admin: chamados direto pelos hooks de trabalhadores/api.ts.
 *  - Secretária: enfileirados em solicitacoes_admin e executados por estas mesmas
 *    funções quando o Admin aprova (fila-admin/api.ts → executarOperacao).
 * Os valores chegam como strings (vindos do BulkAssignDialog) e são coeridos aqui.
 */

export type DadosLote = {
  municipio_id?: string;
  data_filiacao?: string;
  forma_pagamento_preferida?: string;
  origem_cadastro?: string;
};

export type VinculoLote = {
  estabelecimento_id?: string;
  funcao?: string;
  data_admissao?: string;
  data_desligamento?: string;
  salario_informado?: string;
};

export type CartaLote = {
  ano_base?: string;
  data_entrega?: string;
  forma?: string;
  comprovante_url?: string;
};

/** IDs dos vínculos principais ativos dos trabalhadores selecionados — alvo da
 *  atribuição em massa de campos de VÍNCULO (a coluna vive no vínculo, não no
 *  trabalhador). Resolve-se no momento da criação (Secretária tem SELECT). */
export async function resolverVinculosPrincipais(trabalhadorIds: string[]): Promise<string[]> {
  if (trabalhadorIds.length === 0) return [];
  const { data, error } = await supabase
    .from("vinculos_empregaticios")
    .select("id")
    .in("trabalhador_id", trabalhadorIds)
    .eq("principal", true)
    .is("data_desligamento", null);
  if (error) throw error;
  return (data ?? []).map((v) => v.id);
}

export async function executarLoteExcluir(ids: string[]): Promise<number> {
  const { error, count } = await supabase
    .from("trabalhadores")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function executarLoteDados(ids: string[], valores: DadosLote): Promise<number> {
  const p: Database["public"]["Tables"]["trabalhadores"]["Update"] = {};
  if (valores.municipio_id) p.municipio_id = Number(valores.municipio_id);
  if (valores.data_filiacao) p.data_filiacao = valores.data_filiacao;
  if (valores.forma_pagamento_preferida)
    p.forma_pagamento_preferida = valores.forma_pagamento_preferida as Enums<"forma_cobranca">;
  if (valores.origem_cadastro)
    p.origem_cadastro = valores.origem_cadastro as Enums<"origem_cadastro">;

  const { error, count } = await supabase
    .from("trabalhadores")
    .update(p, { count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function executarLoteVinculos(
  vinculoIds: string[],
  valores: VinculoLote,
): Promise<number> {
  if (vinculoIds.length === 0) return 0;
  const p: Database["public"]["Tables"]["vinculos_empregaticios"]["Update"] = {};
  if (valores.estabelecimento_id) p.estabelecimento_id = valores.estabelecimento_id;
  if (valores.funcao) p.funcao = valores.funcao;
  if (valores.data_admissao) p.data_admissao = valores.data_admissao;
  if (valores.data_desligamento) p.data_desligamento = valores.data_desligamento;
  if (valores.salario_informado) p.salario_informado = Number(valores.salario_informado);

  const { error, count } = await supabase
    .from("vinculos_empregaticios")
    .update(p, { count: "exact" })
    .in("id", vinculoIds);
  if (error) throw error;
  return count ?? vinculoIds.length;
}

/**
 * Registra carta de oposição para cada trabalhador selecionado e, em seguida,
 * zera as duas flags de recolhimento (todos passam a Bronze — mesmo efeito do
 * registro individual). Duplicatas de ano-base (unique trabalhador_id+ano_base,
 * SQLSTATE 23505) são puladas e reportadas em vez de abortar o lote inteiro.
 */
export async function executarLoteCartas(
  ids: string[],
  valores: CartaLote,
): Promise<{ registradas: number; puladas: number }> {
  const anoBase = Number(valores.ano_base);
  const registrados: string[] = [];
  let puladas = 0;

  for (const id of ids) {
    const { error } = await supabase.from("cartas_oposicao").insert({
      trabalhador_id: id,
      ano_base: anoBase,
      data_entrega: valores.data_entrega as string,
      forma: (valores.forma || "presencial") as Enums<"forma_entrega_carta">,
      comprovante_url: valores.comprovante_url || null,
    });
    if (error) {
      if (error.code === "23505") {
        puladas += 1;
        continue;
      }
      throw error;
    }
    registrados.push(id);
  }

  if (registrados.length > 0) {
    const { error } = await supabase
      .from("trabalhadores")
      .update({ recolhe_contribuicao_sindical: false, recolhe_mensalidade_convenio: false })
      .in("id", registrados);
    if (error) throw error;
  }

  return { registradas: registrados.length, puladas };
}

// ---------------------------------------------------------------------------
// Payload de lote para o fila-admin (Secretária → solicitacoes_admin)
// ---------------------------------------------------------------------------

export type LotePayload =
  | { tipo: "excluir"; ids: string[] }
  | { tipo: "dados"; ids: string[]; valores: DadosLote }
  | { tipo: "vinculos"; vinculoIds: string[]; valores: VinculoLote }
  | { tipo: "cartas"; ids: string[]; valores: CartaLote };

/** Executa um payload de lote (chamado pelo fila-admin na aprovação do Admin). */
export async function executarLote(lote: LotePayload): Promise<void> {
  switch (lote.tipo) {
    case "excluir":
      await executarLoteExcluir(lote.ids);
      return;
    case "dados":
      await executarLoteDados(lote.ids, lote.valores);
      return;
    case "vinculos":
      await executarLoteVinculos(lote.vinculoIds, lote.valores);
      return;
    case "cartas":
      await executarLoteCartas(lote.ids, lote.valores);
      return;
  }
}
