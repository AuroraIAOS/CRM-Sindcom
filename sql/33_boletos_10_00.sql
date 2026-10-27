-- ============================================================================
-- CRM SINDCOM — sql/33_boletos_10_00.sql
-- ETAPA 10 — Controle de boletos (TAF, CA, CN, PAMED)
-- Spec: docs/superpowers/specs/2026-10-26-controle-boletos-design.md
--
-- O QUE ESTE ARQUIVO FAZ
-- O boleto continua sendo gerado à mão no Sicoob. O CRM controla o fluxo ao redor:
-- avisar a empresa, receber CNPJ + número de trabalhadores por link, calcular
-- (quando dá) o valor, e acompanhar cada boleto até o pagamento.
--
--   aguardando_dados → fazer → enviar → enviado → pago      (+ cancelado)
--   `atrasado` NÃO é gravado: a view o deriva (enviado + vencimento passado).
--
-- DE ONDE VEM O VALOR (correção do Maxwell em 2026-10-26)
--  · TAF e PAMED: valor fixo por trabalhador. O banco calcula
--      valor = round(valor-base × quantidade, 2), com o valor-base vindo de
--      `taxas_convencao` (coluna nova `tipo_boleto`).
--  · CA e CN: dependem do piso salarial de cada trabalhador, dado que a empresa
--      não informa. O CRM NÃO calcula; o operador digita o valor.
--  · Sem valor-base → valor NULL, nunca padrão nem teto (orientacoes §2.1,
--      a lição do `least()` que dava o teto a quem não tinha base).
--  · Em enviar/enviado/pago o valor congela: o boleto emitido não muda por
--      mudança de cadastro. Para corrigir, volta-se um passo.
--
-- A GRANULARIDADE DO LINK
-- UM token por CAIXA DE E-MAIL, permanente entre ciclos. Encerrar ciclo não o
-- revoga. Trocar só a pedido da empresa; nesse caso o contato na Brevo precisa
-- ser atualizado à mão (`brevo_pendente` na view, até alguém marcar).
-- O token mora em `tokens_boleto`, tabela à parte: a RLS restringe LINHAS, nunca
-- colunas, então misturar o segredo com o acompanhamento mostraria o token a
-- quem só deveria ler o acompanhamento (o Presidente).
--
-- SEGURANÇA (as três brechas que a RLS não alcança — CLAUDE.md)
--  · Toda view com security_invoker = on; anon sem SELECT.
--  · Toda função de trigger é SECURITY DEFINER, com search_path fixo, NÃO chama
--    outra função, e tem EXECUTE revogado de public/anon/authenticated (§2.17,
--    §2.17b). As 4 funções chamáveis pelo operador conferem fn_eh() por dentro.
--  · Escrita só por GRANT de coluna: o operador nunca escreve quantidade, caixa,
--    convenção nem datas de transição. Quem escreve isso são os triggers e a
--    Edge Function (service_role).
--
-- IDEMPOTENTE: pode ser reaplicado; a 2ª execução tem delta zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. taxas_convencao.tipo_boleto — qual taxa é o valor-base de qual boleto
--    Só TAF e PAMED: CA e CN não são "valor fixo × trabalhadores".
-- ----------------------------------------------------------------------------
alter table taxas_convencao add column if not exists tipo_boleto text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_taxas_tipo_boleto') then
    alter table taxas_convencao
      add constraint chk_taxas_tipo_boleto check (tipo_boleto in ('taf', 'pamed'));
  end if;
end $do$;

-- Etiqueta o que o Maxwell já cadastrou pelo nome. Só quando houver UMA taxa
-- com aquele nome na convenção: duplicata não derruba a migração, fica sem
-- etiqueta e aparece na conferência do rodapé.
update taxas_convencao t
   set tipo_boleto = lower(btrim(t.nome))
 where t.tipo_boleto is null
   and lower(btrim(t.nome)) in ('taf', 'pamed')
   and (t.convencao_id, lower(btrim(t.nome))) in (
     select convencao_id, lower(btrim(nome))
       from taxas_convencao
      group by convencao_id, lower(btrim(nome))
     having count(*) = 1
   );

create unique index if not exists uq_taxas_convencao_tipo_boleto
  on taxas_convencao (convencao_id, tipo_boleto)
  where tipo_boleto is not null;

comment on column taxas_convencao.tipo_boleto is
  'taf | pamed | NULL. Quando preenchido, `valor` é o valor-base POR TRABALHADOR usado no cálculo do boleto. '
  'No máximo uma taxa de cada tipo por convenção. CA e CN não entram: dependem do piso salarial.';

-- ----------------------------------------------------------------------------
-- 2. CICLO
-- ----------------------------------------------------------------------------
create table if not exists ciclos_boleto (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (btrim(nome) <> ''),
  tipo             text not null check (tipo in ('taf', 'ca', 'cn', 'pamed')),
  referencia       text,
  prazo_resposta   date,
  data_vencimento  date not null,
  cnaes            text[] not null default '{}',
  observacoes      text,
  encerrado_em     timestamptz,
  created_by       uuid default auth.uid() references perfis (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists ciclo_convencoes (
  ciclo_id     uuid not null references ciclos_boleto (id) on delete cascade,
  convencao_id uuid not null references convencoes_coletivas (id),
  primary key (ciclo_id, convencao_id)
);

-- ----------------------------------------------------------------------------
-- 3. CAIXA DE E-MAIL + TOKEN (permanente) + o que muda por ciclo
-- ----------------------------------------------------------------------------
create table if not exists caixas_boleto (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique
                         check (email = lower(btrim(email)) and email <> ''),
  ultimo_acesso_em     timestamptz,
  token_reemitido_em   timestamptz,
  brevo_atualizada_em  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists tokens_boleto (
  caixa_id          uuid primary key references caixas_boleto (id) on delete cascade,
  token             uuid not null unique default gen_random_uuid(),
  token_expira_em   timestamptz not null default (now() + interval '730 days'),
  created_at        timestamptz not null default now()
);

create table if not exists ciclo_caixas (
  ciclo_id              uuid not null references ciclos_boleto (id) on delete cascade,
  caixa_id              uuid not null references caixas_boleto (id),
  aviso_enviado_em      timestamptz,
  cobranca_enviada_em   timestamptz,
  primary key (ciclo_id, caixa_id)
);

-- ----------------------------------------------------------------------------
-- 4. BOLETOS — uma linha por ciclo × estabelecimento
-- ----------------------------------------------------------------------------
create table if not exists boletos (
  id                      uuid primary key default gen_random_uuid(),
  ciclo_id                uuid not null references ciclos_boleto (id),
  estabelecimento_id      uuid not null references estabelecimentos (id),
  convencao_id            uuid not null references convencoes_coletivas (id),
  caixa_id                uuid references caixas_boleto (id),
  estado                  text not null default 'aguardando_dados'
                            check (estado in ('aguardando_dados', 'fazer', 'enviar', 'enviado', 'pago', 'cancelado')),
  quantidade              integer check (quantidade between 0 and 99999),
  quantidade_resposta_id  uuid,
  valor_base              numeric(10,2) check (valor_base >= 0),
  valor                   numeric(10,2) check (valor >= 0),
  vencimento              date,
  numero_boleto           text check (char_length(numero_boleto) <= 60),
  motivo_cancelamento     text check (char_length(motivo_cancelamento) <= 300),
  dados_recebidos_em      timestamptz,
  boleto_feito_em         timestamptz,
  boleto_enviado_em       timestamptz,
  pago_em                 timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (ciclo_id, estabelecimento_id)
);

create index if not exists idx_boletos_ciclo_estado on boletos (ciclo_id, estado);
create index if not exists idx_boletos_caixa        on boletos (ciclo_id, caixa_id) where caixa_id is not null;
create index if not exists idx_boletos_estab        on boletos (estabelecimento_id);
create index if not exists idx_boletos_caixa_id     on boletos (caixa_id);
create index if not exists idx_boletos_convencao    on boletos (convencao_id);
create index if not exists idx_ciclo_caixas_caixa   on ciclo_caixas (caixa_id);
create index if not exists idx_ciclo_conv_convencao on ciclo_convencoes (convencao_id);

-- ----------------------------------------------------------------------------
-- 5. RESPOSTAS (imutáveis) e freio da recepção pública
-- ----------------------------------------------------------------------------
create table if not exists respostas_boleto (
  id                  uuid primary key default gen_random_uuid(),
  boleto_id           uuid not null references boletos (id),
  quantidade          integer not null check (quantidade between 0 and 99999),
  cnpj_confirmado     boolean not null default true,
  cnpj_incorreto_obs  text check (char_length(cnpj_incorreto_obs) <= 300),
  origem              text not null check (origem in ('link', 'manual')),
  registrada_por      uuid references perfis (id),
  ip_origem           inet,
  user_agent          text,
  recebida_em         timestamptz not null default now(),
  check (cnpj_confirmado or nullif(btrim(coalesce(cnpj_incorreto_obs, '')), '') is not null)
);

create index if not exists idx_respostas_boleto on respostas_boleto (boleto_id, recebida_em desc);

alter table boletos
  drop constraint if exists boletos_quantidade_resposta_id_fkey;
alter table boletos
  add constraint boletos_quantidade_resposta_id_fkey
  foreign key (quantidade_resposta_id) references respostas_boleto (id);

create table if not exists tentativas_boleto (
  id           bigserial primary key,
  token_alvo   text        not null,
  sucesso      boolean     not null,
  motivo       text,
  ip_origem    inet,
  ocorrida_em  timestamptz not null default now()
);

create index if not exists idx_tentativas_boleto_janela
  on tentativas_boleto (token_alvo, ocorrida_em desc);

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS (todos DEFINER, sem chamar outra função, EXECUTE revogado)
-- ----------------------------------------------------------------------------

-- 6.1 Caixa: normaliza o e-mail e carimba "Brevo atualizada" com a hora do banco
create or replace function fn_caixa_boleto_guard()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.email := lower(btrim(new.email));
  if tg_op = 'UPDATE' and new.brevo_atualizada_em is distinct from old.brevo_atualizada_em then
    new.brevo_atualizada_em := now();
  end if;
  return new;
end $fn$;
alter function fn_caixa_boleto_guard() owner to postgres;

drop trigger if exists trg_caixas_boleto_guard on caixas_boleto;
create trigger trg_caixas_boleto_guard
  before insert or update on caixas_boleto
  for each row execute function fn_caixa_boleto_guard();

-- 6.2 Valor do boleto.
-- TAF/PAMED: recalcula só quando quantidade ou convenção mudam (ou no recálculo
-- em lote, sinalizado por `app.recalc_boleto`); qualquer edição direta de `valor`
-- é revertida. CA/CN: `valor` é digitado, o trigger não toca. Em
-- enviar/enviado/pago o valor congela para todos os tipos.
create or replace function fn_boleto_valor()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tipo  text;
  v_base  numeric;
  v_recalc boolean;
begin
  if tg_op = 'UPDATE' and old.estado in ('enviar', 'enviado', 'pago') then
    new.valor := old.valor;
    new.valor_base := old.valor_base;
    return new;
  end if;

  select tipo into v_tipo from ciclos_boleto where id = new.ciclo_id;

  if v_tipo in ('taf', 'pamed') then
    v_recalc := tg_op = 'INSERT'
      or new.quantidade is distinct from old.quantidade
      or new.convencao_id is distinct from old.convencao_id
      or coalesce(current_setting('app.recalc_boleto', true), '') = '1';
    if v_recalc then
      select valor into v_base from taxas_convencao
       where convencao_id = new.convencao_id and tipo_boleto = v_tipo;
      if v_base is not null and new.quantidade is not null then
        new.valor_base := v_base;
        new.valor := round(v_base * new.quantidade, 2);
      else
        new.valor_base := null;
        new.valor := null;
      end if;
    else
      new.valor := old.valor;
      new.valor_base := old.valor_base;
    end if;
  else
    new.valor_base := null;
  end if;
  return new;
end $fn$;
alter function fn_boleto_valor() owner to postgres;

drop trigger if exists trg_boletos_valor on boletos;
create trigger trg_boletos_valor
  before insert or update on boletos
  for each row execute function fn_boleto_valor();

-- 6.3 Máquina de estados: salta no máximo um passo; passo além de
-- aguardando_dados exige quantidade; cancelar exige motivo; voltar limpa a data
-- do passo desfeito; reativar um cancelado limpa o motivo e as datas à frente.
create or replace function fn_boleto_transicao()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  o_old int;
  o_new int;
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  o_old := case old.estado when 'aguardando_dados' then 1 when 'fazer' then 2
                           when 'enviar' then 3 when 'enviado' then 4 when 'pago' then 5 end;
  o_new := case new.estado when 'aguardando_dados' then 1 when 'fazer' then 2
                           when 'enviar' then 3 when 'enviado' then 4 when 'pago' then 5 end;

  if new.estado = 'cancelado' then
    if old.estado = 'pago' then
      raise exception 'Boleto pago não pode ser cancelado.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(new.motivo_cancelamento, '')), '') is null then
      raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.estado = 'cancelado' then
    if new.estado not in ('aguardando_dados', 'fazer') then
      raise exception 'Boleto cancelado só pode ser reativado para "aguardando dados" ou "fazer".'
        using errcode = '22023';
    end if;
    if new.estado = 'fazer' and new.quantidade is null then
      raise exception 'Sem número de trabalhadores informado, o boleto não pode ir para "fazer".'
        using errcode = '22023';
    end if;
    new.motivo_cancelamento := null;
    new.boleto_feito_em := null;
    new.boleto_enviado_em := null;
    new.pago_em := null;
    if new.estado = 'fazer' then
      new.dados_recebidos_em := coalesce(new.dados_recebidos_em, now());
    else
      new.dados_recebidos_em := null;
    end if;
    return new;
  end if;

  if abs(o_new - o_old) <> 1 then
    raise exception 'Transição de estado inválida: só é permitido avançar ou voltar um passo.'
      using errcode = '22023';
  end if;
  if o_new >= 2 and new.quantidade is null then
    raise exception 'Sem número de trabalhadores informado, o boleto não pode sair de "aguardando dados".'
      using errcode = '22023';
  end if;

  if o_new > o_old then
    case new.estado
      when 'fazer'    then new.dados_recebidos_em := now();
      when 'enviar'   then new.boleto_feito_em    := now();
      when 'enviado'  then new.boleto_enviado_em  := now();
      when 'pago'     then new.pago_em            := now();
    end case;
  else
    case old.estado
      when 'fazer'    then new.dados_recebidos_em := null;
      when 'enviar'   then new.boleto_feito_em    := null;
      when 'enviado'  then new.boleto_enviado_em  := null;
      when 'pago'     then new.pago_em            := null;
    end case;
  end if;
  return new;
end $fn$;
alter function fn_boleto_transicao() owner to postgres;

drop trigger if exists trg_boletos_transicao on boletos;
create trigger trg_boletos_transicao
  before update on boletos
  for each row execute function fn_boleto_transicao();

-- 6.4 Resposta: valida (boleto aceita? ciclo aberto?), carimba autoria
create or replace function fn_resposta_valida()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_estado    text;
  v_encerrado timestamptz;
begin
  select b.estado, c.encerrado_em into v_estado, v_encerrado
    from boletos b join ciclos_boleto c on c.id = b.ciclo_id
   where b.id = new.boleto_id;
  if not found then
    raise exception 'Boleto inexistente.' using errcode = '22023';
  end if;
  if v_encerrado is not null then
    raise exception 'Este ciclo está encerrado e não recebe mais respostas.' using errcode = '22023';
  end if;
  if v_estado not in ('aguardando_dados', 'fazer') then
    raise exception 'Este boleto já foi feito ou cancelado e não aceita nova resposta.' using errcode = '22023';
  end if;
  if new.origem = 'manual' then
    if auth.uid() is null then
      raise exception 'Registro manual exige usuário autenticado.' using errcode = '42501';
    end if;
    new.registrada_por := auth.uid();
  else
    new.registrada_por := null;
  end if;
  return new;
end $fn$;
alter function fn_resposta_valida() owner to postgres;

drop trigger if exists trg_respostas_boleto_valida on respostas_boleto;
create trigger trg_respostas_boleto_valida
  before insert on respostas_boleto
  for each row execute function fn_resposta_valida();

-- 6.5 Resposta: aplica no boleto, move aguardando_dados → fazer e, quando a
-- caixa completa o ciclo, grava UMA notificação por papel (não uma por CNPJ).
create or replace function fn_resposta_aplica()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_estado_ant text;
  v_ciclo      uuid;
  v_caixa      uuid;
  v_pend       integer;
  v_email      text;
  v_nome       text;
begin
  select estado, ciclo_id, caixa_id into v_estado_ant, v_ciclo, v_caixa
    from boletos where id = new.boleto_id;

  perform set_config('app.recalc_boleto', '1', true);
  update boletos
     set quantidade = new.quantidade,
         quantidade_resposta_id = new.id,
         dados_recebidos_em = now(),
         estado = case when estado = 'aguardando_dados' then 'fazer' else estado end
   where id = new.boleto_id;
  perform set_config('app.recalc_boleto', '0', true);

  if v_estado_ant = 'aguardando_dados' and v_caixa is not null then
    select count(*) into v_pend from boletos
     where ciclo_id = v_ciclo and caixa_id = v_caixa and estado = 'aguardando_dados';
    if v_pend = 0 then
      select email into v_email from caixas_boleto where id = v_caixa;
      select nome into v_nome from ciclos_boleto where id = v_ciclo;
      insert into notificacoes (destinatario_role, tipo, titulo, mensagem, referencia_tabela, referencia_id)
      select r, 'boletos_caixa_completa',
             'Caixa respondeu todos os CNPJs',
             'A caixa ' || v_email || ' respondeu todos os CNPJs do ciclo "' || v_nome || '".',
             'ciclos_boleto', v_ciclo::text
        from unnest(array['admin', 'secretaria']::papel_usuario[]) as r;
    end if;
  end if;
  return new;
end $fn$;
alter function fn_resposta_aplica() owner to postgres;

drop trigger if exists trg_respostas_boleto_aplica on respostas_boleto;
create trigger trg_respostas_boleto_aplica
  after insert on respostas_boleto
  for each row execute function fn_resposta_aplica();

-- 6.6 Resposta é imutável: reenvio cria resposta nova; vale a última
create or replace function fn_resposta_imutavel()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'Resposta é imutável: um reenvio cria resposta nova.' using errcode = '42501';
end $fn$;
alter function fn_resposta_imutavel() owner to postgres;

drop trigger if exists trg_respostas_boleto_imutavel on respostas_boleto;
create trigger trg_respostas_boleto_imutavel
  before update or delete on respostas_boleto
  for each row execute function fn_resposta_imutavel();

-- updated_at e auditoria. `tokens_boleto` e `respostas_boleto` ficam FORA da
-- auditoria: o primeiro carrega o segredo (o rastro da troca é gravado pela
-- função, sem o valor), o segundo já é imutável e se auto-documenta.
do $do$
declare t text;
begin
  foreach t in array array['ciclos_boleto', 'caixas_boleto', 'boletos'] loop
    execute format('drop trigger if exists trg_%s_updated_at on %I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on %I
         for each row execute function fn_set_updated_at()', t, t);
    execute format('drop trigger if exists trg_%s_auditoria on %I', t, t);
    execute format(
      'create trigger trg_%s_auditoria after insert or update or delete on %I
         for each row execute function fn_auditoria()', t, t);
  end loop;
end $do$;

revoke execute on function fn_caixa_boleto_guard()  from public, anon, authenticated;
revoke execute on function fn_boleto_valor()        from public, anon, authenticated;
revoke execute on function fn_boleto_transicao()    from public, anon, authenticated;
revoke execute on function fn_resposta_valida()     from public, anon, authenticated;
revoke execute on function fn_resposta_aplica()     from public, anon, authenticated;
revoke execute on function fn_resposta_imutavel()   from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. FUNÇÕES CHAMÁVEIS PELO OPERADOR (Admin e Secretaria, conferido por dentro)
-- ----------------------------------------------------------------------------

-- 7.1 Semeadura — idempotente: rodar de novo só acrescenta o que faltou.
create or replace function fn_semear_ciclo_boleto(p_ciclo uuid)
returns jsonb language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ciclo     ciclos_boleto%rowtype;
  v_alvo      integer;
  v_sem       integer;
  v_inv       integer;
  v_criados   integer;
  v_vinc      integer;
begin
  if not fn_eh('admin', 'secretaria') then
    raise exception 'Sem permissão para semear ciclo de boletos.' using errcode = '42501';
  end if;
  select * into v_ciclo from ciclos_boleto where id = p_ciclo;
  if not found then
    raise exception 'Ciclo inexistente.' using errcode = '22023';
  end if;
  if v_ciclo.encerrado_em is not null then
    raise exception 'Ciclo encerrado.' using errcode = '22023';
  end if;

  drop table if exists pg_temp.t_alvo_boleto;
  create temp table t_alvo_boleto on commit drop as
  select est.id as estab_id,
         est.convencao_id,
         nullif(lower(btrim(est.email)), '') as email_norm,
         coalesce(lower(btrim(est.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$', false) as email_ok
    from estabelecimentos est
    join ciclo_convencoes cc on cc.convencao_id = est.convencao_id and cc.ciclo_id = p_ciclo
   where est.situacao_cadastral = '02'
     and (cardinality(v_ciclo.cnaes) = 0 or est.cnae_principal = any (v_ciclo.cnaes));

  insert into caixas_boleto (email)
  select distinct email_norm from t_alvo_boleto where email_ok
  on conflict (email) do nothing;

  insert into tokens_boleto (caixa_id)
  select cx.id from caixas_boleto cx
   where cx.email in (select email_norm from t_alvo_boleto where email_ok)
     and not exists (select 1 from tokens_boleto t where t.caixa_id = cx.id);

  with ins as (
    insert into boletos (ciclo_id, estabelecimento_id, convencao_id, caixa_id, vencimento)
    select p_ciclo, a.estab_id, a.convencao_id, cx.id, v_ciclo.data_vencimento
      from t_alvo_boleto a
      left join caixas_boleto cx on a.email_ok and cx.email = a.email_norm
    on conflict (ciclo_id, estabelecimento_id) do nothing
    returning 1
  )
  select count(*) into v_criados from ins;

  -- Estabelecimento que ganhou e-mail depois da 1ª semeadura passa a ter caixa.
  update boletos b set caixa_id = cx.id
    from t_alvo_boleto a
    join caixas_boleto cx on a.email_ok and cx.email = a.email_norm
   where b.ciclo_id = p_ciclo and b.estabelecimento_id = a.estab_id and b.caixa_id is null;
  get diagnostics v_vinc = row_count;

  insert into ciclo_caixas (ciclo_id, caixa_id)
  select distinct p_ciclo, caixa_id from boletos
   where ciclo_id = p_ciclo and caixa_id is not null
  on conflict do nothing;

  select count(*),
         count(*) filter (where email_norm is null),
         count(*) filter (where email_norm is not null and not email_ok)
    into v_alvo, v_sem, v_inv
    from t_alvo_boleto;

  return jsonb_build_object(
    'alvo', v_alvo, 'criados', v_criados, 'ja_existiam', v_alvo - v_criados,
    'sem_email', v_sem, 'email_invalido', v_inv, 'vinculados_a_caixa', v_vinc);
end $fn$;
alter function fn_semear_ciclo_boleto(uuid) owner to postgres;

-- 7.2 Recalcular valores TAF/PAMED de quem ainda não teve o boleto feito
create or replace function fn_recalcular_valores_ciclo_boleto(p_ciclo uuid)
returns integer language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tipo text;
  v_n    integer;
begin
  if not fn_eh('admin', 'secretaria') then
    raise exception 'Sem permissão para recalcular valores.' using errcode = '42501';
  end if;
  select tipo into v_tipo from ciclos_boleto where id = p_ciclo;
  if v_tipo is null then
    raise exception 'Ciclo inexistente.' using errcode = '22023';
  end if;
  if v_tipo not in ('taf', 'pamed') then
    return 0;
  end if;
  perform set_config('app.recalc_boleto', '1', true);
  update boletos set quantidade = quantidade
   where ciclo_id = p_ciclo and estado in ('aguardando_dados', 'fazer') and quantidade is not null;
  get diagnostics v_n = row_count;
  perform set_config('app.recalc_boleto', '0', true);
  return v_n;
end $fn$;
alter function fn_recalcular_valores_ciclo_boleto(uuid) owner to postgres;

-- 7.3 Trocar o link de uma caixa (a pedido da empresa). O antigo morre na hora.
create or replace function fn_reemitir_token_boleto(p_caixa uuid)
returns void language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not fn_eh('admin', 'secretaria') then
    raise exception 'Sem permissão para trocar o link.' using errcode = '42501';
  end if;
  update tokens_boleto
     set token = gen_random_uuid(), token_expira_em = now() + interval '730 days'
   where caixa_id = p_caixa;
  if not found then
    raise exception 'Caixa sem link.' using errcode = '22023';
  end if;
  update caixas_boleto set token_reemitido_em = now() where id = p_caixa;
  insert into auditoria (tabela, registro_id, operacao, dados_depois, usuario_id)
  values ('tokens_boleto', p_caixa::text, 'UPDATE',
          jsonb_build_object('acao', 'token_reemitido'), auth.uid());
end $fn$;
alter function fn_reemitir_token_boleto(uuid) owner to postgres;

-- 7.4 Renovar a validade SEM trocar o token (não mexe na Brevo)
create or replace function fn_renovar_token_boleto(p_caixa uuid)
returns void language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not fn_eh('admin', 'secretaria') then
    raise exception 'Sem permissão para renovar o link.' using errcode = '42501';
  end if;
  update tokens_boleto set token_expira_em = now() + interval '730 days' where caixa_id = p_caixa;
  if not found then
    raise exception 'Caixa sem link.' using errcode = '22023';
  end if;
  insert into auditoria (tabela, registro_id, operacao, dados_depois, usuario_id)
  values ('tokens_boleto', p_caixa::text, 'UPDATE',
          jsonb_build_object('acao', 'token_renovado'), auth.uid());
end $fn$;
alter function fn_renovar_token_boleto(uuid) owner to postgres;

revoke execute on function fn_semear_ciclo_boleto(uuid)             from public, anon;
revoke execute on function fn_recalcular_valores_ciclo_boleto(uuid) from public, anon;
revoke execute on function fn_reemitir_token_boleto(uuid)           from public, anon;
revoke execute on function fn_renovar_token_boleto(uuid)            from public, anon;
grant  execute on function fn_semear_ciclo_boleto(uuid)             to authenticated;
grant  execute on function fn_recalcular_valores_ciclo_boleto(uuid) to authenticated;
grant  execute on function fn_reemitir_token_boleto(uuid)           to authenticated;
grant  execute on function fn_renovar_token_boleto(uuid)            to authenticated;

-- ----------------------------------------------------------------------------
-- 8. RLS + GRANTS
--   Lê: Admin, Secretaria, Presidente (tokens: só Admin e Secretaria).
--   Escreve: Admin e Secretaria, e só nas colunas liberadas por GRANT.
-- ----------------------------------------------------------------------------
alter table ciclos_boleto     enable row level security;
alter table ciclo_convencoes  enable row level security;
alter table caixas_boleto     enable row level security;
alter table tokens_boleto     enable row level security;
alter table ciclo_caixas      enable row level security;
alter table boletos           enable row level security;
alter table respostas_boleto  enable row level security;
alter table tentativas_boleto enable row level security;

revoke all on ciclos_boleto, ciclo_convencoes, caixas_boleto, tokens_boleto,
              ciclo_caixas, boletos, respostas_boleto, tentativas_boleto
  from anon, authenticated;
revoke all on sequence tentativas_boleto_id_seq from anon, authenticated;

-- ciclos_boleto: tipo e cnaes não mudam depois de criados (mudariam o cálculo)
grant select on ciclos_boleto to authenticated;
grant insert (nome, tipo, referencia, prazo_resposta, data_vencimento, cnaes, observacoes)
  on ciclos_boleto to authenticated;
grant update (nome, referencia, prazo_resposta, data_vencimento, observacoes, encerrado_em)
  on ciclos_boleto to authenticated;

grant select, insert, delete on ciclo_convencoes to authenticated;
grant select on caixas_boleto to authenticated;
grant update (brevo_atualizada_em) on caixas_boleto to authenticated;
grant select on tokens_boleto to authenticated;
grant select on ciclo_caixas to authenticated;
grant update (aviso_enviado_em, cobranca_enviada_em) on ciclo_caixas to authenticated;
grant select on boletos to authenticated;
grant update (estado, numero_boleto, vencimento, motivo_cancelamento, valor) on boletos to authenticated;
grant select on respostas_boleto to authenticated;
grant insert (boleto_id, quantidade, cnpj_confirmado, cnpj_incorreto_obs, origem)
  on respostas_boleto to authenticated;

drop policy if exists pol_ciclos_boleto_select on ciclos_boleto;
drop policy if exists pol_ciclos_boleto_insert on ciclos_boleto;
drop policy if exists pol_ciclos_boleto_update on ciclos_boleto;
create policy pol_ciclos_boleto_select on ciclos_boleto for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_ciclos_boleto_insert on ciclos_boleto for insert to authenticated
  with check (fn_eh('admin', 'secretaria'));
create policy pol_ciclos_boleto_update on ciclos_boleto for update to authenticated
  using (fn_eh('admin', 'secretaria')) with check (fn_eh('admin', 'secretaria'));

drop policy if exists pol_ciclo_convencoes_select on ciclo_convencoes;
drop policy if exists pol_ciclo_convencoes_insert on ciclo_convencoes;
drop policy if exists pol_ciclo_convencoes_delete on ciclo_convencoes;
create policy pol_ciclo_convencoes_select on ciclo_convencoes for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_ciclo_convencoes_insert on ciclo_convencoes for insert to authenticated
  with check (fn_eh('admin', 'secretaria'));
create policy pol_ciclo_convencoes_delete on ciclo_convencoes for delete to authenticated
  using (fn_eh('admin', 'secretaria'));

drop policy if exists pol_caixas_boleto_select on caixas_boleto;
drop policy if exists pol_caixas_boleto_update on caixas_boleto;
create policy pol_caixas_boleto_select on caixas_boleto for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_caixas_boleto_update on caixas_boleto for update to authenticated
  using (fn_eh('admin', 'secretaria')) with check (fn_eh('admin', 'secretaria'));

-- O Presidente NÃO lê token: sem policy para ele, a RLS devolve zero linhas.
drop policy if exists pol_tokens_boleto_select on tokens_boleto;
create policy pol_tokens_boleto_select on tokens_boleto for select to authenticated
  using (fn_eh('admin', 'secretaria'));

drop policy if exists pol_ciclo_caixas_select on ciclo_caixas;
drop policy if exists pol_ciclo_caixas_update on ciclo_caixas;
create policy pol_ciclo_caixas_select on ciclo_caixas for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_ciclo_caixas_update on ciclo_caixas for update to authenticated
  using (fn_eh('admin', 'secretaria')) with check (fn_eh('admin', 'secretaria'));

drop policy if exists pol_boletos_select on boletos;
drop policy if exists pol_boletos_update on boletos;
create policy pol_boletos_select on boletos for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_boletos_update on boletos for update to authenticated
  using (fn_eh('admin', 'secretaria')) with check (fn_eh('admin', 'secretaria'));

drop policy if exists pol_respostas_boleto_select on respostas_boleto;
drop policy if exists pol_respostas_boleto_insert on respostas_boleto;
create policy pol_respostas_boleto_select on respostas_boleto for select to authenticated
  using (fn_eh('admin', 'secretaria', 'presidente'));
create policy pol_respostas_boleto_insert on respostas_boleto for insert to authenticated
  with check (fn_eh('admin', 'secretaria') and origem = 'manual');

-- tentativas_boleto: sem policy e sem GRANT — só a service_role (Edge Function)

-- ----------------------------------------------------------------------------
-- 9. VIEWS (security_invoker = on; anon fora)
-- ----------------------------------------------------------------------------

-- Uma linha por boleto. Os joins são todos por chave primária (uma linha cada),
-- então não multiplicam (§2.2). `atrasado` é derivado, no fuso do sindicato.
create or replace view v_boletos_status
with (security_invoker = on) as
select
  b.id                    as boleto_id,
  b.ciclo_id,
  c.nome                  as ciclo_nome,
  c.tipo,
  c.referencia,
  (c.encerrado_em is not null) as ciclo_encerrado,
  b.estabelecimento_id,
  est.cnpj_completo,
  emp.razao_social,
  est.nome_fantasia,
  est.municipio_id,
  b.convencao_id,
  cv.nome                 as convencao_nome,
  b.caixa_id,
  cx.email                as caixa_email,
  b.estado,
  case when b.estado = 'enviado'
        and b.vencimento < (now() at time zone 'America/Sao_Paulo')::date
       then 'atrasado' else b.estado end as tag,
  b.quantidade,
  b.valor_base,
  b.valor,
  (c.tipo in ('ca', 'cn'))                                                    as valor_manual,
  (c.tipo in ('taf', 'pamed') and b.estado <> 'cancelado'
     and b.valor_base is null and t.valor is null)                            as sem_valor_base,
  (c.tipo in ('ca', 'cn') and b.estado not in ('cancelado', 'aguardando_dados')
     and b.valor is null)                                                     as sem_valor,
  b.vencimento,
  b.numero_boleto,
  b.motivo_cancelamento,
  b.dados_recebidos_em,
  b.boleto_feito_em,
  b.boleto_enviado_em,
  b.pago_em,
  (r.cnpj_confirmado is false)                                                as cnpj_incorreto,
  r.cnpj_incorreto_obs,
  case
    when b.caixa_id is null then
      case when nullif(btrim(coalesce(est.email, '')), '') is null
           then 'sem_email' else 'email_invalido' end
    when b.estado <> 'aguardando_dados' then 'respondeu'
    when cc.cobranca_enviada_em is not null then 'cobranca_enviada'
    when cc.aviso_enviado_em is not null then 'aviso_enviado'
    else 'a_avisar'
  end                                                                         as situacao_contato,
  exists (select 1 from envios_campanha e
           where e.estabelecimento_id = b.estabelecimento_id
             and e.descadastrado_em is not null)                              as descadastrado
from boletos b
join ciclos_boleto c            on c.id = b.ciclo_id
join estabelecimentos est       on est.id = b.estabelecimento_id
join empresas emp               on emp.cnpj_basico = est.cnpj_basico
join convencoes_coletivas cv    on cv.id = b.convencao_id
left join caixas_boleto cx      on cx.id = b.caixa_id
left join ciclo_caixas cc       on cc.ciclo_id = b.ciclo_id and cc.caixa_id = b.caixa_id
left join respostas_boleto r    on r.id = b.quantidade_resposta_id
left join taxas_convencao t     on t.convencao_id = b.convencao_id and t.tipo_boleto = c.tipo;

-- Uma linha por ciclo × caixa. Contagem por agregado pré-calculado, nunca join
-- direto (§2.2). SEM token: o Presidente lê esta view.
create or replace view v_boletos_caixas
with (security_invoker = on) as
with agg as (
  select b.ciclo_id, b.caixa_id,
         count(*) filter (where b.estado <> 'cancelado')::int                              as total_cnpj,
         count(*) filter (where b.estado not in ('aguardando_dados', 'cancelado'))::int    as cnpj_respondidos,
         min(emp.razao_social)                                                             as nome_contato,
         array_agg(distinct b.convencao_id)                                                as convencao_ids,
         string_agg(distinct cv.nome, ' · ' order by cv.nome)                              as convencoes
    from boletos b
    join estabelecimentos est    on est.id = b.estabelecimento_id
    join empresas emp            on emp.cnpj_basico = est.cnpj_basico
    join convencoes_coletivas cv on cv.id = b.convencao_id
   where b.caixa_id is not null
   group by b.ciclo_id, b.caixa_id
)
select
  cc.ciclo_id,
  cc.caixa_id,
  cx.email,
  agg.nome_contato,
  agg.convencoes,
  agg.convencao_ids,
  agg.total_cnpj,
  agg.cnpj_respondidos,
  (agg.total_cnpj - agg.cnpj_respondidos)                       as pendentes,
  (agg.total_cnpj > 0 and agg.cnpj_respondidos = agg.total_cnpj) as completo,
  cc.aviso_enviado_em,
  cc.cobranca_enviada_em,
  cx.ultimo_acesso_em,
  cx.token_reemitido_em,
  cx.brevo_atualizada_em,
  (cx.token_reemitido_em is not null
     and (cx.brevo_atualizada_em is null or cx.brevo_atualizada_em < cx.token_reemitido_em)) as brevo_pendente
from ciclo_caixas cc
join caixas_boleto cx on cx.id = cc.caixa_id
join agg on agg.ciclo_id = cc.ciclo_id and agg.caixa_id = cc.caixa_id;

-- Todas as caixas com o token em CLARO. Base é tokens_boleto: só Admin e
-- Secretaria recebem linhas (o Presidente recebe zero).
create or replace view v_boletos_links
with (security_invoker = on) as
with uso as (
  select b.caixa_id,
         count(distinct b.estabelecimento_id)::int as cnpj_total,
         count(distinct b.estabelecimento_id) filter (where c.encerrado_em is null)::int as cnpj_em_ciclo_aberto
    from boletos b join ciclos_boleto c on c.id = b.ciclo_id
   where b.caixa_id is not null
   group by b.caixa_id
)
select
  t.caixa_id,
  cx.email,
  t.token,
  t.token_expira_em,
  (t.token_expira_em < now())                                              as expirado,
  (t.token_expira_em >= now() and t.token_expira_em < now() + interval '60 days') as expira_em_breve,
  cx.ultimo_acesso_em,
  cx.token_reemitido_em,
  cx.brevo_atualizada_em,
  (cx.token_reemitido_em is not null
     and (cx.brevo_atualizada_em is null or cx.brevo_atualizada_em < cx.token_reemitido_em)) as brevo_pendente,
  coalesce(uso.cnpj_total, 0)            as cnpj_total,
  coalesce(uso.cnpj_em_ciclo_aberto, 0)  as cnpj_em_ciclo_aberto
from tokens_boleto t
join caixas_boleto cx on cx.id = t.caixa_id
left join uso on uso.caixa_id = t.caixa_id;

-- Base da exportação para a Brevo: ciclo × caixa COM token (só Admin/Secretaria).
create or replace view v_boletos_envio
with (security_invoker = on) as
select vc.*, t.token, t.token_expira_em
  from v_boletos_caixas vc
  join tokens_boleto t on t.caixa_id = vc.caixa_id;

-- Funil do ciclo: responde as sete perguntas. `enviado` inclui os atrasados.
create or replace view v_ciclos_funil
with (security_invoker = on) as
select
  c.id as ciclo_id, c.nome, c.tipo, c.referencia, c.prazo_resposta, c.data_vencimento, c.encerrado_em,
  coalesce(a.total, 0)             as total,
  coalesce(a.aguardando_dados, 0)  as aguardando_dados,
  coalesce(a.fazer, 0)             as fazer,
  coalesce(a.enviar, 0)            as enviar,
  coalesce(a.enviado, 0)           as enviado,
  coalesce(a.atrasado, 0)          as atrasado,
  coalesce(a.pago, 0)              as pago,
  coalesce(a.cancelado, 0)         as cancelado,
  coalesce(a.sem_email, 0)         as sem_email,
  coalesce(a.email_invalido, 0)    as email_invalido,
  coalesce(a.sem_valor_base, 0)    as sem_valor_base,
  coalesce(a.sem_valor, 0)         as sem_valor,
  coalesce(k.caixas_total, 0)      as caixas_total,
  coalesce(k.caixas_avisadas, 0)   as caixas_avisadas,
  coalesce(k.caixas_cobradas, 0)   as caixas_cobradas,
  coalesce(m.caixas_completas, 0)  as caixas_completas
from ciclos_boleto c
left join (
  select ciclo_id,
         count(*)::int                                                  as total,
         count(*) filter (where estado = 'aguardando_dados')::int       as aguardando_dados,
         count(*) filter (where estado = 'fazer')::int                  as fazer,
         count(*) filter (where estado = 'enviar')::int                 as enviar,
         count(*) filter (where estado = 'enviado')::int                as enviado,
         count(*) filter (where tag = 'atrasado')::int                  as atrasado,
         count(*) filter (where estado = 'pago')::int                   as pago,
         count(*) filter (where estado = 'cancelado')::int              as cancelado,
         count(*) filter (where situacao_contato = 'sem_email' and estado <> 'cancelado')::int      as sem_email,
         count(*) filter (where situacao_contato = 'email_invalido' and estado <> 'cancelado')::int as email_invalido,
         count(*) filter (where sem_valor_base)::int                    as sem_valor_base,
         count(*) filter (where sem_valor)::int                         as sem_valor
    from v_boletos_status group by ciclo_id
) a on a.ciclo_id = c.id
left join (
  select ciclo_id,
         count(*)::int                                                  as caixas_total,
         count(*) filter (where aviso_enviado_em is not null)::int      as caixas_avisadas,
         count(*) filter (where cobranca_enviada_em is not null)::int   as caixas_cobradas
    from ciclo_caixas group by ciclo_id
) k on k.ciclo_id = c.id
left join (
  select ciclo_id, count(*) filter (where completo)::int as caixas_completas
    from v_boletos_caixas group by ciclo_id
) m on m.ciclo_id = c.id;

-- Convenções do ciclo (TAF/PAMED) sem o valor-base: a tela as lista pelo nome.
create or replace view v_ciclos_sem_valor_base
with (security_invoker = on) as
select cc.ciclo_id, c.nome as ciclo_nome, c.tipo, c.encerrado_em,
       cc.convencao_id, cv.nome as convencao_nome,
       (select count(*) from boletos b
         where b.ciclo_id = cc.ciclo_id and b.convencao_id = cc.convencao_id
           and b.estado <> 'cancelado')::int as boletos
  from ciclo_convencoes cc
  join ciclos_boleto c         on c.id = cc.ciclo_id
  join convencoes_coletivas cv on cv.id = cc.convencao_id
 where c.tipo in ('taf', 'pamed')
   and not exists (select 1 from taxas_convencao t
                    where t.convencao_id = cc.convencao_id
                      and t.tipo_boleto = c.tipo and t.valor is not null);

grant select on v_boletos_status, v_boletos_caixas, v_boletos_links, v_boletos_envio,
                v_ciclos_funil, v_ciclos_sem_valor_base to authenticated;
revoke all on v_boletos_status, v_boletos_caixas, v_boletos_links, v_boletos_envio,
              v_ciclos_funil, v_ciclos_sem_valor_base from anon;

analyze boletos;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS de aplicar
--
-- (1) Views com security_invoker e anon fora:
--   select c.relname, c.reloptions, has_table_privilege('anon', c.oid, 'SELECT') as anon_le
--     from pg_class c where c.relname in ('v_boletos_status','v_boletos_caixas','v_boletos_links',
--          'v_boletos_envio','v_ciclos_funil','v_ciclos_sem_valor_base');
--   -- esperado: {security_invoker=on} · false em todas
--
-- (2) Nenhuma função nova executável por anon (as 4 RPCs só por authenticated):
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
--     from pg_proc p where p.pronamespace = 'public'::regnamespace
--      and p.proname ~ '^fn_(caixa_boleto|boleto_|resposta_|semear_ciclo|recalcular_valores_ciclo|reemitir_token|renovar_token)';
--   -- esperado: anon=false em todas; authed=true só nas 4 RPCs
--
-- (3) Duplicatas de taxa que ficaram SEM etiqueta (para o Maxwell resolver):
--   select convencao_id, lower(btrim(nome)) as nome, count(*)
--     from taxas_convencao where lower(btrim(nome)) in ('taf','pamed') and tipo_boleto is null
--    group by 1,2;
--   -- esperado: zero linhas
--
-- (4) Taxas etiquetadas por nome:
--   select tipo_boleto, count(*) from taxas_convencao where tipo_boleto is not null group by 1;
-- ----------------------------------------------------------------------------
