// ============================================================================
// Edge Function: formularios-site (WP 2.0 / 2.2–2.5 do plano do site)
//
// Recebe os formulários PÚBLICOS do site novo (contato, currículo, vaga, denúncia) por
// POST /formularios-site/{formulario}, multipart/form-data. Pública de propósito
// (verify_jwt = false): a proteção está aqui dentro — origem permitida (CORS), honeypot,
// Cloudflare Turnstile, limite de requisições, validação dos campos e dos arquivos pelos
// bytes. Grava com service_role (que só existe dentro da função) e depois avisa por e-mail.
//
// Filiação NÃO passa por aqui: segue na função formulario-filiacao (grava em `trabalhadores`).
// NÃO IMPLANTADA: depende do SQL 35 e dos secrets (README.md).
// ============================================================================
import { cabecalhosCors, origemPermitida, origensPermitidas } from "./cors.ts";
import { type ArquivoValidado, type TipoArquivo, validarArquivos } from "./arquivos.ts";
import { FORMULARIOS, type Formulario, lerFormulario } from "./esquemas.ts";
import { montarMensagem } from "./aviso.ts";
import { configSmtp, type Mailer, MailerSmtp } from "./mailer.ts";

export interface Banco {
  inserir(tabela: string, dados: Record<string, unknown>): Promise<{ id: string; protocolo?: string }>;
  marcarEmail(tabela: string, id: string, status: "enviado" | "falhou", erro?: string): Promise<void>;
  remover(tabela: string, id: string): Promise<void>;
  limite(tipo: string, chaveHash: string, janela: string, maximo: number): Promise<boolean>;
}

export interface Deps {
  env: (k: string) => string | undefined;
  banco: Banco;
  mailer: Mailer;
  verificarTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  agora: () => Date;
}

const TABELAS: Record<Formulario, string> = {
  contato: "site_contatos", curriculo: "site_curriculos", vaga: "site_vagas", denuncia: "site_denuncias",
};
const ARQUIVOS: Partial<Record<Formulario, { campo: string; permitidos: TipoArquivo[]; max: number; obrigatorio: boolean }>> = {
  curriculo: { campo: "anexo", permitidos: ["pdf", "doc", "docx"], max: 1, obrigatorio: true },
  denuncia: { campo: "evidencias", permitidos: ["pdf", "jpg", "png", "mp4"], max: 5, obrigatorio: false },
};
const LIMITE_POR_HORA: Record<Formulario, number> = { contato: 5, curriculo: 5, vaga: 5, denuncia: 3 };
const TAMANHO_MAXIMO_CORPO = 26 * 1024 * 1024;

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function criarHandler(d: Deps) {
  const permitidas = origensPermitidas(d.env);

  return async (req: Request): Promise<Response> => {
    const origem = req.headers.get("origin");
    const cors = cabecalhosCors(origem, permitidas);
    const json = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

    if (req.method === "OPTIONS") return new Response(null, { status: origemPermitida(origem, permitidas) ? 204 : 403, headers: cors });
    if (!origemPermitida(origem, permitidas)) return json({ ok: false, mensagem: "Origem não permitida." }, 403);
    if (req.method !== "POST") return json({ ok: false, mensagem: "Método não permitido." }, 405);

    const form = new URL(req.url).pathname.split("/").filter(Boolean).pop() as Formulario;
    if (!FORMULARIOS.includes(form)) return json({ ok: false, mensagem: "Formulário desconhecido." }, 404);
    if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_CORPO) {
      return json({ ok: false, mensagem: "O envio é grande demais. Reduza o tamanho dos arquivos." }, 413);
    }

    let fd: FormData;
    try { fd = await req.formData(); } catch { return json({ ok: false, mensagem: "Envio inválido." }, 400); }

    // Honeypot: robô preenche; finge sucesso e não grava nada.
    if (typeof fd.get("_hp") === "string" && (fd.get("_hp") as string).trim() !== "") return json({ ok: true });

    const anonima = form === "denuncia" && fd.get("identificar") !== "sim";
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

    // Turnstile. Sem o secret a função recusa tudo (falha fechada), em vez de aceitar sem proteção.
    if (!d.env("TURNSTILE_SECRET")) return json({ ok: false, mensagem: "Serviço indisponível no momento." }, 503);
    const token = fd.get("cf-turnstile-response");
    if (typeof token !== "string" || !(await d.verificarTurnstile(token, anonima ? null : ip))) {
      return json({ ok: false, mensagem: "Não conseguimos confirmar que você é uma pessoa. Recarregue a página e tente de novo." }, 400);
    }

    // Limite por hora. Chave = hash(IP + sal). Anônima: sal que muda todo dia e nada é gravado na denúncia.
    const sal = d.env("SITE_SAL") ?? "";
    const dia = d.agora().toISOString().slice(0, 10);
    const chave = await sha256(`${ip ?? "sem-ip"}|${sal}${anonima ? "|" + dia : ""}`);
    if (!(await d.banco.limite(form, chave, "1 hour", LIMITE_POR_HORA[form]))) {
      return json({ ok: false, mensagem: "Muitos envios em pouco tempo. Tente de novo mais tarde." }, 429);
    }

    // Campos
    const { dados, erros } = lerFormulario(form, fd);

    // Arquivos
    let anexos: ArquivoValidado[] = [];
    const regra = ARQUIVOS[form];
    if (regra) {
      const files = fd.getAll(regra.campo).filter((v): v is File => v instanceof File);
      const r = await validarArquivos(files, { permitidos: regra.permitidos, max: regra.max });
      if (r.erro) erros[regra.campo] = r.erro;
      else if (regra.obrigatorio && !r.arquivos.length) erros[regra.campo] = "Escolha um arquivo.";
      else anexos = r.arquivos;
    }
    if (Object.keys(erros).length) {
      return json({ ok: false, erros, mensagem: "Confira os campos destacados." }, 422);
    }

    if (form === "curriculo" && anexos[0]) {
      dados.anexo_nome = anexos[0].nome; dados.anexo_tamanho = anexos[0].conteudo.length;
    }
    if (form === "denuncia") dados.anexos_nomes = anexos.map((a) => a.nome);
    // Hash de IP só em envio identificado (a anônima não guarda nada derivado do IP; o CHECK do banco garante).
    if (!anonima && ip) dados.origem_ip_hash = await sha256(`${ip}|${sal}|reg`);

    let gravado: { id: string; protocolo?: string };
    try { gravado = await d.banco.inserir(TABELAS[form], dados); } catch {
      return json({ ok: false, mensagem: "Não foi possível registrar agora. Tente de novo em instantes." }, 500);
    }

    // E-mail. Com anexo, o arquivo só existe no e-mail: se falhar, desfaz o registro (evita duplicata no reenvio).
    const destinos = { contato: d.env("SITE_EMAIL_CONTATO") ?? "contato@sindcompassos.org", juridico: d.env("SITE_EMAIL_JURIDICO") ?? "juridico@sindcompassos.org" };
    const msg = montarMensagem(form, dados, { protocolo: gravado.protocolo, anexos: anexos.length, destinos, quando: d.agora() });
    try {
      await d.mailer.enviar({ ...msg, anexos: anexos.map((a) => ({ nome: a.nome, contentType: a.contentType, conteudo: a.conteudo })) });
      await d.banco.marcarEmail(TABELAS[form], gravado.id, "enviado");
    } catch (e) {
      if (anexos.length) {
        await d.banco.remover(TABELAS[form], gravado.id).catch(() => {});
        return json({ ok: false, mensagem: "Não foi possível enviar agora. Seus dados continuam na tela; tente de novo em instantes." }, 502);
      }
      await d.banco.marcarEmail(TABELAS[form], gravado.id, "falhou", (e instanceof Error ? e.message : "erro").slice(0, 200)).catch(() => {});
    }
    return json({ ok: true, ...(gravado.protocolo ? { protocolo: gravado.protocolo } : {}) });
  };
}

// ---- Execução real (fora dos testes) ---------------------------------------
if (import.meta.main) {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const env = (k: string) => Deno.env.get(k);
  const sb = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);
  const cfg = configSmtp(env);

  const banco: Banco = {
    async inserir(tabela, dados) {
      const { data, error } = await sb.from(tabela).insert(dados).select(tabela === "site_denuncias" ? "id,protocolo" : "id").single();
      if (error) throw error;
      return data as { id: string; protocolo?: string };
    },
    async marcarEmail(tabela, id, status, erro) {
      await sb.from(tabela).update({ email_status: status, email_erro: erro ?? null }).eq("id", id);
    },
    async remover(tabela, id) { await sb.from(tabela).delete().eq("id", id); },
    async limite(tipo, chave, janela, maximo) {
      const { data, error } = await sb.rpc("fn_site_limite", { p_tipo: tipo, p_chave_hash: chave, p_janela: janela, p_maximo: maximo });
      if (error) throw error;
      return data === true;
    },
  };

  const mailer: Mailer = cfg
    ? new MailerSmtp(cfg)
    : { enviar: () => Promise.reject(new Error("SMTP não configurado")) };

  const handler = criarHandler({
    env, banco, mailer, agora: () => new Date(),
    async verificarTurnstile(token, ip) {
      const corpo = new URLSearchParams({ secret: env("TURNSTILE_SECRET")!, response: token });
      if (ip) corpo.set("remoteip", ip);
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo });
      const j = await r.json().catch(() => ({}));
      return j.success === true;
    },
  });
  Deno.serve(handler);
}
