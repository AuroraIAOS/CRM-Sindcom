// ============================================================================
// Edge Function: receber-dados-boleto (ETAPA 10 · Controle de Boletos)
//
// A caixa de e-mail recebe UM link permanente (token em `tokens_boleto`), abre
// `/responder/:token` e informa, para cada CNPJ dela, quantos trabalhadores a
// empresa tem e se o CNPJ está correto. É a mesma classe de risco da
// `receber-remessa`: ENDPOINT PÚBLICO, SEM LOGIN, que escreve no banco. As
// decisões abaixo vêm dela.
//
//   GET  ?token=<uuid>                       → os CNPJs da caixa, por ciclo aberto
//   POST {token, respostas:[{boleto_id, quantidade, cnpj_confirmado,
//         cnpj_incorreto_obs?}]}             → grava as respostas
//
// O QUE ELA NUNCA FAZ
//   · Não calcula valor nem muda estado: isso é do trigger `fn_resposta_aplica`
//     (TAF/PAMED = valor-base × quantidade; CA/CN = o operador digita).
//   · Não revela de quem é o boleto que não é da caixa: "não existe" e "é de
//     outra caixa" têm a mesma resposta.
//   · Não devolve exceção como resposta de negócio. Recusa é RESULTADO
//     (`{ok:false}` com HTTP 200).
//   · Não devolve o valor do boleto, o valor-base nem o token de ninguém.
//
// service_role só existe DENTRO desta função (CLAUDE.md).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_RESPOSTAS = 200;
const MAX_OBSERVACAO = 300;
const MAX_QUANTIDADE = 99999;
const MAX_CORPO_BYTES = 128 * 1024;

// Freio: 5 falhas de TOKEN em 15 minutos travam aquele token por 15 minutos.
// Por token, nunca por caixa nem por IP: travar a caixa deixaria um atacante
// silenciar um cliente legítimo só errando token de propósito (lição do
// check-in e da receber-remessa). Só falha de token alimenta o freio; resposta
// com dado ruim não conta, para o cliente legítimo não se trancar para fora.
const FREIO_LIMITE = 5;
const FREIO_JANELA_MIN = 15;
const MOTIVOS_QUE_FREIAM = ["token_inexistente", "token_expirado"];

const MSG_LINK_INVALIDO = "Link inválido. Fale com a secretaria do sindicato para receber um novo.";

const ORIGENS_PERMITIDAS = [
  "https://crm.sindcompassos.org",
  "http://localhost:5173",
  "http://localhost:4173",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function json(req: Request, corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...cabecalhosCors(req) },
  });
}

function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}

async function registrarTentativa(token: string, sucesso: boolean, motivo: string | null, ip: string | null) {
  // Cada chamada é a sua própria transação: o registro persiste mesmo quando a
  // resposta é uma recusa (orientacoes.md §2.18 — o freio que nunca saía de zero).
  const { error } = await admin
    .from("tentativas_boleto")
    .insert({ token_alvo: token.slice(0, 200), sucesso, motivo, ip_origem: ip });
  if (error) console.error("tentativas_boleto:", error.message);
}

/** true quando o token já está travado. Não registra tentativa nova: contar a
 *  própria consulta do freio faria a trava se auto-renovar para sempre. */
async function estaFreado(token: string): Promise<boolean> {
  const desde = new Date(Date.now() - FREIO_JANELA_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from("tentativas_boleto")
    .select("id", { count: "exact", head: true })
    .eq("token_alvo", token.slice(0, 200))
    .eq("sucesso", false)
    .in("motivo", MOTIVOS_QUE_FREIAM)
    .gte("ocorrida_em", desde);
  if (error) {
    console.error("freio:", error.message);
    return false; // falha de leitura do freio não pode virar negação de serviço
  }
  return (count ?? 0) >= FREIO_LIMITE;
}

type Resolucao =
  | { ok: true; caixaId: string }
  | { ok: false; motivo: string };

async function resolverToken(token: string): Promise<Resolucao> {
  // Texto que não é UUID nem chega ao banco: o cast inválido seria caminho de
  // exceção, que é justamente o que não pode existir aqui.
  if (!UUID.test(token)) return { ok: false, motivo: "token_inexistente" };

  const { data, error } = await admin
    .from("tokens_boleto")
    .select("caixa_id, token_expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error) return { ok: false, motivo: "erro_consulta" };
  if (!data) return { ok: false, motivo: "token_inexistente" };
  if (new Date(data.token_expira_em as string).getTime() <= Date.now()) {
    return { ok: false, motivo: "token_expirado" };
  }
  return { ok: true, caixaId: data.caixa_id as string };
}

type LinhaBoleto = {
  id: string;
  ciclo_id: string;
  estado: string;
  quantidade: number | null;
  quantidade_resposta_id: string | null;
  estabelecimentos: {
    cnpj_completo: string;
    nome_fantasia: string | null;
    empresas: { razao_social: string } | { razao_social: string }[] | null;
  } | null;
  ciclos_boleto: {
    id: string;
    nome: string;
    tipo: string;
    referencia: string | null;
    prazo_resposta: string | null;
    encerrado_em: string | null;
  } | null;
};

function razaoSocial(e: LinhaBoleto["estabelecimentos"]): string {
  const emp = e?.empresas;
  const r = Array.isArray(emp) ? emp[0]?.razao_social : emp?.razao_social;
  return r ?? e?.nome_fantasia ?? "";
}

async function consultar(req: Request, caixaId: string) {
  await admin.from("caixas_boleto").update({ ultimo_acesso_em: new Date().toISOString() }).eq("id", caixaId);

  const { data, error } = await admin
    .from("boletos")
    .select(
      "id, ciclo_id, estado, quantidade, quantidade_resposta_id, " +
        "estabelecimentos(cnpj_completo, nome_fantasia, empresas(razao_social)), " +
        "ciclos_boleto!inner(id, nome, tipo, referencia, prazo_resposta, encerrado_em)",
    )
    .eq("caixa_id", caixaId)
    .neq("estado", "cancelado")
    .is("ciclos_boleto.encerrado_em", null)
    .order("created_at");

  if (error) {
    console.error("consulta:", error.message);
    return json(req, { ok: false, erro: "Não foi possível carregar os dados. Tente de novo em alguns minutos." });
  }
  const linhas = (data ?? []) as unknown as LinhaBoleto[];

  const idsResposta = linhas.map((l) => l.quantidade_resposta_id).filter((x): x is string => !!x);
  const respostas = new Map<string, { cnpj_confirmado: boolean; cnpj_incorreto_obs: string | null }>();
  if (idsResposta.length > 0) {
    const { data: rs } = await admin
      .from("respostas_boleto")
      .select("id, cnpj_confirmado, cnpj_incorreto_obs")
      .in("id", idsResposta);
    for (const r of rs ?? []) {
      respostas.set(r.id as string, {
        cnpj_confirmado: r.cnpj_confirmado as boolean,
        cnpj_incorreto_obs: (r.cnpj_incorreto_obs as string | null) ?? null,
      });
    }
  }

  const porCiclo = new Map<string, {
    ciclo_id: string;
    nome: string;
    tipo: string;
    referencia: string | null;
    prazo_resposta: string | null;
    itens: unknown[];
  }>();
  for (const l of linhas) {
    const c = l.ciclos_boleto;
    if (!c) continue;
    if (!porCiclo.has(c.id)) {
      porCiclo.set(c.id, {
        ciclo_id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        referencia: c.referencia,
        prazo_resposta: c.prazo_resposta,
        itens: [],
      });
    }
    const resp = l.quantidade_resposta_id ? respostas.get(l.quantidade_resposta_id) : undefined;
    porCiclo.get(c.id)!.itens.push({
      boleto_id: l.id,
      cnpj: l.estabelecimentos?.cnpj_completo ?? "",
      razao_social: razaoSocial(l.estabelecimentos),
      nome_fantasia: l.estabelecimentos?.nome_fantasia ?? null,
      editavel: l.estado === "aguardando_dados" || l.estado === "fazer",
      quantidade: l.quantidade,
      cnpj_confirmado: resp?.cnpj_confirmado ?? null,
      cnpj_incorreto_obs: resp?.cnpj_incorreto_obs ?? null,
    });
  }

  return json(req, { ok: true, ciclos: [...porCiclo.values()] });
}

type RespostaEntrada = {
  boleto_id: string;
  quantidade: number;
  cnpj_confirmado: boolean;
  cnpj_incorreto_obs: string | null;
};

/** Valida um item; devolve o motivo da recusa em texto que a página pode mostrar. */
function validarItem(bruto: unknown): { ok: true; item: RespostaEntrada } | { ok: false; boletoId: string; motivo: string } {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const boletoId = typeof o.boleto_id === "string" ? o.boleto_id : "";
  if (!UUID.test(boletoId)) return { ok: false, boletoId, motivo: "Item inválido." };

  const q = o.quantidade;
  if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > MAX_QUANTIDADE) {
    return { ok: false, boletoId, motivo: `Informe um número inteiro de trabalhadores entre 0 e ${MAX_QUANTIDADE}.` };
  }
  if (typeof o.cnpj_confirmado !== "boolean") {
    return { ok: false, boletoId, motivo: "Confirme se o CNPJ está correto." };
  }
  let obs: string | null = null;
  if (o.cnpj_incorreto_obs !== undefined && o.cnpj_incorreto_obs !== null) {
    if (typeof o.cnpj_incorreto_obs !== "string") return { ok: false, boletoId, motivo: "Observação inválida." };
    obs = o.cnpj_incorreto_obs.trim() || null;
  }
  if (obs !== null && obs.length > MAX_OBSERVACAO) {
    return { ok: false, boletoId, motivo: `A observação passa de ${MAX_OBSERVACAO} caracteres.` };
  }
  if (!o.cnpj_confirmado && obs === null) {
    return { ok: false, boletoId, motivo: "Diga o que está errado no CNPJ." };
  }
  return {
    ok: true,
    item: { boleto_id: boletoId, quantidade: q, cnpj_confirmado: o.cnpj_confirmado, cnpj_incorreto_obs: o.cnpj_confirmado ? null : obs },
  };
}

async function gravar(req: Request, caixaId: string, bruto: unknown, ip: string | null, userAgent: string | null) {
  const respostas = (bruto as { respostas?: unknown })?.respostas;
  if (!Array.isArray(respostas) || respostas.length === 0) {
    return json(req, { ok: false, erro: "Nenhuma resposta foi enviada." });
  }
  if (respostas.length > MAX_RESPOSTAS) {
    return json(req, { ok: false, erro: `Envie no máximo ${MAX_RESPOSTAS} respostas por vez.` });
  }

  const recusadas: { boleto_id: string; motivo: string }[] = [];
  const validas = new Map<string, RespostaEntrada>(); // por boleto_id: se repetir, vale a última
  for (const r of respostas) {
    const v = validarItem(r);
    if (!v.ok) recusadas.push({ boleto_id: v.boletoId, motivo: v.motivo });
    else validas.set(v.item.boleto_id, v.item);
  }

  // Pertencimento: só boletos DESTA caixa. Não existir e ser de outra caixa
  // dão exatamente a mesma resposta.
  const ids = [...validas.keys()];
  const meus = new Set<string>();
  if (ids.length > 0) {
    const { data, error } = await admin.from("boletos").select("id").eq("caixa_id", caixaId).in("id", ids);
    if (error) {
      console.error("pertencimento:", error.message);
      return json(req, { ok: false, erro: "Não foi possível gravar agora. Tente de novo em alguns minutos." });
    }
    for (const b of data ?? []) meus.add(b.id as string);
  }

  let gravadas = 0;
  // Sequencial de propósito: o trigger decide "a caixa completou?" contando os
  // pendentes, e isso só é certo se uma resposta termina antes da próxima.
  for (const id of ids) {
    if (!meus.has(id)) {
      recusadas.push({ boleto_id: id, motivo: "Este CNPJ não pertence ao seu link." });
      continue;
    }
    const item = validas.get(id)!;
    const { error } = await admin.from("respostas_boleto").insert({
      boleto_id: id,
      quantidade: item.quantidade,
      cnpj_confirmado: item.cnpj_confirmado,
      cnpj_incorreto_obs: item.cnpj_incorreto_obs,
      origem: "link",
      ip_origem: ip,
      user_agent: userAgent,
    });
    if (error) {
      // 22023 = regra de negócio dos triggers (ciclo encerrado, boleto já feito):
      // a mensagem é nossa e pode ir ao usuário. Qualquer outro erro não.
      if (error.code === "22023") recusadas.push({ boleto_id: id, motivo: error.message });
      else {
        console.error("respostas_boleto:", error.code, error.message);
        recusadas.push({ boleto_id: id, motivo: "Não foi possível gravar esta resposta." });
      }
      continue;
    }
    gravadas += 1;
  }

  return json(req, { ok: true, gravadas, recusadas });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecalhosCors(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, { ok: false, erro: "Método não permitido" }, 405);
  }

  const ip = ipDaRequisicao(req);
  const userAgent = req.headers.get("user-agent");

  let token = new URL(req.url).searchParams.get("token") ?? "";
  let corpo: unknown = null;

  if (req.method === "POST") {
    try {
      const texto = await req.text();
      if (texto.length > MAX_CORPO_BYTES) {
        return json(req, { ok: false, erro: "Envio grande demais. Envie em partes." });
      }
      corpo = JSON.parse(texto);
    } catch {
      return json(req, { ok: false, erro: "Envio malformado. Recarregue a página e tente de novo." });
    }
    const t = (corpo as { token?: unknown })?.token;
    if (typeof t === "string" && t.trim()) token = t.trim();
  }

  if (!token) return json(req, { ok: false, erro: MSG_LINK_INVALIDO });

  // O freio vale para as DUAS ações: se valesse só na gravação, adivinhar token
  // pela consulta sairia de graça, e é a consulta que revela os CNPJs.
  if (await estaFreado(token)) {
    return json(req, {
      ok: false,
      erro: `Muitas tentativas com este link. Aguarde ${FREIO_JANELA_MIN} minutos e tente de novo.`,
    });
  }

  const resolucao = await resolverToken(token);
  if (!resolucao.ok) {
    await registrarTentativa(token, false, resolucao.motivo, ip);
    return json(req, { ok: false, erro: MSG_LINK_INVALIDO });
  }

  if (req.method === "GET") return await consultar(req, resolucao.caixaId);

  const resposta = await gravar(req, resolucao.caixaId, corpo, ip, userAgent);
  await registrarTentativa(token, true, null, ip);
  return resposta;
});
