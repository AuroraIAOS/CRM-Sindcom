-- ============================================================================
-- CRM SINDCOM — 01_schema.sql · Schema completo (Supabase / Postgres)
-- Ordem de execução do pacote:
--   01_schema.sql → 02_seed_municipios.sql → 03_rls.sql → 04_dashboard.sql
-- Executar em banco VAZIO, em projeto Supabase isolado do Sindcom.
-- Após o pacote inteiro: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSÕES
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;     -- busca por nome
create extension if not exists pgcrypto;    -- hash do PIN dos recepcionistas

-- ----------------------------------------------------------------------------
-- 1. TIPOS ENUM
-- ----------------------------------------------------------------------------
create type nivel_protecao        as enum ('bronze', 'prata', 'ouro');
create type status_cadastro       as enum ('pendente', 'aprovado', 'rejeitado', 'inativo');
create type origem_cadastro       as enum ('formulario_site', 'manual', 'csv', 'agente_whatsapp');
create type tipo_beneficiado      as enum ('direto', 'indireto', 'adicional');
create type forma_entrega_carta   as enum ('presencial', 'email', 'correio', 'outro');
create type papel_usuario         as enum ('admin', 'presidente', 'secretaria', 'juridico', 'parceiro');
create type status_solicitacao    as enum ('solicitada', 'pendente_confirmacao', 'executada', 'rejeitada', 'cancelada');
create type tipo_fatura           as enum ('contribuicao_sindical', 'mensalidade_convenio',
                                           'multa', 'acordo', 'taxa_adicional'); -- 3 últimos: guias excepcionais (Secretaria)
create type forma_cobranca        as enum ('holerite', 'boleto_direto');
create type status_fatura         as enum ('aberta', 'paga', 'inadimplente', 'isenta', 'cancelada');
create type status_repasse        as enum ('previsto', 'enviado', 'recebido', 'em_atraso');
create type tipo_atend_juridico   as enum ('orientacao', 'homologacao', 'processo', 'outro');
create type operacao_auditoria    as enum ('INSERT', 'UPDATE', 'DELETE');
create type origem_baixa          as enum ('manual', 'integracao');
create type status_solicitacao_admin as enum ('pendente', 'aprovada', 'rejeitada', 'cancelada');

-- ----------------------------------------------------------------------------
-- 2. FUNÇÕES UTILITÁRIAS
-- ----------------------------------------------------------------------------
create or replace function fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function fn_auditoria()
returns trigger language plpgsql security definer as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_id  text  := coalesce(v_row->>'id', v_row->>'cnpj_basico', v_row->>'codigo');
begin
  insert into auditoria (tabela, registro_id, operacao, dados_antes, dados_depois, usuario_id)
  values (
    tg_table_name, v_id, tg_op::operacao_auditoria,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

-- Guia de encaminhamento (solicitações): 2026-000001, 2026-000002, ...
create sequence if not exists seq_numero_guia;
create or replace function fn_gera_numero_guia()
returns text language sql as $$
  select to_char(now(), 'YYYY') || '-' || lpad(nextval('seq_numero_guia')::text, 6, '0');
$$;

-- Guia de pagamento (empresas): GP-2026-000001, ...
create sequence if not exists seq_guia_pagamento;
create or replace function fn_gera_guia_pagamento()
returns text language sql as $$
  select 'GP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('seq_guia_pagamento')::text, 6, '0');
$$;

-- ----------------------------------------------------------------------------
-- 3. AUDITORIA
-- ----------------------------------------------------------------------------
create table auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro_id   text,
  operacao      operacao_auditoria not null,
  dados_antes   jsonb,
  dados_depois  jsonb,
  usuario_id    uuid,
  created_at    timestamptz not null default now()
);
create index idx_auditoria_tabela_registro on auditoria (tabela, registro_id);
create index idx_auditoria_created_at on auditoria (created_at);

-- ----------------------------------------------------------------------------
-- 4. REFERÊNCIAS (códigos RFB + municípios)
-- ----------------------------------------------------------------------------
create table naturezas_juridicas (
  codigo     text primary key,
  descricao  text not null
);

create table qualificacoes_responsavel (
  codigo     text primary key,
  descricao  text not null
);

create table cnaes (
  codigo     text primary key,
  descricao  text not null
);

create table motivos_situacao_cadastral (
  codigo     text primary key,
  descricao  text not null
);

-- Seed completo em 02_seed_municipios.sql (5.570 municípios,
-- codigo_ibge reconstruído de cidades.csv; codigo_rfb preenchido na importação)
create table municipios (
  id                serial primary key,
  nome              text not null,
  uf                text not null,
  codigo_ibge       integer unique,
  codigo_rfb        integer unique,      -- código TOM da Receita (de-para dos CSVs)
  base_territorial  boolean not null default false,
  sede              boolean not null default false,
  unique (nome, uf)
);
create index idx_municipios_base on municipios (base_territorial) where base_territorial;

-- ----------------------------------------------------------------------------
-- 5. CONVENÇÕES COLETIVAS E PISOS
-- Estabelecimentos diferentes podem seguir CCTs diferentes; o piso vigente
-- para um trabalhador é o da CCT apontada pelo estabelecimento do seu vínculo.
-- A prorrogação ("vale até sair a nova") é o próprio modelo: o vínculo
-- estabelecimento→CCT só muda quando a Denise migra para a CCT nova.
-- ----------------------------------------------------------------------------
create table convencoes_coletivas (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,             -- ex.: "CCT Comércio Varejista 2026/2027"
  ano_base              integer not null,
  data_inicio_vigencia  date not null,
  data_fim_vigencia     date,                      -- null = vigente até a próxima
  data_limite_oposicao  date,                      -- prazo de entrega da Carta de Oposição DESTA CCT (preenchimento manual no registro)
  reclassificada_em     timestamptz,               -- carimbo da organização interna (fn_reclassificar_convencao)
  documento_url         text,
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table pisos_convencao (
  id             uuid primary key default gen_random_uuid(),
  convencao_id   uuid not null references convencoes_coletivas (id) on delete cascade,
  funcao         text,                              -- null = piso geral da categoria
  valor          numeric(10,2) not null check (valor > 0)
);
create unique index ux_pisos_convencao
  on pisos_convencao (convencao_id, coalesce(funcao, '__geral__'));

-- Multas e taxas previstas em cada CCT — base de valores para as faturas
-- excepcionais (tipos multa | acordo | taxa_adicional). Preenchimento manual
-- no registro da convenção, junto com pisos e data limite de oposição.
create table taxas_convencao (
  id             uuid primary key default gen_random_uuid(),
  convencao_id   uuid not null references convencoes_coletivas (id) on delete cascade,
  nome           text not null,
  valor          numeric(10,2),
  observacoes    text,
  created_at     timestamptz not null default now()
);
create index idx_taxas_convencao on taxas_convencao (convencao_id);

-- ----------------------------------------------------------------------------
-- 6. EMPRESAS E ESTABELECIMENTOS (espelham os CSVs da Receita Federal)
-- ----------------------------------------------------------------------------
create table empresas (
  cnpj_basico                text primary key check (cnpj_basico ~ '^\d{8}$'),
  razao_social               text not null,
  natureza_juridica          text references naturezas_juridicas (codigo),
  qualificacao_responsavel   text references qualificacoes_responsavel (codigo),
  capital_social             numeric(15,2),
  porte                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index idx_empresas_razao_social on empresas using gin (razao_social gin_trgm_ops);

create table estabelecimentos (
  id                       uuid primary key default gen_random_uuid(),
  cnpj_basico              text not null references empresas (cnpj_basico) on delete cascade,
  cnpj_ordem               text not null check (cnpj_ordem ~ '^\d{4}$'),
  cnpj_dv                  text not null check (cnpj_dv ~ '^\d{2}$'),
  cnpj_completo            text generated always as (cnpj_basico || cnpj_ordem || cnpj_dv) stored,
  matriz_filial            smallint check (matriz_filial in (1, 2)),
  nome_fantasia            text,
  situacao_cadastral       text,          -- 01 nula · 02 ativa · 03 suspensa · 04 inapta · 08 baixada
  data_situacao_cadastral  date,
  motivo_situacao          text references motivos_situacao_cadastral (codigo),
  data_inicio_atividades   date,
  cnae_principal           text references cnaes (codigo),
  convencao_id             uuid references convencoes_coletivas (id),  -- CCT aplicável
  tipo_logradouro          text,
  logradouro               text,
  numero                   text,
  complemento              text,
  bairro                   text,
  cep                      text,
  uf                       text default 'MG',
  municipio_id             integer references municipios (id),
  ddd_1                    text,
  telefone_1               text,
  ddd_2                    text,
  telefone_2               text,
  email                    text,
  situacao_especial        text,
  data_situacao_especial   date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (cnpj_basico, cnpj_ordem, cnpj_dv)
);
create unique index ux_estabelecimentos_cnpj_completo on estabelecimentos (cnpj_completo);
create index idx_estabelecimentos_municipio on estabelecimentos (municipio_id);
create index idx_estabelecimentos_cnae on estabelecimentos (cnae_principal);
create index idx_estabelecimentos_situacao on estabelecimentos (situacao_cadastral);
create index idx_estabelecimentos_convencao on estabelecimentos (convencao_id);
create index idx_estabelecimentos_fantasia on estabelecimentos using gin (nome_fantasia gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 7. PARCEIROS, RECEPCIONISTAS E PERFIS
-- ----------------------------------------------------------------------------
create table parceiros (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  segmento              text,
  cnpj                  text check (cnpj is null or cnpj ~ '^\d{14}$'),
  contato_nome          text,
  contato_email         text,
  contato_whatsapp      text,
  data_inicio_contrato  date,
  data_fim_contrato     date,
  status                text not null default 'ativo',
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Recepcionistas dos parceiros: fazem check-in pela página pública do QR Code,
-- sem login no CRM, autenticados por PIN individual (hash bcrypt via pgcrypto).
-- O PIN é definido pela Denise/Admin: pin_hash = crypt('1234', gen_salt('bf'))
create table recepcionistas (
  id           uuid primary key default gen_random_uuid(),
  parceiro_id  uuid not null references parceiros (id) on delete cascade,
  nome         text not null,
  pin_hash     text not null,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_recepcionistas_parceiro on recepcionistas (parceiro_id) where ativo;

create table perfis (
  id           uuid primary key references auth.users (id) on delete cascade,
  nome         text not null,
  email        text not null,
  role         papel_usuario not null,
  parceiro_id  uuid references parceiros (id),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chk_parceiro_exige_vinculo
    check (role <> 'parceiro' or parceiro_id is not null)
);

-- ----------------------------------------------------------------------------
-- 8. TRABALHADORES, VÍNCULOS, BENEFICIADOS, CARTAS DE OPOSIÇÃO
-- ----------------------------------------------------------------------------
create table trabalhadores (
  id                             uuid primary key default gen_random_uuid(),
  cpf                            text not null unique check (cpf ~ '^\d{11}$'),
  nome                           text not null,
  data_nascimento                date,
  telefone_whatsapp              text,
  email                          text,
  municipio_id                   integer references municipios (id),
  recolhe_contribuicao_sindical  boolean not null default true,
  recolhe_mensalidade_convenio   boolean not null default false,
  nivel nivel_protecao generated always as (
    case
      when recolhe_contribuicao_sindical and recolhe_mensalidade_convenio then 'ouro'::nivel_protecao
      when recolhe_contribuicao_sindical then 'prata'::nivel_protecao
      else 'bronze'::nivel_protecao
    end
  ) stored,
  forma_pagamento_preferida      forma_cobranca not null default 'holerite',
  status_cadastro                status_cadastro not null default 'pendente',
  origem_cadastro                origem_cadastro not null default 'manual',
  data_filiacao                  date,
  observacoes                    text,
  aprovado_por                   uuid references perfis (id),
  aprovado_em                    timestamptz,
  observacao_aprovacao           text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint chk_convenio_exige_contribuicao
    check (not (recolhe_mensalidade_convenio and not recolhe_contribuicao_sindical))
);
create index idx_trabalhadores_nome on trabalhadores using gin (nome gin_trgm_ops);
create index idx_trabalhadores_nivel on trabalhadores (nivel);
create index idx_trabalhadores_municipio on trabalhadores (municipio_id);
create index idx_trabalhadores_pendentes on trabalhadores (status_cadastro)
  where status_cadastro = 'pendente';

create table vinculos_empregaticios (
  id                 uuid primary key default gen_random_uuid(),
  trabalhador_id     uuid not null references trabalhadores (id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos (id),
  data_admissao      date,
  data_desligamento  date,
  principal          boolean not null default true,
  funcao             text,                -- casa com pisos_convencao.funcao quando houver
  salario_informado  numeric(10,2),       -- override opcional; padrão = piso da CCT do estabelecimento
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint chk_datas_vinculo
    check (data_desligamento is null or data_desligamento >= data_admissao)
);
create unique index ux_vinculo_principal_ativo
  on vinculos_empregaticios (trabalhador_id)
  where principal and data_desligamento is null;
create index idx_vinculos_estabelecimento on vinculos_empregaticios (estabelecimento_id);

create table beneficiados (
  id               uuid primary key default gen_random_uuid(),
  titular_id       uuid not null references trabalhadores (id) on delete cascade,
  cpf              text not null unique check (cpf ~ '^\d{11}$'),
  nome             text not null,
  data_nascimento  date,
  parentesco       text,
  tipo             tipo_beneficiado not null,   -- direto 1% (incluso) · indireto +0,5% · adicional +1%
  status_cadastro  status_cadastro not null default 'pendente',
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_beneficiados_titular on beneficiados (titular_id);

create table cartas_oposicao (
  id              uuid primary key default gen_random_uuid(),
  trabalhador_id  uuid not null references trabalhadores (id) on delete cascade,
  ano_base        integer not null,
  data_entrega    date not null,
  forma           forma_entrega_carta not null default 'presencial',
  comprovante_url text,
  registrada_por  uuid references perfis (id),
  created_at      timestamptz not null default now(),
  unique (trabalhador_id, ano_base)
);
create index idx_cartas_ano on cartas_oposicao (ano_base);

-- ----------------------------------------------------------------------------
-- 9. CONVÊNIO: BENEFÍCIOS E SOLICITAÇÕES (com QR e check-in)
-- ----------------------------------------------------------------------------
create table beneficios (
  id               uuid primary key default gen_random_uuid(),
  parceiro_id      uuid not null references parceiros (id) on delete cascade,
  nome             text not null,
  descricao        text,
  categoria        text,
  valor_particular numeric(10,2),
  valor_convenio   numeric(10,2),
  nivel_minimo     nivel_protecao not null default 'ouro',   -- bloqueio por nível
  condicoes        text,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_valores_beneficio
    check (valor_convenio is null or valor_particular is null or valor_convenio <= valor_particular)
);
create index idx_beneficios_parceiro on beneficios (parceiro_id) where ativo;

create table solicitacoes_servico (
  id                     uuid primary key default gen_random_uuid(),
  numero_guia            text not null unique default fn_gera_numero_guia(),
  token_publico          uuid not null unique default gen_random_uuid(),  -- QR Code
  trabalhador_id         uuid not null references trabalhadores (id),
  beneficiado_id         uuid references beneficiados (id),
  parceiro_id            uuid not null references parceiros (id),
  beneficio_id           uuid not null references beneficios (id),
  data_agendada          date not null,
  horario                time,
  valor_particular       numeric(10,2),          -- snapshot na emissão (preço pode mudar depois)
  valor_convenio         numeric(10,2),          -- snapshot na emissão
  status                 status_solicitacao not null default 'solicitada',
  motivo_rejeicao        text,                   -- OPCIONAL (decisão: reduzir atrito do parceiro)
  resolucao_analise      text,                   -- Denise, ao tratar rejeições
  checkin_por            uuid references recepcionistas (id),
  checkin_em             timestamptz,
  checkin_justificativa  text,
  registrada_por         uuid references perfis (id),
  confirmada_por         uuid references perfis (id),   -- contra-referência mensal (portal)
  confirmada_em          timestamptz,
  observacoes            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index idx_solicitacoes_status on solicitacoes_servico (status);
create index idx_solicitacoes_parceiro_status on solicitacoes_servico (parceiro_id, status);
create index idx_solicitacoes_trabalhador on solicitacoes_servico (trabalhador_id);
create index idx_solicitacoes_data on solicitacoes_servico (data_agendada);

-- ----------------------------------------------------------------------------
-- 10. FINANCEIRO
-- repasses = guia de pagamento emitida em nome da EMPRESA:
--   previsto (gerada) → enviado (e-mail) → recebido | em_atraso.
-- Agrega as faturas nominais dos trabalhadores com forma 'holerite'.
-- Contribuição: 1 guia/ano por empresa · Mensalidade: 1 guia/mês por empresa.
-- Trabalhadores com 'boleto_direto' ficam FORA da guia da empresa.
-- ----------------------------------------------------------------------------
create table repasses (
  id                    uuid primary key default gen_random_uuid(),
  cnpj_basico           text not null references empresas (cnpj_basico),
  tipo                  tipo_fatura not null,
  competencia           date not null,
  valor_total           numeric(12,2) not null check (valor_total >= 0),
  data_vencimento       date,                      -- default na geração: emissão + 30 dias (config dias_vencimento_boleto)
  nominal               boolean not null default true,   -- false apenas p/ registros agregados legados
  numero_guia_pagamento text unique,                     -- fn_gera_guia_pagamento() na emissão
  pdf_url               text,
  email_enviado_para    text,
  email_enviado_em      timestamptz,
  status                status_repasse not null default 'previsto',
  recebido_em           date,
  comprovante_url       text,
  registrado_por        uuid references perfis (id),
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (cnpj_basico, tipo, competencia)
);
create index idx_repasses_status on repasses (status);
create index idx_repasses_competencia on repasses (competencia);

create table faturas (
  id              uuid primary key default gen_random_uuid(),
  trabalhador_id  uuid not null references trabalhadores (id),
  tipo            tipo_fatura not null,
  competencia     date not null,
  valor           numeric(10,2) not null check (valor >= 0),
  data_vencimento date,                            -- default na geração: emissão + 30 dias (config dias_vencimento_boleto)
  forma_cobranca  forma_cobranca not null default 'holerite',
  status          status_fatura not null default 'aberta',
  data_pagamento  date,
  repasse_id      uuid references repasses (id),   -- guia da empresa que agrega esta fatura
  boleto_url      text,                            -- boleto_direto: API bancária (futuro)
  boleto_codigo   text,
  origem_baixa    origem_baixa not null default 'manual',
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trabalhador_id, tipo, competencia)
);
create index idx_faturas_status on faturas (status);
create index idx_faturas_competencia on faturas (tipo, competencia);
create index idx_faturas_repasse on faturas (repasse_id);

-- ----------------------------------------------------------------------------
-- 11. BLOQUEIOS DE NEGÓCIO (obs. 2 e 3) — vivem no banco, valem p/ todo cliente
-- ----------------------------------------------------------------------------
-- POLÍTICA DE BLOQUEIO:
--  · Empresa que atrasa guia (holerite) NUNCA bloqueia o trabalhador —
--    vira alerta estratégico + cobrança institucional.
--  · Só bloqueia inadimplência PESSOAL — boleto_direto vencido, ou marcação
--    manual da Secretaria quando o desconto em folha comprovadamente não
--    ocorreu (únicas vias que geram status 'inadimplente' em fatura):
--      contribuição inadimplente → bloqueia Direitos Individuais (Prata)
--      mensalidade inadimplente  → bloqueia Convênio (Ouro)
create or replace function fn_titular_bloqueado(p_trabalhador_id uuid, p_tipo tipo_fatura)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from faturas
     where trabalhador_id = p_trabalhador_id
       and tipo = p_tipo
       and status = 'inadimplente'
  );
$$;

create or replace function fn_valida_solicitacao()
returns trigger language plpgsql as $$
declare
  v_nivel_titular nivel_protecao;
  v_nivel_minimo  nivel_protecao;
  v_vp numeric(10,2);
  v_vc numeric(10,2);
begin
  -- Beneficiado deve pertencer ao titular
  if new.beneficiado_id is not null then
    perform 1 from beneficiados b
      where b.id = new.beneficiado_id and b.titular_id = new.trabalhador_id;
    if not found then
      raise exception 'Beneficiado não pertence ao titular informado';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Bloqueio por nível: enum compara na ordem bronze < prata < ouro
    select t.nivel into v_nivel_titular from trabalhadores t where t.id = new.trabalhador_id;
    select b.nivel_minimo, b.valor_particular, b.valor_convenio
      into v_nivel_minimo, v_vp, v_vc
      from beneficios b where b.id = new.beneficio_id;
    if v_nivel_titular < v_nivel_minimo then
      raise exception 'Nível % do titular não permite acessar este benefício (mínimo: %)',
        v_nivel_titular, v_nivel_minimo;
    end if;

    -- Bloqueio por inadimplência de mensalidade
    if fn_titular_bloqueado(new.trabalhador_id, 'mensalidade_convenio') then
      raise exception 'Titular com mensalidade do convênio inadimplente (boleto) — Convênio bloqueado';
    end if;

    -- Snapshot de valores na emissão da guia
    new.valor_particular := coalesce(new.valor_particular, v_vp);
    new.valor_convenio   := coalesce(new.valor_convenio, v_vc);
  end if;

  return new;
end $$;

create trigger trg_valida_solicitacao
  before insert or update of beneficiado_id, trabalhador_id on solicitacoes_servico
  for each row execute function fn_valida_solicitacao();

-- ----------------------------------------------------------------------------
-- 12. PÁGINA PÚBLICA DO QR CODE — funções security definer
-- Chamadas via Edge Function/endpoint público; o token uuid não-adivinhável
-- é a credencial de leitura; o PIN do recepcionista é a credencial de escrita.
-- ----------------------------------------------------------------------------
create or replace function fn_dados_guia_publica(p_token uuid)
returns table (
  numero_guia      text,
  interessado      text,
  data_agendada    date,
  horario          time,
  parceiro         text,
  servico          text,
  valor_particular numeric,
  valor_convenio   numeric,
  status           status_solicitacao
) language sql stable security definer as $$
  select
    s.numero_guia,
    coalesce(b.nome, t.nome) as interessado,
    s.data_agendada,
    s.horario,
    p.nome as parceiro,
    bf.nome as servico,
    s.valor_particular,
    s.valor_convenio,
    s.status
  from solicitacoes_servico s
  join trabalhadores t on t.id = s.trabalhador_id
  left join beneficiados b on b.id = s.beneficiado_id
  join parceiros p on p.id = s.parceiro_id
  join beneficios bf on bf.id = s.beneficio_id
  where s.token_publico = p_token;
$$;

create or replace function fn_registrar_checkin(
  p_token uuid,
  p_pin text,
  p_atendido boolean,           -- true = atendido (executada) · false = recusado (rejeitada)
  p_justificativa text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_sol solicitacoes_servico%rowtype;
  v_recep recepcionistas%rowtype;
begin
  select * into v_sol from solicitacoes_servico where token_publico = p_token;
  if not found then
    raise exception 'Guia não encontrada';
  end if;
  if v_sol.status not in ('solicitada', 'pendente_confirmacao') then
    raise exception 'Guia já processada (status atual: %)', v_sol.status;
  end if;

  -- Valida o PIN contra os recepcionistas ativos do parceiro da guia
  select r.* into v_recep
    from recepcionistas r
   where r.parceiro_id = v_sol.parceiro_id
     and r.ativo
     and r.pin_hash = crypt(p_pin, r.pin_hash)
   limit 1;
  if not found then
    raise exception 'Senha de recepcionamento inválida';
  end if;

  update solicitacoes_servico set
    status = case when p_atendido then 'executada' else 'rejeitada' end::status_solicitacao,
    motivo_rejeicao = case when not p_atendido then p_justificativa else motivo_rejeicao end,
    checkin_por = v_recep.id,
    checkin_em = now(),
    checkin_justificativa = p_justificativa
  where id = v_sol.id;

  return jsonb_build_object(
    'numero_guia', v_sol.numero_guia,
    'resultado', case when p_atendido then 'executada' else 'rejeitada' end,
    'recepcionista', v_recep.nome
  );
end $$;

-- ----------------------------------------------------------------------------
-- 13. ATENDIMENTOS JURÍDICOS, NOTIFICAÇÕES, IMPORTAÇÕES
-- ----------------------------------------------------------------------------
create table atendimentos_juridicos (
  id              uuid primary key default gen_random_uuid(),
  trabalhador_id  uuid not null references trabalhadores (id),
  data            date not null default current_date,
  tipo            tipo_atend_juridico not null,
  resumo          text,
  status          text not null default 'aberto',
  responsavel     uuid references perfis (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_atendimentos_trabalhador on atendimentos_juridicos (trabalhador_id);

-- Gate dos Direitos Individuais (serviços Prata). Exceção deliberada:
-- tipo 'orientacao' é livre para qualquer nível (orientações gerais são
-- para todos — FAQ 07); o bloqueio vale para homologação, processo etc.
create or replace function fn_valida_atendimento_juridico()
returns trigger language plpgsql as $$
declare
  v_nivel nivel_protecao;
begin
  if new.tipo <> 'orientacao' then
    select nivel into v_nivel from trabalhadores where id = new.trabalhador_id;

    if v_nivel = 'bronze' then
      raise exception 'Trabalhador Bronze: apenas orientação geral. Assistência individual exige nível Prata.';
    end if;

    if fn_titular_bloqueado(new.trabalhador_id, 'contribuicao_sindical') then
      raise exception 'Contribuição sindical (boleto) inadimplente — Direitos Individuais bloqueados até a regularização';
    end if;
  end if;
  return new;
end $$;

create trigger trg_valida_atendimento_juridico
  before insert on atendimentos_juridicos
  for each row execute function fn_valida_atendimento_juridico();

create table notificacoes (
  id                      uuid primary key default gen_random_uuid(),
  destinatario_perfil_id  uuid references perfis (id),
  destinatario_role       papel_usuario,
  tipo                    text not null,
  titulo                  text not null,
  mensagem                text,
  referencia_tabela       text,
  referencia_id           text,
  lida                    boolean not null default false,
  created_at              timestamptz not null default now(),
  constraint chk_destinatario
    check (destinatario_perfil_id is not null or destinatario_role is not null)
);
create index idx_notificacoes_nao_lidas on notificacoes (destinatario_perfil_id, destinatario_role)
  where not lida;

create table importacoes_csv (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null,
  arquivo_nome  text not null,
  total_linhas  integer not null default 0,
  inseridos     integer not null default 0,
  atualizados   integer not null default 0,
  erros         jsonb,
  importado_por uuid references perfis (id),
  created_at    timestamptz not null default now()
);

-- Fila de solicitações ao Admin: qualquer role abre chamados para operações
-- fora da sua autonomia (em especial os CREATE/DELETE "CRU-baixa" da
-- Secretaria). O Admin analisa; na aprovação, o frontend executa a operação
-- real com a sessão dele e marca a solicitação como aprovada (se a operação
-- falhar, permanece pendente). Cadastros do formulário do site NÃO passam
-- por aqui: entram via service_role com status_cadastro = 'pendente'
-- (a aprovação da Secretaria é UPDATE, autonomia que ela tem).
create table solicitacoes_admin (
  id                 uuid primary key default gen_random_uuid(),
  solicitante        uuid not null references perfis (id),
  tabela_alvo        text not null,               -- ex.: 'trabalhadores'
  operacao           operacao_auditoria not null, -- INSERT | UPDATE | DELETE
  registro_id        text,                        -- alvo (UPDATE/DELETE)
  payload            jsonb,                       -- dados propostos (INSERT/UPDATE)
  justificativa      text,
  status             status_solicitacao_admin not null default 'pendente',
  analisada_por      uuid references perfis (id),
  analisada_em       timestamptz,
  observacao_analise text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_solic_admin_pendentes on solicitacoes_admin (status)
  where status = 'pendente';
create index idx_solic_admin_solicitante on solicitacoes_admin (solicitante);

create or replace function fn_notifica_solicitacao_admin()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into notificacoes (destinatario_role, tipo, titulo, mensagem, referencia_tabela, referencia_id)
    values (
      'admin', 'solicitacao_admin',
      'Nova solicitação: ' || new.operacao || ' em ' || new.tabela_alvo,
      coalesce(new.justificativa, ''),
      'solicitacoes_admin', new.id::text
    );
  elsif tg_op = 'UPDATE' and new.status in ('aprovada', 'rejeitada')
        and old.status = 'pendente' then
    insert into notificacoes (destinatario_perfil_id, tipo, titulo, mensagem, referencia_tabela, referencia_id)
    values (
      new.solicitante, 'solicitacao_admin_analisada',
      'Solicitação ' || new.status || ': ' || new.operacao || ' em ' || new.tabela_alvo,
      coalesce(new.observacao_analise, ''),
      'solicitacoes_admin', new.id::text
    );
  end if;
  return new;
end $$;

create trigger trg_notifica_solicitacao_admin
  after insert or update of status on solicitacoes_admin
  for each row execute function fn_notifica_solicitacao_admin();

-- ----------------------------------------------------------------------------
-- 14. TRIGGERS DE updated_at E AUDITORIA
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'convencoes_coletivas', 'empresas', 'estabelecimentos', 'parceiros',
    'recepcionistas', 'perfis', 'trabalhadores', 'vinculos_empregaticios',
    'beneficiados', 'beneficios', 'solicitacoes_servico', 'repasses',
    'faturas', 'atendimentos_juridicos', 'solicitacoes_admin'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %I
         for each row execute function fn_set_updated_at()', t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'convencoes_coletivas', 'pisos_convencao', 'taxas_convencao', 'empresas',
    'estabelecimentos', 'parceiros', 'recepcionistas', 'perfis', 'trabalhadores',
    'vinculos_empregaticios', 'beneficiados', 'cartas_oposicao', 'beneficios',
    'solicitacoes_servico', 'repasses', 'faturas', 'atendimentos_juridicos',
    'solicitacoes_admin'
  ] loop
    execute format(
      'create trigger trg_%s_auditoria after insert or update or delete on %I
         for each row execute function fn_auditoria()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 15. RLS HABILITADO COMO PADRÃO SEGURO (políticas em 03_rls.sql)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'naturezas_juridicas', 'qualificacoes_responsavel', 'cnaes',
    'motivos_situacao_cadastral', 'municipios', 'convencoes_coletivas',
    'pisos_convencao', 'taxas_convencao', 'empresas', 'estabelecimentos', 'parceiros',
    'recepcionistas', 'perfis', 'trabalhadores', 'vinculos_empregaticios',
    'beneficiados', 'cartas_oposicao', 'beneficios', 'solicitacoes_servico',
    'repasses', 'faturas', 'atendimentos_juridicos', 'notificacoes',
    'importacoes_csv', 'auditoria', 'solicitacoes_admin'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 16. VIEWS DE CÁLCULO (fonte única das regras de valores)
-- security_invoker: obedecem ao RLS de quem consulta (protegem CPF/salário)
-- ----------------------------------------------------------------------------
-- Salário-base = salario_informado (override) OU piso da CCT do estabelecimento
-- do vínculo principal ativo, casando pela função (fallback: piso geral).
create or replace view v_base_calculo_trabalhador with (security_invoker = on) as
select
  t.id  as trabalhador_id,
  t.cpf,
  t.nivel,
  t.forma_pagamento_preferida,
  v.id  as vinculo_id,
  v.estabelecimento_id,
  e.cnpj_basico,
  coalesce(v.salario_informado, piso.valor) as salario_base,
  least(coalesce(v.salario_informado, piso.valor) * 0.05, 100.00) as valor_contribuicao_anual
from trabalhadores t
left join vinculos_empregaticios v
       on v.trabalhador_id = t.id and v.principal and v.data_desligamento is null
left join estabelecimentos e on e.id = v.estabelecimento_id
left join lateral (
  select p.valor
    from pisos_convencao p
   where p.convencao_id = e.convencao_id
     and (p.funcao = v.funcao or p.funcao is null)
   order by p.funcao nulls last
   limit 1
) piso on true;

-- Mensalidade do Ouro: 1% do salário-base (titular + diretos inclusos)
-- + 0,5% por beneficiado indireto + 1% por beneficiado adicional
-- (07_filiacao_valores_carta_oposicao.md)
create or replace view v_mensalidade_titular with (security_invoker = on) as
select
  bc.trabalhador_id,
  bc.cpf,
  bc.cnpj_basico,
  bc.forma_pagamento_preferida,
  bc.salario_base,
  coalesce(bn.n_diretos, 0)    as n_beneficiados_diretos,
  coalesce(bn.n_indiretos, 0)  as n_beneficiados_indiretos,
  coalesce(bn.n_adicionais, 0) as n_beneficiados_adicionais,
  round(bc.salario_base * (
    0.01
    + 0.005 * coalesce(bn.n_indiretos, 0)
    + 0.01  * coalesce(bn.n_adicionais, 0)
  ), 2) as valor_mensalidade
from v_base_calculo_trabalhador bc
left join (
  select titular_id,
         count(*) filter (where tipo = 'direto')    as n_diretos,
         count(*) filter (where tipo = 'indireto')  as n_indiretos,
         count(*) filter (where tipo = 'adicional') as n_adicionais
    from beneficiados
   where ativo and status_cadastro = 'aprovado'
   group by titular_id
) bn on bn.titular_id = bc.trabalhador_id
where bc.nivel = 'ouro';

-- ============================================================================
-- FIM · Próximo arquivo: 02_seed_municipios.sql
-- ============================================================================
