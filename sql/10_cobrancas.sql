-- ============================================================================
-- 10_cobrancas.sql · MOTOR DE GERAÇÃO DE COBRANÇAS (Subetapa 02.6)
-- Matriz do item 7 (plano_fases.md): faturas de contribuição (anual, por CCT),
-- faturas de mensalidade (mensal, por Ouro) e guias de pagamento (agregação
-- das faturas `holerite` por empresa).
--
-- Princípios:
--  · Idempotência é do BANCO, não da UI: unique (trabalhador_id, tipo,
--    competencia) em faturas e unique (cnpj_basico, tipo, competencia) em
--    repasses. Duplo clique não duplica cobrança.
--  · Conciliação exata: repasses.valor_total é SEMPRE recalculado como a soma
--    das faturas vinculadas — nunca incrementado.
--  · Quem não tem base de cálculo (sem piso na CCT e sem salário informado) é
--    PULADO e devolvido na lista, nunca cobrado por um valor inventado.
--  · Todas security definer com fn_guarda_job() → só Admin (ou service_role,
--    para os jobs do pg_cron).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- G1 · Faturas de contribuição sindical — anual, por CCT
-- Disparo: botão do Admin, DEPOIS da organização interna da CCT (02.5).
-- Alvo: Prata e Ouro (Bronze entregou carta de oposição → não recolhe).
-- Valor: v_base_calculo_trabalhador (5% do piso, teto R$ 100).
-- ----------------------------------------------------------------------------
create or replace function fn_gerar_faturas_contribuicao(p_convencao_id uuid)
returns table (geradas integer, puladas integer, pulados jsonb)
language plpgsql security definer as $$
declare
  v_ano         integer;
  v_nome        text;
  v_competencia date;
  v_vencimento  date;
  v_geradas     integer := 0;
  v_puladas     integer := 0;
  v_pulados     jsonb;
begin
  perform fn_guarda_job();

  select ano_base, nome into v_ano, v_nome
    from convencoes_coletivas where id = p_convencao_id;
  if v_ano is null then
    raise exception 'Convenção não encontrada';
  end if;

  -- Competência anual estável: é ela que, no unique (trabalhador_id, tipo,
  -- competencia), impede cobrar a mesma pessoa duas vezes no mesmo ano-base.
  -- Mudar esta convenção depois de gerar faturas reais quebra a idempotência.
  v_competencia := make_date(v_ano, 1, 1);
  v_vencimento  := current_date + (fn_config('dias_vencimento_boleto', '30'))::int;

  -- v_base_calculo_trabalhador dá no máximo UMA linha por trabalhador: o
  -- índice único parcial ux_vinculo_principal_ativo garante um só vínculo
  -- principal ativo. Não há risco de fatura dobrada aqui.
  with alvo as (
    select bc.trabalhador_id,
           t.nome,
           t.cpf,
           bc.valor_contribuicao_anual,
           bc.forma_pagamento_preferida
      from v_base_calculo_trabalhador bc
      join trabalhadores t   on t.id = bc.trabalhador_id
      join estabelecimentos e on e.id = bc.estabelecimento_id
     where e.convencao_id = p_convencao_id
       and t.status_cadastro = 'aprovado'
       and t.nivel in ('prata', 'ouro')
  ),
  ins as (
    insert into faturas (trabalhador_id, tipo, competencia, valor,
                         data_vencimento, forma_cobranca)
    select a.trabalhador_id, 'contribuicao_sindical', v_competencia,
           a.valor_contribuicao_anual, v_vencimento, a.forma_pagamento_preferida
      from alvo a
     where a.valor_contribuicao_anual is not null
    on conflict (trabalhador_id, tipo, competencia) do nothing
    returning 1
  ),
  pul as (
    select trabalhador_id, nome from alvo where valor_contribuicao_anual is null
  )
  select (select count(*) from ins),
         (select count(*) from pul),
         (select coalesce(
                   jsonb_agg(jsonb_build_object(
                     'trabalhador_id', trabalhador_id, 'nome', nome
                   ) order by nome), '[]'::jsonb)
            from pul)
    into v_geradas, v_puladas, v_pulados;

  return query select v_geradas, v_puladas, v_pulados;
end $$;

-- ----------------------------------------------------------------------------
-- G2 · Faturas de mensalidade do convênio — mensal, por Ouro
-- Disparo: cron mensal (dia 1) ou botão do Admin.
-- Valor: v_mensalidade_titular (1% do salário-base + adicionais).
-- ----------------------------------------------------------------------------
create or replace function fn_gerar_faturas_mensalidade(p_competencia date)
returns table (geradas integer, puladas integer, pulados jsonb)
language plpgsql security definer as $$
declare
  v_competencia date;
  v_vencimento  date;
  v_geradas     integer := 0;
  v_puladas     integer := 0;
  v_pulados     jsonb;
begin
  perform fn_guarda_job();

  -- Normaliza para o dia 1: a competência é o MÊS, e o unique depende dela ser
  -- idêntica entre execuções (rodar dia 1 e dia 3 não pode gerar duas faturas).
  v_competencia := date_trunc('month', p_competencia)::date;
  v_vencimento  := current_date + (fn_config('dias_vencimento_boleto', '30'))::int;

  with alvo as (
    select mt.trabalhador_id,
           t.nome,
           mt.valor_mensalidade,
           mt.forma_pagamento_preferida
      from v_mensalidade_titular mt
      join trabalhadores t on t.id = mt.trabalhador_id
     where t.status_cadastro = 'aprovado'
       and t.nivel = 'ouro'
  ),
  ins as (
    insert into faturas (trabalhador_id, tipo, competencia, valor,
                         data_vencimento, forma_cobranca)
    select a.trabalhador_id, 'mensalidade_convenio', v_competencia,
           a.valor_mensalidade, v_vencimento, a.forma_pagamento_preferida
      from alvo a
     where a.valor_mensalidade is not null
    on conflict (trabalhador_id, tipo, competencia) do nothing
    returning 1
  ),
  pul as (
    select trabalhador_id, nome from alvo where valor_mensalidade is null
  )
  select (select count(*) from ins),
         (select count(*) from pul),
         (select coalesce(
                   jsonb_agg(jsonb_build_object(
                     'trabalhador_id', trabalhador_id, 'nome', nome
                   ) order by nome), '[]'::jsonb)
            from pul)
    into v_geradas, v_puladas, v_pulados;

  return query select v_geradas, v_puladas, v_pulados;
end $$;

-- ----------------------------------------------------------------------------
-- G3 · Guias de pagamento — agrega as faturas `holerite` por empresa
-- Disparo: cron (após a geração de faturas) ou botão do Admin.
--
-- `bloqueadas` é a contagem de faturas que NÃO puderam entrar em nenhuma guia
-- porque a guia daquela empresa/competência já está `recebido`. Anexá-las
-- silenciosamente inflaria uma guia já quitada — então elas ficam de fora e
-- são reportadas para tratamento manual (fatura excepcional ou ajuste).
-- ----------------------------------------------------------------------------
create or replace function fn_gerar_guias(p_tipo tipo_fatura, p_competencia date)
returns table (guias_criadas integer, faturas_vinculadas integer,
               bloqueadas integer, valor_total numeric)
language plpgsql security definer as $$
declare
  v_comp         date;
  v_vencimento   date;
  v_criadas      integer := 0;
  v_vinculadas   integer := 0;
  v_bloqueadas   integer := 0;
  v_total        numeric(12,2) := 0;
begin
  perform fn_guarda_job();

  -- Contribuição usa competência = 1º de janeiro do ano-base; mensalidade usa o
  -- 1º do mês. date_trunc('month') é idempotente para os dois casos.
  v_comp       := date_trunc('month', p_competencia)::date;
  v_vencimento := current_date + (fn_config('dias_vencimento_boleto', '30'))::int;

  -- 1) Uma guia por empresa com faturas holerite pendentes.
  --    O unique (cnpj_basico, tipo, competencia) faz a 2ª execução não duplicar.
  --    fn_gera_guia_pagamento() é avaliada antes do conflito, então o número
  --    pode ter saltos — é sequência de emissão, não contagem.
  with pendentes as (
    select distinct bc.cnpj_basico
      from faturas f
      join v_base_calculo_trabalhador bc on bc.trabalhador_id = f.trabalhador_id
     where f.tipo = p_tipo
       and f.competencia = v_comp
       and f.forma_cobranca = 'holerite'
       and f.repasse_id is null
       and bc.cnpj_basico is not null
  ),
  novas as (
    insert into repasses (cnpj_basico, tipo, competencia, valor_total,
                          data_vencimento, numero_guia_pagamento, status)
    select p.cnpj_basico, p_tipo, v_comp, 0, v_vencimento,
           fn_gera_guia_pagamento(), 'previsto'
      from pendentes p
    on conflict (cnpj_basico, tipo, competencia) do nothing
    returning 1
  )
  select count(*) into v_criadas from novas;

  -- 2) Vincula as faturas à guia da empresa — nunca a uma guia já recebida.
  update faturas f
     set repasse_id = r.id
    from v_base_calculo_trabalhador bc,
         repasses r
   where f.trabalhador_id = bc.trabalhador_id
     and r.cnpj_basico    = bc.cnpj_basico
     and r.tipo           = p_tipo
     and r.competencia    = v_comp
     and r.status <> 'recebido'
     and f.tipo           = p_tipo
     and f.competencia    = v_comp
     and f.forma_cobranca = 'holerite'
     and f.repasse_id is null;
  get diagnostics v_vinculadas = row_count;

  -- 3) Sobrou fatura sem guia? Só pode ser guia já recebida — reporta.
  select count(*) into v_bloqueadas
    from faturas f
    join v_base_calculo_trabalhador bc on bc.trabalhador_id = f.trabalhador_id
   where f.tipo = p_tipo
     and f.competencia = v_comp
     and f.forma_cobranca = 'holerite'
     and f.repasse_id is null
     and bc.cnpj_basico is not null;

  -- 4) Conciliação: valor_total = Σ das faturas vinculadas, SEMPRE recalculado.
  --    Guia recebida não é tocada (é registro liquidado).
  update repasses r
     set valor_total = coalesce(
           (select sum(f.valor) from faturas f where f.repasse_id = r.id), 0)
   where r.tipo = p_tipo
     and r.competencia = v_comp
     and r.status <> 'recebido';

  select coalesce(sum(r.valor_total), 0) into v_total
    from repasses r where r.tipo = p_tipo and r.competencia = v_comp;

  return query select v_criadas, v_vinculadas, v_bloqueadas, v_total;
end $$;

-- ----------------------------------------------------------------------------
-- Hardening (mesmo padrão de 05_hardening.sql)
-- ----------------------------------------------------------------------------
alter function public.fn_gerar_faturas_contribuicao(uuid)             set search_path = public, extensions, pg_temp;
alter function public.fn_gerar_faturas_mensalidade(date)              set search_path = public, extensions, pg_temp;
alter function public.fn_gerar_guias(tipo_fatura, date)               set search_path = public, extensions, pg_temp;

-- Disparo pelo botão do Admin: authenticated executa, a guarda decide.
-- anon nunca — quem barra é este revoke (erro 42501), não o fn_guarda_job,
-- que só levanta quando auth.uid() is not null.
revoke execute on function public.fn_gerar_faturas_contribuicao(uuid)  from public, anon;
revoke execute on function public.fn_gerar_faturas_mensalidade(date)   from public, anon;
revoke execute on function public.fn_gerar_guias(tipo_fatura, date)    from public, anon;
grant  execute on function public.fn_gerar_faturas_contribuicao(uuid)  to authenticated;
grant  execute on function public.fn_gerar_faturas_mensalidade(date)   to authenticated;
grant  execute on function public.fn_gerar_guias(tipo_fatura, date)    to authenticated;

-- Agendamento (pg_cron) — a geração mensal roda depois do snapshot:
--   select cron.schedule('faturas-mensalidade', '0 5 1 * *',
--     $$select fn_gerar_faturas_mensalidade(current_date)$$);
--   select cron.schedule('guias-mensalidade',   '30 5 1 * *',
--     $$select fn_gerar_guias('mensalidade_convenio', current_date)$$);
-- A contribuição anual NÃO é agendada: depende da organização interna da CCT,
-- que é ato humano deliberado (02.5).

-- ============================================================================
-- FIM · 10_cobrancas.sql
-- ============================================================================
