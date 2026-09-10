-- ============================================================================
-- CRM SINDCOM — sql/28_cobertura_reemissao_atendimento_09_02.sql
-- ETAPA 09 · Subetapa 9.2 — "Link ativo" e "Revogar token" também na Secretaria
--
-- O QUE MUDA, E POR QUÊ
--
-- Ordem do Maxwell (2026-09-10): durante as ondas, quem tem o contato direto
-- com as empresas é a Denise (Secretaria). "Meu link não abre" chega a ela, não
-- ao Admin — e hoje ela vê a tela de cobertura mas não consegue nem ler o link
-- em vigor nem emitir um substituto. Isso transforma um atendimento de trinta
-- segundos em um repasse.
--
-- Três objetos mudam, e é o BANCO que decide — a lista de papéis no frontend
-- (`PODE_REVOGAR`) só evita desenhar um botão que não funcionaria.
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE A SECRETARIA GANHA DE FATO — dito sem eufemismo, porque a decisão é
-- de segurança e não pode ficar implícita:
--
--  (1) LER O TOKEN EM CLARO. Na prática ela **já podia**: `pol_envios_select`
--      a inclui desde a sql/20 e o GRANT de SELECT na tabela crua continua de
--      pé (sql/23, linha 194). O mascaramento da view nunca a barrou de
--      verdade — bastava consultar `envios_campanha` diretamente. Esta mudança
--      não abre porta nova; ela para de fingir que a porta estava fechada.
--
--  (2) REVOGAR (update de `token_revogado_em`). Poder novo, e é o pedido.
--
--  (3) INSERIR linha em `envios_campanha`. Poder novo, e é o mais amplo dos
--      três: com ele a Secretaria pode emitir um link de remessa para um
--      e-mail QUALQUER, não só reemitir o de um destinatário já existente. Ele
--      entra porque a reemissão é literalmente revogar + inserir (não há RPC
--      transacional para isto — ver `revogarEEmitir` em features/cobertura/api.ts).
--
--      Por que isso não é escalada de privilégio, pelo mesmo raciocínio já
--      registrado na sql/20 (linhas 395-403): o token permite APENAS enviar uma
--      remessa, que vira `remessas_dados` e passa por revisão humana antes de
--      virar cadastro — e a Secretaria já tem escrita DIRETA em `trabalhadores`,
--      que é o poder maior. O caminho novo é mais estreito do que o que ela já
--      tinha.
--
--      Se um dia se quiser fechar (3) sem perder (2), o desenho é uma função
--      `security definer` que faça revogar+inserir numa transação, guardada por
--      `fn_eh('admin','secretaria')`, com EXECUTE concedido só a `authenticated`
--      — e aí as policies de insert/update voltam a `fn_eh('admin')`. Ficou
--      fora daqui por ser redesenho, não por ser pior. Decisão do Maxwell.
-- ────────────────────────────────────────────────────────────────────────────
--
-- ADITIVA para a Secretaria e NEUTRA para todos os outros papéis: Presidente,
-- Jurídico e Parceiro continuam exatamente como estavam, e `anon` não é tocado.
--
-- IDEMPOTENTE: `create or replace` + `alter policy` — a 2ª execução tem delta
-- zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A view para de esconder o token da Secretaria.
--    `security_invoker = on` preservado: a RLS das bases continua ligada, e o
--    que muda é só o mascaramento de COLUNA (§2.6b — view não nega, ela zera).
-- ----------------------------------------------------------------------------
create or replace view v_envios_campanha_mascarada
with (security_invoker = on) as
select
  e.id,
  e.campanha_id,
  e.contabilidade_id,
  e.estabelecimento_id,
  e.email,
  case when fn_eh('admin', 'secretaria') then e.token else null end as token,
  e.token_expira_em,
  e.token_revogado_em,
  e.descadastrado_em,
  e.enviado_em,
  e.primeira_remessa_em,
  e.ultima_remessa_em,
  e.created_at
from envios_campanha e;

comment on view v_envios_campanha_mascarada is
  'Espelho de envios_campanha com o token em claro para Admin e Secretaria (Subetapa 9.2; era só '
  'Admin desde a 9.1). Existe para a tela de cobertura poder reemitir e ENTREGAR o link novo depois '
  'de uma revogação. Presidente e Jurídico recebem token = null. Observação honesta: a Secretaria '
  'lê a tabela crua `envios_campanha` desde a sql/20, então a máscara nunca a barrou de fato — '
  'fechar aquela leitura direta segue sendo decisão pendente do Maxwell.';

-- `create or replace view` preserva os privilégios existentes, mas repetir é
-- barato e torna o arquivo autossuficiente se um dia a view for recriada do zero.
grant select on v_envios_campanha_mascarada to authenticated;
revoke select on v_envios_campanha_mascarada from anon;

-- ACHADO AO CONFERIR ESTA PRÓPRIA MIGRAÇÃO (2026-09-10), e é por isso que a
-- conferência do rodapé não é ritual: `authenticated` tinha
-- **INSERT, UPDATE e DELETE** nesta view — herdados do default ACL (§2.25: o
-- hardening de GRANT não é hereditário, `pg_default_acl` reabre a porta a cada
-- objeto novo). E esta view É auto-atualizável, porque tem UMA tabela na
-- origem; a maioria das outras views do projeto agrega e por isso o mesmo
-- privilégio, nelas, é inerte.
--
-- Não era furo: `security_invoker = on` mantém a RLS de `envios_campanha`
-- decidindo tudo, e a medição confirmou que nenhuma policy de escrita alcança
-- `anon` ou `public` e que nenhuma tabela do schema está com RLS desligada.
-- Mas privilégio que ninguém usa é superfície de graça, e um objeto de LEITURA
-- não tem por que aceitar escrita. A conferência (2) da sql/25 já esperava
-- "authenticated | SELECT" e nunca tinha sido rodada de fato (§7.2).
revoke insert, update, delete on v_envios_campanha_mascarada from authenticated;
revoke insert, update, delete on v_envios_campanha_mascarada from anon;

-- ----------------------------------------------------------------------------
-- 2. Escrita: revogar (update) e emitir o substituto (insert).
--    `(select fn_eh(...))` — a subconsulta escalar é o padrão adotado na
--    sql/27: promove a chamada a InitPlan, avaliada uma vez por consulta em vez
--    de uma vez por linha. Aqui o ganho é pequeno (as escritas são pontuais),
--    mas manter a forma evita que a próxima leitura do catálogo pareça
--    inconsistente.
-- ----------------------------------------------------------------------------
alter policy pol_envios_update on envios_campanha
  using ((select fn_eh('admin', 'secretaria')))
  with check ((select fn_eh('admin', 'secretaria')));

alter policy pol_envios_insert on envios_campanha
  with check ((select fn_eh('admin', 'secretaria')));

-- DELETE fica como está: `fn_eh('admin')`. Reemissão não apaga histórico —
-- marca `token_revogado_em` e insere uma linha nova (spec 08.11). A Secretaria
-- não precisa de delete, e conceder o que não se usa é superfície de graça.

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS de aplicar. Mede catálogo E comportamento; o
-- arquivo aplicado não prova nada sozinho (orientacoes.md §7.2).
--
-- (1) As duas policies mudaram, e a de delete NÃO:
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'envios_campanha'
--    order by policyname;
--   -- esperado: insert/update citando 'secretaria'; delete e select inalterados
--
-- (2) A view continua com security_invoker (sem ele, ignoraria a RLS das bases
--     e vazaria a tabela inteira — §2.15):
--   select relname, reloptions from pg_class where relname = 'v_envios_campanha_mascarada';
--   -- esperado: {security_invoker=on}
--
-- (3) `anon` continua fora:
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_name = 'v_envios_campanha_mascarada' and grantee in ('anon','authenticated')
--    group by grantee;
--   -- esperado: uma linha só — authenticated | SELECT
--
-- (4) O comportamento, com login real (tests/rls/cobertura.spec.ts faz isto):
--     Admin      → token preenchido · revoga (1 linha afetada)
--     Secretaria → token preenchido · revoga (1 linha afetada)   ← o que mudou
--     Presidente → token null       · revoga 0 linhas, sem erro (§2.6d)
--     Jurídico   → não enxerga a linha
-- ----------------------------------------------------------------------------
