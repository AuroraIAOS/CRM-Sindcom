import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loginComo,
  clienteAnon,
  clienteServico,
  ehErroRls,
  ehErroConstraintOuTrigger,
  ehProducao,
  type Role,
} from "./helpers";

/**
 * Subetapa 08.4 — as seis tabelas da comunicação externa.
 *
 * O que esta suíte prova, e por que cada bloco existe:
 *
 *  1. `anon` não alcança NENHUMA das seis. Este é o teste que a ETAPA 07 provou
 *     ser indispensável: a anon key vai no bundle publicado em
 *     crm.sindcompassos.org, então "só quem tem a chave" não protege nada.
 *  2. O CONTROLE NEGATIVO em toda negativa — Admin lendo o que o outro não lê.
 *     Sem ele, "policy que nega tudo" passaria como "policy correta".
 *  3. A diferença medida entre negar LEITURA e negar ESCRITA (orientacoes §2.6d):
 *     INSERT barrado devolve 42501; UPDATE barrado devolve `error: null` com
 *     ZERO linhas, porque o `USING` filtra o que o comando enxerga e atualizar
 *     zero linhas é um no-op válido. Uma tela que checasse só `error` diria
 *     "salvo com sucesso" para uma operação que não mudou nada.
 *  4. As garantias que a spec §5.5/§5.6 põe no banco e não no frontend:
 *     validade obrigatória do token, destinatário obrigatório, imutabilidade da
 *     remessa e normalização do e-mail que é a chave do agrupamento.
 *
 * NENHUM teste fixa contagem (orientacoes §7.1b): o dado de demonstração fica
 * gravado por regra do projeto, então número mágico aqui é dívida programada.
 * Asserta-se o RECORTE — quem vê o quê em relação ao Admin.
 *
 * Fixtures: prefixo `08.4 teste —`, e-mails em `@sindcom.invalido`, removidos no
 * `afterAll`. Fixture de suíte automatizada não é dado de demonstração (§7.3).
 */

const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const AS_SEIS = [
  "contabilidades",
  "contabilidade_estabelecimentos",
  "modelos_coleta",
  "campanhas",
  "envios_campanha",
  "remessas_dados",
] as const;

const clientes: Record<Role, SupabaseClient> = {} as never;
let anon: SupabaseClient;

const PREFIXO = "08.4 teste —";
const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emailFixture = `08-4-teste-${sufixo}@sindcom.invalido`;

let contabilidadeId: string;
let campanhaId: string;
let envioId: string;
const contabilidadesParaLimpar: string[] = [];
const campanhasParaLimpar: string[] = [];

beforeAll(async () => {
  for (const p of PAPEIS) clientes[p] = (await loginComo(p)).client;
  anon = clienteAnon();

  const { data: contab, error: erroContab } = await clientes.admin
    .from("contabilidades")
    .insert({ nome: `${PREFIXO} Escritório`, email: emailFixture })
    .select("id")
    .single();
  if (erroContab) throw new Error(`fixture contabilidade: ${erroContab.message}`);
  contabilidadeId = contab.id as string;
  contabilidadesParaLimpar.push(contabilidadeId);

  const { data: camp, error: erroCamp } = await clientes.admin
    .from("campanhas")
    .insert({ nome: `${PREFIXO} Campanha`, eixo: "requisicao", onda: 1, assunto: `${PREFIXO} assunto` })
    .select("id")
    .single();
  if (erroCamp) throw new Error(`fixture campanha: ${erroCamp.message}`);
  campanhaId = camp.id as string;
  campanhasParaLimpar.push(campanhaId);

  const { data: env, error: erroEnv } = await clientes.admin
    .from("envios_campanha")
    .insert({ campanha_id: campanhaId, contabilidade_id: contabilidadeId, email: emailFixture })
    .select("id")
    .single();
  if (erroEnv) throw new Error(`fixture envio: ${erroEnv.message}`);
  envioId = env.id as string;
});

afterAll(async () => {
  // Ordem inversa das FKs: envios saem junto com a campanha (cascade); as
  // contabilidades são `restrict`, então só saem depois dos envios.
  for (const id of campanhasParaLimpar) await clientes.admin.from("campanhas").delete().eq("id", id);
  for (const id of contabilidadesParaLimpar)
    await clientes.admin.from("contabilidades").delete().eq("id", id);
});

// ---------------------------------------------------------------------------

describe("08.4 · anon não alcança nenhuma das seis tabelas novas", () => {
  for (const tabela of AS_SEIS) {
    it(`anon em ${tabela}: sem dado, e barrado no GRANT antes da RLS`, async () => {
      const { data, error } = await anon.from(tabela).select("*").limit(1);
      // O que importa em primeiro lugar: dado nenhum sai.
      expect(data ?? []).toEqual([]);
      // E a negativa é de privilégio (42501, HTTP 401), não `[]` silencioso — o
      // `revoke all ... from anon` derruba a requisição antes de a policy ser
      // avaliada. É uma camada a mais do que o critério pedia, não a menos.
      expect(ehErroRls(error)).toBe(true);
    });
  }

  it("controle negativo: Admin lê as seis (a política não é 'negar tudo')", async () => {
    for (const tabela of AS_SEIS) {
      const { error } = await clientes.admin.from(tabela).select("*").limit(1);
      expect(error, `Admin deveria ler ${tabela}`).toBeNull();
    }
  });
});

/**
 * Conta pelo cabeçalho, sem trazer linha. Duas razões, e a primeira é uma
 * armadilha registrada: depois da semeadura da 08.9 estas tabelas têm 950 e
 * 7.438 linhas, e `select('id')` voltaria TRUNCADO em 1000 sem avisar (§2.4) —
 * o teste continuaria verde comparando dois conjuntos truncados, que é
 * exatamente o tipo de "passou" que não prova nada. A segunda é custo: são 4
 * papéis × 5 tabelas por execução.
 */
async function contar(c: SupabaseClient, tabela: string): Promise<number> {
  const { count, error } = await c.from(tabela).select("id", { count: "exact", head: true });
  expect(error, `contagem de ${tabela}`).toBeNull();
  return count ?? 0;
}

describe("08.4 · recorte de leitura por papel", () => {
  it("contabilidades e vínculos: Presidente, Secretaria e Jurídico leem como o Admin; Parceiro não", async () => {
    for (const tabela of ["contabilidades", "contabilidade_estabelecimentos"] as const) {
      const total = await contar(clientes.admin, tabela);
      expect(total, `${tabela} deveria ter linhas (semeadura 08.9)`).toBeGreaterThan(0);

      for (const papel of ["presidente", "secretaria", "juridico"] as const) {
        expect(
          await contar(clientes[papel], tabela),
          `${papel} deveria ver o mesmo que o Admin em ${tabela}`,
        ).toBe(total);
      }

      // Parceiro é `authenticated` e TEM o grant — quem o barra é a policy, e
      // policy que não casa devolve conjunto vazio SEM erro (§2.6b).
      expect(await contar(clientes.parceiro, tabela), `parceiro em ${tabela}`).toBe(0);
    }
  });

  it("campanhas, envios e remessas: só Admin, Presidente e Secretaria; Jurídico e Parceiro veem vazio", async () => {
    for (const tabela of ["campanhas", "envios_campanha", "remessas_dados"] as const) {
      const total = await contar(clientes.admin, tabela);
      for (const papel of ["presidente", "secretaria"] as const) {
        expect(await contar(clientes[papel], tabela), `${papel} em ${tabela}`).toBe(total);
      }
      for (const papel of ["juridico", "parceiro"] as const) {
        expect(await contar(clientes[papel], tabela), `${papel} não deveria ver ${tabela}`).toBe(0);
      }
    }
  });

  it("modelos_coleta é catálogo: os cinco papéis leem", async () => {
    for (const papel of PAPEIS) {
      const { data, error } = await clientes[papel].from("modelos_coleta").select("id");
      expect(error, `${papel} em modelos_coleta`).toBeNull();
      expect((data ?? []).length, `${papel} deveria ler o catálogo`).toBeGreaterThan(0);
    }
  });
});

describe("08.4 · recorte de escrita", () => {
  it("Secretaria cria contabilidade; Jurídico e Parceiro são barrados com 42501", async () => {
    const emailSecretaria = `08-4-secretaria-${sufixo}@sindcom.invalido`;
    const { data, error } = await clientes.secretaria
      .from("contabilidades")
      .insert({ nome: `${PREFIXO} Criada pela Secretaria`, email: emailSecretaria })
      .select("id");
    expect(error).toBeNull();
    expect(data?.[0]?.id).toBeTruthy();
    contabilidadesParaLimpar.push(data![0].id as string);

    for (const papel of ["juridico", "parceiro"] as const) {
      const { error: erroPapel } = await clientes[papel]
        .from("contabilidades")
        .insert({ nome: `${PREFIXO} não deveria existir`, email: `08-4-${papel}-${sufixo}@sindcom.invalido` });
      expect(ehErroRls(erroPapel), `${papel} não pode inserir contabilidade`).toBe(true);
    }
  });

  it("campanhas e envios são escrita de Admin: a Secretaria lê mas não cria", async () => {
    const { error: erroCampanha } = await clientes.secretaria
      .from("campanhas")
      .insert({ nome: `${PREFIXO} campanha da Secretaria`, eixo: "informativo" });
    expect(ehErroRls(erroCampanha)).toBe(true);

    const { error: erroEnvio } = await clientes.secretaria
      .from("envios_campanha")
      .insert({ campanha_id: campanhaId, contabilidade_id: contabilidadeId, email: emailFixture });
    expect(ehErroRls(erroEnvio)).toBe(true);
  });

  it("NENHUM papel autenticado insere em remessas_dados — só a Edge Function, com service_role", async () => {
    // Se existisse esse caminho, haveria uma segunda porta de entrada de dado
    // externo sem token, sem rate limit e sem rastro de IP. A ausência de policy
    // de INSERT é deliberada, e é isto que a prova.
    for (const papel of PAPEIS) {
      const { error } = await clientes[papel].from("remessas_dados").insert({
        envio_id: envioId,
        modelo_coleta_id: "00000000-0000-0000-0000-000000000000",
        arquivo_path: "nao-deveria/entrar.xlsx",
      });
      expect(ehErroRls(error), `${papel} não pode inserir remessa`).toBe(true);
    }
  });

  it("UPDATE barrado por RLS NÃO dá erro — afeta zero linhas (§2.6d)", async () => {
    // A armadilha registrada: `error === null` num UPDATE protegido só por
    // `USING` não significa que gravou. Significa que a linha não existia para
    // aquele comando. Quem não encadeia `.select()` mostra "salvo com sucesso".
    const { data, error } = await clientes.juridico
      .from("contabilidades")
      .update({ nome: `${PREFIXO} INVASÃO` })
      .eq("id", contabilidadeId)
      .select();
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    // Controle negativo: a Secretaria PODE, e a mesma checagem devolve a linha.
    const { data: dataSec, error: erroSec } = await clientes.secretaria
      .from("contabilidades")
      .update({ observacoes: `${PREFIXO} anotação da Secretaria` })
      .eq("id", contabilidadeId)
      .select();
    expect(erroSec).toBeNull();
    expect((dataSec ?? []).length).toBe(1);
  });
});

describe("08.4 · garantias do token (spec §5.5)", () => {
  it("token nasce único, com validade obrigatória de 90 dias e sem revogação", async () => {
    const { data, error } = await clientes.admin
      .from("envios_campanha")
      .select("token, token_expira_em, token_revogado_em")
      .eq("id", envioId)
      .single();
    expect(error).toBeNull();
    expect(data!.token).toBeTruthy();
    expect(data!.token_revogado_em).toBeNull();

    // A pendência da ETAPA 07 era justamente um token de vida infinita.
    const dias = (new Date(data!.token_expira_em as string).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(89);
    expect(dias).toBeLessThan(91);
  });

  it("envio sem contabilidade nem estabelecimento é recusado pelo CHECK", async () => {
    const { error } = await clientes.admin
      .from("envios_campanha")
      .insert({ campanha_id: campanhaId, email: `08-4-orfao-${sufixo}@sindcom.invalido` });
    expect(ehErroConstraintOuTrigger(error)).toBe(true);
  });
});

describe("08.4 · o e-mail é a chave do agrupamento, e o banco a defende", () => {
  it("grava normalizado e recusa a mesma caixa em outra grafia", async () => {
    const bruto = `  08-4-Grafia-${sufixo}@Sindcom.INVALIDO  `;
    const normalizado = bruto.trim().toLowerCase();

    const { data, error } = await clientes.admin
      .from("contabilidades")
      .insert({ nome: `${PREFIXO} Grafia`, email: bruto })
      .select("id, email")
      .single();
    expect(error).toBeNull();
    contabilidadesParaLimpar.push(data!.id as string);
    expect(data!.email).toBe(normalizado);

    // Sem a normalização, `Contato@x.com` e `contato@x.com` virariam DUAS
    // contabilidades para o mesmo escritório — e a semeadura da 08.9 mandaria
    // dois links para a mesma caixa.
    const { error: erroDuplicata } = await clientes.admin
      .from("contabilidades")
      .insert({ nome: `${PREFIXO} Duplicata`, email: normalizado.toUpperCase() });
    expect(ehErroConstraintOuTrigger(erroDuplicata)).toBe(true);
  });
});

describe("08.4 · modelo de coleta v1", () => {
  it('"Cadastro sindical 2026" existe com as 6 colunas mapeadas ao template de importação', async () => {
    const { data, error } = await clientes.admin
      .from("modelos_coleta")
      .select("colunas, destino, ativo")
      .eq("nome", "Cadastro sindical 2026")
      .single();
    expect(error).toBeNull();
    expect(data!.destino).toBe("trabalhadores");
    expect(data!.ativo).toBe(true);

    const colunas = data!.colunas as Array<{ nome: string; obrigatoria: boolean }>;
    const nomes = colunas.map((c) => c.nome);
    // Os nomes são os do template de specs/importacao.md §3.3 — se divergirem,
    // a planilha do contador não casa com o importador que já existe.
    expect(nomes).toEqual([
      "cnpj_estabelecimento",
      "nome",
      "cpf",
      "telefone_whatsapp",
      "salario_informado",
      "recolhe_contribuicao",
    ]);

    const obrigatorias = colunas.filter((c) => c.obrigatoria).map((c) => c.nome);
    // `recolhe_contribuicao` é obrigatória de propósito: o default do importador
    // é "sim" (padrão legal), então deixar em branco converteria em Prata quem
    // se OPÔS. E sem `cnpj_estabelecimento` não nasce vínculo — que é a métrica
    // da etapa.
    expect(obrigatorias).toContain("recolhe_contribuicao");
    expect(obrigatorias).toContain("cnpj_estabelecimento");
    expect(obrigatorias).toContain("cpf");
  });
});

// A imutabilidade só pode ser exercitada por quem consegue INSERIR remessa — e,
// por desenho, isso é exclusividade da `service_role`. Roda só no bench, onde
// `clienteServico()` é permitido (§2.20).
describe.skipIf(ehProducao())("08.4 · remessa é imutável (só no bench)", () => {
  it("altera status/processada_*, recusa qualquer coluna de evidência", async () => {
    const servico = clienteServico();
    const { data: modelo } = await servico
      .from("modelos_coleta")
      .select("id")
      .eq("nome", "Cadastro sindical 2026")
      .single();

    const { data: remessa, error: erroInsert } = await servico
      .from("remessas_dados")
      .insert({
        envio_id: envioId,
        modelo_coleta_id: modelo!.id,
        arquivo_path: `08-4-teste/${sufixo}.xlsx`,
        linhas_recebidas: 3,
      })
      .select("id")
      .single();
    expect(erroInsert).toBeNull();
    const remessaId = remessa!.id as string;

    for (const campo of [
      { arquivo_path: "trocado.xlsx" },
      { linhas_recebidas: 999 },
      { relatorio: { adulterado: true } },
    ]) {
      const { error } = await servico.from("remessas_dados").update(campo).eq("id", remessaId);
      expect(ehErroRls(error) || ehErroConstraintOuTrigger(error), JSON.stringify(campo)).toBe(true);
    }

    const { data: processada, error: erroStatus } = await servico
      .from("remessas_dados")
      .update({ status: "importada", processada_em: new Date().toISOString() })
      .eq("id", remessaId)
      .select("status");
    expect(erroStatus).toBeNull();
    expect(processada?.[0]?.status).toBe("importada");

    await servico.from("remessas_dados").delete().eq("id", remessaId);
  });
});
