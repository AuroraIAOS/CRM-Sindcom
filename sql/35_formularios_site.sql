-- ============================================================================
-- CRM SINDCOM — 35_formularios_site.sql · WP 2.1 do plano do site HTML
-- Tabelas dos formulários próprios do site: contato, currículo, vaga, denúncia.
-- ============================================================================
--
-- NÃO APLICADO. Escrito para ser aplicado primeiro num projeto BENCH descartável
-- (docs/formularios_site_bd.md); aplicar em produção é decisão do Maxwell.
-- Pré-requisitos: 01_schema.sql (perfis, papel_usuario) e 03_rls.sql (fn_eh).
--
-- MODELO DE ACESSO
--  · GRAVAÇÃO: só a Edge Function, com service_role. anon e authenticated NÃO
--    têm INSERT (nem policy, nem GRANT): o site público jamais fala com o banco
--    por conta própria; toda validação, Turnstile, honeypot e rate limit estão
--    na função. Duas camadas de negação (GRANT ausente + RLS sem policy).
--  · LEITURA/MODERAÇÃO (frontend do CRM, role authenticated), conforme 03_rls:
--      site_contatos    SELECT Admin, Secretaria
--      site_curriculos  SELECT Admin, Secretaria
--      site_vagas       SELECT Admin, Secretaria · UPDATE (status_moderacao) idem
--      site_denuncias   SELECT Admin, Jurídico   · UPDATE (status, responsavel_id) idem
--      DELETE           só Admin, em todas.
--    Presidente e Parceiro não leem nada daqui. Secretaria NÃO lê denúncia.
--  · GRANT DE COLUNA: authenticated lê todas as colunas EXCETO origem_ip_hash
--    (o CRM não precisa dele). Consequência: `select *` falha com 42501; o
--    frontend deve listar as colunas (select explícito).
--  · UPDATE barrado por RLS devolve ZERO linhas, sem erro (orientacoes.md §2).
--    Já UPDATE de coluna sem GRANT devolve 42501.
--  · O arquivo anexado (currículo, evidência de denúncia) NÃO é guardado: vai
--    por e-mail. O banco só guarda metadado (nome e tamanho).
--  · IP: nunca gravado. origem_ip_hash = hash COM SAL calculado na Edge Function
--    (sal em secret da função). Em denúncia anônima fica NULL por CHECK.
--
-- Idempotente: create ... if not exists / drop ... if exists / create or replace.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. CONTATO
-- ----------------------------------------------------------------------------
create table if not exists site_contatos (
  id              uuid primary key default gen_random_uuid(),
  criado_em       timestamptz not null default now(),
  nome            text not null,
  telefone        text,                       -- só dígitos (DDD + número), opcional
  email           text not null,
  cidade          text,
  estado          text,                       -- UF, 2 letras maiúsculas
  assunto         text,
  mensagem        text not null,
  consentimento   boolean not null,
  email_status    text not null default 'pendente',
  email_erro      text,
  origem_ip_hash  text,
  constraint ck_sc_nome     check (char_length(btrim(nome)) between 2 and 150),
  constraint ck_sc_telefone check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  constraint ck_sc_email    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint ck_sc_cidade   check (cidade is null or char_length(cidade) <= 100),
  constraint ck_sc_estado   check (estado is null or estado ~ '^[A-Z]{2}$'),
  constraint ck_sc_assunto  check (assunto is null or char_length(assunto) <= 200),
  constraint ck_sc_mensagem check (char_length(btrim(mensagem)) between 1 and 5000),
  constraint ck_sc_consent  check (consentimento is true),
  constraint ck_sc_email_st check (email_status in ('pendente','enviado','falhou')),
  constraint ck_sc_email_er check (email_erro is null or char_length(email_erro) <= 500),
  constraint ck_sc_iphash   check (origem_ip_hash is null or char_length(origem_ip_hash) between 16 and 128)
);
create index if not exists ix_site_contatos_criado on site_contatos (criado_em desc);
create index if not exists ix_site_contatos_email_pend on site_contatos (email_status) where email_status <> 'enviado';

-- ----------------------------------------------------------------------------
-- 2. CURRÍCULO (arquivo NÃO é guardado; só metadado)
-- ----------------------------------------------------------------------------
create table if not exists site_curriculos (
  id              uuid primary key default gen_random_uuid(),
  criado_em       timestamptz not null default now(),
  nome            text not null,
  telefone        text,
  email           text not null,
  cidade          text,
  area_interesse  text,
  consentimento   boolean not null,
  anexo_nome      text,                       -- metadado: nome do arquivo enviado por e-mail
  anexo_tamanho   integer,                    -- bytes (limite 5 MB, plano §4.3)
  email_status    text not null default 'pendente',
  email_erro      text,
  origem_ip_hash  text,
  constraint ck_scv_nome     check (char_length(btrim(nome)) between 2 and 150),
  constraint ck_scv_telefone check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  constraint ck_scv_email    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint ck_scv_cidade   check (cidade is null or char_length(cidade) <= 100),
  constraint ck_scv_area     check (area_interesse is null or char_length(area_interesse) <= 200),
  constraint ck_scv_consent  check (consentimento is true),
  constraint ck_scv_anexo_n  check (anexo_nome is null or char_length(anexo_nome) between 1 and 255),
  constraint ck_scv_anexo_t  check (anexo_tamanho is null or anexo_tamanho between 0 and 5242880),
  constraint ck_scv_anexo_p  check ((anexo_nome is null) = (anexo_tamanho is null)),  -- ambos ou nenhum
  constraint ck_scv_email_st check (email_status in ('pendente','enviado','falhou')),
  constraint ck_scv_email_er check (email_erro is null or char_length(email_erro) <= 500),
  constraint ck_scv_iphash   check (origem_ip_hash is null or char_length(origem_ip_hash) between 16 and 128)
);
create index if not exists ix_site_curriculos_criado on site_curriculos (criado_em desc);

-- ----------------------------------------------------------------------------
-- 3. VAGA (moderada: nasce 'pendente'; só aparece no site depois de 'aprovada')
-- ----------------------------------------------------------------------------
create table if not exists site_vagas (
  id               uuid primary key default gen_random_uuid(),
  criado_em        timestamptz not null default now(),
  empresa          text not null,
  cnpj             text not null,             -- 14 posições (alfanumérico desde jul/2026: 12 [0-9A-Z] + 2 dígitos)
  contato_nome     text not null,
  telefone         text not null,
  email            text not null,
  cargo            text not null,
  descricao        text not null,
  requisitos       text,
  consentimento    boolean not null,
  status_moderacao text not null default 'pendente',
  publicada_em     timestamptz,               -- preenchida por trigger ao aprovar
  email_status     text not null default 'pendente',
  email_erro       text,
  origem_ip_hash   text,
  constraint ck_sv_empresa  check (char_length(btrim(empresa)) between 2 and 200),
  constraint ck_sv_cnpj     check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint ck_sv_contato  check (char_length(btrim(contato_nome)) between 2 and 150),
  constraint ck_sv_telefone check (telefone ~ '^[0-9]{10,13}$'),
  constraint ck_sv_email    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint ck_sv_cargo    check (char_length(btrim(cargo)) between 2 and 150),
  constraint ck_sv_desc     check (char_length(btrim(descricao)) between 1 and 5000),
  constraint ck_sv_req      check (requisitos is null or char_length(requisitos) <= 3000),
  constraint ck_sv_consent  check (consentimento is true),
  constraint ck_sv_status   check (status_moderacao in ('pendente','aprovada','rejeitada','encerrada')),
  -- pendente/rejeitada nunca têm data de publicação (nada "meio publicado")
  constraint ck_sv_publicada check (publicada_em is null or status_moderacao in ('aprovada','encerrada')),
  constraint ck_sv_email_st check (email_status in ('pendente','enviado','falhou')),
  constraint ck_sv_email_er check (email_erro is null or char_length(email_erro) <= 500),
  constraint ck_sv_iphash   check (origem_ip_hash is null or char_length(origem_ip_hash) between 16 and 128)
);
create index if not exists ix_site_vagas_status on site_vagas (status_moderacao, publicada_em desc);

-- ----------------------------------------------------------------------------
-- 4. DENÚNCIA / COMUNICADO (a mais sensível; só Admin e Jurídico)
-- ----------------------------------------------------------------------------
create sequence if not exists site_denuncia_protocolo_seq;

create table if not exists site_denuncias (
  id                    uuid primary key default gen_random_uuid(),
  criado_em             timestamptz not null default now(),
  -- 'DEN-AAAA-NNNNNN'. Sequence global (não reinicia por ano): o número é único.
  -- O protocolo é devolvido a quem denunciou, que NÃO consegue consultá-lo
  -- (anon não tem SELECT).
  protocolo             text not null unique
    default ('DEN-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-'
             || lpad(nextval('site_denuncia_protocolo_seq')::text, 6, '0')),
  empresa_denunciada    text not null,
  cnpj                  text,                 -- opcional; mesmo formato do CNPJ de vaga
  cidade                text not null,
  endereco              text,
  tipos                 text[] not null,
  relato                text not null,
  urgencia              text not null,
  comunicada_autoridade text not null,
  identificar           boolean not null,     -- true = denúncia identificada
  nome                  text,
  telefone              text,
  email                 text,
  consentimento         boolean not null,
  anexos_nomes          text[] not null default '{}',   -- metadado; arquivos vão por e-mail
  status                text not null default 'nova',
  responsavel_id        uuid references perfis (id) on delete set null,
  email_status          text not null default 'pendente',
  email_erro            text,
  origem_ip_hash        text,
  constraint ck_sd_protocolo check (protocolo ~ '^DEN-[0-9]{4}-[0-9]{6,}$'),
  constraint ck_sd_empresa   check (char_length(btrim(empresa_denunciada)) between 2 and 200),
  constraint ck_sd_cnpj      check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint ck_sd_cidade    check (char_length(btrim(cidade)) between 2 and 100),
  constraint ck_sd_endereco  check (endereco is null or char_length(endereco) <= 300),
  constraint ck_sd_tipos     check (cardinality(tipos) between 1 and 4
                                    and tipos <@ array['trabalhista','direitos_humanos','saude_seguranca','outra']),
  constraint ck_sd_relato    check (char_length(btrim(relato)) between 1 and 8000),  -- = limite do formulário do site
  constraint ck_sd_urgencia  check (urgencia in ('baixa','media','alta')),
  constraint ck_sd_autoridade check (comunicada_autoridade in ('sim','nao','nao_sei')),
  constraint ck_sd_consent   check (consentimento is true),
  constraint ck_sd_anexos    check (cardinality(anexos_nomes) <= 10),
  constraint ck_sd_status    check (status in ('nova','em_analise','encerrada')),
  constraint ck_sd_email_st  check (email_status in ('pendente','enviado','falhou')),
  constraint ck_sd_email_er  check (email_erro is null or char_length(email_erro) <= 500),
  constraint ck_sd_nome      check (nome is null or char_length(btrim(nome)) between 2 and 150),
  constraint ck_sd_telefone  check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  constraint ck_sd_email     check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Identificação: identificar=true exige nome (telefone/e-mail opcionais, já
  -- validados acima). identificar=false: NENHUM dado de identificação e NENHUM
  -- hash de IP — a anônima é anônima por construção do banco, não por boa
  -- vontade da Edge Function.
  constraint ck_sd_ident     check (
    (identificar and nome is not null)
    or (not identificar and nome is null and telefone is null and email is null and origem_ip_hash is null)
  ),
  constraint ck_sd_iphash    check (origem_ip_hash is null or char_length(origem_ip_hash) between 16 and 128)
);
create index if not exists ix_site_denuncias_status on site_denuncias (status, urgencia, criado_em desc);

-- ----------------------------------------------------------------------------
-- 5. RATE LIMIT (uso exclusivo da Edge Function)
-- ----------------------------------------------------------------------------
-- Guarda só um hash com sal (definido pela função) + tipo + instante. Linhas com
-- mais de 1 dia são apagadas a cada chamada. Sem SELECT/INSERT para ninguém além
-- de service_role e da própria função. Para denúncia anônima, a Edge Function
-- deve usar um sal que rotacione diariamente, para que a chave não seja
-- correlacionável entre dias.
create table if not exists site_limites (
  id          bigint generated always as identity primary key,
  tipo        text not null,
  chave_hash  text not null,
  criado_em   timestamptz not null default now(),
  constraint ck_sl_tipo  check (char_length(tipo) between 1 and 40),
  constraint ck_sl_chave check (char_length(chave_hash) between 16 and 128)
);
create index if not exists ix_site_limites on site_limites (tipo, chave_hash, criado_em desc);

-- fn_site_limite: devolve TRUE se a requisição pode seguir (e a registra) ou
-- FALSE se o teto da janela foi atingido (nada é registrado nesse caso).
-- O advisory lock por (tipo,chave) serializa chamadas concorrentes da mesma
-- chave, evitando que uma rajada passe do máximo.
create or replace function fn_site_limite(p_tipo text, p_chave_hash text, p_janela interval, p_maximo int)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_qtd int;
begin
  if p_tipo is null or p_chave_hash is null or p_janela is null or p_maximo is null
     or p_maximo < 1 or p_janela <= interval '0' or p_janela > interval '1 day' then
    raise exception 'parâmetros inválidos em fn_site_limite' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tipo || ':' || p_chave_hash, 0));

  delete from site_limites where criado_em < now() - interval '1 day';

  select count(*) into v_qtd from site_limites
   where tipo = p_tipo and chave_hash = p_chave_hash and criado_em >= now() - p_janela;

  if v_qtd >= p_maximo then
    return false;
  end if;

  insert into site_limites (tipo, chave_hash) values (p_tipo, p_chave_hash);
  return true;
end $$;

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS DE INTEGRIDADE
-- ----------------------------------------------------------------------------
-- 6.1 Vaga: publicada_em é decidida pelo banco, não pelo cliente (preenche ao aprovar, limpa ao reverter).
create or replace function fn_site_vaga_publicacao()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status_moderacao = 'aprovada' and new.publicada_em is null then
    new.publicada_em := now();
  elsif new.status_moderacao in ('pendente','rejeitada') then
    new.publicada_em := null;   -- reverter a moderação despublica (senão ck_sv_publicada barraria a reversão)
  end if;
  return new;
end $$;

drop trigger if exists trg_site_vaga_publicacao on site_vagas;
create trigger trg_site_vaga_publicacao
  before insert or update on site_vagas
  for each row execute function fn_site_vaga_publicacao();

-- 6.2 Denúncia: o responsável precisa ser Admin ou Jurídico ativo (senão a
-- denúncia poderia ser "atribuída" a quem não consegue lê-la).
create or replace function fn_site_denuncia_responsavel()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.responsavel_id is not null
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    if not exists (select 1 from perfis
                    where id = new.responsavel_id and ativo and role in ('admin','juridico')) then
      raise exception 'responsável deve ser Admin ou Jurídico ativo' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_site_denuncia_responsavel on site_denuncias;
create trigger trg_site_denuncia_responsavel
  before insert or update on site_denuncias
  for each row execute function fn_site_denuncia_responsavel();

-- ----------------------------------------------------------------------------
-- 7. VITRINE PÚBLICA DE VAGAS (única porta do anon)
-- ----------------------------------------------------------------------------
-- Por que função SECURITY DEFINER e não view "definer": o anon NÃO tem SELECT em
-- site_vagas. A função roda como dono, mas o que sai é fixado no SELECT abaixo —
-- é um contrato de colunas. A view v_vagas_publicas é security_invoker=true
-- (padrão do projeto) e só repassa a função.
--
-- Colunas devolvidas e por que são seguras:
--  · id                uuid aleatório; âncora na página. Não revela ordem/volume.
--  · cargo             título da vaga: informação que a empresa quer divulgar.
--  · descricao         texto escrito pela empresa para candidatos; só sai depois
--                      de MODERAÇÃO humana (status 'aprovada'). A moderação deve
--                      checar se há telefone/e-mail/nome pessoal no texto.
--  · requisitos_resumo primeiros 280 caracteres de requisitos (limita volume).
--  · publicada_em      data de aprovação; metadado sem dado pessoal.
-- NUNCA saem: empresa, cnpj, contato_nome, telefone, email, consentimento,
-- origem_ip_hash, email_* (o candidato se candidata pela Secretaria do Sindicato,
-- que intermedeia — o contato da empresa não é público).
-- Não há coluna cidade: o formulário de vaga não a coleta (ver docs).
-- Teto: 100 linhas, mais recentes primeiro.
create or replace function fn_vagas_publicas()
returns table (id uuid, cargo text, descricao text, requisitos_resumo text, publicada_em timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $$
  select v.id, v.cargo, v.descricao, left(v.requisitos, 280), v.publicada_em
    from site_vagas v
   where v.status_moderacao = 'aprovada'
   order by v.publicada_em desc nulls last
   limit 100;
$$;

create or replace view v_vagas_publicas with (security_invoker = true) as
  select * from fn_vagas_publicas();

-- ----------------------------------------------------------------------------
-- 8. RLS — negação por padrão
-- ----------------------------------------------------------------------------
alter table site_contatos   enable row level security;
alter table site_curriculos enable row level security;
alter table site_vagas      enable row level security;
alter table site_denuncias  enable row level security;
alter table site_limites    enable row level security;   -- sem nenhuma policy: ninguém

-- Nenhuma policy de INSERT existe de propósito (service_role ignora RLS).

drop policy if exists pol_site_contatos_select on site_contatos;
create policy pol_site_contatos_select on site_contatos for select to authenticated
  using (fn_eh('admin','secretaria'));
drop policy if exists pol_site_contatos_delete on site_contatos;
create policy pol_site_contatos_delete on site_contatos for delete to authenticated
  using (fn_eh('admin'));

drop policy if exists pol_site_curriculos_select on site_curriculos;
create policy pol_site_curriculos_select on site_curriculos for select to authenticated
  using (fn_eh('admin','secretaria'));
drop policy if exists pol_site_curriculos_delete on site_curriculos;
create policy pol_site_curriculos_delete on site_curriculos for delete to authenticated
  using (fn_eh('admin'));

drop policy if exists pol_site_vagas_select on site_vagas;
create policy pol_site_vagas_select on site_vagas for select to authenticated
  using (fn_eh('admin','secretaria'));
drop policy if exists pol_site_vagas_update on site_vagas;
create policy pol_site_vagas_update on site_vagas for update to authenticated
  using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
drop policy if exists pol_site_vagas_delete on site_vagas;
create policy pol_site_vagas_delete on site_vagas for delete to authenticated
  using (fn_eh('admin'));

drop policy if exists pol_site_denuncias_select on site_denuncias;
create policy pol_site_denuncias_select on site_denuncias for select to authenticated
  using (fn_eh('admin','juridico'));
drop policy if exists pol_site_denuncias_update on site_denuncias;
create policy pol_site_denuncias_update on site_denuncias for update to authenticated
  using (fn_eh('admin','juridico')) with check (fn_eh('admin','juridico'));
drop policy if exists pol_site_denuncias_delete on site_denuncias;
create policy pol_site_denuncias_delete on site_denuncias for delete to authenticated
  using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 9. GRANTS — o Supabase concede privilégios por padrão a anon/authenticated em
-- tabelas novas do schema public; aqui tudo é revogado e re-concedido a dedo.
-- ----------------------------------------------------------------------------
revoke all on site_contatos, site_curriculos, site_vagas, site_denuncias, site_limites
  from public, anon, authenticated;
revoke all on sequence site_denuncia_protocolo_seq from public, anon, authenticated;
revoke all on sequence site_limites_id_seq from public, anon, authenticated;

-- authenticated: SELECT por coluna (sem origem_ip_hash) + o mínimo de UPDATE.
grant select (id, criado_em, nome, telefone, email, cidade, estado, assunto, mensagem,
              consentimento, email_status, email_erro)
  on site_contatos to authenticated;
grant select (id, criado_em, nome, telefone, email, cidade, area_interesse, consentimento,
              anexo_nome, anexo_tamanho, email_status, email_erro)
  on site_curriculos to authenticated;
grant select (id, criado_em, empresa, cnpj, contato_nome, telefone, email, cargo, descricao,
              requisitos, consentimento, status_moderacao, publicada_em, email_status, email_erro)
  on site_vagas to authenticated;
grant select (id, criado_em, protocolo, empresa_denunciada, cnpj, cidade, endereco, tipos, relato,
              urgencia, comunicada_autoridade, identificar, nome, telefone, email, consentimento,
              anexos_nomes, status, responsavel_id, email_status, email_erro)
  on site_denuncias to authenticated;

grant update (status_moderacao)       on site_vagas     to authenticated;
grant update (status, responsavel_id) on site_denuncias to authenticated;

grant delete on site_contatos, site_curriculos, site_vagas, site_denuncias to authenticated;  -- RLS: só Admin

-- service_role (Edge Function): escreve tudo, inclusive o estado do e-mail.
grant select, insert, update on site_contatos, site_curriculos, site_vagas, site_denuncias to service_role;
grant select, insert, delete on site_limites to service_role;
grant usage on sequence site_denuncia_protocolo_seq to service_role;
grant usage on sequence site_limites_id_seq to service_role;

-- anon: só a vitrine de vagas aprovadas (colunas fixadas na função, seção 7).
grant select on v_vagas_publicas to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. EXECUTE das funções (a RLS não olha EXECUTE — CLAUDE.md, portão adversarial)
-- ----------------------------------------------------------------------------
revoke execute on function fn_site_limite(text, text, interval, int) from public, anon, authenticated;
grant  execute on function fn_site_limite(text, text, interval, int) to service_role;

revoke execute on function fn_site_vaga_publicacao()      from public, anon, authenticated;
revoke execute on function fn_site_denuncia_responsavel() from public, anon, authenticated;

-- Vitrine: anon PRECISA de EXECUTE (a view é invoker e chama a função).
revoke execute on function fn_vagas_publicas() from public;
grant  execute on function fn_vagas_publicas() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
