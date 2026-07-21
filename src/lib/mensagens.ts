/**
 * Mapa central Postgres → mensagem amigável (PT-BR).
 * A segurança real são RLS + triggers no banco; o frontend só TRADUZ os erros.
 * Regra: mensagens de trigger já vêm humanas (definidas no SQL) e passam
 * adiante; os códigos genéricos do Postgres ganham texto amigável aqui.
 */

type ErroPostgres = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

// Códigos SQLSTATE / PostgREST → texto amigável
const POR_CODIGO: Record<string, string> = {
  "23505": "Já existe um registro com estes dados. Verifique duplicidade (CPF, CNPJ, competência).",
  "23503": "Operação bloqueada: existe um registro relacionado que impede esta ação.",
  "23514": "Dados inválidos: violam uma regra de validação do sistema.",
  "23502": "Preencha todos os campos obrigatórios.",
  "42501": "Você não tem permissão para esta operação.",
  "P0001": "", // raise exception dos triggers — usa a própria mensagem (já amigável)
  PGRST301: "Sessão expirada. Faça login novamente.",
  PGRST116: "Registro não encontrado ou sem permissão de acesso.",
};

const MENSAGEM_OFFLINE =
  "Sem conexão com a internet. Esta ação exige conexão — reconecte e tente novamente.";

// Trechos conhecidos vindos do RLS/PostgREST que merecem tradução direta
const POR_TRECHO: Array<[RegExp, string]> = [
  [/row-level security|violates row-level security/i, "Você não tem permissão para esta operação."],
  [/permission denied/i, "Você não tem permissão para esta operação."],
  [/JWT expired|invalid claim/i, "Sessão expirada. Faça login novamente."],
  // Falha de rede (offline): o texto exato varia por navegador ("Failed to
  // fetch" no Chrome, "NetworkError..." no Firefox, "Load failed" no
  // Safari) — cobre os três em vez de depender de um só. Subetapa 03.3:
  // escrita nunca deve ficar "pendurada" esperando reconexão (frontend.md
  // §6) — mutations usam networkMode:'always' (lib/queryClient.ts), então
  // falham na hora, e caem aqui com mensagem clara em vez do erro técnico.
  [/Failed to fetch|NetworkError|Load failed|fetch failed/i, MENSAGEM_OFFLINE],
  [
    /ux_vinculo_principal_ativo/i,
    "Este trabalhador já tem um vínculo principal ativo. Desligue o vínculo atual antes de cadastrar um novo vínculo principal.",
  ],
  [
    /cartas_oposicao_trabalhador_id_ano_base_key/i,
    "Já existe uma carta de oposição registrada para este trabalhador neste ano-base.",
  ],
  [/duplicate key value/i, "Já existe um registro com estes dados (duplicado)."],
];

/** Retorna uma mensagem amigável em PT-BR para exibir na UI. */
export function mensagemErro(erro: unknown): string {
  if (!erro) return "Ocorreu um erro inesperado.";

  // 0. `navigator.onLine` é o sinal mais confiável de "sem rede" — checado
  //    antes de tentar interpretar o texto do erro, que varia por navegador
  //    e às vezes nem chega a ter mensagem reconhecível (fetch abortado).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return MENSAGEM_OFFLINE;
  }

  const e = erro as ErroPostgres;
  const msg = (e.message ?? "").trim();

  // 1. Erros de trigger (P0001): a mensagem do SQL já é amigável.
  if (e.code === "P0001" && msg) return msg;

  // 2. Trecho conhecido na mensagem — mais específico que o código genérico
  //    (ex.: qual constraint de unicidade foi violada), então vem antes.
  for (const [re, texto] of POR_TRECHO) {
    if (re.test(msg)) return texto;
  }

  // 3. Código conhecido (fallback genérico por SQLSTATE).
  if (e.code && POR_CODIGO[e.code]) return POR_CODIGO[e.code];

  // 4. Fallback: a própria mensagem, ou genérica.
  return msg || "Ocorreu um erro inesperado. Tente novamente.";
}
