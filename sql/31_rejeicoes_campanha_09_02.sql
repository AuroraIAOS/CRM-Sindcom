-- ============================================================================
-- CRM SINDCOM — sql/31_rejeicoes_campanha_09_02.sql
-- ETAPA 09 · Subetapa 9.2 — os e-mails REJEITADOS no disparo, nominalmente
--
-- O PEDIDO (Maxwell, 2026-09-14): um lugar no painel de campanhas para ver
-- quais e-mails foram rejeitados, e assim iniciar a abordagem por outra via —
-- SMS, ligação, carta, visita.
--
-- POR QUE UMA TABELA, E NÃO UMA CONSULTA À BREVO NA HORA
-- A API da Brevo devolve, no relatório de campanha, apenas o TOTAL de
-- `hardBounces` e `softBounces`. Para a lista nominal existe
-- `POST /v3/emailCampaigns/{id}/exportRecipients`, que é **assíncrono**:
-- devolve um `processId`, exige polling e entrega um CSV — e mesmo assim traz
-- só o endereço, sem o motivo. Um painel que dependesse disso abriria lento,
-- às vezes vazio, e não responderia a pergunta que importa.
--
-- A pergunta que importa não é "quantos rejeitaram". É **"para quem eu ligo
-- amanhã de manhã"** — e isso exige cruzar o endereço com razão social, CNPJ,
-- TELEFONE e município, que só existem aqui dentro. Um e-mail solto numa
-- exportação da Brevo não inicia abordagem nenhuma.
--
-- Então o evento é RECEBIDO (webhook) e GRAVADO, como já se faz com o
-- descadastro desde a 9.00. O painel lê do Postgres, junta com o cadastro, e
-- sai uma lista de trabalho com telefone.
--
-- IDEMPOTÊNCIA — a parte que um webhook sempre precisa e quase sempre esquece.
-- A Brevo REPETE a entrega quando não recebe 200 a tempo. Sem chave única, uma
-- repetição vira linha duplicada, e a lista de ligação manda telefonar duas
-- vezes para a mesma pessoa. A chave natural é (email, tipo, ocorrido_em):
-- o mesmo endereço pode rejeitar de novo num disparo posterior — e isso É
-- informação nova —, mas não duas vezes no mesmo instante.
--
-- IDEMPOTENTE (o arquivo): `create table if not exists` + `drop policy if
-- exists`. A 2ª execução tem delta zero.
-- ============================================================================

create table if not exists rejeicoes_campanha (
  id            uuid primary key default gen_random_uuid(),

  -- `restrict` pelo mesmo motivo de `descadastros_campanha` (sql/24): rejeição
  -- é histórico de campanha. Apagar o envio não pode apagar o registro de que
  -- aquela caixa recusou a mensagem.
  envio_id      uuid references envios_campanha (id) on delete restrict,

  -- Copiado do envio quando resolve, e gravado mesmo quando NÃO resolve: um
  -- endereço que rejeitou e não está mais na base ainda é informação — quer
  -- dizer que a lista e a realidade divergiram.
  email         text not null,

  /**
   * O tipo decide a AÇÃO, e é por isso que ele não é um booleano:
   *   hard     → a caixa não existe. Não adianta reenviar NUNCA; vai para
   *              telefone/carta e o e-mail sai da lista.
   *   soft     → caixa cheia ou servidor fora do ar. Pode voltar a funcionar;
   *              vale reenviar depois antes de gastar uma ligação.
   *   bloqueado→ o destinatário (ou o provedor dele) barrou o remetente.
   *              Insistir por e-mail piora a reputação do domínio.
   *   spam     → marcou como spam. É o mais caro de todos: nunca reenviar, e
   *              rever a copy antes da onda seguinte.
   */
  tipo          text not null check (tipo in ('hard', 'soft', 'bloqueado', 'spam')),

  -- O texto que o provedor devolveu ("mailbox not found", "quota exceeded").
  -- Vale guardar cru: é o que distingue "caixa cheia" de "domínio morto" quando
  -- alguém for decidir se tenta de novo.
  motivo        text,

  -- Quando o provedor recusou, segundo a Brevo — NÃO é o `now()` do registro.
  -- A diferença importa num webhook que pode chegar horas depois.
  ocorrido_em   timestamptz not null,

  -- Nome da campanha na Brevo, como ela mandou. Sem FK de propósito: a campanha
  -- vive lá, não aqui, e uma FK quebraria o registro se ela fosse renomeada.
  campanha      text,

  created_at    timestamptz not null default now(),

  constraint uq_rejeicao_evento unique (email, tipo, ocorrido_em)
);

comment on table rejeicoes_campanha is
  'E-mails recusados no disparo, recebidos por webhook da Brevo (Subetapa 9.2). Existe para virar '
  'LISTA DE TRABALHO: cruzada com cadastro e telefone, diz para quem ligar quando o e-mail não chega. '
  'O ESP só expõe o total; a lista nominal, com motivo, só existe aqui.';

create index if not exists idx_rejeicoes_email on rejeicoes_campanha (email);
create index if not exists idx_rejeicoes_ocorrido on rejeicoes_campanha (ocorrido_em desc);

-- ----------------------------------------------------------------------------
-- RLS — o MESMO recorte de `descadastros_campanha`, e pela mesma razão.
--
-- Leitura para quem toca campanha; escrita para NINGUÉM autenticado. Quem
-- escreve é a Edge Function, com `service_role`, que não passa por RLS. Abrir
-- INSERT a papel autenticado criaria um segundo caminho de entrada para um
-- dado que só o ESP tem autoridade para afirmar.
-- ----------------------------------------------------------------------------
alter table rejeicoes_campanha enable row level security;

drop policy if exists pol_rejeicoes_select on rejeicoes_campanha;
create policy pol_rejeicoes_select on rejeicoes_campanha for select
  to authenticated using ((select fn_eh('admin', 'presidente', 'secretaria')));

-- Sem grant, `anon` nem chega à avaliação da policy — o 42501 é a asserção
-- forte, e é ela que sobrevive ao dia em que uma policy for afrouxada por
-- engano (§2.6c).
revoke all on rejeicoes_campanha from anon;
grant select on rejeicoes_campanha to authenticated;
revoke insert, update, delete on rejeicoes_campanha from authenticated;

-- ----------------------------------------------------------------------------
-- A VIEW QUE VIRA LISTA DE LIGAÇÃO — é ela que justifica a tabela.
--
-- Junta a rejeição ao cadastro para responder "quem é, e por onde mais eu falo
-- com essa pessoa". O telefone vem da RFB (`ddd_1` + `telefone_1`), e é o
-- primeiro canal alternativo; o município diz se cabe visita.
--
-- `security_invoker = on`: a RLS de `rejeicoes_campanha` e das tabelas de
-- cadastro continua decidindo quem lê. Sem isso, a view devolveria a base
-- inteira para qualquer papel (§2.15).
-- ----------------------------------------------------------------------------
create or replace view v_rejeicoes_para_contato
with (security_invoker = on) as
select
  r.id,
  r.email,
  r.tipo,
  r.motivo,
  r.ocorrido_em,
  r.campanha,
  case when r.envio_id is null then 'fora da base' else 'na base' end as situacao,
  coalesce(c.nome, emp.razao_social, est.nome_fantasia) as nome,
  est.cnpj_completo,
  -- Telefone montado aqui para a tela não ter de saber que a RFB separa DDD do
  -- número — e `nullif` evita devolver "( ) " quando os dois estão vazios.
  nullif(trim(coalesce(c.telefone, concat_ws(' ', nullif(est.ddd_1, ''), nullif(est.telefone_1, '')))), '') as telefone,
  m.nome as municipio,
  (r.envio_id is not null) as tem_envio
from rejeicoes_campanha r
left join envios_campanha e on e.id = r.envio_id
left join contabilidades c on c.id = e.contabilidade_id
left join estabelecimentos est on est.id = e.estabelecimento_id
left join empresas emp on emp.cnpj_basico = est.cnpj_basico
left join municipios m on m.id = est.municipio_id;

comment on view v_rejeicoes_para_contato is
  'Rejeições com o que a abordagem por outra via exige: nome, CNPJ, TELEFONE e município. Subetapa 9.2.';

grant select on v_rejeicoes_para_contato to authenticated;
revoke insert, update, delete on v_rejeicoes_para_contato from authenticated, anon;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS. Efeito observável, não ausência de erro (§7.2).
--
-- (1) `anon` é barrado no GRANT, não só pela RLS:
--   -- via REST com a chave publicável: esperado 401/42501
--
-- (2) Nenhum papel autenticado escreve:
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_name = 'rejeicoes_campanha' and grantee in ('anon','authenticated')
--    group by grantee;
--   -- esperado: uma linha só — authenticated | SELECT
--
-- (3) A idempotência do webhook, que é o ponto da constraint:
--   -- repetir o mesmo evento não pode criar segunda linha (a Edge Function
--   -- usa upsert on conflict do nothing).
--
-- (4) A view entrega telefone para quem tem:
--   select count(*) filter (where telefone is not null) as com_telefone, count(*)
--     from v_rejeicoes_para_contato;
-- ----------------------------------------------------------------------------
