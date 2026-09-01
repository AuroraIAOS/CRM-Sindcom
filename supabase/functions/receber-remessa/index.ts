// ============================================================================
// Edge Function: receber-remessa (ETAPA 08 · Subetapa 08.5)
//
// O CANAL DE RETORNO DA CAMPANHA. O contador recebe um link com token, abre
// `/enviar-dados/:token`, e manda a planilha do quadro de empregados dele.
//
// Este é um ENDPOINT PÚBLICO, SEM LOGIN, QUE RECEBE DADO PESSOAL — mesma classe
// de risco do check-in por QR da 02.2, e é dela que vêm as decisões abaixo.
//
// DUAS AÇÕES, e as duas passam pelo mesmo freio:
//   GET  ?token=<uuid>   → quem é este contador e quais empresas são dele
//   POST multipart       → recebe a planilha, guarda no bucket privado e cria
//                          a linha em `remessas_dados`
//
// O QUE ELA NUNCA FAZ
//   · Não escreve UMA LINHA em `trabalhadores` nem em `vinculos_empregaticios`.
//     Remessa vira cadastro só na 08.10, por clique da Denise. É a garantia
//     central da etapa, e está aqui como ausência deliberada de código.
//   · Não devolve exceção como resposta de negócio. Recusa é RESULTADO
//     (`{ok:false}` com HTTP 200) — ver o bloco do freio abaixo.
//   · Não deixa ninguém LISTAR nem LER o bucket. Quem abre o link só envia.
//
// service_role só existe DENTRO desta função, pela variável que o Supabase
// injeta em toda Edge Function — nunca no frontend (CLAUDE.md).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "remessas";
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB — o Storage também impõe (sql/21)
const RELATORIO_MAXIMO = 256 * 1024;

// Freio: 5 falhas de TOKEN em 15 minutos travam aquele token por 15 minutos.
// POR TOKEN, NUNCA POR CONTABILIDADE — travar a contabilidade deixaria um
// atacante silenciar um contador legítimo só errando token de propósito, que é
// a mesma lição do freio do check-in.
const FREIO_LIMITE = 5;
const FREIO_JANELA_MIN = 15;

// Só falha de TOKEN alimenta o freio. Planilha no formato errado NÃO conta: o
// freio existe para encarecer adivinhação de token, e um contador legítimo
// tentando três vezes com o `.csv` que o sistema contábil dele exportou não
// pode se trancar para fora do próprio link.
const MOTIVOS_QUE_FREIAM = ["token_inexistente", "token_expirado", "token_revogado"];

const ORIGENS_PERMITIDAS = [
  "https://crm.sindcompassos.org",
  "http://localhost:5173",
  "http://localhost:4173",
];

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

/** IP de quem chamou, para o rastro exigido pela spec §6. */
function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}

async function registrarTentativa(
  token: string,
  sucesso: boolean,
  motivo: string | null,
  ip: string | null,
) {
  // Sem `await` em transação nenhuma e sem exceção no caminho: cada chamada é
  // sua própria transação, então o registro PERSISTE mesmo quando a resposta é
  // uma recusa. Foi exatamente isso que a 1ª correção do freio do check-in não
  // teve — `RAISE EXCEPTION` levava o INSERT do contador junto no rollback, e o
  // freio nunca saía de zero (orientacoes.md §2.18).
  const { error } = await admin
    .from("tentativas_remessa")
    .insert({ token_alvo: token.slice(0, 200), sucesso, motivo, ip_origem: ip });
  if (error) console.error("tentativas_remessa:", error.message);
}

/** true quando o token já está travado. Não registra nova tentativa: contar a
 *  própria consulta do freio faria a trava se auto-renovar para sempre. */
async function estaFreado(token: string): Promise<boolean> {
  const desde = new Date(Date.now() - FREIO_JANELA_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from("tentativas_remessa")
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

type Envio = {
  id: string;
  token_expira_em: string;
  token_revogado_em: string | null;
  contabilidade_id: string | null;
  estabelecimento_id: string | null;
  email: string;
  primeira_remessa_em: string | null;
};

type Resolucao =
  | { ok: true; envio: Envio }
  | { ok: false; motivo: string; erro: string };

/** Resolve o token e devolve o motivo da recusa como DADO, nunca como exceção. */
async function resolverToken(token: string): Promise<Resolucao> {
  // Um token que não é UUID nem chega ao banco: o `eq` com texto inválido daria
  // erro de cast, e erro de cast é caminho de exceção — que é justamente o que
  // não pode existir aqui.
  const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (!ehUuid) {
    return { ok: false, motivo: "token_inexistente", erro: "Link inválido." };
  }

  const { data, error } = await admin
    .from("envios_campanha")
    .select("id, token_expira_em, token_revogado_em, contabilidade_id, estabelecimento_id, email, primeira_remessa_em")
    .eq("token", token)
    .maybeSingle();

  if (error) return { ok: false, motivo: "erro_consulta", erro: "Falha ao validar o link." };
  if (!data) return { ok: false, motivo: "token_inexistente", erro: "Link inválido." };

  if (data.token_revogado_em !== null) {
    return {
      ok: false,
      motivo: "token_revogado",
      erro: "Este link foi cancelado pelo sindicato. Fale com a secretaria para receber um novo.",
    };
  }
  if (new Date(data.token_expira_em as string).getTime() <= Date.now()) {
    return {
      ok: false,
      motivo: "token_expirado",
      erro: "Este link expirou. Fale com a secretaria para receber um novo.",
    };
  }
  return { ok: true, envio: data as Envio };
}

/** Procura uma sequência de bytes dentro de outra, sem alocar string. */
function contemBytes(alvo: Uint8Array, agulha: Uint8Array): boolean {
  const limite = alvo.length - agulha.length;
  for (let i = 0; i <= limite; i += 1) {
    let bate = true;
    for (let j = 0; j < agulha.length; j += 1) {
      if (alvo[i + j] !== agulha[j]) {
        bate = false;
        break;
      }
    }
    if (bate) return true;
  }
  return false;
}

const MARCA_CONTENT_TYPES = new TextEncoder().encode("[Content_Types].xml");

/**
 * Valida o arquivo POR CONTEÚDO, não por extensão (D6).
 *
 * Um `.csv` renomeado para `.xlsx` passa em qualquer checagem de nome — e o
 * navegador ainda por cima manda o content-type que quiserem dizer a ele. A
 * única coisa que não se falsifica de graça são os bytes:
 *   · `.xlsx` é um ZIP → assinatura `50 4B 03 04` ("PK\x03\x04");
 *   · e um ZIP genérico não é planilha, então exige-se também a entrada
 *     `[Content_Types].xml`, que só existe em pacote OOXML.
 *
 * SÓ `.xlsx`, e isso é um ESTREITAMENTO CONSCIENTE da D6 (que diz ".xls/.xlsx"):
 * o `.xls` legado é OLE2, e a biblioteca decidida para o projeto (`exceljs`) não
 * o lê. Aceitar `.xls` criaria remessa que a 08.10 não conseguiria abrir — falha
 * descoberta só na hora da revisão, com o contador achando que já enviou. Quem
 * mandar `.xls` recebe instrução de salvar como `.xlsx`, que é duas teclas no
 * próprio Excel.
 */
function validarPlanilha(nome: string, bytes: Uint8Array): { ok: true } | { ok: false; erro: string } {
  if (bytes.length === 0) return { ok: false, erro: "O arquivo enviado está vazio." };
  if (bytes.length > TAMANHO_MAXIMO) {
    return { ok: false, erro: "O arquivo passa de 5 MB. Envie em partes — o link aceita quantos envios você precisar." };
  }
  if (!nome.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      erro: "Envie a planilha em .xlsx. No Excel: Arquivo → Salvar como → Pasta de Trabalho do Excel (.xlsx).",
    };
  }
  const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!ehZip || !contemBytes(bytes, MARCA_CONTENT_TYPES)) {
    return {
      ok: false,
      erro: "O arquivo tem nome .xlsx, mas o conteúdo não é uma planilha do Excel. Se exportou em CSV, reabra no Excel e salve como .xlsx.",
    };
  }
  return { ok: true };
}

/** Dados que a página do token mostra: quem é o contador e a carteira dele.
 *
 *  Devolver a carteira é decisão da spec, não conveniência: o §7 exige o modelo
 *  pré-preenchido com as empresas dele — é o que elimina o erro mais provável,
 *  CNPJ digitado errado — e o §5.5 conta explicitamente com o contador
 *  repassando o link para a equipe do escritório dividir os clientes. Nada de
 *  trabalhador sai daqui: CNPJ e razão social são dado público da RFB. */
async function montarContexto(envio: Envio) {
  let nome = envio.email;
  let ids: string[] = [];

  if (envio.contabilidade_id) {
    const { data: contab } = await admin
      .from("contabilidades")
      .select("nome")
      .eq("id", envio.contabilidade_id)
      .maybeSingle();
    if (contab?.nome) nome = contab.nome as string;

    const { data: vinculos } = await admin
      .from("contabilidade_estabelecimentos")
      .select("estabelecimento_id")
      .eq("contabilidade_id", envio.contabilidade_id);
    ids = (vinculos ?? []).map((v) => v.estabelecimento_id as string);
  } else if (envio.estabelecimento_id) {
    ids = [envio.estabelecimento_id];
  }

  if (ids.length === 0) return { nome, estabelecimentos: [] };

  const { data: estabs } = await admin
    .from("estabelecimentos")
    .select("id, cnpj_completo, nome_fantasia, empresas(razao_social)")
    .in("id", ids)
    .order("cnpj_completo");

  // "Já coberto" = já tem trabalhador vinculado. É o que faz a 2ª visita mostrar
  // ao contador o que ainda falta, em vez de pedir tudo de novo (spec §7).
  const { data: comTrabalhador } = await admin
    .from("vinculos_empregaticios")
    .select("estabelecimento_id")
    .in("estabelecimento_id", ids);
  const cobertos = new Set((comTrabalhador ?? []).map((v) => v.estabelecimento_id as string));

  return {
    nome,
    estabelecimentos: (estabs ?? []).map((e) => ({
      cnpj: e.cnpj_completo as string,
      razao_social:
        (e.empresas as { razao_social?: string } | null)?.razao_social ?? (e.nome_fantasia as string) ?? "",
      nome_fantasia: (e.nome_fantasia as string) ?? null,
      ja_coberto: cobertos.has(e.id as string),
    })),
  };
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

  // -------------------------------------------------------------- token
  let token = new URL(req.url).searchParams.get("token") ?? "";
  let formulario: FormData | null = null;

  if (req.method === "POST") {
    try {
      formulario = await req.formData();
    } catch {
      return json(req, { ok: false, erro: "Envio malformado. Recarregue a página e tente de novo." });
    }
    token = (formulario.get("token") as string | null)?.trim() || token;
  }

  if (!token) return json(req, { ok: false, erro: "Link inválido." });

  // O freio vale para as DUAS ações. Se valesse só no upload, adivinhar token
  // pela consulta sairia de graça — e é a consulta que revela a carteira.
  if (await estaFreado(token)) {
    return json(req, {
      ok: false,
      erro: `Muitas tentativas com este link. Aguarde ${FREIO_JANELA_MIN} minutos e tente de novo.`,
    });
  }

  const resolucao = await resolverToken(token);
  if (!resolucao.ok) {
    await registrarTentativa(token, false, resolucao.motivo, ip);
    return json(req, { ok: false, erro: resolucao.erro });
  }
  const { envio } = resolucao;

  // -------------------------------------------------------------- consulta
  if (req.method === "GET") {
    const contexto = await montarContexto(envio);
    return json(req, { ok: true, ...contexto });
  }

  // -------------------------------------------------------------- recepção
  const arquivo = formulario!.get("arquivo");
  if (!(arquivo instanceof File)) {
    await registrarTentativa(token, false, "arquivo_ausente", ip);
    return json(req, { ok: false, erro: "Nenhum arquivo foi anexado." });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const valido = validarPlanilha(arquivo.name, bytes);
  if (!valido.ok) {
    await registrarTentativa(token, false, "arquivo_invalido", ip);
    return json(req, { ok: false, erro: valido.erro });
  }

  const { data: modelo } = await admin
    .from("modelos_coleta")
    .select("id")
    .eq("ativo", true)
    .eq("destino", "trabalhadores")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!modelo) {
    console.error("Nenhum modelo_coleta ativo — configuração do servidor.");
    return json(req, { ok: false, erro: "Recepção indisponível no momento. Avise a secretaria." });
  }

  const caminho = `${envio.id}/${Date.now()}-${crypto.randomUUID()}.xlsx`;
  const { error: erroUpload } = await admin.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (erroUpload) {
    console.error("upload:", erroUpload.message);
    await registrarTentativa(token, false, "falha_upload", ip);
    return json(req, { ok: false, erro: "Não foi possível guardar o arquivo. Tente de novo em alguns minutos." });
  }

  // Números e relatório vêm da validação feita NO NAVEGADOR do contador
  // (08.6). São DECLARADOS, não verificados aqui — a conferência que vale é a
  // da Denise na 08.10, olhando a planilha. Por isso ficam em `relatorio` com
  // a origem marcada, e não viram fato.
  const numero = (campo: string): number | null => {
    const bruto = formulario!.get(campo);
    if (typeof bruto !== "string" || bruto.trim() === "") return null;
    const n = Number.parseInt(bruto, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const linhasRecebidas = numero("linhas_recebidas");
  const linhasComErro = numero("linhas_com_erro");

  let relatorio: unknown = null;
  const relatorioBruto = formulario!.get("relatorio");
  if (typeof relatorioBruto === "string" && relatorioBruto.length > 0) {
    if (relatorioBruto.length > RELATORIO_MAXIMO) {
      relatorio = { origem: "navegador", aviso: "relatório descartado por tamanho" };
    } else {
      try {
        relatorio = { origem: "navegador", detalhe: JSON.parse(relatorioBruto) };
      } catch {
        relatorio = { origem: "navegador", aviso: "relatório não era JSON válido" };
      }
    }
  }

  const status = linhasRecebidas !== null && linhasRecebidas > 0 && linhasComErro === 0
    ? "validada"
    : "recebida";

  const { data: remessa, error: erroRemessa } = await admin
    .from("remessas_dados")
    .insert({
      envio_id: envio.id,
      modelo_coleta_id: modelo.id,
      arquivo_path: caminho,
      status,
      linhas_recebidas: linhasRecebidas,
      linhas_com_erro: linhasComErro,
      relatorio,
      ip_origem: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (erroRemessa) {
    // O objeto já subiu; sem a linha ele seria órfão no bucket.
    await admin.storage.from(BUCKET).remove([caminho]);
    console.error("remessas_dados:", erroRemessa.message);
    await registrarTentativa(token, false, "falha_registro", ip);
    return json(req, { ok: false, erro: "Não foi possível registrar o envio. Tente de novo." });
  }

  // `primeira_remessa_em` só é carimbado uma vez — é ele que, junto do
  // `ultima_remessa_em`, registra o RITMO do contador (spec §5.5). Sobrescrever
  // a cada envio apagaria justamente a informação de quando ele começou.
  const agora = new Date().toISOString();
  await admin
    .from("envios_campanha")
    .update(
      envio.primeira_remessa_em
        ? { ultima_remessa_em: agora }
        : { ultima_remessa_em: agora, primeira_remessa_em: agora },
    )
    .eq("id", envio.id);

  await registrarTentativa(token, true, null, ip);

  return json(req, {
    ok: true,
    remessa_id: remessa.id,
    status,
    mensagem:
      "Recebemos sua planilha. O sindicato vai conferir antes de cadastrar. " +
      "Você pode usar este mesmo link quantas vezes quiser, com quantas empresas conseguir por vez.",
  });
});
