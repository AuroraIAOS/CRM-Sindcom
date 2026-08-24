import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

// Credenciais dos 5 usuários de teste (arquivo gitignored).
//
// ALVO (ETAPA 07): a suíte roda contra dois bancos diferentes.
//   · `.env.test`  → projeto de PRODUÇÃO. É onde os 67 testes originais rodam,
//                    porque é a fidelidade que importa: a RLS que vale é a que
//                    está no ar. Só leitura e escrita que DEVE falhar.
//   · `.env.bench` → projeto de BENCH, descartável. É o único lugar onde ataque
//                    destrutivo pode acontecer (TRUNCATE, escalar papel, apagar
//                    auditoria, criar/apagar usuário).
// Escolhido por SINDCOM_ALVO=bench; sem a variável, produção — o default é o
// comportamento que já existia.
//
// `override: true` NÃO é detalhe: o Vitest (via Vite) carrega `.env` e
// `.env.test` sozinho, antes deste módulo, e joga as chaves em `process.env`.
// Como `dotenv` não sobrescreve o que já existe, `SINDCOM_ALVO=bench` carregava
// os e-mails do bench mas mantinha a URL de PRODUÇÃO — a suíte anunciava
// "alvo=BENCH" e batia no banco real. Medido nesta etapa; ver orientacoes.md.
const ALVO_BENCH = process.env.SINDCOM_ALVO === "bench";
config({ path: ALVO_BENCH ? ".env.bench" : ".env.test", override: true });

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SENHA = process.env.TEST_USER_PASSWORD;

/**
 * Ref do projeto de PRODUÇÃO, cravado no código de propósito.
 *
 * Esta constante é a trava mais importante da suíte adversarial. Ela não vem de
 * variável de ambiente porque o ponto é justamente não depender de um `.env`
 * estar certo: se alguém apontar `.env.bench` para produção por engano — copiar
 * e colar a URL errada é o erro mais fácil de cometer aqui —, `exigirBench()`
 * recusa antes de o ataque tocar no banco.
 */
const REF_PRODUCAO = "vcswvscjqifelslsdjth";

export function refDoProjeto(url = URL ?? ""): string {
  return url.replace(/^https?:\/\//, "").split(".")[0];
}

/** true quando o alvo configurado é o Supabase que serve crm.sindcompassos.org. */
export function ehProducao(): boolean {
  return refDoProjeto() === REF_PRODUCAO;
}

// Coerência entre o alvo PEDIDO e o alvo REAL, conferida no import — antes de
// qualquer teste rodar. Pedir bench e receber produção é o pior falso verde
// possível: o rótulo tranquiliza enquanto o ataque acontece no banco errado.
if (ALVO_BENCH && ehProducao()) {
  throw new Error(
    "SINDCOM_ALVO=bench, mas VITE_SUPABASE_URL aponta para PRODUÇÃO. " +
      "Confira .env.bench — e note que o Vitest injeta .env.test sozinho (por isso o override).",
  );
}

/**
 * Portão dos ataques destrutivos. Chamado no início de todo caso que escreve,
 * apaga ou cria de verdade. Em produção, lança em vez de rodar.
 */
export function exigirBench(oQueIaFazer: string): void {
  if (ehProducao()) {
    throw new Error(
      `ATAQUE DESTRUTIVO BLOQUEADO: "${oQueIaFazer}" tentou rodar contra o projeto de PRODUÇÃO ` +
        `(${REF_PRODUCAO}). Rode com SINDCOM_ALVO=bench e um .env.bench apontando para o projeto ` +
        `descartável. Esta trava existe porque a base real tem CPF de trabalhadores e 16.687 empresas.`,
    );
  }
}

export type Role = "admin" | "presidente" | "secretaria" | "juridico" | "parceiro";
export type Ator = Role | "anon";

const EMAILS: Record<Role, string | undefined> = {
  admin: process.env.TEST_ADMIN_EMAIL,
  presidente: process.env.TEST_PRESIDENTE_EMAIL,
  secretaria: process.env.TEST_SECRETARIA_EMAIL,
  juridico: process.env.TEST_JURIDICO_EMAIL,
  parceiro: process.env.TEST_PARCEIRO_EMAIL,
};

function novoCliente(): SupabaseClient {
  if (!URL || !ANON) {
    throw new Error(
      `Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no ${ALVO_BENCH ? ".env.bench" : ".env.test"}`,
    );
  }
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clienteAnon(): SupabaseClient {
  return novoCliente();
}

/**
 * Cliente com a service_role — IGNORA RLS por completo. Só para semear e limpar
 * fixture de ataque. Recusa rodar fora do bench: uma `service_role` apontada
 * para produção não tem freio nenhum.
 */
export function clienteServico(): SupabaseClient {
  exigirBench("clienteServico() (service_role ignora RLS)");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !service) {
    throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.bench");
  }
  return createClient(URL, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- Sessões preparadas uma vez por execução (globalSetup) -------------------

const CAMINHO_SESSOES = path.resolve(__dirname, ".sessoes-teste.json");

type SessaoCacheada = { access_token: string; refresh_token: string; expires_at: number; ref: string };

function sessoesPreparadas(): Partial<Record<Role, SessaoCacheada>> {
  try {
    return JSON.parse(readFileSync(CAMINHO_SESSOES, "utf8"));
  } catch {
    return {};
  }
}

const cacheDeClientes = new Map<Role, { client: SupabaseClient; uid: string }>();

/** Lê o `sub` (uid do usuário) do payload de um JWT, sem validar assinatura e
 *  sem rede — o token já veio do servidor no globalSetup. */
function subDoToken(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Faz login como o papel e devolve um cliente autenticado + o uid.
 *
 * Por que existe cache: o Vitest dá a cada arquivo de teste um registro de
 * módulos próprio, então um cache de módulo nunca atravessa a fronteira entre
 * arquivos — com 13 arquivos × 5 papéis a suíte fazia até 65 `signInWithPassword`
 * em poucos segundos, acima do teto do endpoint de token do Supabase. O sintoma
 * NÃO parece rate limit: sem token o cliente cai para anônimo e a RLS nega tudo,
 * o que aparece como "conjunto vazio onde deveria haver linha" — idêntico a uma
 * RLS quebrada. `tests/rls/globalSetup.ts` autentica os cinco papéis UMA vez, no
 * processo principal, e grava em disco; aqui só se monta o cliente com a sessão.
 */
export async function loginComo(role: Role): Promise<{ client: SupabaseClient; uid: string }> {
  const emCache = cacheDeClientes.get(role);
  if (emCache) return emCache;

  const email = EMAILS[role];
  if (!email) throw new Error(`E-mail do papel "${role}" ausente no .env`);

  const client = novoCliente();
  const preparada = sessoesPreparadas()[role];

  // A sessão em disco só vale para o MESMO projeto: um token do bench mandado
  // para produção (ou o contrário) autenticaria o ator errado em silêncio.
  if (preparada && preparada.ref === refDoProjeto()) {
    const { error } = await client.auth.setSession({
      access_token: preparada.access_token,
      refresh_token: preparada.refresh_token,
    });
    if (!error) {
      // O uid sai do PRÓPRIO token, decodificado aqui. `getUser()` seria a forma
      // óbvia — e é uma chamada de rede ao endpoint de auth, uma por arquivo por
      // papel. Com 13 arquivos × 5 papéis isso são ~65 requisições em segundos, o
      // bastante para estourar o rate limit e derrubar a suíte inteira com
      // "Request rate limit reached" (medido). O `sub` do JWT é a mesma
      // informação, de graça e sem sair do processo.
      const uid = subDoToken(preparada.access_token);
      if (uid) {
        const pronto = { client, uid };
        cacheDeClientes.set(role, pronto);
        return pronto;
      }
    }
    // Token recusado (expirou entre o setup e agora): cai para o login abaixo.
  }

  if (!SENHA) throw new Error("TEST_USER_PASSWORD ausente no .env");
  const { data, error } = await client.auth.signInWithPassword({ email, password: SENHA });
  if (error || !data.user) {
    // Falha de credencial → o chamador deve PARAR e perguntar (não inventar).
    throw new Error(`FALHA_CREDENCIAL: login de "${role}" (${email}) falhou: ${error?.message}`);
  }
  const pronto = { client, uid: data.user.id };
  cacheDeClientes.set(role, pronto);
  return pronto;
}

// --- Usuário descartável (alvo contido) --------------------------------------

export interface UsuarioDescartavel {
  uid: string;
  email: string;
  senha: string;
}

/**
 * Cria um usuário de Auth novo, SEM linha em `perfis` — que é exatamente o
 * estado que o achado A01 do CRM Vitrine explorou. Só no bench.
 */
export async function criarUsuarioDescartavel(prefixo: string): Promise<UsuarioDescartavel> {
  exigirBench(`criarUsuarioDescartavel("${prefixo}")`);
  const admin = clienteServico();
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@sindcom.invalido`;
  const senha = `Adv!${Math.random().toString(36).slice(2, 12)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`criarUsuarioDescartavel: falha ao criar ${email}: ${error?.message}`);
  }
  return { uid: data.user.id, email, senha };
}

/** Desfaz criarUsuarioDescartavel — inclusive o perfil que um ataque tenha plantado. */
export async function apagarUsuarioDescartavel(uid: string): Promise<void> {
  exigirBench("apagarUsuarioDescartavel()");
  const admin = clienteServico();
  await admin.from("perfis").delete().eq("id", uid);
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) throw new Error(`apagarUsuarioDescartavel(${uid}): ${error.message}`);
}

/** Sessão autenticada avulsa, fora do cache de papéis (para usuário descartável). */
export async function loginAvulso(email: string, senha: string): Promise<SupabaseClient> {
  const client = novoCliente();
  const { error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`loginAvulso(${email}): ${error.message}`);
  return client;
}

// --- Asserções de RLS -------------------------------------------------------

type ErroSupabase = { code?: string | null; message?: string | null } | null;

/** Erro de RLS/permissão (negado): SQLSTATE 42501 ou mensagem equivalente. */
export function ehErroRls(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  return code === "42501" || /row-level security|permission denied|not authorized/i.test(msg);
}

const CODIGOS_CONSTRAINT = new Set(["23502", "23503", "23514", "23505"]);

/** Erro de constraint/trigger (RLS PASSOU, falhou depois nos dados). */
export function ehErroConstraintOuTrigger(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  // P0001 = raise exception de trigger de negócio (também significa "passou o RLS")
  return CODIGOS_CONSTRAINT.has(code) || code === "P0001";
}

/**
 * Um ataque só está barrado se o erro for de RLS/privilégio OU de
 * constraint/trigger. Qualquer outro desfecho — inclusive sucesso — é achado.
 */
export function ataqueBarrado(err: ErroSupabase): boolean {
  return ehErroRls(err) || ehErroConstraintOuTrigger(err);
}
