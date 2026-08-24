// ============================================================================
// 01_nucleo.spec.ts — Portão de segurança adversarial (ETAPA 07)
// Vetores V1 e V5:
//   V1 — CRUD fora do que o papel permite (escalação de privilégio)
//   V5 — alteração de parâmetro ou valor protegido
//
// SÓ RODA NO BENCH. Todo caso aqui escreve, apaga ou cria de verdade — é o que
// separa "achei um caminho" de "acho que existe um caminho". Contra produção o
// arquivo inteiro é pulado, e `exigirBench()` é a segunda camada, caso alguém
// remova o guard.
//
// ALVO CONTIDO: o ataque destrutivo mira registro criado na hora pelo próprio
// teste. Se um ataque passar, o dano fica dentro da fixture do bench.
// ============================================================================
import { describe, it, expect, afterAll } from "vitest";
import {
  loginComo, loginAvulso, clienteServico, criarUsuarioDescartavel, apagarUsuarioDescartavel,
  ehProducao, ehErroRls, ataqueBarrado, type Role,
} from "../rls/helpers";

const PULAR = ehProducao();
const bench = PULAR ? describe.skip : describe;

if (PULAR) {
  console.log("[adversarial] 01_nucleo pulado: alvo é PRODUÇÃO. Rode com SINDCOM_ALVO=bench.");
}

const limpeza: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza adversarial falhou:", (e as Error).message);
    }
  }
});

// ============================================================================
// V1 — escalação de privilégio
// ============================================================================
bench("V1 — escalação de privilégio em perfis", () => {
  it("usuário autenticado SEM perfil não se cadastra como admin", async () => {
    // Este é o A01 do CRM Vitrine traduzido. Lá, a policy de INSERT olhava só a
    // identidade e a trava de coluna era BEFORE UPDATE — não cobria INSERT. Aqui
    // não existe policy de INSERT para não-admin, o que deveria negar por
    // ausência; o que se mede é se `fn_eh()` devolvendo NULL (usuário sem perfil)
    // não abre uma brecha, já que `NULL` não é `false`.
    const invasor = await criarUsuarioDescartavel("adv-sem-perfil");
    limpeza.push(async () => {
      await clienteServico().from("perfis").delete().eq("id", invasor.uid);
      await apagarUsuarioDescartavel(invasor.uid);
    });

    const sessao = await loginAvulso(invasor.email, invasor.senha);
    const { data, error } = await sessao
      .from("perfis")
      .insert({ id: invasor.uid, nome: "Invasor", email: invasor.email, role: "admin", ativo: true })
      .select("id, role");

    if (!error) {
      const { data: alcance } = await sessao.from("trabalhadores").select("cpf, nome").limit(3);
      console.error(
        "EXPLORÁVEL — perfil admin plantado:", JSON.stringify(data),
        "| dado pessoal alcançado:", JSON.stringify(alcance),
      );
    }

    expect(ataqueBarrado(error), `INSERT de perfil admin por usuário sem perfil NÃO foi barrado: ${JSON.stringify(error)}`).toBe(true);
  });

  it("usuário sem perfil não enxerga nada do sistema", async () => {
    // Estado alcançável de verdade: login criado no Auth sem linha em `perfis`
    // (é o que acontece com qualquer usuário criado fora do fluxo do Admin).
    const orfao = await criarUsuarioDescartavel("adv-orfao");
    limpeza.push(() => apagarUsuarioDescartavel(orfao.uid));

    const sessao = await loginAvulso(orfao.email, orfao.senha);
    const vazamentos: string[] = [];
    for (const t of ["trabalhadores", "empresas", "perfis", "faturas", "parceiros", "auditoria"]) {
      const { data, error } = await sessao.from(t).select("*").limit(1);
      if (!error && (data ?? []).length > 0) vazamentos.push(t);
    }
    expect(vazamentos, `usuário sem perfil leu: ${vazamentos.join(", ")}`).toEqual([]);
  });

  it("papel nenhum reativa ou desativa perfil alheio", async () => {
    const { uid: uidAdmin } = await loginComo("admin");
    for (const papel of ["secretaria", "juridico", "parceiro", "presidente"] as Role[]) {
      const { client } = await loginComo(papel);
      await client.from("perfis").update({ ativo: false }).eq("id", uidAdmin);

      const { data } = await clienteServico().from("perfis").select("ativo").eq("id", uidAdmin).single();
      expect(data?.ativo, `${papel} desativou o perfil do Admin — negação de serviço no sistema inteiro`).toBe(true);
    }
  });

  it("o parceiro não se desliga do próprio parceiro_id para virar interno", async () => {
    const { client, uid } = await loginComo("parceiro");
    await client.from("perfis").update({ parceiro_id: null }).eq("id", uid);

    const { data } = await clienteServico().from("perfis").select("parceiro_id").eq("id", uid).single();
    expect(data?.parceiro_id, "parceiro zerou o próprio vínculo — fn_parceiro_id() passaria a NULL").not.toBeNull();
  });
});

// ============================================================================
// V5 — parâmetro e valor protegido
// ============================================================================
bench("V5 — o nível de proteção não muda por caminho lateral", () => {
  it("nivel é coluna GERADA — ninguém, nem o Admin, escreve nela direto", async () => {
    // Descoberto na montagem do bench: `nivel` é GENERATED ALWAYS a partir de
    // recolhe_contribuicao_sindical + recolhe_mensalidade_convenio. Isso é uma
    // proteção estrutural — vale prová-la, para que uma migration futura não a
    // troque por coluna comum sem ninguém perceber.
    const { data: alvo } = await clienteServico().from("trabalhadores").select("id, nivel").limit(1).single();
    const { client } = await loginComo("admin");
    const { error } = await client.from("trabalhadores").update({ nivel: "ouro" }).eq("id", alvo!.id).select("id");
    expect(error, "nivel aceitou escrita direta — deixou de ser coluna gerada").not.toBeNull();
  });

  it("mudar recolhe_* muda o nível — e isso FICA REGISTRADO em eventos_nivel", async () => {
    // A secretária pode alterar as colunas-fonte: é ato deliberado de operação,
    // não falha. O que torna isso seguro é o rastro. Se o registro sumir, a
    // mudança de nível vira invisível — e é ela que decide quanto a pessoa paga.
    const admin = clienteServico();
    // recolhe_contribuicao_sindical tem DEFAULT true (= nasce prata). Para medir a
    // subida até ouro, o alvo começa em bronze explicitamente.
    const { data: alvo } = await admin
      .from("trabalhadores")
      .insert({
        cpf: `999${Date.now()}`.slice(0, 11),
        nome: "DEMO — Alvo de Nível",
        status_cadastro: "aprovado",
        recolhe_contribuicao_sindical: false,
        recolhe_mensalidade_convenio: false,
      })
      .select("id, nivel")
      .single();
    limpeza.push(async () => {
      await admin.from("eventos_nivel").delete().eq("trabalhador_id", alvo!.id);
      await admin.from("trabalhadores").delete().eq("id", alvo!.id);
    });

    expect(alvo!.nivel).toBe("bronze");

    const { client } = await loginComo("secretaria");
    const { error } = await client
      .from("trabalhadores")
      .update({ recolhe_contribuicao_sindical: true, recolhe_mensalidade_convenio: true })
      .eq("id", alvo!.id)
      .select("id");
    expect(error, `secretaria não conseguiu operar o nível: ${JSON.stringify(error)}`).toBeNull();

    const { data: depois } = await admin.from("trabalhadores").select("nivel").eq("id", alvo!.id).single();
    expect(depois?.nivel, "as colunas-fonte mudaram mas o nível não acompanhou").toBe("ouro");

    const { data: eventos } = await admin.from("eventos_nivel").select("*").eq("trabalhador_id", alvo!.id);
    expect(
      (eventos ?? []).length,
      "mudança de nível não deixou rastro em eventos_nivel — é ela que define quanto a pessoa paga",
    ).toBeGreaterThan(0);
  });

  it("o parceiro não reescreve valor da própria guia ao evoluir o status", async () => {
    // pol_solic_update deixa o parceiro atualizar a própria solicitação, e RLS não
    // distingue coluna: quem segura é trg_guarda_parceiro_solicitacao. Este caso
    // mede o trigger, não a policy.
    const admin = clienteServico();
    const { client, uid } = await loginComo("parceiro");

    // A guia tem de ser DO parceiro logado. Pegar "a primeira que aparecer" fazia
    // o teste mirar a guia do parceiro rival — aí a RLS filtra a linha, o UPDATE
    // afeta zero linhas, não há erro, e o caso passava a medir a coisa errada.
    const { data: perfil } = await admin.from("perfis").select("parceiro_id").eq("id", uid).single();
    const { data: minha } = await admin
      .from("solicitacoes_servico")
      .select("id, parceiro_id, valor_convenio, numero_guia")
      .eq("parceiro_id", perfil!.parceiro_id)
      .eq("status", "solicitada")
      .limit(1)
      .single();
    const ataques: Array<[string, Record<string, unknown>]> = [
      ["valor_convenio inflado", { status: "executada", valor_convenio: 99999 }],
      ["numero_guia reescrito", { status: "executada", numero_guia: "2026-999999" }],
      ["check-in forjado", { status: "executada", checkin_em: new Date().toISOString() }],
      ["trabalhador trocado", { status: "executada", trabalhador_id: minha!.id }],
    ];

    for (const [nome, payload] of ataques) {
      const { error } = await client.from("solicitacoes_servico").update(payload).eq("id", minha!.id).select("id");
      expect(ataqueBarrado(error), `parceiro passou: ${nome} (erro: ${JSON.stringify(error)})`).toBe(true);
    }

    const { data: conferencia } = await admin
      .from("solicitacoes_servico")
      .select("valor_convenio, numero_guia")
      .eq("id", minha!.id)
      .single();
    expect(Number(conferencia?.valor_convenio ?? 0)).not.toBe(99999);
    expect(conferencia?.numero_guia).toBe(minha!.numero_guia);
  });

  it("o parceiro não evolui guia de OUTRO parceiro", async () => {
    const admin = clienteServico();
    const { uid } = await loginComo("parceiro");
    const { data: meuPerfil } = await admin.from("perfis").select("parceiro_id").eq("id", uid).single();
    const { data: alheia } = await admin
      .from("solicitacoes_servico")
      .select("id, status")
      .neq("parceiro_id", meuPerfil!.parceiro_id)
      .limit(1)
      .single();

    const { client } = await loginComo("parceiro");
    await client.from("solicitacoes_servico").update({ status: "executada" }).eq("id", alheia!.id).select("id");

    const { data: depois } = await admin.from("solicitacoes_servico").select("status").eq("id", alheia!.id).single();
    expect(depois?.status, "parceiro executou a guia de um concorrente").toBe(alheia!.status);
  });

  it("quem abre chamado ao Admin não se auto-aprova", async () => {
    const { client, uid: uidSecretaria } = await loginComo("secretaria");
    const { data: chamado, error: erroInsert } = await client
      .from("solicitacoes_admin")
      .insert({
        operacao: "DELETE",
        tabela_alvo: "trabalhadores",
        registro_id: "00000000-0000-0000-0000-000000000000",
        justificativa: "DEMO — chamado adversarial",
        solicitante: uidSecretaria,
        status: "pendente",
      } as never)
      .select("id")
      .single();

    if (erroInsert) {
      // Se nem abrir chamado é possível, o caso não se aplica — mas isso precisa
      // aparecer, não passar como verde silencioso.
      expect(ataqueBarrado(erroInsert), `secretaria não abriu chamado: ${JSON.stringify(erroInsert)}`).toBe(true);
      return;
    }
    limpeza.push(async () => {
      await clienteServico().from("solicitacoes_admin").delete().eq("id", chamado.id);
    });

    await client.from("solicitacoes_admin").update({ status: "aprovada" }).eq("id", chamado.id).select("id");
    const { data: depois } = await clienteServico()
      .from("solicitacoes_admin")
      .select("status")
      .eq("id", chamado.id)
      .single();
    expect(depois?.status, "o solicitante aprovou o próprio chamado").not.toBe("aprovada");
  });
});

// ============================================================================
// V1 — a auditoria é a testemunha; testemunha que se apaga não serve
// ============================================================================
bench("V1 — trilha de auditoria é imutável", () => {
  it("nem o Admin reescreve ou apaga linha de auditoria", async () => {
    const admin = clienteServico();
    const { count: antes } = await admin.from("auditoria").select("*", { count: "exact", head: true });
    const { data: linha } = await admin.from("auditoria").select("id").limit(1).maybeSingle();
    if (!linha) {
      // Sem linha não há o que provar — e isso é informação, não aprovação.
      expect.fail("auditoria vazia no bench: nenhuma operação gerou rastro (verificar fn_auditoria)");
    }

    const { client } = await loginComo("admin");
    const { error: erroUpdate } = await client
      .from("auditoria")
      .update({ dados_depois: { adulterado: true } })
      .eq("id", linha!.id)
      .select("id");
    const { error: erroDelete } = await client.from("auditoria").delete().eq("id", linha!.id).select("id");

    const { data: aindaLa } = await admin.from("auditoria").select("id, dados_depois").eq("id", linha!.id).maybeSingle();
    expect(aindaLa, "linha de auditoria foi APAGADA por um papel do app").not.toBeNull();
    expect(
      JSON.stringify(aindaLa?.dados_depois ?? {}),
      "linha de auditoria foi REESCRITA por um papel do app",
    ).not.toContain("adulterado");

    // Contagem antes/depois: o `.eq(id)` prova que ESTA linha sobreviveu; a
    // contagem prova que nenhuma outra caiu junto.
    const { count: depois } = await admin.from("auditoria").select("*", { count: "exact", head: true });
    expect(depois, "a auditoria perdeu linhas durante o ataque").toBe(antes);

    // Sem policy de UPDATE/DELETE, a RLS nega por ausência e não levanta erro —
    // afeta zero linhas (orientacoes.md §2.6d). As duas formas contam como barrado.
    expect(erroUpdate === null || ehErroRls(erroUpdate)).toBe(true);
    expect(erroDelete === null || ehErroRls(erroDelete)).toBe(true);
  });

  it("papel nenhum apaga eventos_nivel para esconder mudança de nível", async () => {
    const admin = clienteServico();
    const { data: evento } = await admin.from("eventos_nivel").select("id").limit(1).maybeSingle();
    if (!evento) return; // sem evento no bench ainda; o caso anterior já cria um

    const { client } = await loginComo("secretaria");
    await client.from("eventos_nivel").delete().eq("id", evento.id);

    const { data: aindaLa } = await admin.from("eventos_nivel").select("id").eq("id", evento.id).maybeSingle();
    expect(aindaLa, "histórico de mudança de nível apagado pela Secretaria").not.toBeNull();
  });
});
