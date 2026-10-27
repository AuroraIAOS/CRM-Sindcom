/**
 * `brevo-campanhas` — os KPIs das campanhas da Brevo, para o painel do CRM
 * (ETAPA 09 · Subetapa 9.2).
 *
 * POR QUE ESTA FUNÇÃO EXISTE, E NÃO UM `fetch` DIRETO DA TELA
 * A `BREVO_API_KEY` é chave de CONTA INTEIRA: com ela se lê a base de
 * contatos, se dispara campanha e se apaga lista. Qualquer chave que o
 * navegador precise conhecer é chave pública — o `VITE_` do Vite deixa isso
 * literal (orientacoes.md §6.1), mas o problema não é o prefixo: é que o
 * bundle roda na máquina de quem abriu a página. Então a chave fica aqui, no
 * servidor, e o navegador recebe apenas números agregados.
 *
 * A DIFERENÇA PARA AS OUTRAS TRÊS FUNÇÕES DESTE PROJETO
 * `receber-remessa`, `formulario-filiacao` e `descadastrar` são PÚBLICAS e
 * sobem com `verify_jwt: false`, porque quem as chama não tem sessão — a
 * credencial delas é o token no corpo/URL (orientacoes.md §2.27). Esta é o
 * oposto: só usuário logado do CRM chama, então ela sobe com
 * **`verify_jwt: true`** e o gateway barra quem não tem JWT.
 *
 * MAS O GATEWAY NÃO BASTA, e é aqui que estaria o furo se ninguém olhasse:
 * `verify_jwt` só prova que existe um JWT válido — QUALQUER usuário do
 * projeto passa, inclusive o papel `parceiro`, que não tem nada a ver com
 * campanha. A autorização de verdade é a checagem de papel abaixo, feita com
 * o JWT DO CHAMADOR (nunca com `service_role`): o próprio Postgres, pela RLS
 * de `perfis`, só deixa a pessoa ler a própria linha. Se a RLS mudar um dia,
 * esta função muda junto, sem precisar ser reescrita.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

/** Papéis que enxergam a campanha — o mesmo recorte de `pol_descadastros_select`. */
const PAPEIS_PERMITIDOS = ["admin", "presidente", "secretaria"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type EstatisticaBrevo = {
  sent?: number;
  delivered?: number;
  hardBounces?: number;
  softBounces?: number;
  complaints?: number;
  unsubscriptions?: number;
  viewed?: number;
  uniqueViews?: number;
  clickers?: number;
  uniqueClicks?: number;
};

type CampanhaBrevo = {
  id: number;
  name: string;
  subject?: string;
  status?: string;
  sentDate?: string | null;
  scheduledAt?: string | null;
  statistics?: { globalStats?: EstatisticaBrevo };
};

/**
 * Descobre o papel de quem chamou, usando o JWT dele.
 *
 * Devolve `null` quando não há sessão utilizável. Note que NÃO usamos
 * `service_role` em nenhum ponto desta função: ela não escreve nada e não
 * precisa ver nada além do que o próprio usuário já veria.
 */
function subDoJwt(authorization: string): string | null {
  // O gateway (`verify_jwt: true`) JÁ validou assinatura e expiração antes de
  // esta função rodar — aqui só lemos o `sub` para montar o filtro. E, mesmo
  // que alguém forjasse um `sub`, a consulta abaixo continua correndo sob a RLS
  // com o JWT verificado: pedir a linha de outra pessoa devolve vazio.
  try {
    const parte = authorization.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

async function papelDoChamador(authorization: string | null): Promise<string | null> {
  if (!authorization) return null;
  const sub = subDoJwt(authorization);
  if (!sub) return null;

  // Filtrar por `id` em vez de contar linhas: a RLS de `perfis` devolve só a
  // própria linha para a maioria dos papéis, mas devolve TODAS para o Admin —
  // e deduzir papel pela quantidade de linhas seria uma regra que quebra em
  // silêncio no dia em que a policy mudar.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/perfis?select=role,ativo&id=eq.${encodeURIComponent(sub)}`,
    { headers: { apikey: ANON_KEY, Authorization: authorization } },
  );
  if (!r.ok) return null;
  const linhas = (await r.json()) as Array<{ role: string; ativo: boolean }>;
  if (linhas.length !== 1) return null;
  return linhas[0].ativo ? linhas[0].role : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const papel = await papelDoChamador(req.headers.get("Authorization"));
  if (!papel || !PAPEIS_PERMITIDOS.includes(papel)) {
    // 403 e não 401: o gateway já garantiu que há JWT. Quem chega aqui está
    // logado — só não é do time da campanha.
    return json({ ok: false, erro: "Sem permissão para ler os dados da campanha." }, 403);
  }

  if (!BREVO_API_KEY) {
    return json({
      ok: false,
      erro:
        "BREVO_API_KEY ausente nos secrets desta função. Configure em Edge Functions → brevo-campanhas → Secrets.",
      configuravel: true,
    });
  }

  const url = new URL(req.url);
  const limite = Math.min(Number(url.searchParams.get("limite") ?? 50), 100);

  try {
    const r = await fetch(
      `https://api.brevo.com/v3/emailCampaigns?limit=${limite}&offset=0&sort=desc&statistics=globalStats`,
      { headers: { "api-key": BREVO_API_KEY, accept: "application/json" } },
    );

    if (!r.ok) {
      const corpo = await r.text();
      // A mensagem da Brevo entra INTEIRA (truncada) de propósito: 401 de chave
      // inválida e 403 de chave sem escopo são coisas diferentes, e a tela
      // precisa dizer qual das duas é — senão o suporte vira adivinhação.
      return json({
        ok: false,
        erro: `A Brevo recusou a consulta (HTTP ${r.status}).`,
        detalhe: corpo.slice(0, 400),
        configuravel: r.status === 401 || r.status === 403,
      });
    }

    const dados = (await r.json()) as { count?: number; campaigns?: CampanhaBrevo[] };
    const campanhas = (dados.campaigns ?? []).map((c) => {
      const s = c.statistics?.globalStats ?? {};
      const entregues = s.delivered ?? 0;
      return {
        id: c.id,
        nome: c.name,
        assunto: c.subject ?? null,
        status: c.status ?? null,
        enviadaEm: c.sentDate ?? c.scheduledAt ?? null,
        enviados: s.sent ?? 0,
        entregues,
        aberturasUnicas: s.uniqueViews ?? 0,
        aberturas: s.viewed ?? 0,
        // OS DOIS CONTADORES DE CLIQUE DA BREVO SÃO DE EVENTO, NÃO DE PESSOA —
        // e isso foi MEDIDO, não lido na documentação. Na Trilha A da Onda 00,
        // com **2 entregues**, a Brevo devolveu `uniqueClicks: 10` e
        // `clickers: 20`. Os dois são muito maiores que o número de
        // destinatários, então nenhum deles responde "quantas pessoas
        // clicaram". Por isso a tela mostra clique como CONTAGEM ABSOLUTA e
        // não como percentual de entregues: qualquer taxa aqui passaria de
        // 100% e pareceria defeito.
        //
        // A abertura é diferente: `uniqueViews` veio 2 para 2 entregues, ou
        // seja, ali o "único" é por pessoa e a taxa faz sentido.
        cliquesUnicos: s.clickers ?? 0,
        cliques: s.uniqueClicks ?? 0,
        rejeicoesDuras: s.hardBounces ?? 0,
        rejeicoesLeves: s.softBounces ?? 0,
        spam: s.complaints ?? 0,
        descadastros: s.unsubscriptions ?? 0,
        // O bruto segue junto porque foi ele que resolveu a ambiguidade acima —
        // e continuará resolvendo a próxima. A tela lê o clique daqui.
        bruto: s,
      };
    });

    return json({ ok: true, total: dados.count ?? campanhas.length, campanhas });
  } catch (e) {
    return json({ ok: false, erro: `Falha ao falar com a Brevo: ${(e as Error).message}` });
  }
});
