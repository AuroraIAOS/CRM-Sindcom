-- ============================================================================
-- CRM SINDCOM — sql/26_cobertura_empresas_09_01.sql
-- ETAPA 09 · Subetapa 9.1 — Cobertura por EMPRESA (trilha B, empresas isoladas)
--
-- POR QUE ELA NÃO É A MESMA VIEW DAS CONTABILIDADES
-- `v_cobertura_contabilidades` responde "quantas das MINHAS empresas já
-- mandaram" — uma linha por escritório, com duas contagens. Aqui não há
-- carteira: a empresa isolada tem UM estabelecimento e a pergunta é binária
-- ("mandou ou não mandou"). Forçar as duas no mesmo objeto produziria uma view
-- com colunas que só fazem sentido em metade das linhas.
--
-- O NÚMERO QUE MUDA O DESENHO: 8.238 envios de empresa isolada, contra 957 de
-- contabilidade. O PostgREST trunca em 1000 linhas SEM AVISAR (orientacoes.md
-- §2.4), então a tela desta view **filtra e pagina no servidor** — não dá para
-- carregar tudo e filtrar no navegador, como a tela de contabilidades faz com
-- as 953 dela.
--
-- UMA LINHA POR ESTABELECIMENTO, E O `distinct on` É O QUE GARANTE ISSO
-- Revogar um token cria um envio NOVO e mantém o antigo (histórico, 08.11), então
-- um `join` simples devolveria uma linha por envio e a mesma empresa apareceria
-- duas vezes na tela — a armadilha do §2.2, aqui visível a olho nu. O
-- `distinct on (estabelecimento_id)` com `order by created_at desc` mantém
-- exatamente o envio MAIS RECENTE, que é o que vale.
--
-- E ele mantém a empresa na lista mesmo quando o link mais recente está
-- revogado (`link_revogado`), de propósito: filtrar por `token_revogado_em is
-- null` faria sumir da tela justamente quem ficou sem link ativo por uma falha
-- parcial — o caso que mais precisa ser visto.
--
-- A COBERTURA VEM DE UM JOIN PRÉ-AGREGADO, NÃO DE UM `exists` CORRELACIONADO —
-- e isso foi MEDIDO, não escolhido por estilo. A primeira versão usava
-- `exists (select 1 from vinculos_empregaticios ...)`; a tela levava **6,8
-- segundos** para abrir a primeira página e o navegador chegou a travar. As
-- medições isolaram a causa:
--
--   5 linhas, sem `order by`, sem count …………………  103 ms
--   50 linhas com `order by coberta, razao_social` … 2.866 ms
--   o mesmo, com count exact ……………………………………………… 6.826 ms
--
-- Ordenar por `coberta` obriga o Postgres a avaliar a coluna em TODAS as 8.238
-- linhas — ou seja, 8.238 subconsultas correlacionadas. Com `limit` e sem
-- ordenação ele avaliava só as 5 devolvidas, por isso a versão rápida
-- enganava. O `left join` sobre o conjunto distinto de vínculos (35 linhas
-- hoje) resolve em uma passada, e é o mesmo padrão que
-- `v_cobertura_contabilidades` já usava.
--
-- O join continua sendo sobre o conjunto DISTINTO: um estabelecimento com 12
-- trabalhadores viraria 12 linhas num join direto, e a contagem da tela
-- mentiria para cima (§2.2).
--
-- SEGURANÇA: `security_invoker = on` como todas as views deste projeto
-- (§2.15). Quem não lê `envios_campanha` (Jurídico, parceiro) recebe zero
-- linhas aqui — a view não concede nada que a RLS de origem já não conceda. O
-- TOKEN NÃO ENTRA: quem precisa dele usa `v_envios_campanha_mascarada`
-- (sql/25), onde só o Admin o recebe em claro.
--
-- IDEMPOTENTE: pode ser reaplicado; a 2ª execução tem delta zero.
-- ============================================================================

create or replace view v_cobertura_empresas
with (security_invoker = on) as
with estab_cobertos as (
  select distinct estabelecimento_id from vinculos_empregaticios
)
select distinct on (e.estabelecimento_id)
  e.estabelecimento_id,
  e.id                as envio_id,
  e.campanha_id,
  est.cnpj_completo,
  emp.razao_social,
  est.nome_fantasia,
  est.municipio_id,
  e.email,
  (ec.estabelecimento_id is not null) as coberta,
  e.descadastrado_em,
  (e.token_revogado_em is not null)   as link_revogado,
  e.primeira_remessa_em,
  e.ultima_remessa_em,
  e.created_at
from envios_campanha e
join estabelecimentos est on est.id = e.estabelecimento_id
join empresas emp on emp.cnpj_basico = est.cnpj_basico
left join estab_cobertos ec on ec.estabelecimento_id = e.estabelecimento_id
where e.estabelecimento_id is not null
order by e.estabelecimento_id, e.created_at desc;

comment on view v_cobertura_empresas is
  'Uma linha por empresa isolada da campanha (Subetapa 9.1): o envio MAIS RECENTE de cada '
  'estabelecimento, com `coberta` dizendo se já existe trabalhador vinculado. Complementa '
  'v_cobertura_contabilidades, que responde a pergunta de carteira; aqui a pergunta é binária. '
  'Cobertura é sempre calculada, nunca gravada. O token não entra: para o link em claro existe '
  'v_envios_campanha_mascarada, restrita ao Admin.';

grant select on v_cobertura_empresas to authenticated;
revoke select on v_cobertura_empresas from anon;

-- O índice que serve ao `distinct on`: sem ele, cada abertura da tela ordena
-- 8.236 linhas do zero. Parcial porque a metade contabilidade da tabela não
-- participa desta view.
create index if not exists idx_envios_estab_recente
  on envios_campanha (estabelecimento_id, created_at desc)
  where estabelecimento_id is not null;

analyze envios_campanha;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS de aplicar.
--
-- (1) security_invoker no lugar e `anon` fora:
--   select c.relname, c.reloptions, has_table_privilege('anon', c.oid, 'SELECT') as anon_le
--     from pg_class c where c.relname = 'v_cobertura_empresas';
--   -- esperado: {security_invoker=on} · false
--
-- (2) UMA linha por estabelecimento, mesmo com token revogado e reemitido —
--     é o que o `distinct on` promete, e é a diferença entre a tela contar
--     certo e contar duas vezes a mesma empresa:
--   select count(*) as linhas,
--          count(distinct estabelecimento_id) as estabelecimentos
--     from v_cobertura_empresas;
--   -- esperado: os dois números IGUAIS
--
-- (3) O universo bate com os envios de empresa isolada:
--   select (select count(distinct estabelecimento_id) from envios_campanha
--            where estabelecimento_id is not null) as esperado,
--          (select count(*) from v_cobertura_empresas) as na_view;
--   -- esperado: iguais
-- ----------------------------------------------------------------------------
