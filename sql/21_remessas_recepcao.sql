-- ============================================================================
-- CRM SINDCOM — 21_remessas_recepcao.sql
-- ETAPA 08 · Subetapa 08.5 — bucket privado + freio do endpoint público
--
-- O QUE ESTE ARQUIVO PREPARA
-- A Edge Function `receber-remessa` é um endpoint PÚBLICO, sem login, que
-- recebe dado pessoal — mesma classe de risco do check-in por QR da 02.2.
-- Aqui ficam as duas peças de banco que ela precisa:
--   1. o bucket PRIVADO `remessas`, onde a planilha do contador é guardada;
--   2. `tentativas_remessa`, o registro que faz o rate limit contar de verdade.
--
-- POR QUE A TABELA DE TENTATIVAS NÃO NASCEU NA 08.4
-- Ela é infraestrutura da função, não do modelo de dados da spec — que fixa
-- SEIS tabelas. Mesmo arranjo de `tentativas_checkin`, que vive ao lado da
-- `fn_registrar_checkin` em 19_hardening_adversarial.sql.
--
-- IDEMPOTENTE: pode ser reaplicado; a 2ª execução tem delta zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUCKET PRIVADO `remessas`
--
-- `public = false` é o que importa: sem isso, a URL do objeto seria acessível a
-- qualquer um que a adivinhasse, e o objeto é uma planilha com CPF. A leitura
-- interna (08.10) acontece por URL ASSINADA, que expira.
--
-- `file_size_limit` e `allowed_mime_types` são validação do lado do Storage —
-- uma segunda camada, independente da que a Edge Function faz. Se a checagem
-- da função falhar por um bug futuro, o Storage ainda recusa.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'remessas', 'remessas', false,
  5242880,  -- 5 MB. Um quadro de empregados de 4.000 linhas em .xlsx dá ~200 KB.
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 1b. UMA POLICY EM `storage.objects`, E SÓ UMA: leitura interna
--
-- `storage.objects` tem RLS ligada e nasceu com ZERO policies neste projeto
-- (medido em 2026-08-26). A intenção inicial aqui era não criar policy nenhuma:
-- quem escreve é a Edge Function com `service_role`, que ignora RLS por design.
--
-- **A MEDIÇÃO DERRUBOU A INTENÇÃO.** Com zero policies, quem fica de fora não é
-- só o `anon` — é o `authenticated` inteiro. Medido com login real, ANTES desta
-- policy existir:
--
--   Admin       → list = []   ·  createSignedUrl = "Object not found"
--
-- E a 08.10 exige exatamente isso: "a tela interna abre a planilha por URL
-- ASSINADA". Sem policy, a subetapa seguinte seria construída contra um bucket
-- que ninguém consegue ler — e o sintoma ("Object not found") não se parece com
-- permissão negada, ele se parece com arquivo inexistente. É a mesma família do
-- §2.6b: a negativa não recusa, ela FAZ SUMIR.
--
-- SELECT apenas. Ninguém de dentro do CRM escreve nem apaga objeto por aqui:
-- upload é só da Edge Function, e remessa é imutável (08.4).
drop policy if exists pol_remessas_leitura_interna on storage.objects;
create policy pol_remessas_leitura_interna on storage.objects for select
  to authenticated
  using (bucket_id = 'remessas' and public.fn_eh('admin','presidente','secretaria'));

-- Medido DEPOIS, com login real de cada papel — e o controle negativo é a
-- metade que prova que a policy não é "negar tudo":
--
--   ADMIN       list=1  assinar=OK      baixar=HTTP 200, 3640 bytes
--   SECRETARIA  list=1  assinar=OK      baixar=HTTP 200, 3640 bytes
--   JURIDICO    list=0  assinar=NEGADO
--   PARCEIRO    list=0  assinar=NEGADO
--   ANON        list=0  assinar=NEGADO
--
-- E o `anon` tentando ESCREVER, por requisição real na API de Storage:
--   403 "new row violates row-level security policy".
--   (Cuidado registrado: na 1ª medição o upload anônimo voltou 415
--   "invalid_mime_type" — o `allowed_mime_types` do bucket dispara ANTES da
--   autorização. Aquele 415 não provava nada sobre RLS. Só repetindo com o
--   content-type correto é que a negativa de RLS apareceu.)
--
-- Policies de `storage.objects` são mecanismo DISTINTO da RLS de tabela e
-- entram no escopo do portão adversarial da 08.12: o caso a atacar lá é `anon`
-- tentando LISTAR o bucket — e listar bucket VAZIO devolve `[]` de qualquer
-- jeito, então o ataque só vale com objeto dentro.

-- ----------------------------------------------------------------------------
-- 2. GRANT DE FÁBRICA NO SCHEMA `storage` — ACEITO COM MOTIVO, NÃO FECHADO
--
-- Medido em 2026-08-26: `anon` e `authenticated` têm INSERT, SELECT, UPDATE,
-- DELETE, **TRUNCATE**, REFERENCES e TRIGGER em `storage.objects`,
-- `storage.buckets` e `storage.buckets_analytics`. O 19_hardening_adversarial
-- varreu só o schema `public` e nunca alcançou este. TRUNCATE **não passa por
-- RLS** — é privilégio de tabela —, então a ausência de policies não cobre.
--
-- TENTAMOS REVOGAR, E NÃO DEU. E o modo como não deu é a parte que importa:
--
--   revoke truncate on storage.objects from anon;   →  SEM ERRO, sqlstate 00000
--   ...e o grant CONTINUA LÁ, conferido no catálogo logo depois.
--
-- O `postgres` deste projeto **não é superuser** (`rolsuper = false`) e **não é
-- membro de `supabase_storage_admin`**, que é o dono dessas tabelas. `REVOKE`
-- de privilégio que não é seu é NO-OP SILENCIOSO no Postgres: não levanta
-- exceção, não revoga nada. Se a conferência fosse "a migração aplicou sem
-- erro", teríamos dado o item por fechado (orientacoes.md §2.16b).
--
-- POR QUE ISSO É ACEITÁVEL, e a medição que sustenta:
--   · O schema `storage` NÃO é exposto pelo PostgREST. Medido por requisição:
--     `Accept-Profile: storage` devolve PGRST106 "Only the following schemas
--     are exposed: public, graphql_public". Não há verbo TRUNCATE em REST.
--   · `anon` e `authenticated` têm `rolcanlogin = false` — ninguém se conecta
--     como elas — e não têm CREATE para definir a função que faria o TRUNCATE
--     por dentro (mesma análise da §2.16).
--   · A API de Storage passa pela RLS: `anon` tentando upload no bucket recebe
--     403 "new row violates row-level security policy" (medido).
--
-- LEVAR PARA A 08.12: este item entra no relatório adversarial como ACEITO COM
-- MOTIVO, não como resolvido, e a revisão é pedir à Supabase (ou usar um papel
-- com privilégio) se o projeto migrar de plano.

-- ----------------------------------------------------------------------------
-- 3. TENTATIVAS_REMESSA — o freio do endpoint público
--
-- A lição que esta tabela materializa (§2.18): o caminho de recusa NÃO pode ser
-- exceção. Na ETAPA 07, a 1ª correção do freio do check-in falhou em silêncio
-- porque `RAISE EXCEPTION` abortava a transação e levava junto o próprio INSERT
-- que registrava a tentativa — o contador nunca saía de zero, e o teste provou
-- 15 tentativas em 731ms sem bloqueio nenhum.
--
-- Aqui o registro é feito pela Edge Function, em chamada própria, ANTES de
-- devolver a recusa como RESULTADO (`{ok:false}`, HTTP 200). Não existe
-- exceção no caminho de negócio.
--
-- `token_alvo` é TEXT, não UUID, de propósito: quem varre tokens manda lixo que
-- não é UUID nenhum, e um erro de cast faria a tentativa não ser registrada —
-- ou seja, varrer com lixo sairia de graça, que é o oposto do objetivo.
-- ----------------------------------------------------------------------------
create table if not exists tentativas_remessa (
  id           bigserial primary key,
  token_alvo   text        not null,
  sucesso      boolean     not null,
  motivo       text,        -- 'token_inexistente' | 'expirado' | 'revogado' | 'arquivo_invalido' | ...
  ip_origem    inet,
  ocorrida_em  timestamptz not null default now()
);

create index if not exists idx_tentativas_remessa_janela
  on tentativas_remessa (token_alvo, ocorrida_em desc);

alter table tentativas_remessa enable row level security;

-- Sem policy: nega por ausência para anon e authenticated. Só a `service_role`
-- (dentro da Edge Function) escreve e lê aqui. E, como em `tentativas_checkin`,
-- o GRANT também é revogado — as duas camadas são independentes (§2.6c).
revoke all on tentativas_remessa from anon, authenticated;
revoke all on sequence tentativas_remessa_id_seq from anon, authenticated;

comment on table tentativas_remessa is
  'Freio por TOKEN do endpoint público de recepção (08.5). Por token, nunca por contabilidade: travar a contabilidade deixaria um atacante silenciar um contador legítimo só errando token de propósito — mesma lição do freio do check-in.';

-- ----------------------------------------------------------------------------
-- 4. CONFERÊNCIA (rodar depois de aplicar)
--
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
--   select count(*) from pg_policy where polrelid = 'storage.objects'::regclass;  -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='storage' and table_name='objects'
--      and grantee in ('anon','authenticated')
--      and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');                 -- vazio
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name='tentativas_remessa' and grantee in ('anon','authenticated'); -- vazio
-- ----------------------------------------------------------------------------
