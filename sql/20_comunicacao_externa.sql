-- ============================================================================
-- CRM SINDCOM — 20_comunicacao_externa.sql
-- ETAPA 08 · Subetapa 08.4 — Esquema da comunicação externa e da coleta de dados
--
-- POR QUÊ
-- O CRM está em produção com 17.300 estabelecimentos, 16.671 empresas e
-- ZERO estabelecimentos com trabalhador vinculado. A ETAPA 08 converte a base
-- de empresas em base de pessoas por uma campanha externa: o sindicato manda
-- um link com token para a caixa do contador, ele devolve a planilha do quadro
-- de empregados, e a Denise revisa antes de virar cadastro. Estas seis tabelas
-- são o esqueleto desse caminho (spec §5).
--
-- O QUE ESTE ARQUIVO NÃO FAZ
--  · Não altera `trabalhadores` — o modelo de coleta v1 mapeia direto no
--    template que já existe (specs/importacao.md §3.3), e `nivel` continua
--    coluna gerada, jamais escrita.
--  · Não cria view nenhuma. Toda view desta etapa nasce nas subetapas de tela,
--    e nasce com `security_invoker = on` (orientacoes.md §2.15).
--  · Não cria a tabela de tentativas do rate limit do upload. Ela é da 08.5,
--    junto da Edge Function que a usa — mesmo arranjo de `tentativas_checkin`
--    em 19_hardening_adversarial.sql, que vive ao lado da sua função.
--
-- SEGURANÇA (as três lições que este arquivo aplica de propósito)
--  · §2.16 — o grant de fábrica deste projeto Supabase nasce aberto demais.
--    Toda tabela nova aqui perde TUDO de `anon` e perde TRUNCATE/REFERENCES/
--    TRIGGER de `authenticated`. RLS é o recorte de linha; o GRANT é o portão.
--  · §2.15 — RLS habilitada E policy explícita em todas as seis, desde a
--    criação. Sem policy, `anon` recebe `[]` por ausência; com o revoke, nem
--    chega a consultar.
--  · ETAPA 07, pendência aberta — o token da guia pública NÃO expira. Aqui
--    `token_expira_em` é NOT NULL com default de 90 dias e `token_revogado_em`
--    existe desde a criação, não como conserto posterior.
--
-- IDEMPOTENTE: pode ser reaplicado; a 2ª execução tem delta zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONTABILIDADES — a entidade que hoje não existe (spec §5.1)
--
-- O vínculo contador↔empresa é hoje implícito no e-mail compartilhado do
-- estabelecimento, e se perde no dia em que a empresa troca de escritório.
-- Aqui ele vira entidade persistida e editável.
-- ----------------------------------------------------------------------------
create table if not exists contabilidades (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  email        text not null unique,
  cnpj         text,
  telefone     text,
  ativa        boolean not null default true,
  observacoes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- O e-mail é a chave natural do agrupamento (08.9). Guardar normalizado é o
  -- que faz `unique` valer de verdade: sem isso, `Contato@x.com` e
  -- `contato@x.com` viram duas contabilidades para o mesmo escritório.
  -- Garantido pelo trigger `trg_contabilidades_normaliza`; o CHECK é a rede de
  -- segurança para o dia em que alguém remover o trigger.
  constraint chk_contabilidades_email_normalizado
    check (email = lower(btrim(email)) and email <> '')
);

comment on table contabilidades is
  'Escritórios de contabilidade que respondem por 2+ estabelecimentos (ETAPA 08). Semeada em 08.9 pelo agrupamento por e-mail; editável depois. Caixa com 1 estabelecimento NÃO vira contabilidade — é empresa isolada.';
comment on column contabilidades.email is
  'Chave natural do agrupamento, sempre em minúsculas e sem espaços nas pontas (trigger trg_contabilidades_normaliza).';

-- ----------------------------------------------------------------------------
-- 2. CONTABILIDADE_ESTABELECIMENTOS — o vínculo, persistido e editável (§5.2)
-- ----------------------------------------------------------------------------
create table if not exists contabilidade_estabelecimentos (
  id                  uuid primary key default gen_random_uuid(),
  contabilidade_id    uuid not null references contabilidades (id) on delete cascade,
  estabelecimento_id  uuid not null references estabelecimentos (id) on delete cascade,
  -- 'agrupamento_email' = heurística nossa · 'informado' = o contador declarou.
  -- O DEFAULT é o valor MAIS FRACO de propósito: esquecer de informar a origem
  -- deve subestimar a certeza, nunca inventar uma declaração que não houve.
  origem              text not null default 'agrupamento_email'
                      check (origem in ('agrupamento_email', 'informado')),
  confirmado          boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (contabilidade_id, estabelecimento_id)
);

comment on table contabilidade_estabelecimentos is
  'Quais estabelecimentos cada contabilidade atende. confirmado=false enquanto for só o agrupamento por e-mail — o dia em que o contador disser "essa empresa não é mais minha", o CRM registra em vez de esquecer.';

-- ----------------------------------------------------------------------------
-- 3. MODELOS_COLETA — o que torna a ferramenta reconfigurável sem form builder
--    (spec §5.3 / D5). Criado por INSERT em migration, nunca por tela.
-- ----------------------------------------------------------------------------
create table if not exists modelos_coleta (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  colunas     jsonb not null,        -- [{nome, rotulo, obrigatoria, tipo, validacao}]
  destino     text not null check (destino in ('trabalhadores')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table modelos_coleta is
  'Catálogo dos modelos de coleta. A próxima coleta custa um INSERT e uma revisão de copy — não uma subetapa de frontend. `destino` é fechado por CHECK: hoje só trabalhadores.';

-- ----------------------------------------------------------------------------
-- 4. CAMPANHAS (spec §5.4)
-- ----------------------------------------------------------------------------
create table if not exists campanhas (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  eixo               text check (eixo in ('estrutural', 'informativo', 'requisicao')),
  onda               smallint,
  assunto            text,
  modelo_coleta_id   uuid references modelos_coleta (id) on delete restrict,
  agendada_para      timestamptz,
  created_at         timestamptz not null default now()
);

comment on table campanhas is
  'Uma linha por disparo planejado. O envio em si acontece no ESP (Brevo) — nada de n8n e nada de pg_cron no envio (decisão D2).';

-- ----------------------------------------------------------------------------
-- 5. ENVIOS_CAMPANHA — a linha por destinatário (spec §5.5)
--
-- O TOKEN É REUTILIZÁVEL POR DECISÃO EXPLÍCITA: é identidade da contabilidade,
-- não senha descartável. `juridico@contss.com.br` responde por 129
-- estabelecimentos — com envio único ele teria de preencher 129 empresas antes
-- de mandar qualquer coisa, e parando no meio nada chegaria. Envio parcial vale
-- muito mais que envio nenhum.
--
-- A contrapartida obrigatória da reutilização são as duas colunas de validade e
-- revogação. O token da guia pública (ETAPA 07) não expira, e isso ficou como
-- pendência aberta; aqui a validade nasce NOT NULL e a revogação nasce junto.
-- ----------------------------------------------------------------------------
create table if not exists envios_campanha (
  id                   uuid primary key default gen_random_uuid(),
  campanha_id          uuid not null references campanhas (id) on delete cascade,
  -- Um dos dois, nunca nenhum: contabilidade (2+ estabs) OU empresa isolada.
  -- `restrict` porque envio é histórico: apagar a contabilidade não pode
  -- apagar o rastro de que o link foi mandado para ela.
  contabilidade_id     uuid references contabilidades (id) on delete restrict,
  estabelecimento_id   uuid references estabelecimentos (id) on delete restrict,
  email                text not null,
  token                uuid not null unique default gen_random_uuid(),
  token_expira_em      timestamptz not null default now() + interval '90 days',
  token_revogado_em    timestamptz,
  enviado_em           timestamptz,
  primeira_remessa_em  timestamptz,
  ultima_remessa_em    timestamptz,
  created_at           timestamptz not null default now(),
  constraint chk_envio_tem_destinatario
    check (contabilidade_id is not null or estabelecimento_id is not null)
);

comment on table envios_campanha is
  'Um destinatário por linha; o token do link público mora aqui. Reutilizável por construção (spec §5.5), com validade obrigatória e revogação sem perda de histórico.';
comment on column envios_campanha.token_expira_em is
  'NOT NULL, default 90 dias. Token de vida infinita foi pendência aberta da ETAPA 07 — não se repete aqui.';
comment on column envios_campanha.token_revogado_em is
  'Preenchido ao revogar (08.11). O link antigo passa a ser recusado; a linha e as remessas dela permanecem.';

-- ----------------------------------------------------------------------------
-- 6. REMESSAS_DADOS — o que o contador enviou, e é IMUTÁVEL (spec §5.6)
--
-- Correção não altera remessa antiga: cria uma nova. É o que permite
-- reconstruir a origem de qualquer dado da base cadastral, e é a razão de
-- `ip_origem`/`user_agent` existirem — o token é reutilizável e de vida longa,
-- então uma contestação sobre "quem mandou o quê" precisa de rastro.
-- ----------------------------------------------------------------------------
create table if not exists remessas_dados (
  id                uuid primary key default gen_random_uuid(),
  envio_id          uuid not null references envios_campanha (id) on delete restrict,
  modelo_coleta_id  uuid not null references modelos_coleta (id) on delete restrict,
  arquivo_path      text not null,          -- objeto no bucket PRIVADO `remessas`
  status            text not null default 'recebida'
                    check (status in ('recebida', 'validada', 'importada', 'rejeitada')),
  linhas_recebidas  integer,
  linhas_com_erro   integer,
  relatorio         jsonb,
  ip_origem         inet,
  user_agent        text,
  recebida_em       timestamptz not null default now(),
  processada_em     timestamptz,
  processada_por    uuid references perfis (id) on delete set null
);

comment on table remessas_dados is
  'Uma linha por upload. Imutável (trigger trg_remessas_imutavel): só status, processada_em e processada_por mudam — o resto é a evidência do que chegou.';
comment on column remessas_dados.arquivo_path is
  'Caminho no bucket PRIVADO. Nunca URL pública: planilha com CPF só é servida por URL assinada, que expira.';

-- ----------------------------------------------------------------------------
-- 7. ÍNDICES
-- ----------------------------------------------------------------------------
create index if not exists idx_contab_estab_contabilidade on contabilidade_estabelecimentos (contabilidade_id);
create index if not exists idx_contab_estab_estabelecimento on contabilidade_estabelecimentos (estabelecimento_id);
create index if not exists idx_envios_campanha on envios_campanha (campanha_id);
create index if not exists idx_envios_contabilidade on envios_campanha (contabilidade_id);
create index if not exists idx_envios_estabelecimento on envios_campanha (estabelecimento_id);
create index if not exists idx_envios_email on envios_campanha (lower(email));
create index if not exists idx_remessas_envio on remessas_dados (envio_id);
create index if not exists idx_remessas_status on remessas_dados (status, recebida_em desc);

-- ----------------------------------------------------------------------------
-- 8. TRIGGERS
--
-- As duas funções abaixo são SECURITY DEFINER com dono `postgres` por lição
-- medida (orientacoes.md §2.17): função de trigger nasce SECURITY INVOKER e
-- roda com o privilégio de quem inseriu. No dia em que uma passada de
-- hardening revogar EXECUTE de PUBLIC — foi exatamente o que 05_hardening.sql
-- fez —, um trigger INVOKER quebra o INSERT legítimo com 42501. DEFINER
-- imuniza, e o `set search_path` fecha o §2.5.
-- ----------------------------------------------------------------------------
create or replace function fn_normaliza_email_contabilidade()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.email := lower(btrim(new.email));
  return new;
end $fn$;
alter function fn_normaliza_email_contabilidade() owner to postgres;

drop trigger if exists trg_contabilidades_normaliza on contabilidades;
create trigger trg_contabilidades_normaliza
  before insert or update of email on contabilidades
  for each row execute function fn_normaliza_email_contabilidade();

-- Imutabilidade da remessa. Só três colunas mudam depois que o arquivo chega:
-- as do PROCESSAMENTO. As da EVIDÊNCIA (quem mandou, o quê, de onde, quando)
-- ficam congeladas — é isso que a palavra "imutável" da spec significa na
-- prática, e sem trigger ela seria só uma frase no documento.
create or replace function fn_remessa_imutavel()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (new.envio_id, new.modelo_coleta_id, new.arquivo_path, new.linhas_recebidas,
      new.linhas_com_erro, new.relatorio, new.ip_origem, new.user_agent, new.recebida_em)
     is distinct from
     (old.envio_id, old.modelo_coleta_id, old.arquivo_path, old.linhas_recebidas,
      old.linhas_com_erro, old.relatorio, old.ip_origem, old.user_agent, old.recebida_em)
  then
    raise exception
      'Remessa é imutável: só status, processada_em e processada_por podem mudar. Correção cria remessa nova.'
      using errcode = '42501';
  end if;
  return new;
end $fn$;
alter function fn_remessa_imutavel() owner to postgres;

drop trigger if exists trg_remessas_imutavel on remessas_dados;
create trigger trg_remessas_imutavel
  before update on remessas_dados
  for each row execute function fn_remessa_imutavel();

-- updated_at: só `contabilidades` tem a coluna (as demais são append-only ou
-- têm carimbo próprio de processamento).
drop trigger if exists trg_contabilidades_updated_at on contabilidades;
create trigger trg_contabilidades_updated_at
  before update on contabilidades
  for each row execute function fn_set_updated_at();

-- As duas funções acima nascem com `EXECUTE` para PUBLIC (privilégio de fábrica
-- de toda função nova), e o PostgREST publica TODA função de `public` como RPC.
-- O advisor de segurança pegou as duas assim que a migração subiu:
--   "fn_normaliza_email_contabilidade() can be executed by the `anon` role as a
--    SECURITY DEFINER function via /rest/v1/rpc/..."
-- É a segunda das três brechas que o CLAUDE.md manda procurar — função exposta
-- como RPC, onde a RLS não olha o `EXECUTE`.
--
-- Revogar é seguro e NÃO quebra o trigger: o Postgres confere `EXECUTE` da
-- função de trigger na hora de CRIAR o trigger, não na hora de disparar. O caso
-- da §2.17 é outro — lá o que quebrou foi uma função INVOKER chamando por
-- dentro uma terceira função cujo `EXECUTE` tinha sido revogado. Aqui as duas
-- são DEFINER e não chamam ninguém. Medido depois de revogar: o INSERT continua
-- normalizando e o UPDATE continua sendo recusado.
revoke execute on function fn_normaliza_email_contabilidade() from public, anon, authenticated;
revoke execute on function fn_remessa_imutavel() from public, anon, authenticated;

-- Auditoria. Entram as tabelas de ciclo de vida editável e baixo volume:
-- `contabilidades` (entidade editável), `envios_campanha` (revogação e
-- reemissão de token precisam de rastro), `campanhas` e `modelos_coleta`.
--
-- Ficam FORA, com motivo:
--  · contabilidade_estabelecimentos — 7.438 linhas numa carga só (08.9), e a
--    própria tabela já carrega `origem` e `confirmado`, que é o que se quer
--    saber dela. Auditar dobraria o volume para registrar o óbvio.
--  · remessas_dados — já é imutável por trigger e guarda processada_por/
--    processada_em na própria linha; `relatorio` é JSONB potencialmente grande
--    e seria duplicado inteiro em `auditoria` a cada UPDATE de status.
do $do$
declare t text;
begin
  foreach t in array array['contabilidades', 'envios_campanha', 'campanhas', 'modelos_coleta'] loop
    execute format('drop trigger if exists trg_%s_auditoria on %I', t, t);
    execute format(
      'create trigger trg_%s_auditoria after insert or update or delete on %I
         for each row execute function fn_auditoria()', t, t);
  end loop;
end $do$;

-- ----------------------------------------------------------------------------
-- 9. RLS HABILITADA NAS SEIS
-- ----------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'contabilidades', 'contabilidade_estabelecimentos', 'modelos_coleta',
    'campanhas', 'envios_campanha', 'remessas_dados'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $do$;

-- ----------------------------------------------------------------------------
-- 10. POLICIES EXPLÍCITAS
--
-- Todas são `to authenticated`. `anon` não tem policy nenhuma aqui e, além
-- disso, perde todo o GRANT na seção 11 — as duas camadas são independentes
-- (§2.6c): o GRANT concede, a policy recorta. Uma nunca substitui a outra.
--
-- `parceiro` não aparece em lugar nenhum: o convênio não tem relação com a
-- campanha de coleta, e ele já lia a base empresarial indevidamente na ETAPA 07
-- (achado corrigido). Aqui ele nasce fora.
-- ----------------------------------------------------------------------------

-- 10.1 contabilidades — mesmo recorte de `empresas`: leitura ampla, escrita
--      de Admin e Secretaria (é a Denise quem corrige nome e telefone do
--      escritório ao falar com ele), exclusão só do Admin.
drop policy if exists pol_contabilidades_select on contabilidades;
create policy pol_contabilidades_select on contabilidades for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
drop policy if exists pol_contabilidades_insert on contabilidades;
create policy pol_contabilidades_insert on contabilidades for insert
  to authenticated with check (fn_eh('admin','secretaria'));
drop policy if exists pol_contabilidades_update on contabilidades;
create policy pol_contabilidades_update on contabilidades for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
drop policy if exists pol_contabilidades_delete on contabilidades;
create policy pol_contabilidades_delete on contabilidades for delete
  to authenticated using (fn_eh('admin'));

-- 10.2 contabilidade_estabelecimentos — idem.
drop policy if exists pol_contab_estab_select on contabilidade_estabelecimentos;
create policy pol_contab_estab_select on contabilidade_estabelecimentos for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
drop policy if exists pol_contab_estab_insert on contabilidade_estabelecimentos;
create policy pol_contab_estab_insert on contabilidade_estabelecimentos for insert
  to authenticated with check (fn_eh('admin','secretaria'));
drop policy if exists pol_contab_estab_update on contabilidade_estabelecimentos;
create policy pol_contab_estab_update on contabilidade_estabelecimentos for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
drop policy if exists pol_contab_estab_delete on contabilidade_estabelecimentos;
create policy pol_contab_estab_delete on contabilidade_estabelecimentos for delete
  to authenticated using (fn_eh('admin'));

-- 10.3 modelos_coleta — catálogo: qualquer papel do CRM lê, só Admin escreve.
--      Mesmo padrão das tabelas de referência (03_rls.sql §2).
drop policy if exists pol_modelos_coleta_select on modelos_coleta;
create policy pol_modelos_coleta_select on modelos_coleta for select
  to authenticated using (fn_role() is not null);
drop policy if exists pol_modelos_coleta_admin_all on modelos_coleta;
create policy pol_modelos_coleta_admin_all on modelos_coleta for all
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));

-- 10.4 campanhas — quem opera a campanha é Admin e Secretaria (`secretaria@` é
--      o Reply-To de toda a etapa). Presidente lê.
drop policy if exists pol_campanhas_select on campanhas;
create policy pol_campanhas_select on campanhas for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
drop policy if exists pol_campanhas_insert on campanhas;
create policy pol_campanhas_insert on campanhas for insert
  to authenticated with check (fn_eh('admin'));
drop policy if exists pol_campanhas_update on campanhas;
create policy pol_campanhas_update on campanhas for update
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));
drop policy if exists pol_campanhas_delete on campanhas;
create policy pol_campanhas_delete on campanhas for delete
  to authenticated using (fn_eh('admin'));

-- 10.5 envios_campanha — ESCRITA SÓ DO ADMIN. Gerar token (08.13) e revogar
--      token (08.11) são atos de Admin; a Secretaria acompanha e cobra.
--
--      TROCA CONSCIENTE, registrada para o portão adversarial da 08.12: a
--      Secretaria LÊ a linha inteira, e a coluna `token` está nela. RLS
--      restringe QUAIS LINHAS, nunca QUAIS COLUNAS — é a primeira das três
--      brechas que o CLAUDE.md manda procurar. Esconder a coluna dela exigiria
--      uma view SECURITY DEFINER com filtro interno (padrão de
--      `v_fila_parceiro`), e é isso que a 08.11 deve construir ao montar a tela
--      de cobertura, onde o requisito "o token não aparece em claro para quem
--      não é Admin" é critério de conclusão.
--
--      Por que a leitura da Secretaria não é adiável: a 08.10 é a tela DELA, e
--      sem chegar em `envios_campanha` não há caminho de `remessas_dados` até
--      o nome da contabilidade que mandou o arquivo.
--
--      Severidade real do que ela enxerga: o token só permite ENVIAR uma
--      remessa, que ela própria revisa antes de virar cadastro — e ela já tem
--      escrita direta em `trabalhadores`. Não é escalada de privilégio; é
--      exposição de credencial de baixo poder a quem já tem poder maior.
drop policy if exists pol_envios_select on envios_campanha;
create policy pol_envios_select on envios_campanha for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
drop policy if exists pol_envios_insert on envios_campanha;
create policy pol_envios_insert on envios_campanha for insert
  to authenticated with check (fn_eh('admin'));
drop policy if exists pol_envios_update on envios_campanha;
create policy pol_envios_update on envios_campanha for update
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));
drop policy if exists pol_envios_delete on envios_campanha;
create policy pol_envios_delete on envios_campanha for delete
  to authenticated using (fn_eh('admin'));

-- 10.6 remessas_dados — NENHUMA POLICY DE INSERT, e isso é deliberado.
--      Quem cria remessa é a Edge Function da 08.5, com service_role, que
--      ignora RLS por design. Papel autenticado nenhum insere aqui: se
--      inserisse, existiria um segundo caminho de entrada de dado externo sem
--      passar pelo canal com token, rate limit e rastro de IP.
--
--      UPDATE existe para Admin e Secretaria porque é o ato da 08.10 — marcar
--      a remessa como importada. O trigger de imutabilidade limita esse UPDATE
--      às três colunas de processamento.
drop policy if exists pol_remessas_select on remessas_dados;
create policy pol_remessas_select on remessas_dados for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
drop policy if exists pol_remessas_update on remessas_dados;
create policy pol_remessas_update on remessas_dados for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
drop policy if exists pol_remessas_delete on remessas_dados;
create policy pol_remessas_delete on remessas_dados for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 11. GRANTS — o portão, independente da RLS (§2.16)
--
-- `anon` perde TUDO nas seis. A página pública `/enviar-dados/:token` (08.6)
-- NÃO lê o banco: ela conversa só com a Edge Function, que responde o nome da
-- contabilidade e recebe o arquivo. Quem abre o link consegue ENVIAR; nunca
-- listar, nunca ler. Sem grant, `anon` nem chega à avaliação da policy.
--
-- `authenticated` mantém DML e perde os três privilégios de fábrica que
-- ninguém pediu — TRUNCATE não passa por RLS, é privilégio de tabela.
-- ----------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'contabilidades', 'contabilidade_estabelecimentos', 'modelos_coleta',
    'campanhas', 'envios_campanha', 'remessas_dados'
  ] loop
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke truncate, references, trigger on %I from authenticated', t);
  end loop;
end $do$;

-- ----------------------------------------------------------------------------
-- 12. MODELO DE COLETA v1 — "Cadastro sindical 2026"
--
-- Os seis campos pedidos por Maxwell, mapeados um a um contra o template de
-- importação que JÁ EXISTE (specs/importacao.md §3.3). Nenhuma alteração em
-- `trabalhadores` é necessária, e `nivel` continua coluna gerada.
--
-- Duas colunas são obrigatórias além do óbvio, e o motivo importa:
--  · `cnpj_estabelecimento` — sem ele não nasce o vínculo empregatício, e é o
--    vínculo que é a métrica da etapa. Trabalhador sem CNPJ não move o número.
--  · `recolhe_contribuicao` — o default do importador é "sim" (padrão legal).
--    Deixar em branco converteria silenciosamente quem se OPÔS em Prata. O
--    contador tem de declarar, não omitir.
-- ----------------------------------------------------------------------------
insert into modelos_coleta (nome, colunas, destino, ativo)
values (
  'Cadastro sindical 2026',
  '[
    {"nome":"cnpj_estabelecimento","rotulo":"CNPJ do estabelecimento","obrigatoria":true,"tipo":"cnpj","validacao":"14 dígitos com DV válido; cria o vínculo empregatício"},
    {"nome":"nome","rotulo":"Nome do trabalhador","obrigatoria":true,"tipo":"texto","validacao":"não vazio"},
    {"nome":"cpf","rotulo":"CPF","obrigatoria":true,"tipo":"cpf","validacao":"11 dígitos com dígito verificador válido"},
    {"nome":"telefone_whatsapp","rotulo":"Contato telefônico (WhatsApp)","obrigatoria":false,"tipo":"telefone","validacao":"só dígitos; aviso se não tiver 10 ou 11"},
    {"nome":"salario_informado","rotulo":"Piso salarial pago","obrigatoria":true,"tipo":"decimal","validacao":"maior que zero; a guia é emitida POR EMPRESA, então um piso em branco impede fechar o boleto da empresa inteira"},
    {"nome":"recolhe_contribuicao","rotulo":"Situação: sindicalizado ou oposição","obrigatoria":true,"tipo":"sindicalizado_ou_oposicao","validacao":"sindicalizado => true (Prata) · oposição => false (Bronze)"}
  ]'::jsonb,
  'trabalhadores',
  true
)
on conflict (nome) do nothing;

-- ----------------------------------------------------------------------------
-- 13. CONFERÊNCIA — as quatro medições de catálogo do critério da 08.4.
--     Rodar DEPOIS de aplicar. Não substituem a suíte; a suíte mede
--     comportamento, estas medem o que o catálogo realmente guardou.
--
-- (1) RLS ligada e ao menos uma policy por tabela nova:
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname='public' and c.relname in ('contabilidades',
--          'contabilidade_estabelecimentos','modelos_coleta','campanhas',
--          'envios_campanha','remessas_dados');
--
-- (2) Zero grant de fábrica sobrando nelas:
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='public' and grantee in ('anon','authenticated')
--      and table_name in (...as seis...);
--   -- esperado: nenhuma linha de `anon`, e nenhuma de TRUNCATE/REFERENCES/TRIGGER.
--
-- (3) Nenhuma view sem security_invoker (varredura de TODAS, não só das novas):
--   select c.relname,
--          coalesce((select option_value from pg_options_to_table(c.reloptions)
--                     where option_name='security_invoker'),'off_default') as invoker,
--          has_table_privilege('anon', c.oid, 'SELECT') as anon_le
--     from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind in ('v','m');
--
-- (4) tests/rls/comunicacao.spec.ts verde.
-- ----------------------------------------------------------------------------
