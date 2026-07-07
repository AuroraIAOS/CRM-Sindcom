-- ============================================================================
-- CRM SINDCOM — 04_dashboard.sql · Dashboard e rotinas automáticas
-- Executar APÓS 03_rls.sql (usa fn_role / fn_eh)
--
-- CONTEÚDO
--  A. configuracoes (parâmetros operacionais editáveis pelo Admin)
--  B. eventos_nivel (histórico de conversões/regressões — trigger automático)
--  C. snapshots_dashboard (fotografia mensal para gráficos de evolução)
--  D. Views do dashboard (v_dash_*) + relatório por CCT
--  E. Motor de dicas estratégicas (v_dash_dicas — 11 regras)
--  F. Rotinas automáticas (funções de job + agendamento pg_cron)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. CONFIGURAÇÕES OPERACIONAIS
-- ----------------------------------------------------------------------------
create table configuracoes (
  chave      text primary key,
  valor      text not null,
  descricao  text,
  updated_at timestamptz not null default now()
);
alter table configuracoes enable row level security;

create policy pol_config_select on configuracoes for select
  to authenticated using (fn_role() is not null);
create policy pol_config_admin on configuracoes for all
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));

create trigger trg_configuracoes_updated_at
  before update on configuracoes
  for each row execute function fn_set_updated_at();

insert into configuracoes (chave, valor, descricao) values
  ('dias_alerta_carta', '30', 'Antecedência (dias) do alerta de prazo de oposição de cada CCT'),
  ('dias_vencimento_boleto', '30', 'Vencimento default de boletos/guias contado da GERAÇÃO (editável por documento)');
-- Nota: a data limite da Carta de Oposição NÃO é global — é campo da própria
-- CCT (convencoes_coletivas.data_limite_oposicao), preenchida no registro.

create or replace function fn_config(p_chave text, p_default text)
returns text language sql stable as $$
  select coalesce((select valor from configuracoes where chave = p_chave), p_default);
$$;

-- ----------------------------------------------------------------------------
-- B. EVENTOS DE NÍVEL — cada mudança Bronze/Prata/Ouro vira um registro.
-- Alimenta: conversões mensais, churn, funil. Origem marcada por sessão
-- (manual | reclassificacao_anual | importacao | formulario).
-- ----------------------------------------------------------------------------
create table eventos_nivel (
  id              bigint generated always as identity primary key,
  trabalhador_id  uuid not null references trabalhadores (id) on delete cascade,
  nivel_anterior  nivel_protecao,          -- null = cadastro novo
  nivel_novo      nivel_protecao not null,
  origem          text not null default 'manual',
  created_at      timestamptz not null default now()
);
create index idx_eventos_nivel_mes on eventos_nivel (created_at);
alter table eventos_nivel enable row level security;

create policy pol_eventos_select on eventos_nivel for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
-- INSERT apenas via trigger security definer abaixo.

create or replace function fn_registra_evento_nivel()
returns trigger language plpgsql security definer as $$
begin
  insert into eventos_nivel (trabalhador_id, nivel_anterior, nivel_novo, origem)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.nivel end,
    new.nivel,
    coalesce(nullif(current_setting('app.origem_evento', true), ''), 'manual')
  );
  return new;
end $$;

create trigger trg_evento_nivel_insert
  after insert on trabalhadores
  for each row execute function fn_registra_evento_nivel();

create trigger trg_evento_nivel_update
  after update on trabalhadores
  for each row
  when (old.nivel is distinct from new.nivel)
  execute function fn_registra_evento_nivel();

-- ----------------------------------------------------------------------------
-- C. SNAPSHOTS MENSAIS — fotografia no dia 1 de cada mês
-- ----------------------------------------------------------------------------
create table snapshots_dashboard (
  id                 bigint generated always as identity primary key,
  data_ref           date not null,
  municipio_id       integer references municipios (id),  -- null = global
  nivel              nivel_protecao,                       -- null = todos
  qtd_trabalhadores  integer not null default 0,
  mrr_mensalidades   numeric(12,2),                        -- só nas linhas globais
  mrr_contribuicoes  numeric(12,2),
  created_at         timestamptz not null default now()
);
create unique index ux_snapshot on snapshots_dashboard
  (data_ref, coalesce(municipio_id, 0), coalesce(nivel::text, '__todos__'));
alter table snapshots_dashboard enable row level security;

create policy pol_snapshots_select on snapshots_dashboard for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));

-- ----------------------------------------------------------------------------
-- D. VIEWS DO DASHBOARD (security_invoker: obedecem ao RLS de quem consulta)
-- ----------------------------------------------------------------------------

-- D1. KPIs de topo (uma linha)
create or replace view v_dash_kpis with (security_invoker = on) as
select
  (select count(*) from trabalhadores where status_cadastro = 'aprovado')                         as total_trabalhadores,
  (select count(*) from trabalhadores where status_cadastro = 'aprovado' and nivel = 'bronze')    as bronze,
  (select count(*) from trabalhadores where status_cadastro = 'aprovado' and nivel = 'prata')     as prata,
  (select count(*) from trabalhadores where status_cadastro = 'aprovado' and nivel = 'ouro')      as ouro,
  (select count(*) from trabalhadores where created_at >= now() - interval '30 days')             as novos_30d,
  (select count(*) from trabalhadores where status_cadastro = 'pendente')
    + (select count(*) from beneficiados where status_cadastro = 'pendente')                      as cadastros_pendentes,
  (select count(*) from solicitacoes_admin where status = 'pendente')                             as fila_admin_pendente,
  (select coalesce(sum(vm.valor_mensalidade), 0)
     from v_mensalidade_titular vm
     join trabalhadores t on t.id = vm.trabalhador_id
    where t.status_cadastro = 'aprovado')                                                         as mrr_mensalidades,
  (select round(coalesce(sum(bc.valor_contribuicao_anual), 0) / 12, 2)
     from v_base_calculo_trabalhador bc
     join trabalhadores t on t.id = bc.trabalhador_id
    where t.status_cadastro = 'aprovado' and t.nivel in ('prata', 'ouro'))                        as mrr_contribuicoes,
  (select count(*) from repasses where status = 'em_atraso')                                      as guias_em_atraso,
  (select coalesce(sum(valor_total), 0) from repasses where status = 'em_atraso')                 as valor_guias_em_atraso,
  (select count(*) from faturas
    where status = 'inadimplente' and forma_cobranca = 'boleto_direto')                           as boletos_inadimplentes,
  (select coalesce(sum(valor), 0) from faturas
    where status = 'inadimplente' and forma_cobranca = 'boleto_direto')                           as valor_boletos_inadimplentes;

-- D2. Evolução mensal por nível (dos snapshots)
create or replace view v_dash_evolucao_niveis with (security_invoker = on) as
select data_ref, nivel, qtd_trabalhadores
from snapshots_dashboard
where municipio_id is null and nivel is not null
order by data_ref;

-- D3. Conversões e regressões mensais (dos eventos)
create or replace view v_dash_conversoes_mensais with (security_invoker = on) as
select
  date_trunc('month', created_at)::date as mes,
  count(*) filter (where nivel_anterior = 'bronze' and nivel_novo = 'prata')  as bronze_para_prata,
  count(*) filter (where nivel_anterior = 'prata'  and nivel_novo = 'ouro')   as prata_para_ouro,
  count(*) filter (where nivel_anterior = 'bronze' and nivel_novo = 'ouro')   as bronze_para_ouro,
  count(*) filter (where nivel_anterior is not null
                     and nivel_novo < nivel_anterior)                          as regressoes,
  count(*) filter (where nivel_anterior is null)                               as novos_cadastros
from eventos_nivel
group by 1
order by 1;

-- D4. Receita mensal por tipo (realizada × pendente)
create or replace view v_dash_receita_mensal with (security_invoker = on) as
select
  date_trunc('month', competencia)::date as mes,
  tipo,
  coalesce(sum(valor) filter (where status = 'paga'), 0)                        as receita_realizada,
  coalesce(sum(valor) filter (where status in ('aberta', 'inadimplente')), 0)   as receita_pendente
from faturas
group by 1, 2
order by 1;

-- D5. Mapa coroplético — base territorial (29 municípios)
-- Município do trabalhador = onde TRABALHA (estabelecimento do vínculo ativo);
-- fallback: residência. Junta com o GeoJSON do IBGE por codigo_ibge.
create or replace view v_dash_mapa with (security_invoker = on) as
with trab as (
  select coalesce(e.municipio_id, t.municipio_id) as municipio_id, t.nivel
  from trabalhadores t
  left join vinculos_empregaticios v
         on v.trabalhador_id = t.id and v.principal and v.data_desligamento is null
  left join estabelecimentos e on e.id = v.estabelecimento_id
  where t.status_cadastro = 'aprovado'
)
select
  m.id            as municipio_id,
  m.codigo_ibge,
  m.nome,
  m.sede,
  count(tr.municipio_id)                                    as total_trabalhadores,
  count(*) filter (where tr.nivel = 'bronze')               as bronze,
  count(*) filter (where tr.nivel = 'prata')                as prata,
  count(*) filter (where tr.nivel = 'ouro')                 as ouro,
  (select count(*) from estabelecimentos e2
    where e2.municipio_id = m.id and e2.situacao_cadastral = '02') as estabelecimentos_ativos
from municipios m
left join trab tr on tr.municipio_id = m.id
where m.base_territorial
group by m.id, m.codigo_ibge, m.nome, m.sede;

-- D6. Parceiros — utilização e economia (janela de 90 dias)
create or replace view v_dash_top_parceiros with (security_invoker = on) as
select
  p.id,
  p.nome,
  count(*) filter (where s.status = 'executada')             as executadas_90d,
  count(*) filter (where s.status = 'pendente_confirmacao')  as pendentes_confirmacao,
  count(*) filter (where s.status = 'rejeitada')             as rejeitadas_90d,
  coalesce(sum(s.valor_particular - s.valor_convenio)
           filter (where s.status = 'executada'), 0)         as economia_gerada_90d
from parceiros p
left join solicitacoes_servico s
       on s.parceiro_id = p.id and s.created_at >= now() - interval '90 days'
where p.status = 'ativo'
group by p.id, p.nome
order by executadas_90d desc;

-- D7. Relatório final por CCT (item 6 do fluxo de convenções)
-- Base do relatório de organização interna: quantos e quais (CPF)
-- trabalhadores regidos pela CCT em cada nível, e a forma de pagamento
-- escolhida. O frontend agrega contagens e exporta as listas.
create or replace view v_relatorio_convencao with (security_invoker = on) as
select
  c.id   as convencao_id,
  c.nome as convencao,
  c.ano_base,
  c.reclassificada_em,
  t.id   as trabalhador_id,
  t.cpf,
  t.nome as trabalhador,
  t.nivel,
  t.forma_pagamento_preferida,
  e.id   as estabelecimento_id,
  coalesce(e.nome_fantasia, emp.razao_social) as estabelecimento,
  emp.razao_social as empresa
from convencoes_coletivas c
join estabelecimentos e   on e.convencao_id = c.id
join empresas emp         on emp.cnpj_basico = e.cnpj_basico
join vinculos_empregaticios v
  on v.estabelecimento_id = e.id and v.data_desligamento is null
join trabalhadores t
  on t.id = v.trabalhador_id and t.status_cadastro = 'aprovado';

-- ----------------------------------------------------------------------------
-- E. MOTOR DE DICAS ESTRATÉGICAS — 11 regras
-- Severidades: critica | atencao | oportunidade. Cada dica traz a rota de ação.
-- O frontend renderiza ordenando por severidade.
-- ----------------------------------------------------------------------------
create or replace view v_dash_dicas with (security_invoker = on) as

-- R1 · CCT vigente há 12+ meses (aguardando renovação)
select
  'CCT_DESATUALIZADA'::text as codigo, 'atencao'::text as severidade,
  'Convenção vigente há mais de 12 meses' as titulo,
  c.nome || ' — vigente desde ' || to_char(c.data_inicio_vigencia, 'DD/MM/YYYY')
    || '. Pisos podem estar defasados.' as detalhe,
  1::bigint as quantidade, '/convencoes' as rota
from convencoes_coletivas c
where c.data_fim_vigencia is null
  and c.data_inicio_vigencia < current_date - interval '12 months'
  and exists (select 1 from estabelecimentos e where e.convencao_id = c.id)

union all
-- R2 · Prazo de oposição de CCT terminando — trabalhadores não-Ouro sem carta
select
  'CARTA_PENDENTE', 'critica',
  'Prazo de oposição terminando: ' || c.nome,
  count(t.id) || ' trabalhadores (não-Ouro) ainda sem carta — prazo até '
    || to_char(c.data_limite_oposicao, 'DD/MM/YYYY') || '.',
  count(t.id), '/convencoes'
from convencoes_coletivas c
join estabelecimentos e on e.convencao_id = c.id
join vinculos_empregaticios v
  on v.estabelecimento_id = e.id and v.data_desligamento is null
join trabalhadores t
  on t.id = v.trabalhador_id and t.status_cadastro = 'aprovado' and t.nivel <> 'ouro'
where c.data_limite_oposicao between current_date
      and current_date + (fn_config('dias_alerta_carta', '30'))::int
  and not exists (
    select 1 from cartas_oposicao ca
    where ca.trabalhador_id = t.id and ca.ano_base = c.ano_base)
group by c.id, c.nome, c.data_limite_oposicao
having count(t.id) > 0

union all
-- R11 · CCT com prazo de oposição encerrado aguardando organização interna
select
  'ORGANIZACAO_PENDENTE', 'critica',
  'CCT aguardando organização interna: ' || c.nome,
  'Prazo de oposição encerrou em ' || to_char(c.data_limite_oposicao, 'DD/MM/YYYY')
    || ' — conferir cartas e executar a reclassificação desta convenção.',
  1::bigint, '/convencoes'
from convencoes_coletivas c
where c.data_limite_oposicao < current_date
  and c.reclassificada_em is null
  and exists (select 1 from estabelecimentos e where e.convencao_id = c.id)

union all
-- R3 · Guias de pagamento em atraso (inadimplência é da EMPRESA)
select
  'GUIAS_ATRASO', 'critica',
  'Guias de pagamento em atraso',
  count(*) || ' guias somando R$ ' || to_char(sum(valor_total), 'FM999G999G990D00')
    || ' — cobrança institucional recomendada.',
  count(*), '/financeiro/guias'
from repasses
where status = 'em_atraso'
having count(*) > 0

union all
-- R4 · Pratas que usaram o jurídico em 12 meses — candidatos naturais a Ouro
select
  'CAMPANHA_OURO', 'oportunidade',
  'Pratas com uso recente do jurídico — candidatos a Ouro',
  count(distinct t.id) || ' sindicalizados usaram assistência individual nos últimos 12 meses. Já percebem valor — abordar com o Convênio.',
  count(distinct t.id), '/trabalhadores?nivel=prata&uso_juridico=12m'
from trabalhadores t
join atendimentos_juridicos a
  on a.trabalhador_id = t.id and a.data >= current_date - interval '12 months'
where t.nivel = 'prata' and t.status_cadastro = 'aprovado'
having count(distinct t.id) > 0

union all
-- R5 · Ouros sem usar o convênio há 12 meses — risco de churn
select
  'OURO_SEM_USO', 'atencao',
  'Ouros sem utilizar o Convênio há 12 meses',
  count(*) || ' filiados sem nenhuma solicitação executada no período — não percebem o retorno da mensalidade. Risco de regressão.',
  count(*), '/trabalhadores?nivel=ouro&sem_uso=12m'
from trabalhadores t
where t.nivel = 'ouro' and t.status_cadastro = 'aprovado'
  and not exists (
    select 1 from solicitacoes_servico s
    where s.trabalhador_id = t.id and s.status = 'executada'
      and s.created_at >= now() - interval '12 months')
having count(*) > 0

union all
-- R6 · Cadastros pendentes há mais de 7 dias
select
  'APROVACAO_LENTA', 'atencao',
  'Cadastros pendentes há mais de 7 dias',
  count(*) || ' registros aguardando aprovação — trabalhador esperando resposta é conversão esfriando.',
  count(*), '/aprovacoes'
from (
  select id from trabalhadores where status_cadastro = 'pendente' and created_at < now() - interval '7 days'
  union all
  select id from beneficiados where status_cadastro = 'pendente' and created_at < now() - interval '7 days'
) pend
having count(*) > 0

union all
-- R7 · Estabelecimentos com trabalhadores ativos e sem CCT vinculada
select
  'SEM_CCT', 'critica',
  'Estabelecimentos com trabalhadores e sem CCT vinculada',
  count(distinct e.id) || ' estabelecimentos — sem CCT não há piso, e sem piso não há cálculo de contribuição/mensalidade.',
  count(distinct e.id), '/empresas?sem_cct=1'
from estabelecimentos e
join vinculos_empregaticios v
  on v.estabelecimento_id = e.id and v.data_desligamento is null
where e.convencao_id is null
having count(distinct e.id) > 0

union all
-- R8 · Prata/Ouro sem vínculo ativo — base de cálculo indefinida
select
  'SEM_VINCULO', 'atencao',
  'Contribuintes sem vínculo empregatício ativo',
  count(*) || ' trabalhadores Prata/Ouro sem vínculo ativo — verificar desligamento (migrar para boleto?) ou cadastrar vínculo.',
  count(*), '/trabalhadores?sem_vinculo=1'
from trabalhadores t
where t.nivel in ('prata', 'ouro') and t.status_cadastro = 'aprovado'
  and not exists (
    select 1 from vinculos_empregaticios v
    where v.trabalhador_id = t.id and v.data_desligamento is null)
having count(*) > 0

union all
-- R9 · Pratas sem interação há 90+ dias — campanha de upgrade
select
  'CAMPANHA_UPGRADE', 'oportunidade',
  'Pratas sem interação há mais de 90 dias',
  count(*) || ' sindicalizados sem atendimento, solicitação ou atualização cadastral no período — candidatos a campanha de reengajamento rumo ao Ouro.',
  count(*), '/trabalhadores?nivel=prata&sem_interacao=90d'
from trabalhadores t
where t.nivel = 'prata' and t.status_cadastro = 'aprovado'
  and t.updated_at < now() - interval '90 days'
  and not exists (
    select 1 from atendimentos_juridicos a
    where a.trabalhador_id = t.id and a.data >= current_date - interval '90 days')
  and not exists (
    select 1 from solicitacoes_servico s
    where s.trabalhador_id = t.id and s.created_at >= now() - interval '90 days')
having count(*) > 0

union all
-- R10 · Benefícios ativos sem valores definidos (pendência Alma Pura/CISMIP)
-- Sem valor_particular/valor_convenio, a guia sai SEM o comparativo de
-- economia — que é o argumento central de venda do nível Ouro.
select
  'BENEFICIO_SEM_VALOR', 'atencao',
  'Benefícios ativos sem valores definidos',
  count(*) || ' benefícios sem valor particular e/ou de convênio cadastrado — guias emitidas sem o comparativo de economia.',
  count(*), '/beneficios?sem_valor=1'
from beneficios
where ativo and (valor_particular is null or valor_convenio is null)
having count(*) > 0;

-- ----------------------------------------------------------------------------
-- F. ROTINAS AUTOMÁTICAS
-- Todas security definer com guarda: executáveis por service_role (jobs)
-- ou por usuário admin. Consolidam os jobs prometidos nos deliverables 1-2.
-- ----------------------------------------------------------------------------
create or replace function fn_guarda_job()
returns void language plpgsql as $$
begin
  if auth.uid() is not null and not fn_eh('admin') then
    raise exception 'Rotina restrita ao Admin';
  end if;
end $$;

-- F1 · Diária: solicitada → pendente_confirmacao após a data agendada
create or replace function fn_evoluir_solicitacoes()
returns integer language plpgsql security definer as $$
declare v_qtd integer;
begin
  perform fn_guarda_job();
  update solicitacoes_servico
     set status = 'pendente_confirmacao'
   where status = 'solicitada' and data_agendada < current_date;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- F2 · Diária: guias vencidas → em_atraso (inadimplência da empresa)
create or replace function fn_marcar_guias_em_atraso()
returns integer language plpgsql security definer as $$
declare v_qtd integer;
begin
  perform fn_guarda_job();
  update repasses
     set status = 'em_atraso'
   where status in ('previsto', 'enviado')
     and data_vencimento is not null
     and current_date > data_vencimento;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- F3 · Diária: boletos vencidos → inadimplente (dispara os bloqueios de inadimplência do schema)
create or replace function fn_marcar_boletos_inadimplentes()
returns integer language plpgsql security definer as $$
declare v_qtd integer;
begin
  perform fn_guarda_job();
  update faturas
     set status = 'inadimplente'
   where status = 'aberta'
     and forma_cobranca = 'boleto_direto'
     and data_vencimento is not null
     and current_date > data_vencimento;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- F4 · Mensal (dia 1): snapshot para os gráficos de evolução
create or replace function fn_snapshot_dashboard()
returns void language plpgsql security definer as $$
begin
  perform fn_guarda_job();
  delete from snapshots_dashboard where data_ref = current_date;

  -- Global por nível + linha global com MRR
  insert into snapshots_dashboard (data_ref, nivel, qtd_trabalhadores)
  select current_date, nivel, count(*)
    from trabalhadores where status_cadastro = 'aprovado' group by nivel;

  insert into snapshots_dashboard (data_ref, qtd_trabalhadores, mrr_mensalidades, mrr_contribuicoes)
  select current_date,
         (select count(*) from trabalhadores where status_cadastro = 'aprovado'),
         (select coalesce(sum(vm.valor_mensalidade), 0)
            from v_mensalidade_titular vm
            join trabalhadores t on t.id = vm.trabalhador_id and t.status_cadastro = 'aprovado'),
         (select round(coalesce(sum(bc.valor_contribuicao_anual), 0) / 12, 2)
            from v_base_calculo_trabalhador bc
            join trabalhadores t on t.id = bc.trabalhador_id
           where t.status_cadastro = 'aprovado' and t.nivel in ('prata', 'ouro'));

  -- Por município × nível
  insert into snapshots_dashboard (data_ref, municipio_id, nivel, qtd_trabalhadores)
  select current_date, mun.municipio_id, mun.nivel, count(*)
    from (
      select coalesce(e.municipio_id, t.municipio_id) as municipio_id, t.nivel
      from trabalhadores t
      left join vinculos_empregaticios v
             on v.trabalhador_id = t.id and v.principal and v.data_desligamento is null
      left join estabelecimentos e on e.id = v.estabelecimento_id
      where t.status_cadastro = 'aprovado'
    ) mun
   where mun.municipio_id is not null
   group by mun.municipio_id, mun.nivel;
end $$;

-- F5 · Por CCT (manual, após o prazo de oposição): ORGANIZAÇÃO INTERNA
-- Regras (fluxo de convenções, itens 5.1 a 5.3):
--   5.2 Ouro permanece Ouro (renovação anual automática do contrato de
--       adesão ao Convênio). Ouro que entregar carta NÃO regride por aqui:
--       precisa antes cancelar a adesão (fidelidade mínima de 1 ano, FAQ 15).
--   5.1 Entregou carta (ano_base da CCT) → Bronze
--   5.3 Demais → Prata
-- Idempotente: só altera quem está com a flag divergente; carimba
-- reclassificada_em (apaga a dica ORGANIZACAO_PENDENTE).
create or replace function fn_reclassificar_convencao(p_convencao_id uuid)
returns table (para_bronze integer, para_prata integer)
language plpgsql security definer as $$
declare
  v_ano  integer;
  v_nome text;
  v_bronze integer := 0;
  v_prata  integer := 0;
begin
  perform fn_guarda_job();

  select ano_base, nome into v_ano, v_nome
    from convencoes_coletivas where id = p_convencao_id;
  if v_ano is null then
    raise exception 'Convenção não encontrada';
  end if;

  perform set_config('app.origem_evento', 'reclassificacao_anual', true);

  with alvo as (
    select distinct t.id as trabalhador_id,
           exists (
             select 1 from cartas_oposicao ca
             where ca.trabalhador_id = t.id and ca.ano_base = v_ano
           ) as tem_carta
    from trabalhadores t
    join vinculos_empregaticios v
      on v.trabalhador_id = t.id and v.data_desligamento is null
    join estabelecimentos e
      on e.id = v.estabelecimento_id and e.convencao_id = p_convencao_id
    where t.status_cadastro = 'aprovado'
      and t.nivel <> 'ouro'                      -- 5.2: Ouro intocado
  ),
  up as (
    update trabalhadores t
       set recolhe_contribuicao_sindical = not a.tem_carta
      from alvo a
     where t.id = a.trabalhador_id
       and t.recolhe_contribuicao_sindical is distinct from (not a.tem_carta)
     returning a.tem_carta
  )
  select count(*) filter (where tem_carta),
         count(*) filter (where not tem_carta)
    into v_bronze, v_prata
    from up;

  update convencoes_coletivas
     set reclassificada_em = now()
   where id = p_convencao_id;

  insert into notificacoes (destinatario_role, tipo, titulo, mensagem, referencia_tabela, referencia_id)
  values (
    'secretaria', 'reclassificacao_cct',
    'Organização interna concluída: ' || v_nome,
    v_bronze || ' regredidos a Bronze (carta entregue) · ' || v_prata
      || ' classificados como Prata. Gerar o relatório final da CCT e comunicar o RH.',
    'convencoes_coletivas', p_convencao_id::text);

  perform set_config('app.origem_evento', '', true);
  return query select v_bronze, v_prata;
end $$;

-- Agendamento via pg_cron (habilitar em Database → Extensions no Supabase):
-- create extension if not exists pg_cron;
-- select cron.schedule('evoluir-solicitacoes',  '0 3 * * *',  $$select fn_evoluir_solicitacoes()$$);
-- select cron.schedule('guias-em-atraso',       '10 3 * * *', $$select fn_marcar_guias_em_atraso()$$);
-- select cron.schedule('boletos-inadimplentes', '20 3 * * *', $$select fn_marcar_boletos_inadimplentes()$$);
-- select cron.schedule('snapshot-dashboard',    '0 4 1 * *',  $$select fn_snapshot_dashboard()$$);
-- Organização interna por CCT: disparo MANUAL (Admin), pelo botão no
-- relatório da convenção, após o prazo de oposição dela:
--   select * from fn_reclassificar_convencao('<uuid-da-cct>');

-- Grants: as funções são security definer; execução pelo frontend fica
-- restrita pela guarda interna (admin). Sem acesso anônimo:
revoke execute on function fn_evoluir_solicitacoes() from anon;
revoke execute on function fn_marcar_guias_em_atraso() from anon;
revoke execute on function fn_marcar_boletos_inadimplentes() from anon;
revoke execute on function fn_snapshot_dashboard() from anon;
revoke execute on function fn_reclassificar_convencao(uuid) from anon;

-- ============================================================================
-- FIM · Motor de geração de cobranças (fn_gerar_*): especificado em
-- specs/plano_fases.md (Fase 2) — implementação no Claude Code.
-- ============================================================================
