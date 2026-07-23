-- ============================================================================
-- 16. ATENDIMENTOS JURÍDICOS — vocabulário de status (Subetapa 04.1)
-- ============================================================================
-- Contexto: `atendimentos_juridicos.status` nasceu como `text` livre com
-- default 'aberto' — sem enum e sem CHECK. A tela /juridico precisa de um
-- vocabulário fechado, e a decisão de Maxwell (2026-07-22) foi colocar a
-- regra NO BANCO, coerente com o princípio do projeto: a segurança e a
-- padronização reais são do Postgres; o frontend só traduz.
--
-- Não vira enum porque `status` já existe como `text` em produção e a coluna
-- pode ganhar valores no futuro (ex.: 'suspenso'): um CHECK é alterável com
-- um único ALTER, um enum exigiria ALTER TYPE + reescrita.
--
-- Idempotente: pode ser reaplicado sem erro.
-- ============================================================================

alter table atendimentos_juridicos
  drop constraint if exists chk_status_atendimento;

alter table atendimentos_juridicos
  add constraint chk_status_atendimento
  check (status in ('aberto', 'em_andamento', 'concluido', 'arquivado'));

comment on column atendimentos_juridicos.status is
  'Vocabulário fechado por chk_status_atendimento: aberto | em_andamento | concluido | arquivado. Rótulos em pt-BR ficam no frontend (features/juridico/api.ts).';

-- Índices de apoio à tela /juridico: a lista ordena por data (desc) e filtra
-- por status. Sem eles, a listagem faz seq scan à medida que a base cresce.
create index if not exists idx_atendimentos_data on atendimentos_juridicos (data desc);
create index if not exists idx_atendimentos_status on atendimentos_juridicos (status);

-- ----------------------------------------------------------------------------
-- Conferência (rodar após aplicar):
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'atendimentos_juridicos'::regclass
--      and conname = 'chk_status_atendimento';
--
--   -- deve FALHAR com 23514:
--   insert into atendimentos_juridicos (trabalhador_id, tipo, status)
--   values ('<uuid>', 'orientacao', 'inventado');
-- ----------------------------------------------------------------------------
