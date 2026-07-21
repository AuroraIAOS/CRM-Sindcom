-- ============================================================================
-- CRM SINDCOM — 14_agente_whatsapp.sql · Subetapa 03.4
-- RPC de nível/bloqueio por CPF: substitui a lookup do agente WhatsApp em
-- Google Sheets — nasce a fonte única de verdade (specs/plano_fases.md).
-- ============================================================================
--
-- QUEM CHAMA E COMO
--
-- O agente roda hoje no n8n self-host de Maxwell (fase de teste) e depois
-- muda para uma VPS (Railway/Oracle Free Tier) — o transporte muda, a forma
-- de chamar não: POST direto ao endpoint REST do Supabase com
-- `Authorization: Bearer <service_role>` (mesmo padrão do workflow de
-- e-mail das guias, n8n/README.md). Só `Authorization: Bearer` estabelece o
-- papel `service_role` — o header `apikey` sozinho roda como `anon` e
-- devolveria silenciosamente vazio (orientacoes.md §3.2). Como o CPF NÃO é
-- segredo (ao contrário do token UUID de fn_dados_guia_publica), esta
-- função NÃO é liberada para `anon`/`authenticated` — só quem já detém a
-- service_role consegue chamá-la.
--
--   curl "$URL/rest/v1/rpc/fn_consulta_nivel_bloqueio" \
--     -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
--     -H "Content-Type: application/json" \
--     -d '{"p_cpf": "12345678901"}'
--
-- CONTRATO DE RESPOSTA
--
-- Sempre UMA linha (nunca array vazio) com `encontrado` como o campo a
-- checar primeiro — evita a ambiguidade "array vazio = não encontrado OU
-- erro de parsing no n8n" (a mesma classe de bug do §3.4: nó Code
-- processando só o primeiro item de uma lista passou despercebido por
-- semanas com fila de 1 item só).
--
-- MINIMIZAÇÃO DE DADO ("sem vazamento de dados sensíveis na resposta")
--
-- Devolve `primeiro_nome` (só a primeira palavra do nome, para a saudação),
-- nunca o nome completo, CPF, e-mail, telefone ou qualquer valor financeiro.
-- O agente já tem o CPF (veio da pergunta); não há razão para ecoá-lo de
-- volta numa mensagem que pode ficar em log do WhatsApp/n8n.
-- ----------------------------------------------------------------------------

create or replace function fn_consulta_nivel_bloqueio(p_cpf text)
returns table (
  encontrado              boolean,
  primeiro_nome           text,
  nivel                   nivel_protecao,
  status_cadastro         status_cadastro,
  bloqueado_contribuicao  boolean,  -- relevante a partir do nível Prata
  bloqueado_mensalidade   boolean   -- relevante só no nível Ouro
) language plpgsql stable security definer as $$
declare
  -- CPF normalizado aqui dentro: o agente recebe texto livre do WhatsApp
  -- ("123.456.789-01", "123 456 789 01" etc.), então a função aceita
  -- qualquer formatação e só compara dígitos.
  v_cpf  text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_trab trabalhadores%rowtype;
begin
  if length(v_cpf) <> 11 then
    return query select false, null::text, null::nivel_protecao, null::status_cadastro, null::boolean, null::boolean;
    return;
  end if;

  select * into v_trab from trabalhadores where cpf = v_cpf;

  if not found then
    return query select false, null::text, null::nivel_protecao, null::status_cadastro, null::boolean, null::boolean;
    return;
  end if;

  return query select
    true,
    split_part(v_trab.nome, ' ', 1),
    v_trab.nivel,
    v_trab.status_cadastro,
    fn_titular_bloqueado(v_trab.id, 'contribuicao_sindical'::tipo_fatura),
    fn_titular_bloqueado(v_trab.id, 'mensalidade_convenio'::tipo_fatura);
end;
$$;

alter function public.fn_consulta_nivel_bloqueio(text)
  set search_path = public, extensions, pg_temp;

-- Nenhum papel do app chama isto — só quem detém a service_role (que já
-- recebe EXECUTE por padrão no projeto, sem grant explícito; ver
-- orientacoes.md §2.6c). CPF não é segredo, então diferente das RPCs
-- públicas do QR (fn_dados_guia_publica), esta NUNCA vai para anon.
revoke execute on function public.fn_consulta_nivel_bloqueio(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Conferência (deve devolver só "postgres" e "service_role" — nem anon nem
-- authenticated):
--
--   select proname, array_to_string(proacl, E'\n') from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'fn_consulta_nivel_bloqueio';
-- ----------------------------------------------------------------------------
