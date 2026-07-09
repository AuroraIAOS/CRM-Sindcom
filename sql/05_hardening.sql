-- ============================================================================
-- CRM SINDCOM — 05_hardening.sql · Endurecimento de segurança (idempotente)
-- Executar APÓS 01→04. Reexecutável sem efeito colateral.
--
-- Fecha os avisos do database linter (get_advisors) que NÃO são by-design:
--   1. search_path mutável em funções SECURITY DEFINER  (lint 0011)
--   2. EXECUTE concedido a PUBLIC/anon em funções sensíveis (lints 0028/0029)
--   3. extensão pg_trgm no schema public               (lint 0014)
--
-- NÃO altera o comportamento do app:
--   · As 2 RPCs públicas do QR seguem executáveis por anon.
--   · fn_role / fn_parceiro_id / fn_titular_bloqueado seguem disponíveis ao
--     papel authenticated (necessárias para o RLS e a pré-validação de UX).
--   · Triggers e jobs pg_cron rodam como owner — não dependem de grant ao app.
--   · v_fila_parceiro permanece security definer DE PROPÓSITO (esconde CPF) e
--     por isso não é tratada aqui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. search_path FIXO em todas as funções SECURITY DEFINER
-- Usa-se `public, extensions, pg_temp`: `extensions` é obrigatório porque o
-- pgcrypto (crypt/gen_salt, usados por fn_registrar_checkin) vive nesse schema
-- no Supabase. `public` resolve primeiro; incluir `extensions` é inócuo para as
-- demais funções. `pg_temp` por último (recomendação de segurança do Postgres).
-- Exceção: rls_auto_enable já tem search_path fixo (pg_catalog) e é função de
-- sistema — não é tocada.
-- ----------------------------------------------------------------------------
alter function public.fn_role()                                   set search_path = public, extensions, pg_temp;
alter function public.fn_parceiro_id()                            set search_path = public, extensions, pg_temp;
alter function public.fn_titular_bloqueado(uuid, tipo_fatura)     set search_path = public, extensions, pg_temp;
alter function public.fn_auditoria()                              set search_path = public, extensions, pg_temp;
alter function public.fn_notifica_solicitacao_admin()            set search_path = public, extensions, pg_temp;
alter function public.fn_registra_evento_nivel()                 set search_path = public, extensions, pg_temp;
alter function public.fn_dados_guia_publica(uuid)                set search_path = public, extensions, pg_temp;
alter function public.fn_registrar_checkin(uuid, text, boolean, text)
                                                                  set search_path = public, extensions, pg_temp;
alter function public.fn_reclassificar_convencao(uuid)           set search_path = public, extensions, pg_temp;
alter function public.fn_evoluir_solicitacoes()                  set search_path = public, extensions, pg_temp;
alter function public.fn_marcar_guias_em_atraso()                set search_path = public, extensions, pg_temp;
alter function public.fn_marcar_boletos_inadimplentes()          set search_path = public, extensions, pg_temp;
alter function public.fn_snapshot_dashboard()                    set search_path = public, extensions, pg_temp;

-- ----------------------------------------------------------------------------
-- 2. EXECUTE: revogar de PUBLIC/anon e reconceder só onde é necessário
-- ----------------------------------------------------------------------------

-- 2a. RPCs públicas do QR — anon PRECISA continuar executando (não revogar).
grant execute on function public.fn_dados_guia_publica(uuid)                       to anon, authenticated;
grant execute on function public.fn_registrar_checkin(uuid, text, boolean, text)   to anon, authenticated;

-- 2b. Funções usadas pelo RLS e pela UI — só authenticated (nunca anon).
revoke execute on function public.fn_role()                              from public, anon;
revoke execute on function public.fn_parceiro_id()                       from public, anon;
revoke execute on function public.fn_titular_bloqueado(uuid, tipo_fatura) from public, anon;
revoke execute on function public.fn_reclassificar_convencao(uuid)       from public, anon;
grant  execute on function public.fn_role()                              to authenticated;
grant  execute on function public.fn_parceiro_id()                       to authenticated;
grant  execute on function public.fn_titular_bloqueado(uuid, tipo_fatura) to authenticated;
grant  execute on function public.fn_reclassificar_convencao(uuid)       to authenticated;

-- 2c. Triggers / jobs pg_cron / utilitários internos — nenhum papel do app.
--     (Triggers e cron executam como owner; não precisam de grant a anon/auth.)
revoke execute on function public.fn_auditoria()                   from public, anon, authenticated;
revoke execute on function public.fn_notifica_solicitacao_admin()  from public, anon, authenticated;
revoke execute on function public.fn_registra_evento_nivel()       from public, anon, authenticated;
revoke execute on function public.fn_evoluir_solicitacoes()        from public, anon, authenticated;
revoke execute on function public.fn_marcar_guias_em_atraso()      from public, anon, authenticated;
revoke execute on function public.fn_marcar_boletos_inadimplentes() from public, anon, authenticated;
revoke execute on function public.fn_snapshot_dashboard()          from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Mover pg_trgm de public para extensions
-- pg_trgm é relocatable; os 3 índices GIN (gin_trgm_ops) religam-se
-- automaticamente à operator class na nova localização — sem recriação.
-- Consultas ILIKE continuam usando os índices (o planner resolve por OID).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pg_trgm' and n.nspname = 'public'
  ) then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end $$;

-- ============================================================================
-- FIM · 05_hardening.sql
-- Observação: os avisos de search_path mutável nas funções SECURITY INVOKER
-- (fn_set_updated_at, fn_gera_numero_guia, fn_gera_guia_pagamento, fn_eh,
-- fn_valida_solicitacao, fn_valida_atendimento_juridico,
-- fn_guarda_parceiro_solicitacao, fn_config, fn_guarda_job) têm severidade
-- menor (não rodam com privilégio elevado) e ficam fora deste escopo.
-- ============================================================================
