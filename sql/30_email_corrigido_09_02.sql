-- ============================================================================
-- CRM SINDCOM — sql/30_email_corrigido_09_02.sql
-- ETAPA 09 · Subetapa 9.2 — a correção de e-mail parou no meio do caminho
--
-- O QUE FOI RELATADO
-- Maxwell buscou `@gmai.com` em `/cobertura-empresas` e achou empresas ainda
-- com o domínio errado, depois de a correção de 2026-09-10 ter sido dada como
-- feita.
--
-- O QUE A MEDIÇÃO MOSTROU — e o defeito é meu, de escopo
-- O e-mail mora em TRÊS lugares neste banco, e eu corrigi um:
--
--   estabelecimentos.email   ← CADASTRO MESTRE (vem da RFB). 18 com typo.
--   contabilidades.email     ← cadastro mestre das contabilidades. 0 com typo.
--   envios_campanha.email    ← cópia do disparo. 12 corrigidos, 6 revertidos.
--
-- A correção de ontem tocou só `envios_campanha`, porque era ali que o CSV da
-- Brevo é montado. O cadastro ficou para trás — e cadastro é o que a tela de
-- cobertura mostra, o que o follow-up telefônico usa, e o que uma futura
-- regeneração de campanha leria.
--
-- E HÁ UM SEGUNDO PROBLEMA, QUE SÓ APARECE NO MÊS QUE VEM
-- `email` está na lista de colunas que o delta mensal da RFB compara e atualiza
-- (`scripts/rfb/delta.mjs`, CAMPOS_ESTAB). O endereço com typo NÃO é erro de
-- digitação nosso: é o que a empresa declarou à Receita. A Receita vai
-- continuar servindo `@gmai.com` no arquivo do mês que vem, e o delta
-- reescreveria a correção **em silêncio, todo mês**.
--
-- Corrigir o cadastro sem tratar isso seria entregar um conserto com prazo de
-- validade de 30 dias — e pior, um que reverte sem avisar ninguém.
--
-- POR QUE NÃO BASTA "PROTEGER A COLUNA email"
-- Congelar `email` contra o delta mensal destruiria o caso legítimo: empresa
-- que troca de e-mail na Receita PRECISA que o CRM acompanhe. A proteção tem de
-- ser cirúrgica — e é isto que as duas colunas novas permitem:
--
--   email_rfb_original  → o valor que a Receita mandava quando corrigimos
--   email_corrigido_em  → quando a correção foi feita
--
-- O gatilho preserva a correção **apenas enquanto a RFB insistir no mesmo valor
-- errado**. No dia em que a empresa arrumar a própria inscrição (ou trocar de
-- endereço), o valor novo é diferente do original e passa normalmente. Zero
-- falso positivo, e a regra vive no BANCO — vale para o delta mensal, para a
-- tela e para qualquer script futuro, sem depender de ninguém lembrar.
--
-- IDEMPOTENTE: `add column if not exists`, `create or replace`, e a correção
-- casa por endereço errado (na 2ª execução não acha mais nada).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As duas colunas que tornam a correção durável.
-- ----------------------------------------------------------------------------
alter table estabelecimentos
  add column if not exists email_rfb_original text,
  add column if not exists email_corrigido_em timestamptz;

comment on column estabelecimentos.email_rfb_original is
  'O e-mail que a Receita servia quando a correção manual foi feita. Existe para o gatilho saber '
  'distinguir "a RFB continua mandando o valor errado" (preserva a correção) de "a empresa trocou '
  'de e-mail de verdade" (aceita o novo). Subetapa 9.2.';
comment on column estabelecimentos.email_corrigido_em is
  'Quando o e-mail foi corrigido à mão. Nulo = nunca corrigido, e o delta mensal da RFB manda como '
  'sempre. Subetapa 9.2.';

-- ----------------------------------------------------------------------------
-- 2. O gatilho. Cirúrgico de propósito — ver o cabeçalho.
-- ----------------------------------------------------------------------------
create or replace function fn_preserva_email_corrigido()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Só age em linha que foi corrigida à mão E cuja origem ainda insiste no erro.
  if new.email_corrigido_em is not null
     and old.email_corrigido_em is not null
     and new.email is distinct from old.email
     and lower(trim(new.email)) is not distinct from lower(trim(old.email_rfb_original))
  then
    new.email := old.email;
  end if;
  return new;
end $$;

comment on function fn_preserva_email_corrigido() is
  'Impede que o delta mensal da RFB desfaça uma correção manual de e-mail, SEM congelar a coluna: '
  'se a Receita passar a servir um valor diferente do original, a atualização passa. Subetapa 9.2.';

drop trigger if exists trg_preserva_email_corrigido on estabelecimentos;
create trigger trg_preserva_email_corrigido
  before update of email on estabelecimentos
  for each row execute function fn_preserva_email_corrigido();

-- ----------------------------------------------------------------------------
-- 3. As 18 correções no CADASTRO.
--
-- Aqui vão os DEZOITO, e não os doze de ontem. A diferença é estrutural: em
-- `envios_campanha`, seis tiveram de ser revertidos porque o endereço corrigido
-- já pertencia a OUTRO envio, e a Brevo funde contato por e-mail na importação
-- — duas linhas iguais fariam um dos links sumir. No CADASTRO não existe essa
-- restrição, e nem deveria: o mesmo contador atende várias empresas, e a base
-- já tem 62 estabelecimentos com as versões corretas desses mesmos endereços.
-- ----------------------------------------------------------------------------
with typos(errado, certo) as (values
 ('ana.nogueira397800@gmai.com','ana.nogueira397800@gmail.com'),
 ('contador.andrenarciso@gmai.com','contador.andrenarciso@gmail.com'),
 ('danilo20162016@gmai.com','danilo20162016@gmail.com'),
 ('feedbackassessoriacontabil@gmai.com','feedbackassessoriacontabil@gmail.com'),
 ('impactossp@gmai.com','impactossp@gmail.com'),
 ('joelagnaldo37@gmai.com','joelagnaldo37@gmail.com'),
 ('zirousboutiqueloja@gmai.com','zirousboutiqueloja@gmail.com'),
 ('contadores.email@gmal.com','contadores.email@gmail.com'),
 ('daianecipriano1@gmal.com','daianecipriano1@gmail.com'),
 ('samiraresende29@gmal.com','samiraresende29@gmail.com'),
 ('anaclaraassis489@gmail.con','anaclaraassis489@gmail.com'),
 ('lu0403mendessilva@gmail.con','lu0403mendessilva@gmail.com'),
 ('martinsjairo85@gmail.comag','martinsjairo85@gmail.com'),
 ('luizamendess@hotmail.con','luizamendess@hotmail.com'),
 ('independenciamoveis@bol.combr','independenciamoveis@bol.com.br'),
 ('kim.kp@bolcom.br','kim.kp@bol.com.br'),
 ('lm_sc@yahoo.co.br','lm_sc@yahoo.com.br'),
 ('sercolserv@uol.cpm.br','sercolserv@uol.com.br'))
, reg as (
  insert into auditoria (tabela, registro_id, operacao, dados_antes, dados_depois)
  select 'estabelecimentos', s.id::text, 'UPDATE',
         jsonb_build_object('email', s.email, 'motivo', 'higienizacao 9.2 — dominio com erro de digitacao'),
         jsonb_build_object('email', t.certo, 'origem', 'correcao manual autorizada por Maxwell em 2026-09-11 (cadastro mestre)')
    from estabelecimentos s join typos t on lower(trim(s.email)) = t.errado
  returning 1
)
update estabelecimentos s
   set email = t.certo,
       email_rfb_original = s.email,
       email_corrigido_em = now()
  from typos t
 where lower(trim(s.email)) = t.errado;

-- ----------------------------------------------------------------------------
-- 4. As duas telas de cobertura passam a ler o MESMO lugar.
--
-- Esta era uma inconsistência real, e foi o que fez o relato parecer
-- contraditório: `v_cobertura_contabilidades` sempre leu o cadastro
-- (`contabilidades.email`), enquanto `v_cobertura_empresas` lia a cópia do
-- disparo (`envios_campanha.email`). Duas telas irmãs respondendo "qual é o
-- e-mail desta empresa?" a partir de tabelas diferentes.
--
-- Agora as duas leem o CADASTRO — que é a pergunta que a tela faz: "para quem
-- eu ligo, para quem eu reenvio o link". E `email_envio` fica exposto ao lado,
-- para o caso em que o disparo saiu para outro endereço: divergência tem de
-- ficar VISÍVEL, não resolvida em silêncio a favor de uma das duas.
-- ----------------------------------------------------------------------------
create or replace view v_cobertura_empresas
with (security_invoker = on) as
 with estab_cobertos as (
   select distinct estabelecimento_id from vinculos_empregaticios
 )
 select distinct on (e.estabelecimento_id)
    e.estabelecimento_id,
    e.id as envio_id,
    e.campanha_id,
    est.cnpj_completo,
    emp.razao_social,
    est.nome_fantasia,
    est.municipio_id,
    est.email,                                   -- cadastro: o contato de verdade
    ec.estabelecimento_id is not null as coberta,
    e.descadastrado_em,
    e.token_revogado_em is not null as link_revogado,
    e.primeira_remessa_em,
    e.ultima_remessa_em,
    e.created_at,
    -- `email_envio` entra NO FIM, e não ao lado de `email`, porque
    -- `create or replace view` recusa coluna nova no meio da lista:
    --   ERROR 42P16: cannot change name of view column "coberta" to "email_envio"
    -- Pôr no fim evita ter de dropar a view (e com ela as dependências).
    e.email as email_envio                       -- para onde o link efetivamente saiu
   from envios_campanha e
   join estabelecimentos est on est.id = e.estabelecimento_id
   join empresas emp on emp.cnpj_basico = est.cnpj_basico
   left join estab_cobertos ec on ec.estabelecimento_id = e.estabelecimento_id
  where e.estabelecimento_id is not null
  order by e.estabelecimento_id, e.created_at desc;

comment on view v_cobertura_empresas is
  'Cobertura da trilha B. `email` é o do CADASTRO (estabelecimentos), igual ao que '
  'v_cobertura_contabilidades faz — é o contato para ligar ou reenviar. `email_envio` é para onde o '
  'link saiu; quando diferem, a tela mostra os dois. Subetapa 9.2.';

grant select on v_cobertura_empresas to authenticated;
revoke insert, update, delete on v_cobertura_empresas from authenticated, anon;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS. Efeito observável, não ausência de erro (§7.2).
--
-- (1) Nenhum dos 18 endereços errados sobrou no cadastro:
--   select count(*) from estabelecimentos
--    where email ~* '(@gmai\.com|@gmal\.com|@gmail\.con|@gmail\.comag|@hotmail\.con|@bol\.combr|@bolcom\.br|@yahoo\.co\.br|@uol\.cpm\.br)$';
--   -- esperado: 0
--
-- (2) As 18 ficaram marcadas, com o original guardado:
--   select count(*) from estabelecimentos where email_corrigido_em is not null;
--   -- esperado: 18, todas com email_rfb_original preenchido
--
-- (3) O GATILHO funciona — e este é o teste que importa, porque é o que decide
--     se a correção sobrevive ao mês que vem. Em transação, sem gravar:
--   begin;
--     update estabelecimentos set email = email_rfb_original
--      where email_corrigido_em is not null;      -- simula o delta da RFB
--     select count(*) from estabelecimentos
--      where email_corrigido_em is not null and email = email_rfb_original;
--     -- esperado: 0 — o gatilho recusou a reversão
--     update estabelecimentos set email = 'outro.endereco@exemplo.com'
--      where email_corrigido_em is not null;      -- simula troca REAL
--     select count(*) from estabelecimentos where email = 'outro.endereco@exemplo.com';
--     -- esperado: 18 — mudança legítima passa
--   rollback;
-- ----------------------------------------------------------------------------
