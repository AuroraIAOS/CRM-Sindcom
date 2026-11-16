// deno test supabase/functions/formularios-site/tests/ — fluxo completo com banco, e-mail e Turnstile simulados.
import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { type Banco, criarHandler, type Deps } from "../index.ts";
import { MailerMemoria } from "../mailer.ts";
import { detectarTipo } from "../arquivos.ts";
import { lerFormulario } from "../esquemas.ts";

const ORIGEM = "https://sindcompassos.org";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3]);

function montar(over: Partial<Deps> & { limiteOk?: boolean } = {}) {
  const inseridos: { tabela: string; dados: Record<string, unknown> }[] = [];
  const marcas: string[] = [];
  const removidos: string[] = [];
  const mailer = new MailerMemoria();
  const banco: Banco = {
    inserir(tabela, dados) { inseridos.push({ tabela, dados }); return Promise.resolve({ id: "id-1", protocolo: tabela === "site_denuncias" ? "DEN-2026-000001" : undefined }); },
    marcarEmail(_t, _id, status) { marcas.push(status); return Promise.resolve(); },
    remover(t, id) { removidos.push(`${t}:${id}`); return Promise.resolve(); },
    limite() { return Promise.resolve(over.limiteOk ?? true); },
  };
  const deps: Deps = {
    env: (k) => ({ TURNSTILE_SECRET: "s", SITE_SAL: "sal" } as Record<string, string>)[k],
    banco, mailer, verificarTurnstile: () => Promise.resolve(true), agora: () => new Date("2026-11-12T12:00:00Z"), ...over,
  };
  return { handler: criarHandler(deps), inseridos, marcas, removidos, mailer };
}

function req(form: string, campos: Record<string, string | string[] | File>, origem: string | null = ORIGEM, ip = "203.0.113.7") {
  const fd = new FormData();
  fd.set("cf-turnstile-response", "tok");
  for (const [k, v] of Object.entries(campos)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x)); else fd.set(k, v);
  }
  const headers: Record<string, string> = { "cf-connecting-ip": ip };
  if (origem) headers.origin = origem;
  return new Request(`https://x.supabase.co/functions/v1/formularios-site/${form}`, { method: "POST", body: fd, headers });
}

const contatoOk = { nome: "Maria Souza", telefone: "(35) 99999-9999", email: "Maria@Exemplo.com", cidade: "Passos", estado: "mg", assunto: "ACT", mensagem: "Olá", consentimento: "1" };

Deno.test("CORS: preflight de origem permitida = 204; origem estranha = 403", async () => {
  const { handler } = montar();
  const ok = await handler(new Request("https://x/formularios-site/contato", { method: "OPTIONS", headers: { origin: ORIGEM } }));
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), ORIGEM);
  const mau = await handler(req("contato", contatoOk, "https://malicioso.example"));
  assertEquals(mau.status, 403);
  assertEquals(mau.headers.get("access-control-allow-origin"), null);
});

Deno.test("contato válido: grava normalizado, avisa contato@ com Reply-To e marca enviado", async () => {
  const t = montar();
  const r = await t.handler(req("contato", contatoOk));
  assertEquals(r.status, 200); assertEquals((await r.json()).ok, true);
  assertEquals(t.inseridos[0].tabela, "site_contatos");
  assertEquals(t.inseridos[0].dados.telefone, "35999999999");
  assertEquals(t.inseridos[0].dados.email, "maria@exemplo.com");
  assertEquals(t.inseridos[0].dados.estado, "MG");
  assertEquals(t.mailer.enviados[0].para, "contato@sindcompassos.org");
  assertEquals(t.mailer.enviados[0].responderPara, "maria@exemplo.com");
  assertEquals(t.marcas, ["enviado"]);
});

Deno.test("contato inválido: 422 com erros por campo e nada gravado nem enviado", async () => {
  const t = montar();
  const r = await t.handler(req("contato", { ...contatoOk, email: "ruim", telefone: "123", consentimento: "" }));
  assertEquals(r.status, 422);
  const j = await r.json();
  assert(j.erros.email && j.erros.telefone && j.erros.consentimento);
  assertEquals(t.inseridos.length, 0); assertEquals(t.mailer.enviados.length, 0);
});

Deno.test("honeypot preenchido: finge sucesso e não grava", async () => {
  const t = montar();
  const r = await t.handler(req("contato", { ...contatoOk, _hp: "http://spam" }));
  assertEquals((await r.json()).ok, true); assertEquals(t.inseridos.length, 0);
});

Deno.test("Turnstile: sem secret = 503 (falha fechada); token recusado = 400", async () => {
  const sem = montar({ env: () => undefined });
  assertEquals((await sem.handler(req("contato", contatoOk))).status, 503);
  const ruim = montar({ verificarTurnstile: () => Promise.resolve(false) });
  assertEquals((await ruim.handler(req("contato", contatoOk))).status, 400);
  assertEquals(ruim.inseridos.length, 0);
});

Deno.test("limite de requisições: 429 e nada gravado", async () => {
  const t = montar({ limiteOk: false });
  assertEquals((await t.handler(req("contato", contatoOk))).status, 429);
  assertEquals(t.inseridos.length, 0);
});

Deno.test("denúncia anônima: sem identificação nem hash de IP; e-mail é SÓ aviso, sem relato", async () => {
  const t = montar();
  const relato = "RELATO-SIGILOSO-XYZ";
  const r = await t.handler(req("denuncia", {
    empresa_denunciada: "Loja X", cidade: "Passos", tipos: ["trabalhista", "saude_seguranca"], relato,
    urgencia: "alta", comunicada_autoridade: "nao", identificar: "nao", nome: "Fulano", email: "f@x.com", consentimento: "1",
    evidencias: new File([PDF], "prova.pdf", { type: "application/pdf" }),
  }));
  const j = await r.json();
  assertEquals(r.status, 200); assertEquals(j.protocolo, "DEN-2026-000001");
  const d = t.inseridos[0].dados;
  assertEquals(d.nome, null); assertEquals(d.email, null); assertFalse("origem_ip_hash" in d);
  const m = t.mailer.enviados[0];
  assertEquals(m.para, "juridico@sindcompassos.org");
  assertFalse(m.texto.includes(relato)); assertFalse(m.assunto.includes("Loja X"));
  assertStringIncludes(m.texto, "DEN-2026-000001");
  assertEquals(m.anexos.length, 1); assertEquals(m.anexos[0].nome, "prova.pdf");
});

Deno.test("denúncia identificada guarda nome e hash de IP (nunca o IP)", async () => {
  const t = montar();
  await t.handler(req("denuncia", {
    empresa_denunciada: "Loja X", cidade: "Passos", tipos: "outra", relato: "r", urgencia: "baixa",
    comunicada_autoridade: "sim", identificar: "sim", nome: "Fulano de Tal", consentimento: "1",
  }));
  const d = t.inseridos[0].dados;
  assertEquals(d.nome, "Fulano de Tal");
  assert(typeof d.origem_ip_hash === "string" && !(d.origem_ip_hash as string).includes("203.0.113.7"));
});

Deno.test("currículo: arquivo falso (texto com extensão .pdf) é recusado pelos bytes", async () => {
  const t = montar();
  const base = { nome: "João Silva", telefone: "35988887777", email: "j@x.com", cidade: "Passos", area_interesse: "vendas", consentimento: "1" };
  const falso = await t.handler(req("curriculo", { ...base, anexo: new File(["isto não é pdf"], "cv.pdf") }));
  assertEquals(falso.status, 422); assert((await falso.json()).erros.anexo);
  const sem = await t.handler(req("curriculo", base));
  assertEquals(sem.status, 422);
  const ok = await t.handler(req("curriculo", { ...base, anexo: new File([PDF], "Meu Currículo (final).pdf") }));
  assertEquals(ok.status, 200);
  assertEquals(t.inseridos[0].dados.anexo_nome, "Meu_Curriculo_final.pdf");
});

Deno.test("falha de e-mail COM anexo: 502 e o registro é desfeito; SEM anexo: sucesso e marca 'falhou'", async () => {
  const t = montar(); t.mailer.falhar = true;
  const base = { nome: "João Silva", telefone: "35988887777", email: "j@x.com", cidade: "Passos", area_interesse: "vendas", consentimento: "1" };
  const r = await t.handler(req("curriculo", { ...base, anexo: new File([PDF], "cv.pdf") }));
  assertEquals(r.status, 502); assertEquals(t.removidos, ["site_curriculos:id-1"]);

  const u = montar(); u.mailer.falhar = true;
  const r2 = await u.handler(req("contato", contatoOk));
  assertEquals(r2.status, 200); assertEquals(u.marcas, ["falhou"]); assertEquals(u.removidos.length, 0);
});

Deno.test("detecção de tipo pelos bytes e leitura do formulário de vaga", () => {
  assertEquals(detectarTipo(PDF), "pdf");
  assertEquals(detectarTipo(new Uint8Array([1, 2, 3, 4])), null);
  const fd = new FormData();
  for (const [k, v] of Object.entries({ empresa: "ACME", cnpj: "23.778.277/0001-45", contato_nome: "Ana", telefone: "3535263847", email: "a@acme.com", cargo: "Vendedor", descricao: "d", consentimento: "on" })) fd.set(k, v);
  const { dados, erros } = lerFormulario("vaga", fd);
  assertEquals(erros, {}); assertEquals(dados.cnpj, "23778277000145"); assertEquals(dados.requisitos, null);
});
