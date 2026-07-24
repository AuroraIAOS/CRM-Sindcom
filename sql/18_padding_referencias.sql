-- ============================================================================
-- CRM SINDCOM — 18_padding_referencias.sql
-- Subetapa 06.0 · Zero-padding canônico das tabelas de referência da RFB
--
-- POR QUÊ
-- A carga da Fase 0 gravou os códigos de referência SEM zeros à esquerda
-- (`5`, `1`, `111301`), provavelmente por passarem por um intermediário
-- numérico. Os CSVs de Dados Abertos do CNPJ entregam esses mesmos códigos
-- com largura fixa (`05`, `01`, `0111301`). Sem este alinhamento, TODA linha
-- de empresas/estabelecimentos violaria as FKs de natureza jurídica,
-- qualificação, motivo de situação e CNAE — 100% de rejeição em colunas
-- presentes em todas as linhas (docs/plano_importacao_rfb.md §3.1).
--
-- Larguras conforme o layout oficial do CNPJ:
--   cnaes 7 · naturezas_juridicas 4 · qualificacoes_responsavel 2
--   motivos_situacao_cadastral 2
--
-- QUANDO
-- Executado com empresas e estabelecimentos VAZIAS (reset de 2026-07-23).
-- É a única janela barata: com a base carregada, mexer nestes PKs implicaria
-- arrastar ~120 mil chaves estrangeiras.
--
-- SEGURANÇA
-- Guardas abortam a migração (nada é gravado) se: houver dependente em
-- empresas/estabelecimentos, código não-numérico, código maior que a largura
-- alvo, ou colisão de PK após o padding. Idempotente: `lpad` de um valor já
-- padded devolve ele mesmo, e o WHERE só alcança o que está curto.
--
-- Estas 4 tabelas não têm trigger de auditoria nem de updated_at
-- (01_schema.sql §14) — a migração não gera ruído em `auditoria`.
-- ============================================================================

do $$
declare
  v_empresas          bigint;
  v_estabelecimentos  bigint;
  v_problema          bigint;
begin
  -- ---------------------------------------------------------------- guarda 1
  -- Dependentes precisam estar vazios: um UPDATE de PK com filho existente
  -- ou falharia na FK, ou (pior) exigiria cascata não desejada aqui.
  select count(*) into v_empresas from empresas;
  select count(*) into v_estabelecimentos from estabelecimentos;
  if v_empresas > 0 or v_estabelecimentos > 0 then
    raise exception
      'ABORTADO: empresas (%) / estabelecimentos (%) não estão vazias. '
      'Esta migração só é segura antes da carga da Etapa 06.',
      v_empresas, v_estabelecimentos;
  end if;

  -- ---------------------------------------------------------------- guarda 2
  -- Código não-numérico ou mais largo que o alvo indica que a premissa do
  -- layout mudou — parar e reavaliar, nunca truncar dado silenciosamente.
  select count(*) into v_problema from (
    select codigo from cnaes                      where codigo !~ '^[0-9]+$' or length(codigo) > 7
    union all
    select codigo from naturezas_juridicas        where codigo !~ '^[0-9]+$' or length(codigo) > 4
    union all
    select codigo from qualificacoes_responsavel  where codigo !~ '^[0-9]+$' or length(codigo) > 2
    union all
    select codigo from motivos_situacao_cadastral where codigo !~ '^[0-9]+$' or length(codigo) > 2
  ) x;
  if v_problema > 0 then
    raise exception
      'ABORTADO: % código(s) não-numérico(s) ou acima da largura do layout.', v_problema;
  end if;

  -- ---------------------------------------------------------------- guarda 3
  -- Colisão: se `1` e `01` coexistissem, o padding fundiria dois domínios
  -- distintos numa só linha. Falhar alto é obrigatório — jamais sobrescrever.
  select count(*) into v_problema from (
    select 1 from cnaes                      group by lpad(codigo, 7, '0') having count(*) > 1
    union all
    select 1 from naturezas_juridicas        group by lpad(codigo, 4, '0') having count(*) > 1
    union all
    select 1 from qualificacoes_responsavel  group by lpad(codigo, 2, '0') having count(*) > 1
    union all
    select 1 from motivos_situacao_cadastral group by lpad(codigo, 2, '0') having count(*) > 1
  ) y;
  if v_problema > 0 then
    raise exception
      'ABORTADO: % colisão(ões) de chave primária após o padding.', v_problema;
  end if;

  -- ------------------------------------------------------------------ padding
  update cnaes                      set codigo = lpad(codigo, 7, '0') where length(codigo) < 7;
  update naturezas_juridicas        set codigo = lpad(codigo, 4, '0') where length(codigo) < 4;
  update qualificacoes_responsavel  set codigo = lpad(codigo, 2, '0') where length(codigo) < 2;
  update motivos_situacao_cadastral set codigo = lpad(codigo, 2, '0') where length(codigo) < 2;

  raise notice 'Padding aplicado com sucesso nas 4 tabelas de referência.';
end $$;

-- ============================================================================
-- FIM · 18_padding_referencias.sql
-- ============================================================================
