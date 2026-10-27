import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginComo } from "./helpers";

/**
 * Subetapa 9.2 — a correção manual de e-mail tem de SOBREVIVER ao delta mensal
 * da Receita.
 *
 * O PROBLEMA QUE O GATILHO RESOLVE, e por que ele precisa de teste
 * `estabelecimentos.email` está na lista de colunas que o delta mensal compara
 * e atualiza (`scripts/rfb/delta.mjs`, CAMPOS_ESTAB). O endereço com erro de
 * digitação NÃO é engano nosso: é o que a empresa declarou à Receita, e a
 * Receita vai continuar servindo o mesmo valor no arquivo do mês que vem.
 * Sem o gatilho, a correção some **em silêncio, todo mês** — e ninguém
 * perceberia, porque o sintoma (e-mail errado na tela) é idêntico ao estado
 * anterior à correção.
 *
 * Garantia sem teste apodrece: basta alguém recriar a tabela, restaurar um dump
 * ou mexer na função para o gatilho sumir sem nenhum alarme.
 *
 * POR QUE ESTE TESTE É SEGURO CONTRA PRODUÇÃO
 * O caso principal faz exatamente o que o delta mensal faria — tentar gravar o
 * `email_rfb_original` por cima da correção. **Se o gatilho estiver certo, essa
 * escrita é um no-op**: ele devolve o valor corrigido e nada muda. O teste é
 * neutralizado pela própria coisa que testa. Se o gatilho estiver quebrado, o
 * `afterAll` restaura a linha — e o teste falha, que é o ponto.
 */
describe("9.2 · o delta mensal da RFB não desfaz correção manual de e-mail", () => {
  let admin: SupabaseClient;
  let alvo: { id: string; email: string; email_rfb_original: string } | null = null;

  beforeAll(async () => {
    admin = (await loginComo("admin")).client;
    const { data } = await admin
      .from("estabelecimentos")
      .select("id, email, email_rfb_original")
      .not("email_corrigido_em", "is", null)
      .limit(1)
      .maybeSingle();
    alvo = data
      ? {
          id: data.id as string,
          email: data.email as string,
          email_rfb_original: data.email_rfb_original as string,
        }
      : null;
  }, 30_000);

  afterAll(async () => {
    // Rede de proteção: só age se o gatilho tiver falhado e a linha mudado.
    if (!alvo || !admin) return;
    const { data } = await admin.from("estabelecimentos").select("email").eq("id", alvo.id).maybeSingle();
    if (data && data.email !== alvo.email) {
      await admin.from("estabelecimentos").update({ email: alvo.email }).eq("id", alvo.id);
    }
  }, 30_000);

  it("existe pelo menos uma correção marcada, com o valor original guardado", (ctx) => {
    if (!alvo) ctx.skip(); // base sem correção manual — nada a proteger
    expect(alvo!.email_rfb_original, "correção marcada sem o original: o gatilho fica cego").toBeTruthy();
    expect(alvo!.email).not.toBe(alvo!.email_rfb_original);
  });

  it("regravar o valor ORIGINAL da Receita não desfaz a correção", async (ctx) => {
    if (!alvo) ctx.skip();
    const { error } = await admin
      .from("estabelecimentos")
      .update({ email: alvo!.email_rfb_original })
      .eq("id", alvo!.id);
    expect(error).toBeNull();

    // Efeito observável (§7.2): o que importa é o valor que FICOU na linha.
    const { data } = await admin.from("estabelecimentos").select("email").eq("id", alvo!.id).maybeSingle();
    expect(
      data?.email,
      "o gatilho deixou a RFB sobrescrever a correção — ela vai sumir no próximo delta mensal",
    ).toBe(alvo!.email);
  }, 30_000);

  it("mas uma troca REAL de e-mail passa — o gatilho não congela a coluna", async (ctx) => {
    if (!alvo) ctx.skip();
    // A distinção é o ponto do desenho: preservar a correção enquanto a origem
    // insiste no erro, sem impedir que a empresa mude de endereço de verdade.
    const novo = `9.2-teste-${Date.now()}@exemplo.invalido`;
    const { error } = await admin.from("estabelecimentos").update({ email: novo }).eq("id", alvo!.id);
    expect(error).toBeNull();

    const { data } = await admin.from("estabelecimentos").select("email").eq("id", alvo!.id).maybeSingle();
    expect(data?.email, "o gatilho barrou uma mudança legítima — congelou a coluna").toBe(novo);

    // Fixture criada aqui é desfeita aqui (regra de dados de 2026-09-09).
    await admin.from("estabelecimentos").update({ email: alvo!.email }).eq("id", alvo!.id);
    const { data: voltou } = await admin
      .from("estabelecimentos")
      .select("email")
      .eq("id", alvo!.id)
      .maybeSingle();
    expect(voltou?.email, "a restauração falhou — a linha ficou com o e-mail de teste").toBe(alvo!.email);
  }, 30_000);
});
