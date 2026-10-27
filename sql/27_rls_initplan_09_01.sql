-- ============================================================================
-- CRM SINDCOM — sql/27_rls_initplan_09_01.sql
-- ETAPA 09 · Subetapa 9.1 — `fn_eh()` avaliada UMA vez por consulta, não por linha
--
-- ✅ APLICADO EM PRODUÇÃO em 2026-09-08, por ordem do Maxwell. Mexe em policies
-- de RLS, que são a segurança real do projeto (CLAUDE.md) — por isso foi
-- escrito, revisado e só então aplicado, na regra da ETAPA 08. O
-- comportamento não muda: a expressão booleana é a mesma.
--
-- O QUE FOI MEDIDO, E COMO
--
-- A tela `/cobertura-empresas` (8.238 empresas) abria em ~6 segundos. As
-- medições, todas na mesma consulta de uma página de 50 linhas:
--
--   como `postgres`, SEM RLS ………………………………………………  1.165 ms
--   como `authenticated`, RLS antiga …………………………  2.372 ms
--   pelo PostgREST, com contagem exata ………………………  ~5.500 ms
--
-- E o que foi medido DEPOIS de aplicar, em 2026-09-08 (o plano passou a mostrar
-- `InitPlan 1..4` e `Filter: (InitPlan N).col1`):
--
--   `explain analyze`, plano frio ……………………………… 1.146,8 ms
--   `explain analyze`, em regime ……………………………………  38,0 / 40,3 ms
--   pelo PostgREST, sem contagem ……………………………………  193 / 145 / 98 ms
--   pelo PostgREST, com contagem exata ……………………… 679 / 230 / 130 ms
--
-- A primeira rodada é sempre a mais lenta (plano novo: `Planning Time` 49,7 ms
-- contra 2,7 ms depois) — comparar planos frios com quentes é como se inventa
-- um ganho que não existe, ou se perde um que existe.
--
-- O `count` continuou em **8.238** antes e depois: mesmo universo de linhas,
-- que é a evidência de que o recorte por papel não mudou. A outra evidência é a
-- suíte: 291 casos passando, 0 falha.
--
-- A terceira linha foi medida SEM APLICAR NADA: `begin` → `alter policy` →
-- `explain analyze` → `rollback`. DDL no Postgres é transacional, então a
-- medição aconteceu com as policies novas e o banco voltou ao estado anterior —
-- conferido depois por `pg_policies` (nenhuma com subconsulta).
--
-- POR QUE FUNCIONA
-- `fn_eh()` é `stable`, mas dentro de uma policy ela é chamada como filtro de
-- linha: o Postgres a avalia para CADA linha varrida (o plano mostrava
-- `Filter: fn_eh(VARIADIC '{admin,presidente,...}')`). Como o resultado não
-- depende da linha — só de quem está logado —, embrulhá-la numa subconsulta
-- escalar a promove a **InitPlan**, avaliada uma única vez por consulta (o
-- plano passa a mostrar `InitPlan 4` e `Filter: (InitPlan 4).col1`). É a
-- recomendação da própria Supabase para RLS em tabela grande.
--
-- O QUE **NÃO** MUDA, e é o que torna isto seguro:
--  · a expressão é a mesma — mesmos papéis, mesmo booleano;
--  · nenhuma linha passa a ser visível para quem não a via;
--  · vale só para policies cuja condição depende APENAS do usuário. Policy que
--    compara com coluna da linha (`id = fn_parceiro_id()`, por exemplo) NÃO
--    entra aqui: ali o embrulho iria no lado da função, nunca na comparação, e
--    o ganho é outro. Por isso este arquivo lista as quatro nominalmente em vez
--    de varrer `pg_policies` num laço.
--
-- COMO CONFERIR DEPOIS DE APLICAR (não pule — §7.2):
--  1. `npm run test` inteiro. A suíte de RLS é justamente o que prova que o
--     recorte por papel continua igual; 285 casos passando é a evidência de que
--     a mudança foi só de desempenho.
--  2. O plano, com a mesma medição de antes: deve aparecer `InitPlan`.
--  3. A tela, aberta de verdade.
-- ============================================================================

alter policy pol_estab_select on estabelecimentos
  using ((select fn_eh('admin', 'presidente', 'secretaria', 'juridico')));

alter policy pol_empresas_select on empresas
  using ((select fn_eh('admin', 'presidente', 'secretaria', 'juridico')));

alter policy pol_envios_select on envios_campanha
  using ((select fn_eh('admin', 'presidente', 'secretaria')));

alter policy pol_vinc_select on vinculos_empregaticios
  using ((select fn_eh('admin', 'presidente', 'secretaria', 'juridico')));

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS de aplicar.
--
-- (1) As quatro passaram a ter a subconsulta, e nenhuma outra mudou:
--   select tablename, policyname, (qual like '%(SELECT%' or qual like '%( SELECT%') as tem_subconsulta
--     from pg_policies
--    where schemaname = 'public'
--      and policyname in ('pol_estab_select','pol_empresas_select','pol_envios_select','pol_vinc_select');
--   -- esperado: quatro linhas, todas `true`
--
-- (2) O plano mudou de `Filter: fn_eh(...)` para `Filter: (InitPlan N).col1`:
--   begin;
--   select set_config('request.jwt.claims',
--     (select json_build_object('sub', id, 'role', 'authenticated')::text
--        from perfis where role = 'admin' limit 1), true);
--   set local role authenticated;
--   explain (analyze, timing off, summary on)
--   select * from v_cobertura_empresas order by coberta, razao_social limit 50;
--   rollback;
--   -- esperado: Execution Time na casa das centenas de ms, não dos segundos
--
-- (3) `npm run test` — o recorte por papel é o que não pode ter mudado.
--
-- RESULTADO DA CONFERÊNCIA (2026-09-08), com uma medição a mais que a prevista:
-- além de contar as quatro, o hash das policies que NÃO deviam mudar. Ele
-- responde de uma vez "aplicou?" e "mexeu em mais alguma coisa?":
--
--   select
--     (select count(*) from pg_policies where schemaname='public') as total,
--     (select md5(string_agg(tablename||'|'||policyname||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),
--                            chr(10) order by tablename, policyname))
--        from pg_policies where schemaname='public'
--         and policyname not in ('pol_estab_select','pol_empresas_select','pol_envios_select','pol_vinc_select')) as hash_demais,
--     (select count(*) from pg_policies where schemaname='public'
--        and policyname in ('pol_estab_select','pol_empresas_select','pol_envios_select','pol_vinc_select')
--        and qual like '%SELECT%') as com_subconsulta;
--
--   ANTES:  111 · 3004e7ae453085c7cc7e9aca508a174a · 0
--   DEPOIS: 111 · 3004e7ae453085c7cc7e9aca508a174a · 4
--
-- Total igual (nenhuma policy criada nem removida), hash idêntico (as outras
-- 107 intactas), quatro embrulhadas. `npm run test`: 291 passando, 0 falha.
-- ----------------------------------------------------------------------------
