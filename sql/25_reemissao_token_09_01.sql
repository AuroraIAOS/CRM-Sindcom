-- ============================================================================
-- CRM SINDCOM — sql/25_reemissao_token_09_01.sql
-- ETAPA 09 · Subetapa 9.1 — Reemissão de token: o link novo precisa CHEGAR
--
-- O QUE ESTE ARQUIVO EXISTE PARA RESOLVER, E O QUE NÃO ERA O PROBLEMA
--
-- Medido em produção antes de escrever uma linha de código (2026-09-06), na
-- campanha DEMO da Onda 00, para a contabilidade `maxwell.mr@hotmail.com`:
--
--   token 71f68d10…  REVOGADO em 2026-09-06T23:38:22   (criado 09-05)
--   token c31a75e8…  REVOGADO em 2026-09-06T23:51:41   (criado 09-06T23:38:13)
--   token e01ccdf3…  ATIVO                              (criado 09-06T23:51:32)
--
-- Ou seja: **a reemissão SEMPRE funcionou.** `useRevogarToken` (08.11) marca a
-- linha antiga e insere uma nova, que recebe token por DEFAULT do banco. Depois
-- de duas revogações havia exatamente UM envio ativo, com token novo.
--
-- O que NÃO existia era o caminho de **entrega**: nenhuma tela mostra o link,
-- o CSV de `/cobertura` não traz link, e o CRM não dispara e-mail (quem envia é
-- a Brevo, a partir de CSV exportado por script). Resultado prático: revogar
-- era uma ação sem saída — quebrava o link antigo e o novo nascia invisível.
-- O sintoma relatado ("não gera token novo") e a causa ("ninguém consegue ver o
-- token novo para reenviá-lo") são coisas diferentes, e só a segunda precisa de
-- conserto.
--
-- POR QUE UMA VIEW, E NÃO SIMPLESMENTE LER A COLUNA NA TELA
--
-- `envios_campanha.token` é legível hoje por Admin, Presidente e Secretaria —
-- a RLS restringe QUAIS LINHAS, nunca QUAIS COLUNAS (sql/20 linhas 384-403). A
-- Subetapa 08.11 fechou com o critério "o token não aparece em claro para quem
-- não é Admin" e, para cumpri-lo, deixou a feature de cobertura sem NENHUMA
-- leitura do token — com um teste de guarda que falha se alguém a acrescentar.
--
-- Agora a tela precisa do valor (para o Admin poder reenviar o link). A escolha
-- é entre afrouxar a guarda no frontend ou pôr a regra no BANCO. Esta view põe
-- no banco: quem não é Admin recebe `token = null`, decidido pelo Postgres, não
-- pela UI. É exatamente a Parte 2 de `sql/22_cobertura_08_11.sql`, escrita
-- naquela subetapa e deixada para revisão — o desenho não mudou.
--
-- ADITIVA E SEM AFROUXAMENTO: cria um objeto novo, não altera policy nem grant
-- de nada existente. Nenhum papel passa a ler o que não lia (Presidente e
-- Secretaria já leem a tabela crua; fechar ISSO continua sendo decisão
-- pendente do Maxwell, e este arquivo não a toma).
--
-- IDEMPOTENTE: pode ser reaplicado; a 2ª execução tem delta zero.
-- ============================================================================

create or replace view v_envios_campanha_mascarada
with (security_invoker = on) as
select
  e.id,
  e.campanha_id,
  e.contabilidade_id,
  e.estabelecimento_id,
  e.email,
  -- Mascaramento de COLUNA, não de LINHA: a RLS de `envios_campanha` já decide
  -- corretamente QUEM vê a linha (admin/presidente/secretaria). Aqui só se
  -- decide se o CONTEÚDO do token aparece em claro. `security_invoker = on`
  -- mantém a RLS ligada — o oposto do SECURITY DEFINER de `v_fila_parceiro`,
  -- que bypassa RLS de propósito para um filtro de LINHA.
  case when fn_eh('admin') then e.token else null end as token,
  e.token_expira_em,
  e.token_revogado_em,
  e.descadastrado_em,
  e.enviado_em,
  e.primeira_remessa_em,
  e.ultima_remessa_em,
  e.created_at
from envios_campanha e;

comment on view v_envios_campanha_mascarada is
  'Espelho de envios_campanha com o token em claro APENAS para o Admin (Subetapa 08.11, Parte 2, '
  'aplicada na 9.1). Existe para a tela de cobertura poder reemitir e ENTREGAR o link novo depois de '
  'uma revogação — sem essa leitura, revogar quebrava o link antigo e o novo nascia invisível. '
  'Não substitui o fechamento da leitura direta de envios_campanha por Presidente/Secretaria, que '
  'segue pendente (sql/20 linhas 384-403).';

grant select on v_envios_campanha_mascarada to authenticated;
revoke select on v_envios_campanha_mascarada from anon;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS de aplicar. Medem o catálogo e o COMPORTAMENTO,
-- que é onde a leitura de código não alcança (orientacoes.md §2.15).
--
-- (1) A view nasceu com security_invoker (sem ele, ignoraria a RLS das bases):
--   select c.relname, c.reloptions from pg_class c
--    where c.relname = 'v_envios_campanha_mascarada';
--   -- esperado: {security_invoker=on}
--
-- (2) `anon` não alcança, `authenticated` só lê:
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_name = 'v_envios_campanha_mascarada' and grantee in ('anon','authenticated')
--    group by grantee;
--   -- esperado: uma linha só — authenticated | SELECT
--
-- (3) O mascaramento por papel, que é o ponto do arquivo — conferir com login
--     real de Admin e de Secretaria (tests/rls/cobertura.spec.ts faz isso):
--     Admin      → token preenchido
--     Secretaria → MESMA linha, token null (sem erro: §2.6b — a view não nega,
--                  ela apaga o valor)
-- ----------------------------------------------------------------------------
