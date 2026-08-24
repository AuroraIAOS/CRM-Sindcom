import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Autentica os cinco papéis UMA VEZ por execução — ETAPA 07
 * =========================================================
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * `helpers.loginComo()` sempre criou uma sessão nova por chamada, e o Vitest dá
 * a cada arquivo de teste um registro de módulos próprio — então nenhum cache em
 * memória atravessa a fronteira entre arquivos. Com 13 arquivos de teste × até 5
 * papéis, a suíte chega a fazer dezenas de `signInWithPassword` em poucos
 * segundos, acima do teto do endpoint de token do Supabase.
 *
 * O sintoma não parece rate limit: sem token, o cliente cai para anônimo e a RLS
 * nega tudo, o que aparece nas asserções como "conjunto vazio onde deveria haver
 * linha" — exatamente o que uma RLS quebrada produz. É um falso vermelho que
 * manda a investigação para o lado errado (armadilha registrada em
 * `orientacoes.md`).
 *
 * O portão adversarial reexecuta a suíte muitas vezes seguidas, por construção.
 * Sem isto, ele trava antes de encontrar qualquer coisa.
 *
 * O arquivo de cache é gitignorado e guarda TOKEN de sessão de usuário de teste,
 * nunca senha — a senha continua só no `.env`. Cada entrada carrega o `ref` do
 * projeto: token do bench nunca é reaproveitado contra produção, nem o contrário.
 */

const AQUI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const ALVO_BENCH = process.env.SINDCOM_ALVO === "bench";
// override: true — o Vitest carrega .env/.env.test sozinho e o dotenv não
// sobrescreve o que já existe; sem isto, SINDCOM_ALVO=bench anunciava BENCH e
// batia em PRODUÇÃO (medido nesta etapa).
config({ path: ALVO_BENCH ? ".env.bench" : ".env.test", override: true });

export const CAMINHO_CACHE = path.resolve(AQUI, ".sessoes-teste.json");

const PAPEIS = ["admin", "presidente", "secretaria", "juridico", "parceiro"] as const;
type Papel = (typeof PAPEIS)[number];

type SessaoCacheada = { access_token: string; refresh_token: string; expires_at: number; ref: string };

/** Margem antes do vencimento: token que expira no meio da suíte é pior que um login a mais. */
const MARGEM_SEGUNDOS = 10 * 60;

function emailDoPapel(papel: Papel): string | undefined {
  return {
    admin: process.env.TEST_ADMIN_EMAIL,
    presidente: process.env.TEST_PRESIDENTE_EMAIL,
    secretaria: process.env.TEST_SECRETARIA_EMAIL,
    juridico: process.env.TEST_JURIDICO_EMAIL,
    parceiro: process.env.TEST_PARCEIRO_EMAIL,
  }[papel];
}

function lerCache(): Partial<Record<Papel, SessaoCacheada>> {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_CACHE, "utf8"));
  } catch {
    return {};
  }
}

export default async function setup() {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const senha = process.env.TEST_USER_PASSWORD;
  if (!url || !anon || !senha) {
    throw new Error(
      `globalSetup: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e TEST_USER_PASSWORD são obrigatórios ` +
        `(${ALVO_BENCH ? ".env.bench" : ".env.test"}).`,
    );
  }

  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  const agora = Math.floor(Date.now() / 1000);
  const cache = lerCache();
  let reaproveitados = 0;
  let novos = 0;
  const semSessao: string[] = [];

  for (const papel of PAPEIS) {
    const guardada = cache[papel];
    if (guardada && guardada.ref === ref && guardada.expires_at - agora > MARGEM_SEGUNDOS) {
      reaproveitados++;
      continue;
    }

    const email = emailDoPapel(papel);
    if (!email) {
      semSessao.push(`${papel} (e-mail ausente no .env)`);
      continue;
    }

    const cliente = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    if (error || !data.session) {
      // Não derruba a execução: `loginComo()` ainda tenta o login por conta
      // própria. Falhar aqui só significa que este papel não terá cache.
      semSessao.push(`${papel} (${error?.message ?? "sem sessão"})`);
      delete cache[papel];
      continue;
    }
    cache[papel] = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at!,
      ref,
    };
    novos++;
  }

  fs.writeFileSync(CAMINHO_CACHE, JSON.stringify(cache, null, 2));
  const alvo = ALVO_BENCH ? "BENCH" : "PRODUÇÃO";
  console.log(`\n[RLS] alvo=${alvo} (${ref}) — ${novos} login(s) novo(s), ${reaproveitados} reaproveitada(s).`);
  if (semSessao.length) console.log(`[RLS] sem cache: ${semSessao.join(" · ")}\n`);
}
