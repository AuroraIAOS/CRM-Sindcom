import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fixture compartilhada: uma campanha DEMO com os TRÊS estados de token que o
 * endpoint público precisa distinguir — válido, expirado e revogado.
 *
 * POR QUE ELA EXISTE (2026-09-10)
 * Até a limpeza da base de 2026-09-09, `coleta.spec.ts` e
 * `adversarial/05_comunicacao.spec.ts` PROCURAVAM esses três tokens numa
 * campanha DEMO que já estava gravada em produção. A limpeza levou a campanha
 * junto — e cinco casos ficaram vermelhos sem nada ter piorado no código. A
 * regra de dados mudou (`CLAUDE.md`, 2026-09-09): dado de verificação é criado
 * e removido pela própria subetapa, então a suíte precisa **semear o que usa**
 * em vez de se apoiar no que encontra (`orientacoes.md` §7.3, §2.9).
 *
 * TUDO AQUI É ESCRITO E APAGADO PELO ADMIN — de propósito. Nada nesta fixture
 * depende de `service_role`, e nada depende do bucket de remessas, que não tem
 * policy de DELETE (a evidência da remessa é imutável por desenho). É por isso
 * que ela cobre token, e não remessa.
 *
 * A faixa `999999…` de CNPJ é a convenção do projeto para dado fictício, e o
 * prefixo `DEMO —` é o que torna a limpeza possível por PREFIXO — nunca por
 * "contém", que já pegou `contabilidademontanari` e `diegomarademorais`, reais.
 */

export const CAMPANHA_DEMO = "DEMO — Campanha de coleta 2026";

/** CNPJ fictício com dígito verificador válido — o cadastro recusa DV errado. */
const CNPJ = { basico: "99999902", ordem: "0001", dv: "40" };

export type CampanhaDemoSemeada = {
  campanhaId: string;
  contabilidadeId: string;
  estabelecimentoId: string;
  empresaCnpjBasico: string;
  /** token por situação: `valido`, `expirado`, `revogado`. */
  tokens: Record<"valido" | "expirado" | "revogado", string>;
  envioIds: string[];
};

/**
 * Semeia a campanha e devolve os identificadores. Idempotente por natureza:
 * usa `upsert` no que tem chave natural (empresa, estabelecimento,
 * contabilidade) e cria envios novos a cada chamada — os envios são o que
 * `limparCampanhaDemo` remove primeiro.
 */
export async function semearCampanhaDemo(admin: SupabaseClient): Promise<CampanhaDemoSemeada> {
  const { error: erroEmpresa } = await admin
    .from("empresas")
    .upsert(
      { cnpj_basico: CNPJ.basico, razao_social: "DEMO — Alfa Comércio 01 Ltda", porte: "ME" },
      { onConflict: "cnpj_basico" },
    );
  if (erroEmpresa) throw new Error(`fixture/empresas: ${erroEmpresa.message}`);

  const { data: estab, error: erroEstab } = await admin
    .from("estabelecimentos")
    .upsert(
      {
        cnpj_basico: CNPJ.basico,
        cnpj_ordem: CNPJ.ordem,
        cnpj_dv: CNPJ.dv,
        matriz_filial: 1,
        nome_fantasia: "DEMO — Alfa Comércio 01 Ltda",
        situacao_cadastral: "02",
        uf: "MG",
      },
      { onConflict: "cnpj_basico,cnpj_ordem,cnpj_dv" },
    )
    .select("id")
    .single();
  if (erroEstab) throw new Error(`fixture/estabelecimentos: ${erroEstab.message}`);
  const estabelecimentoId = estab.id as string;

  const { data: contab, error: erroContab } = await admin
    .from("contabilidades")
    .upsert(
      { nome: "DEMO — Contabilidade Alfa", email: "demo.contabilidade.alfa@teste.local", ativa: true },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (erroContab) throw new Error(`fixture/contabilidades: ${erroContab.message}`);
  const contabilidadeId = contab.id as string;

  // Sem este vínculo a carteira volta vazia, e o caso "token válido devolve a
  // carteira" mediria o vazio em vez do recorte.
  const { error: erroVinculo } = await admin
    .from("contabilidade_estabelecimentos")
    .upsert(
      { contabilidade_id: contabilidadeId, estabelecimento_id: estabelecimentoId, origem: "informado", confirmado: true },
      { onConflict: "contabilidade_id,estabelecimento_id" },
    );
  if (erroVinculo) throw new Error(`fixture/contabilidade_estabelecimentos: ${erroVinculo.message}`);

  const { data: campanhaExistente } = await admin
    .from("campanhas")
    .select("id")
    .eq("nome", CAMPANHA_DEMO)
    .maybeSingle();
  let campanhaId = (campanhaExistente?.id as string) ?? "";
  if (!campanhaId) {
    const { data, error } = await admin
      .from("campanhas")
      .insert({ nome: CAMPANHA_DEMO, eixo: "requisicao", onda: 0 })
      .select("id")
      .single();
    if (error) throw new Error(`fixture/campanhas: ${error.message}`);
    campanhaId = data.id as string;
  }

  const base = {
    campanha_id: campanhaId,
    contabilidade_id: contabilidadeId,
    email: "demo.contabilidade.alfa@teste.local",
  };
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  /**
   * TRÊS INSERTS SEPARADOS, e isso não é estilo — é obrigatório.
   * Num `insert` de várias linhas, o PostgREST monta UMA lista de colunas com a
   * união das chaves e preenche com `null` o que faltar em cada linha. Ou seja:
   * a linha "válida", que omitia `token_expira_em` para receber o DEFAULT do
   * banco, recebia `null` e batia no `not null` — medido em 2026-09-10:
   *   null value in column "token_expira_em" ... violates not-null constraint
   * Linha a linha, cada uma manda só as suas colunas e o DEFAULT volta a valer.
   */
  const linhas = [{ ...base }, { ...base, token_expira_em: ontem }, { ...base, token_revogado_em: ontem }];
  const envios: Array<Record<string, unknown>> = [];
  for (const linha of linhas) {
    const { data, error } = await admin
      .from("envios_campanha")
      .insert(linha)
      .select("id, token, token_expira_em, token_revogado_em")
      .single();
    if (error) throw new Error(`fixture/envios_campanha: ${error.message}`);
    envios.push(data as Record<string, unknown>);
  }

  const tokens = { valido: "", expirado: "", revogado: "" } as CampanhaDemoSemeada["tokens"];
  for (const e of envios ?? []) {
    const situacao =
      e.token_revogado_em !== null
        ? "revogado"
        : new Date(e.token_expira_em as string).getTime() <= Date.now()
          ? "expirado"
          : "valido";
    tokens[situacao] = e.token as string;
  }
  // Efeito observável, não ausência de erro (§7.2): se um dos três não saiu com
  // a situação pedida, o teste que o usar mediria outra coisa em silêncio.
  for (const s of ["valido", "expirado", "revogado"] as const) {
    if (!tokens[s]) throw new Error(`fixture: token "${s}" não foi semeado — os três estados são obrigatórios`);
  }

  return {
    campanhaId,
    contabilidadeId,
    estabelecimentoId,
    empresaCnpjBasico: CNPJ.basico,
    tokens,
    envioIds: (envios ?? []).map((e) => e.id as string),
  };
}

/**
 * Remove o que foi semeado, na ordem que as FKs exigem. Chamada no `afterAll`.
 *
 * Não apaga campanha/contabilidade/estabelecimento se sobrarem envios ou
 * remessas apontando para eles: a exclusão simplesmente falha por FK, e engolir
 * esse erro esconderia acúmulo. O que ela garante é o essencial — nenhum ENVIO
 * de teste sobrevive, e envio é o que aparece nos contadores de campanha.
 */
export async function limparCampanhaDemo(admin: SupabaseClient, s: CampanhaDemoSemeada): Promise<void> {
  for (const id of s.envioIds) {
    await admin.from("envios_campanha").delete().eq("id", id);
  }
  const { count } = await admin
    .from("envios_campanha")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", s.campanhaId);
  if ((count ?? 0) > 0) return; // outra remessa/envio ainda usa a campanha

  await admin.from("campanhas").delete().eq("id", s.campanhaId);
  await admin
    .from("contabilidade_estabelecimentos")
    .delete()
    .eq("contabilidade_id", s.contabilidadeId)
    .eq("estabelecimento_id", s.estabelecimentoId);
  await admin.from("contabilidades").delete().eq("id", s.contabilidadeId);
  await admin.from("estabelecimentos").delete().eq("id", s.estabelecimentoId);
  await admin.from("empresas").delete().eq("cnpj_basico", s.empresaCnpjBasico);
}
