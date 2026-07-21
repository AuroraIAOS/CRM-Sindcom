// ============================================================================
// Edge Function: formulario-filiacao (Subetapa 03.2)
//
// Recebe a submissão do "Formulário de Filiação" (Google Forms) via um
// Google Apps Script vinculado ao formulário (gatilho onFormSubmit) e cria
// o cadastro em `trabalhadores` com status_cadastro = 'pendente' — Denise
// aprova/rejeita em /aprovações (RLS: pol_trab_update já dá essa autonomia
// à Secretaria, sem passar pela fila do Admin — sql/01_schema.sql §7).
//
// AUTENTICAÇÃO: esta função é pública (verify_jwt = false) porque quem
// chama é o Apps Script do Google, sem sessão Supabase — não é um "buraco"
// de segurança: o próprio corpo da função exige o header
// `X-Formulario-Secret` batendo com o segredo configurado nas variáveis de
// ambiente da função (nunca commitado; ver runbook em
// docs/formulario-filiacao.md). Sem o header correto, nem chega a tentar
// gravar nada.
//
// service_role só existe DENTRO desta função (variável de ambiente que o
// Supabase já injeta automaticamente em toda Edge Function) — nunca no
// frontend, nunca no Apps Script (CLAUDE.md).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO_ESPERADO = Deno.env.get("FORMULARIO_FILIACAO_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Payload = {
  nome_completo?: string;
  cpf?: string;
  data_nascimento?: string; // AAAA-MM-DD (o Apps Script converte antes de enviar)
  pis_pasep?: string;
  telefone?: string;
  email_pessoal?: string;
  endereco_completo?: string;
  municipio_residencia?: string;
  nome_empresa?: string;
  cnpj_empresa?: string;
  cidade_estabelecimento?: string;
  telefone_rh?: string;
  email_rh?: string;
  cargo?: string;
  estado_civil?: string;
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apenasDigitos(v: string | undefined | null): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Monta o bloco de "Observações" com tudo que não tem coluna própria em
 * `trabalhadores` — empresa/CNPJ ficam como TEXTO CRU de propósito (decisão
 * de Maxwell em 2026-07-21): a Edge Function não tenta casar/criar empresa
 * nem estabelecimento sozinha, para não gerar duplicidade por erro de
 * digitação do filiado. Denise resolve o vínculo na hora de aprovar.
 */
function montarObservacoes(p: Payload): string {
  const linhas = [
    `[Formulário de Filiação — recebido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}]`,
    p.pis_pasep ? `PIS/PASEP: ${p.pis_pasep}` : null,
    p.endereco_completo ? `Endereço: ${p.endereco_completo}` : null,
    p.municipio_residencia ? `Município de residência (informado no formulário): ${p.municipio_residencia}` : null,
    p.estado_civil ? `Estado civil: ${p.estado_civil}` : null,
    "",
    "— Dados trabalhistas (conferir antes de vincular a uma empresa/estabelecimento) —",
    p.nome_empresa ? `Empresa: ${p.nome_empresa}` : null,
    p.cnpj_empresa ? `CNPJ informado: ${p.cnpj_empresa}` : null,
    p.cidade_estabelecimento ? `Cidade do estabelecimento: ${p.cidade_estabelecimento}` : null,
    p.cargo ? `Cargo/função: ${p.cargo}` : null,
    p.telefone_rh ? `Telefone do RH: ${p.telefone_rh}` : null,
    p.email_rh ? `E-mail do RH: ${p.email_rh}` : null,
  ].filter((l): l is string => l !== null);
  return linhas.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ erro: "Método não permitido" }, 405);
  }

  if (!SEGREDO_ESPERADO) {
    // Configuração ausente no servidor — nunca finge sucesso.
    return json({ erro: "Função não configurada (segredo ausente)" }, 500);
  }
  if (req.headers.get("X-Formulario-Secret") !== SEGREDO_ESPERADO) {
    return json({ erro: "Não autorizado" }, 401);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ status: "erro_validacao", erro: "Corpo não é JSON válido" }, 400);
  }

  const nome = (payload.nome_completo ?? "").trim();
  const cpf = apenasDigitos(payload.cpf);

  if (!nome) {
    return json({ status: "erro_validacao", erro: "Nome completo é obrigatório" }, 400);
  }
  if (cpf.length !== 11) {
    return json({ status: "erro_validacao", erro: "CPF deve ter 11 dígitos" }, 400);
  }

  // CPF já cadastrado: não sobrescreve um registro existente a partir de um
  // formulário sem autenticação — mesma cautela de importação/CSV
  // (CLAUDE.md: mudança de dado sensível é ato deliberado, não efeito
  // automático de submissão externa).
  const { data: existente, error: erroBusca } = await admin
    .from("trabalhadores")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();
  if (erroBusca) return json({ status: "erro", erro: erroBusca.message }, 500);
  if (existente) {
    return json({ status: "ja_cadastrado", trabalhador_id: existente.id }, 200);
  }

  // Match conservador de município: só liga automaticamente numa
  // correspondência EXATA (case-insensitive) contra a base territorial —
  // ambíguo ou sem match fica null, com o texto cru preservado nas
  // observações para Denise resolver.
  let municipioId: number | null = null;
  const municipioTexto = (payload.municipio_residencia ?? "").trim();
  if (municipioTexto) {
    const { data: municipios } = await admin
      .from("municipios")
      .select("id, nome")
      .eq("base_territorial", true)
      .ilike("nome", municipioTexto);
    if (municipios && municipios.length === 1) municipioId = municipios[0].id;
  }

  const { data: novo, error: erroInsert } = await admin
    .from("trabalhadores")
    .insert({
      nome,
      cpf,
      data_nascimento: payload.data_nascimento || null,
      telefone_whatsapp: payload.telefone?.trim() || null,
      email: payload.email_pessoal?.trim() || null,
      municipio_id: municipioId,
      status_cadastro: "pendente",
      origem_cadastro: "formulario_site",
      // Mesmo default já usado na criação manual (TrabalhadorFormDialog):
      // contribuição sindical sim, convênio não — Ouro é decisão deliberada
      // da Denise na aprovação, não efeito automático do formulário.
      recolhe_contribuicao_sindical: true,
      recolhe_mensalidade_convenio: false,
      observacoes: montarObservacoes(payload),
    })
    .select("id")
    .single();

  if (erroInsert) return json({ status: "erro", erro: erroInsert.message }, 500);

  return json({ status: "criado", trabalhador_id: novo.id }, 201);
});
