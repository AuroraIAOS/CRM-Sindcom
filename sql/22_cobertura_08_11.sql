-- ============================================================================
-- CRM SINDCOM — sql/22_cobertura_08_11.sql
-- ETAPA 08 · Subetapa 08.11 — Acompanhamento por cobertura e revogação de token
--
-- DOIS OBJETOS NESTE ARQUIVO, COM STATUS DE APLICAÇÃO DIFERENTES:
--
--   PARTE 1 — v_cobertura_contabilidades  → JÁ APLICADA em produção.
--     Agregação pura (contabilidades × contabilidade_estabelecimentos ×
--     vinculos_empregaticios), `security_invoker = on`, nenhuma coluna nova
--     exposta a papel nenhum — as quatro tabelas de origem já são lidas por
--     Admin/Presidente/Secretaria/Jurídico via as policies de 20_comunicacao_
--     externa.sql e 01_schema.sql. Existe por eficiência (evita paginar 7.438
--     linhas de `contabilidade_estabelecimentos` no navegador, orientacoes.md
--     §2.4) — não é decisão de segurança.
--
--   PARTE 2 — v_envios_campanha_mascarada → NÃO APLICADA. Comentada de
--     propósito, ao final deste arquivo. `sql/20_comunicacao_externa.sql`
--     linhas 384-403 registra a "troca consciente" pendente: a Secretaria e o
--     Presidente leem `envios_campanha` inteira, e a coluna `token` está
--     nela — RLS restringe QUAIS LINHAS, nunca QUAIS COLUNAS. Fechar essa
--     brecha é mudar o que um papel autenticado consegue LER via a API do
--     Supabase — decisão de segurança, mesmo sendo um endurecimento, não um
--     afrouxamento. Regra da ETAPA 08 (CLAUDE.md / handoff do Circuito 3):
--     "escreva o SQL, peça revisão de Maxwell antes de aplicar." A tela desta
--     subetapa NÃO depende desta view — "revogar token" nunca lê o valor do
--     token (só marca `token_revogado_em` e insere uma linha nova, que recebe
--     token por DEFAULT) —, então a funcionalidade entregue não fica bloqueada
--     à espera da revisão.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1 — cobertura por contabilidade (APLICADA)
--
-- Granularidade: UMA LINHA POR CONTABILIDADE (não por estabelecimento — ver
-- orientacoes.md §2.2 sobre deixar isso explícito). `total_estabelecimentos`
-- vem de `contabilidade_estabelecimentos`; `estabelecimentos_cobertos` conta
-- quantos desses têm ao menos um `vinculos_empregaticios`. Cobertura é QUERY,
-- nunca campo materializado (spec/handoff da 08.11) — um `respondido_em`
-- booleano esconderia as 89 empresas que faltam, e é justamente esse número
-- que dirige o follow-up da Denise.
-- ----------------------------------------------------------------------------
create or replace view v_cobertura_contabilidades
with (security_invoker = on) as
with estab_cobertos as (
  select distinct estabelecimento_id from vinculos_empregaticios
)
select
  c.id as contabilidade_id,
  c.nome,
  c.email,
  count(ce.estabelecimento_id)::int as total_estabelecimentos,
  count(ec.estabelecimento_id)::int as estabelecimentos_cobertos
from contabilidades c
join contabilidade_estabelecimentos ce on ce.contabilidade_id = c.id
left join estab_cobertos ec on ec.estabelecimento_id = ce.estabelecimento_id
group by c.id, c.nome, c.email;

comment on view v_cobertura_contabilidades is
  'Uma linha por contabilidade (Subetapa 08.11): total de estabelecimentos vinculados × quantos já '
  'têm ao menos um trabalhador. Cobertura é sempre calculada aqui, nunca gravada em coluna — evita o '
  'erro de um booleano que escondesse o número de empresas faltando.';

grant select on v_cobertura_contabilidades to authenticated;
revoke select on v_cobertura_contabilidades from anon;

-- ============================================================================
-- PARTE 2 — NÃO APLICAR sem revisão de Maxwell (ver cabeçalho do arquivo).
-- Mantida como texto para revisão; comentada para não rodar por engano se
-- este arquivo inteiro for colado num editor SQL.
-- ============================================================================

-- create or replace view v_envios_campanha_mascarada
-- with (security_invoker = on) as
-- select
--   e.id,
--   e.campanha_id,
--   e.contabilidade_id,
--   e.estabelecimento_id,
--   e.email,
--   -- Mascaramento de COLUNA, não de LINHA: a RLS de `envios_campanha` já
--   -- decide corretamente QUEM vê a linha (admin/presidente/secretaria).
--   -- Aqui só se decide se o CONTEÚDO do token aparece em claro. Por isso
--   -- `security_invoker = on` (mantém a RLS ligada) em vez do padrão
--   -- SECURITY DEFINER de `v_fila_parceiro` (que bypassa RLS de propósito
--   -- para um filtro de LINHA por `fn_parceiro_id()`) — aqui não há linha
--   -- nenhuma a esconder, só uma credencial de baixo poder (o token só
--   -- permite ENVIAR uma remessa, que a Denise revisa antes de virar
--   -- cadastro) de quem já tem acesso de leitura mais amplo.
--   case when fn_eh('admin') then e.token else null end as token,
--   e.token_expira_em,
--   e.token_revogado_em,
--   e.enviado_em,
--   e.primeira_remessa_em,
--   e.ultima_remessa_em,
--   e.created_at
-- from envios_campanha e;
--
-- comment on view v_envios_campanha_mascarada is
--   'Espelho de envios_campanha com o token mascarado para quem não é Admin (Subetapa 08.11, '
--   'sql/20_comunicacao_externa.sql linhas 384-403). Nenhuma tela desta subetapa depende dela — '
--   'escrita para revisão de Maxwell antes de aplicar.';
--
-- grant select on v_envios_campanha_mascarada to authenticated;
-- revoke select on v_envios_campanha_mascarada from anon;
--
-- -- Prova de que a máscara funciona (rode manualmente após aplicar, com login
-- -- real de cada papel — nunca por leitura de código, orientacoes.md §2.6b):
-- --   select token from v_envios_campanha_mascarada limit 1;   -- Admin: uuid · Secretaria/Presidente: null
