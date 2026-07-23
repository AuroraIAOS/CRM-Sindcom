-- ============================================================================
-- 17. VISÃO ANUAL DE CARTAS DE OPOSIÇÃO (Subetapa 04.2)
-- ============================================================================
-- Alimenta a tela `/cartas`: por ano-base, quem entregou e quem falta.
--
-- POR QUE ESTA VIEW SE APOIA EM `v_relatorio_convencao` EM VEZ DE REFAZER OS
-- JOINS: o universo de "quem deveria entregar" é exatamente o universo de
-- `fn_reclassificar_convencao` (aprovado + vínculo ativo + estabelecimento
-- regido pela CCT). Reescrever esses joins criaria uma segunda definição do
-- mesmo conceito, livre para divergir em silêncio — e o critério de aceite da
-- subetapa exige que a tela `/cartas` e a aba Relatório da CCT mostrem os
-- MESMOS números. Herdando a view, a igualdade é estrutural, não coincidência.
--
-- GRANULARIDADE DA LINHA (orientacoes.md §2.2): **uma linha por VÍNCULO**, não
-- por pessoa — herdada de `v_relatorio_convencao`. Quem tem dois vínculos
-- ativos na mesma CCT aparece duas vezes. Qualquer contagem ou exportação
-- PRECISA deduplicar por `trabalhador_id` antes (o hook
-- `features/cartas/api.ts` faz isso e é a única porta de entrada da tela).
--
-- `ano_base` vem da CCT, não da carta: é a convenção que define o ano-base e o
-- prazo de oposição, exatamente como no motor de reclassificação.
--
-- security_invoker = on: obedece ao RLS de quem consulta (a view expõe CPF).
-- Idempotente.
-- ============================================================================

create or replace view v_cartas_ano_base with (security_invoker = on) as
select
  r.convencao_id,
  r.convencao,
  r.ano_base,
  r.reclassificada_em,
  cc.data_limite_oposicao,
  r.trabalhador_id,
  r.cpf,
  r.trabalhador,
  r.nivel,
  r.estabelecimento_id,
  r.estabelecimento,
  r.empresa,
  ca.id           as carta_id,
  ca.data_entrega,
  ca.forma
from v_relatorio_convencao r
join convencoes_coletivas cc
  on cc.id = r.convencao_id
left join cartas_oposicao ca
  on ca.trabalhador_id = r.trabalhador_id
 and ca.ano_base = r.ano_base;

comment on view v_cartas_ano_base is
  'Visão anual de cartas de oposição (/cartas). UMA LINHA POR VÍNCULO — deduplicar por trabalhador_id antes de contar. Universo herdado de v_relatorio_convencao para bater com fn_reclassificar_convencao.';

-- ----------------------------------------------------------------------------
-- Conferência (deve bater com a simulação do motor):
--
--   select case
--            when nivel = 'ouro' and carta_id is not null then '4 Ouro com carta (nao regride)'
--            when nivel = 'ouro'                          then '3 Ouro sem carta'
--            when carta_id is not null                    then '1 Entregou -> Bronze'
--            else                                              '2 Sem carta -> Prata'
--          end as balde,
--          count(distinct trabalhador_id)
--     from v_cartas_ano_base
--    where convencao = 'DEMO — CCT Lojas do Kabum 2026'
--    group by 1 order by 1;
-- ----------------------------------------------------------------------------
