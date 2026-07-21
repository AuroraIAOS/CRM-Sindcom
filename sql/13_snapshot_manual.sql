-- ============================================================================
-- CRM SINDCOM — 13_snapshot_manual.sql · Subetapa 03.1
-- Permite ao Admin tirar a fotografia da base pelo botão do dashboard.
-- Idempotente: pode ser reaplicado sem efeito colateral.
-- ============================================================================
--
-- PROBLEMA QUE ESTE ARQUIVO RESOLVE
--
-- `fn_snapshot_dashboard()` alimenta o gráfico de evolução por nível (G1) e
-- roda por pg_cron no dia 1 às 04h. O cron executa como `postgres`, então
-- sempre funcionou — mas o `05_hardening.sql` revogou EXECUTE de PUBLIC e
-- reconcedeu cirurgicamente, e esta função ficou de fora do grant a
-- `authenticated`. Resultado: o Admin recebia
-- `permission denied for function fn_snapshot_dashboard` (SQLSTATE 42501)
-- ao chamá-la pelo frontend.
--
-- A guarda interna `fn_guarda_job()` NÃO substitui o grant: ela só sabe
-- NEGAR (levanta exceção para papel autenticado que não seja admin). Quem
-- CONCEDE é o GRANT. As duas camadas são independentes — mesma lição do
-- orientacoes.md §2.3, vista do outro lado.
--
-- Por que conceder a `authenticated` e não a um papel de admin: não existe
-- papel Postgres por role de aplicação neste projeto — todo usuário logado é
-- `authenticated`, e o recorte por papel é feito por `fn_eh()` dentro das
-- funções e políticas. É exatamente o padrão já usado em
-- `fn_reclassificar_convencao` e nas `fn_gerar_*` (Subetapas 02.5 e 02.6).
-- ----------------------------------------------------------------------------

grant execute on function public.fn_snapshot_dashboard() to authenticated;

-- Anon continua barrado: a fotografia é ato administrativo, e a camada de
-- permissão tem que negá-lo antes mesmo de a guarda rodar.
revoke execute on function public.fn_snapshot_dashboard() from anon;

-- search_path fixo — requisito de toda função do projeto (orientacoes.md §2.5).
alter function public.fn_snapshot_dashboard() set search_path = public, extensions, pg_temp;

-- ----------------------------------------------------------------------------
-- Conferência (deve devolver: authenticated=X presente, anon ausente)
--
--   select proname, array_to_string(proacl, E'\n')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'fn_snapshot_dashboard';
-- ----------------------------------------------------------------------------
