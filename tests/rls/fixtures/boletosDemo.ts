// Massa de verificação do módulo BOLETOS (ETAPA 10). SÓ no bench (clienteServico recusa produção).
//
// Tudo que nasce aqui leva o prefixo `DEMO —` (nomes) ou `@exemplo.invalido` (e-mails), para a
// limpeza ser por PREFIXO. `respostas_boleto` é imutável (trigger barra até o DELETE em cascata),
// então o service_role NÃO consegue apagar o que já tem resposta: a limpeza total é um SQL como
// postgres, rodado ao fim da subetapa (ver o fechamento da ETAPA 10).
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteServico, exigirBench } from "../helpers";

export const CNAE_ALVO = "4799901";
export const CNAE_FORA = "4799902";

export type Massa = {
  sufixo: string;
  convA: string;
  convB: string;
  emailUm: string;
  emailTres: string;
  estab: { e1: string; e2: string; e3: string; e4: string; e5: string; e6: string; e7: string };
  /** cnpj_completo (14 dígitos) por estabelecimento */
  cnpj: Record<"e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "e7", string>;
};

function ok(r: { data: any; error: { message: string } | null }, onde: string): any {
  if (r.error || r.data === null) throw new Error(`massa boletos (${onde}): ${r.error?.message ?? "sem dados"}`);
  return r.data;
}

/**
 * 2 convenções (A com TAF 12,50 e PAMED 20,00; B sem taxa nenhuma) e 7 estabelecimentos:
 *   e1,e2 → A, mesmo e-mail (uma caixa)   e3 → B, e-mail próprio   e4 → A, sem e-mail
 *   e5 → A, e-mail malformado             e6 → A, situação 03 (baixada)   e7 → A, CNAE fora do ciclo
 */
export async function semearMassa(): Promise<Massa> {
  exigirBench("semearMassa()");
  const s = clienteServico();
  const sufixo = Math.random().toString(36).slice(2, 8);
  const base = 87000000 + Math.floor(Math.random() * 999000); // cnpj_basico de 8 dígitos, faixa 87xxxxxx

  await s.from("cnaes").upsert([
    { codigo: CNAE_ALVO, descricao: "DEMO — teste de boletos" },
    { codigo: CNAE_FORA, descricao: "DEMO — teste de boletos (fora do ciclo)" },
  ]);

  const novaConv = async (nome: string) =>
    ok(
      await s
        .from("convencoes_coletivas")
        .insert({ nome: `DEMO — BOL ${nome} ${sufixo}`, ano_base: 2026, data_inicio_vigencia: "2026-01-01" })
        .select("id")
        .single(),
      "convenção",
    ).id as string;
  const convA = await novaConv("CCT A");
  const convB = await novaConv("CCT B");

  ok(
    await s
      .from("taxas_convencao")
      .insert([
        { convencao_id: convA, nome: "DEMO TAF", valor: 12.5, tipo_boleto: "taf" },
        { convencao_id: convA, nome: "DEMO PAMED", valor: 20, tipo_boleto: "pamed" },
      ])
      .select("id"),
    "taxas",
  );

  const emailUm = `demo.um.${sufixo}@exemplo.invalido`;
  const emailTres = `demo.tres.${sufixo}@exemplo.invalido`;
  const defs: { k: keyof Massa["estab"]; email: string | null; conv: string; sit: string; cnae: string }[] = [
    { k: "e1", email: `  ${emailUm.toUpperCase()} `, conv: convA, sit: "02", cnae: CNAE_ALVO },
    { k: "e2", email: emailUm, conv: convA, sit: "02", cnae: CNAE_ALVO },
    { k: "e3", email: emailTres, conv: convB, sit: "02", cnae: CNAE_ALVO },
    { k: "e4", email: null, conv: convA, sit: "02", cnae: CNAE_ALVO },
    { k: "e5", email: "malformado", conv: convA, sit: "02", cnae: CNAE_ALVO },
    { k: "e6", email: `demo.seis.${sufixo}@exemplo.invalido`, conv: convA, sit: "03", cnae: CNAE_ALVO },
    { k: "e7", email: `demo.sete.${sufixo}@exemplo.invalido`, conv: convA, sit: "02", cnae: CNAE_FORA },
  ];

  const estab = {} as Massa["estab"];
  const cnpj = {} as Massa["cnpj"];
  for (const [i, d] of defs.entries()) {
    const basico = String(base + i);
    ok(await s.from("empresas").insert({ cnpj_basico: basico, razao_social: `DEMO — BOL Empresa ${sufixo} ${i + 1}` }).select("cnpj_basico").single(), "empresa");
    const e = ok(
      await s
        .from("estabelecimentos")
        .insert({
          cnpj_basico: basico,
          cnpj_ordem: "0001",
          cnpj_dv: String(10 + i),
          situacao_cadastral: d.sit,
          cnae_principal: d.cnae,
          email: d.email,
          convencao_id: d.conv,
        })
        .select("id, cnpj_completo")
        .single(),
      "estabelecimento",
    );
    estab[d.k] = e.id as string;
    cnpj[d.k] = e.cnpj_completo as string;
  }
  return { sufixo, convA, convB, emailUm, emailTres, estab, cnpj };
}

/** Cria um ciclo como o operador (RLS/GRANT reais) e semeia. */
export async function criarCicloESemear(
  cliente: SupabaseClient,
  massa: Massa,
  tipo: "taf" | "pamed" | "ca" | "cn",
  convencoes: string[],
  nome?: string,
): Promise<{ cicloId: string; semeadura: Record<string, number> }> {
  const venc = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await cliente
    .from("ciclos_boleto")
    .insert({
      nome: nome ?? `DEMO — BOL ${tipo.toUpperCase()} ${massa.sufixo}`,
      tipo,
      data_vencimento: venc,
      cnaes: [CNAE_ALVO],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`criarCiclo: ${error?.message}`);
  const cicloId = data.id as string;
  const v = await cliente.from("ciclo_convencoes").insert(convencoes.map((c) => ({ ciclo_id: cicloId, convencao_id: c })));
  if (v.error) throw new Error(`ciclo_convencoes: ${v.error.message}`);
  const r = await cliente.rpc("fn_semear_ciclo_boleto", { p_ciclo: cicloId });
  if (r.error) throw new Error(`semear: ${r.error.message}`);
  return { cicloId, semeadura: r.data as Record<string, number> };
}

/** boleto_id de cada estabelecimento num ciclo (lido pelo service_role, sem RLS). */
export async function boletosDoCiclo(cicloId: string): Promise<Record<string, string>> {
  const { data, error } = await clienteServico().from("boletos").select("id, estabelecimento_id").eq("ciclo_id", cicloId);
  if (error) throw new Error(`boletosDoCiclo: ${error.message}`);
  return Object.fromEntries((data ?? []).map((b) => [b.estabelecimento_id as string, b.id as string]));
}

/**
 * Limpeza possível pelo service_role: apaga o que NÃO tem resposta. O resto (boletos com resposta,
 * seus ciclos/estabelecimentos/convenções) fica DEMO no bench até o SQL de limpeza do fechamento.
 */
export async function limparMassaPossivel(massa: Massa | null, ciclos: string[]): Promise<void> {
  if (!massa) return;
  const s = clienteServico();
  for (const c of ciclos) {
    await s.from("boletos").delete().eq("ciclo_id", c);
    await s.from("ciclo_caixas").delete().eq("ciclo_id", c);
    await s.from("ciclo_convencoes").delete().eq("ciclo_id", c);
    await s.from("ciclos_boleto").delete().eq("id", c);
  }
  await s.from("estabelecimentos").delete().in("id", Object.values(massa.estab));
  await s.from("taxas_convencao").delete().in("convencao_id", [massa.convA, massa.convB]);
  await s.from("convencoes_coletivas").delete().in("id", [massa.convA, massa.convB]);
  await s.from("caixas_boleto").delete().like("email", `%.${massa.sufixo}@exemplo.invalido`);
}
