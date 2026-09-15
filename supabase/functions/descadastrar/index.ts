// ============================================================================
// Edge Function: descadastrar (ETAPA 09 · Subetapa 9.00)
//
// O CAMINHO DE SAÍDA DA CAMPANHA — e o único lugar onde o motivo dela é
// capturado. Hoje quem clica em "descadastre-se" some dentro da Brevo: o
// Sindcom não fica sabendo nem quem saiu, nem por quê. Aqui o descadastro
// deixa de ser perda e vira sinal (docs/copies_campanha_08_14.md §10).
//
// TRÊS AÇÕES, e a terceira não vem de navegador nenhum:
//   GET  ?token=<uuid>          → quem é este destinatário
//   POST {token, motivo, ...}   → grava o motivo, carimba `descadastrado_em` e
//                                 remove o contato no ESP
//   POST ?fonte=brevo&chave=…   → webhook do ESP: registra o descadastro que
//                                 aconteceu pelo botão de UM CLIQUE, sem motivo
//
// A REGRA QUE GOVERNA ESTE ARQUIVO INTEIRO, E QUE VALE MAIS QUE O DADO
// **O formulário nunca pode virar obstáculo à saída.** Se a gravação do motivo
// falhar por qualquer razão, o descadastro acontece assim mesmo e o erro vai
// para o log. O dado é subproduto; o direito de sair é o ato principal (plano,
// Subetapa 9.00, decisão (b)).
//
// POR QUE EXISTE UM WEBHOOK, E POR QUE ELE NÃO TEM MOTIVO
// Google e Microsoft somam 79,9% da lista e exigem descadastro em UM CLIQUE
// pelo cabeçalho `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058): o
// botão que o Gmail desenha ACIMA do e-mail tem de funcionar sem formulário,
// sem confirmação e sem página intermediária. Esse cabeçalho continua sendo o
// da Brevo — mexer nele para passar pelo nosso formulário é descumprimento, e o
// dano não aparece em teste: aparece semanas depois, como queda de entrega.
// Então o formulário vive só no link do CORPO, e o que sai pelo botão do
// provedor chega aqui DEPOIS, pelo webhook, como `via = 'um_clique'` e sem
// motivo. Cobertura parcial de propósito é melhor que campanha barrada.
//
// service_role só existe DENTRO desta função, pela variável que o Supabase
// injeta em toda Edge Function — nunca no frontend (CLAUDE.md).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Opcionais de propósito: sem eles a função continua registrando o motivo e
// carimbando `descadastrado_em`. O que fica pendente é só a remoção no ESP, e
// ela é retomável — `brevo_removido_em is null` é a fila.
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const WEBHOOK_SEGREDO = Deno.env.get("DESCADASTRO_WEBHOOK_SEGREDO") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Freio reaproveitado de `tentativas_remessa` (sql/21), com motivos próprios
// prefixados. Uma tabela de freio só, porque duas divergem: o freio da recepção
// filtra pelos motivos dele e nunca enxerga os daqui.
const FREIO_LIMITE = 10;
const FREIO_JANELA_MIN = 15;
const MOTIVOS_QUE_FREIAM = [
  "desc_token_inexistente",
  "desc_token_malformado",
];

const MOTIVOS_VALIDOS = [
  "nao_sou_mais_contador",
  "ja_enviei",
  "mensagens_demais",
  "nao_entendi",
  "prefiro_telefone",
  "discordo",
  "outro",
];

const MOTIVO_LIVRE_MAXIMO = 2000;

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

function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}

const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function registrarTentativa(token: string, sucesso: boolean, motivo: string | null, ip: string | null) {
  const { error } = await admin
    .from("tentativas_remessa")
    .insert({ token_alvo: token.slice(0, 200), sucesso, motivo, ip_origem: ip });
  if (error) console.error("tentativas_remessa:", error.message);
}

/**
 * Freio de VARREDURA. Ele vale para os caminhos que NÃO resolvem um envio, e
 * essa fronteira é a decisão (b) da subetapa escrita em código.
 *
 * **Token válido nunca é freado.** Quem tem um envio de verdade está exercendo
 * a saída, e um freio que a travasse seria um obstáculo à saída, ainda que
 * temporário.
 *
 * **Token que não resolve nada É freado, inclusive no POST.** Medido ao atacar
 * o próprio desenho, antes de ir ao ar: o ramo "sem envio resolvido" grava uma
 * linha em `descadastros_campanha` a cada chamada, e sem freio um laço enche a
 * tabela indefinidamente — escrita não autenticada e ilimitada num projeto no
 * plano Free. Frear aqui não custa saída nenhuma: quem não tem token válido não
 * tem envio de que sair.
 */
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
  email: string;
  contabilidade_id: string | null;
  estabelecimento_id: string | null;
  descadastrado_em: string | null;
};

async function buscarEnvio(token: string): Promise<Envio | null> {
  if (!EH_UUID.test(token)) return null;
  const { data, error } = await admin
    .from("envios_campanha")
    .select("id, email, contabilidade_id, estabelecimento_id, descadastrado_em")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("envios_campanha:", error.message);
    return null;
  }
  return (data as Envio | null) ?? null;
}

/**
 * O nome que a página mostra. Mesma exposição que `receber-remessa` já faz —
 * nome da contabilidade ou razão social, que são dado público da Receita.
 * Nada de trabalhador sai daqui, e nada de CPF.
 */
async function nomeDoDestinatario(envio: Envio): Promise<string> {
  if (envio.contabilidade_id) {
    const { data } = await admin
      .from("contabilidades")
      .select("nome")
      .eq("id", envio.contabilidade_id)
      .maybeSingle();
    if (data?.nome) return data.nome as string;
  } else if (envio.estabelecimento_id) {
    const { data } = await admin
      .from("estabelecimentos")
      .select("nome_fantasia, empresas(razao_social)")
      .eq("id", envio.estabelecimento_id)
      .maybeSingle();
    const razao = (data?.empresas as { razao_social?: string } | null)?.razao_social;
    const nome = razao || (data?.nome_fantasia as string | null);
    if (nome) return nome;
  }
  return envio.email;
}

/**
 * Remove o contato no ESP. Devolve o desfecho como DADO, nunca como exceção —
 * porque quem chama já gravou o descadastro e não pode desfazê-lo por causa de
 * uma falha de rede com terceiro.
 *
 * `emailBlacklisted: true` bloqueia o endereço para TODO envio de marketing da
 * conta, não só para esta lista. É o que a pessoa pediu ao clicar em "não quero
 * mais receber estas mensagens" — remover de uma lista e deixá-la em outra seria
 * cumprir a letra e falhar no ato.
 */
async function removerNaBrevo(email: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!BREVO_API_KEY) {
    return { ok: false, erro: "BREVO_API_KEY ausente — remoção pendente no ESP." };
  }
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ emailBlacklisted: true }),
    });
    // 204 é o sucesso da Brevo neste verbo. 404 = contato que nunca existiu na
    // conta: para o nosso fim o desfecho é o mesmo — ele não recebe.
    if (r.status === 204 || r.status === 200) return { ok: true };
    if (r.status === 404) return { ok: true };
    const texto = await r.text(); // nunca .json() num caminho de erro (§7.8)
    return { ok: false, erro: `HTTP ${r.status}: ${texto.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, erro: `falha de rede: ${(e as Error).message}`.slice(0, 300) };
  }
}

type Registro = {
  envioId: string | null;
  tokenInformado: string | null;
  email: string | null;
  via: "formulario" | "um_clique";
  motivo: string | null;
  motivoLivre: string | null;
  ip: string | null;
  userAgent: string | null;
};

/**
 * A ORDEM AQUI É A DECISÃO (c) DA SUBETAPA, e ela não é intercambiável:
 * grava o motivo PRIMEIRO, remove no ESP DEPOIS. Se a chamada ao ESP falhar, o
 * motivo já está guardado e a linha fica na fila de repetição
 * (`brevo_removido_em is null`). A alternativa — deixar o ESP remover antes e
 * redirecionar para cá — inverteria isso: quando o formulário aparecesse, a
 * pessoa já teria saído, e responder viraria opcional na prática.
 */
async function registrarDescadastro(reg: Registro): Promise<{ carimbou: boolean }> {
  const emailAlvo = reg.email;

  // Passo 1 — o motivo. Falha aqui NÃO interrompe: vai para o log e o
  // descadastro segue (decisão (b)).
  const { data: linha, error: erroInsert } = await admin
    .from("descadastros_campanha")
    .insert({
      envio_id: reg.envioId,
      token_informado: reg.tokenInformado?.slice(0, 200) ?? null,
      email: emailAlvo,
      via: reg.via,
      motivo: reg.motivo,
      motivo_livre: reg.motivoLivre,
      ip_origem: reg.ip,
      user_agent: reg.userAgent,
    })
    .select("id")
    .maybeSingle();
  if (erroInsert) {
    console.error("descadastros_campanha (motivo NÃO gravado, saída segue):", erroInsert.message);
  }

  // Passo 2 — o estado atual do envio. Idempotente: o primeiro carimbo manda,
  // porque é ele que datou o pedido. Um segundo clique não reescreve a data.
  let carimbou = false;
  if (reg.envioId) {
    const { data, error } = await admin
      .from("envios_campanha")
      .update({ descadastrado_em: new Date().toISOString() })
      .eq("id", reg.envioId)
      .is("descadastrado_em", null)
      .select("id");
    if (error) console.error("envios_campanha.descadastrado_em:", error.message);
    else carimbou = (data ?? []).length > 0;
  }

  // Passo 3 — o ESP. É o que efetivamente para o e-mail, e é o único passo que
  // depende de terceiro. Por isso é o último, e por isso a falha dele fica
  // registrada em vez de virar erro para quem só queria sair.
  if (emailAlvo) {
    const resultado = await removerNaBrevo(emailAlvo);
    if (linha?.id) {
      await admin
        .from("descadastros_campanha")
        .update(
          resultado.ok
            ? { brevo_removido_em: new Date().toISOString(), brevo_erro: null }
            : { brevo_erro: resultado.erro },
        )
        .eq("id", linha.id as string);
    }
    if (!resultado.ok) console.error("brevo:", resultado.erro);
  }

  return { carimbou };
}

// ---------------------------------------------------------------------------
// REJEIÇÕES (Subetapa 9.2) — o MESMO webhook, agora despachando por tipo.
//
// O QUE ESTAVA ERRADO ATÉ AQUI, e é o que este bloco conserta: o ramo
// `?fonte=brevo` tratava QUALQUER evento como descadastro. Um `delivered` ou um
// `opened` faria a própria entrega do e-mail virar saída da campanha — foi por
// isso que, ao criar o webhook no painel da Brevo, todos os outros eventos
// tiveram de ser desligados um a um. Isso é uma mina: bastava marcar uma caixa
// a mais naquela tela para a base começar a se descadastrar sozinha, sem erro
// nenhum aparecendo em lugar nenhum.
//
// Despachar por tipo desarma a mina E entrega a 9.2 no MESMO endpoint: hard e
// soft bounce passam a poder ser ligados no painel sem criar webhook novo.
// ---------------------------------------------------------------------------

/**
 * De vocabulário de ESP para o tipo que a tela traduz em AÇÃO (sql/31).
 *
 * `invalid_email` entra como `hard` de propósito: a Brevo o emite quando o
 * endereço é inválido, e a ação é a mesma da caixa inexistente — não reenviar
 * nunca, procurar por telefone.
 *
 * `deferred` foi deixado DE FORA. Ele é adiamento com nova tentativa em curso,
 * e a maioria termina entregue; gravá-lo encheria a lista de ligação com gente
 * que recebeu o e-mail meia hora depois. O que sobra de um `deferred` que não
 * se resolve é um `soft_bounce`, e esse nós pegamos.
 */
const TIPO_REJEICAO_POR_EVENTO: Record<string, string> = {
  hard_bounce: "hard",
  invalid_email: "hard",
  soft_bounce: "soft",
  blocked: "bloqueado",
  spam: "spam",
  complaint: "spam",
};

/**
 * Nomes que significam "saia da lista". Generoso de propósito: errar para
 * menos aqui significaria ENGOLIR um descadastro, que é obrigação legal e de
 * entregabilidade — o erro mais caro que esta função pode cometer.
 */
const EVENTOS_DE_DESCADASTRO = ["unsubscribed", "unsubscribe", "unsubscribed_contact"];

/**
 * QUANDO o provedor recusou — não é o `now()` do registro, e a diferença
 * importa: a chave de idempotência (email, tipo, ocorrido_em) inclui o
 * instante, então tomar o campo errado faria a mesma recusa entrar duas vezes
 * se a Brevo repetisse a entrega.
 *
 * `ts_event` é o instante do evento no provedor; `ts`, o do processamento na
 * Brevo. `date` é o último recurso e vem sem fuso — por isso é o último.
 */
function instanteDoEvento(corpo: Record<string, unknown>): string {
  const epoch = corpo.ts_event ?? corpo.ts;
  if (typeof epoch === "number" && Number.isFinite(epoch)) {
    return new Date(epoch * 1000).toISOString();
  }
  const texto = String(corpo.date ?? "").trim();
  if (texto) {
    const d = new Date(texto.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Grava a recusa. Reconhece o envio pelo e-mail — o webhook não traz token —,
 * mas NÃO exige encontrá-lo: um endereço que rejeitou e já não está na base
 * continua sendo informação, e dizer que a lista e a realidade divergiram é
 * justamente para isso que a coluna `situacao` da view existe.
 *
 * `ignoreDuplicates` é a idempotência exigida por qualquer webhook: a Brevo
 * REPETE a entrega quando não recebe 2xx a tempo, e sem isso uma repetição
 * mandaria telefonar duas vezes para a mesma pessoa.
 */
async function registrarRejeicao(ev: {
  email: string;
  tipo: string;
  motivo: string | null;
  ocorridoEm: string;
  campanha: string | null;
}): Promise<{ gravou: boolean }> {
  const { data: envio } = await admin
    .from("envios_campanha")
    .select("id")
    .eq("email", ev.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("rejeicoes_campanha").upsert(
    {
      envio_id: (envio?.id as string | undefined) ?? null,
      email: ev.email,
      tipo: ev.tipo,
      motivo: ev.motivo,
      ocorrido_em: ev.ocorridoEm,
      campanha: ev.campanha,
    },
    { onConflict: "email,tipo,ocorrido_em", ignoreDuplicates: true },
  );
  if (error) {
    console.error("rejeicoes_campanha:", error.message);
    return { gravou: false };
  }
  return { gravou: true };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecalhosCors(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, { ok: false, erro: "Método não permitido" }, 405);
  }

  const url = new URL(req.url);
  const ip = ipDaRequisicao(req);
  const userAgent = req.headers.get("user-agent");

  // ------------------------------------------------------------ webhook do ESP
  //
  // Autenticado por segredo na query, porque quem chama é a Brevo e ela não
  // manda header customizado. Sem o segredo configurado o caminho fica FECHADO
  // — nunca aberto por omissão: um webhook público aceitaria qualquer um
  // descadastrando qualquer e-mail da base.
  //
  // UM endpoint, DOIS tratamentos, despachados pelo campo `event` (9.2). Ver o
  // bloco TIPO_REJEICAO_POR_EVENTO acima para por que o despacho existe.
  if (url.searchParams.get("fonte") === "brevo") {
    if (!WEBHOOK_SEGREDO || url.searchParams.get("chave") !== WEBHOOK_SEGREDO) {
      return json(req, { ok: false, erro: "não autorizado" }, 401);
    }
    if (req.method !== "POST") return json(req, { ok: false, erro: "Método não permitido" }, 405);

    let corpo: Record<string, unknown>;
    try {
      corpo = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(req, { ok: false, erro: "corpo inválido" }, 400);
    }

    const email = String(corpo.email ?? corpo["contact_email"] ?? "").trim().toLowerCase();
    if (!email) return json(req, { ok: false, erro: "sem e-mail" }, 400);

    const evento = String(corpo.event ?? corpo["event_name"] ?? "").trim().toLowerCase();

    // ---- recusa no disparo (9.2)
    const tipoRejeicao = TIPO_REJEICAO_POR_EVENTO[evento];
    if (tipoRejeicao) {
      const { gravou } = await registrarRejeicao({
        email,
        tipo: tipoRejeicao,
        motivo: String(corpo.reason ?? "").trim().slice(0, 1000) || null,
        ocorridoEm: instanteDoEvento(corpo),
        campanha: String(corpo["campaign name"] ?? corpo.campaign ?? corpo.subject ?? "").trim() || null,
      });
      // Rejeição NÃO descadastra. São fatos diferentes: quem rejeitou não pediu
      // para sair — a caixa é que não recebeu. Tratar um como o outro apagaria
      // do painel exatamente as pessoas que precisam ser procuradas por
      // telefone, que é a razão de a 9.2 existir.
      return json(req, { ok: true, tratado: "rejeicao", tipo: tipoRejeicao, gravou });
    }

    // ---- saída da campanha (9.00)
    //
    // `evento` VAZIO cai aqui de propósito. O webhook em produção foi criado com
    // apenas o evento de descadastro ligado, então um corpo sem `event` só pode
    // ser um descadastro — e engolir um descadastro por causa de um campo que
    // mudou de nome é o pior desfecho possível deste arquivo.
    if (evento && !EVENTOS_DE_DESCADASTRO.includes(evento)) {
      // AQUI mora a mina desarmada: antes, este `return` não existia e o evento
      // desconhecido virava descadastro. 200 porque a Brevo repete a entrega
      // quando não recebe 2xx, e repetir o que vamos ignorar gasta os dois
      // lados. O log fica como evidência de que um evento novo apareceu.
      console.log("webhook brevo: evento ignorado —", evento);
      return json(req, { ok: true, tratado: "ignorado", evento });
    }

    // O webhook não traz token: o vínculo se resolve pelo e-mail, que é a chave
    // com que a lista foi montada (uma linha por caixa, 08.13).
    const { data: envios } = await admin
      .from("envios_campanha")
      .select("id, email, contabilidade_id, estabelecimento_id, descadastrado_em")
      .eq("email", email)
      .is("descadastrado_em", null);

    const alvos = (envios ?? []) as Envio[];
    if (alvos.length === 0) {
      // Já descadastrado (o próprio formulário acabou de fazê-lo e a Brevo está
      // ecoando o evento) ou e-mail que não é da campanha. Nos dois casos não há
      // nada a fazer, e responder 200 evita que a Brevo fique repetindo.
      return json(req, { ok: true, registrados: 0 });
    }

    for (const envio of alvos) {
      await registrarDescadastro({
        envioId: envio.id,
        tokenInformado: null,
        email: envio.email,
        via: "um_clique",
        motivo: null, // por construção: o botão do provedor não pergunta nada
        motivoLivre: null,
        ip,
        userAgent,
      });
    }
    return json(req, { ok: true, tratado: "descadastro", registrados: alvos.length });
  }

  // -------------------------------------------------------------------- token
  let token = url.searchParams.get("token")?.trim() ?? "";
  let corpoJson: Record<string, unknown> = {};

  if (req.method === "POST") {
    try {
      corpoJson = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(req, { ok: false, erro: "Envio malformado. Recarregue a página e tente de novo." });
    }
    token = String(corpoJson.token ?? "").trim() || token;
  }

  if (!token) return json(req, { ok: false, erro: "Link inválido." });

  // ------------------------------------------------------------------ consulta
  if (req.method === "GET") {
    if (await estaFreado(token)) {
      return json(req, {
        ok: false,
        erro: `Muitas tentativas com este link. Aguarde ${FREIO_JANELA_MIN} minutos e tente de novo.`,
      });
    }
    const envio = await buscarEnvio(token);
    if (!envio) {
      await registrarTentativa(
        token,
        false,
        EH_UUID.test(token) ? "desc_token_inexistente" : "desc_token_malformado",
        ip,
      );
      // Recusa como RESULTADO, nunca exceção (orientacoes.md §2.18), e genérica:
      // "não existe" e "lixo" respondem igual, para não haver oráculo.
      return json(req, { ok: false, erro: "Link inválido." });
    }
    return json(req, {
      ok: true,
      nome: await nomeDoDestinatario(envio),
      email: envio.email,
      ja_descadastrado: envio.descadastrado_em !== null,
    });
  }

  // --------------------------------------------------------------- descadastro
  //
  // A PARTIR DAQUI NADA RECUSA POR MOTIVO. Token expirado, revogado ou até
  // inexistente NÃO impede a saída (plano, 9.00 — "quem quer sair sai"): o que
  // muda é só o quanto se consegue registrar.
  const envio = await buscarEnvio(token);

  const motivoBruto = String(corpoJson.motivo ?? "").trim();
  const motivo = MOTIVOS_VALIDOS.includes(motivoBruto) ? motivoBruto : null;
  const livreBruto = String(corpoJson.motivo_livre ?? "").trim();
  const motivoLivre = livreBruto ? livreBruto.slice(0, MOTIVO_LIVRE_MAXIMO) : null;

  if (!envio) {
    await registrarTentativa(
      token,
      false,
      EH_UUID.test(token) ? "desc_token_inexistente" : "desc_token_malformado",
      ip,
    );
    // O freio entra AQUI, e não antes: até este ponto ainda podia haver um envio
    // legítimo do outro lado do token. Passado o freio, grava-se assim mesmo,
    // sem vínculo — o pedido de saída existiu, e alguém pode reconciliá-lo pelo
    // `token_informado`. A resposta é a MESMA freado ou não: dizer "você foi
    // freado" seria devolver ao varredor a confirmação de que ele está sendo
    // contado, e assustar sem motivo quem só tem um link velho.
    if (!(await estaFreado(token))) {
      await registrarDescadastro({
        envioId: null,
        tokenInformado: token,
        email: null,
        via: "formulario",
        motivo,
        motivoLivre,
        ip,
        userAgent,
      });
    }
    return json(req, {
      ok: true,
      ja_estava: false,
      mensagem:
        "Registramos o seu pedido. Não conseguimos identificar o envio de origem por este link, " +
        "então, se continuar recebendo, responda a qualquer mensagem ou ligue para (35) 3526-3847.",
    });
  }

  if (envio.descadastrado_em) {
    // Segundo clique. Não é erro, e dizer que é assusta quem só queria conferir.
    return json(req, {
      ok: true,
      ja_estava: true,
      mensagem: "Este endereço já estava descadastrado. Nada mais é necessário.",
    });
  }

  await registrarDescadastro({
    envioId: envio.id,
    tokenInformado: token,
    email: envio.email,
    via: "formulario",
    motivo,
    motivoLivre,
    ip,
    userAgent,
  });
  await registrarTentativa(token, true, "desc_ok", ip);

  return json(req, {
    ok: true,
    ja_estava: false,
    mensagem: "Pronto. Este endereço não receberá mais as mensagens desta campanha.",
  });
});
