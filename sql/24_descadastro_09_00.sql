-- ============================================================================
-- CRM SINDCOM — sql/24_descadastro_09_00.sql
-- ETAPA 09 · Subetapa 9.00 — Descadastro com coleta de motivo
--
-- O QUE ESTE ARQUIVO EXISTE PARA RESOLVER
-- Hoje quem clica em "descadastre-se" some dentro da Brevo: o Sindcom não fica
-- sabendo nem QUEM saiu, nem POR QUÊ. A decisão de 2026-09-01
-- (`docs/copies_campanha_08_14.md` §10) é transformar essa perda em SINAL —
-- empresa que se descadastrou E não enviou dados é a candidata mais forte à via
-- formal, porque há registro de que foi contatada, de que optou por interromper
-- o canal e de que não cumpriu.
--
-- TRÊS DECISÕES QUE ESTE SCHEMA CARREGA, E QUE NÃO SÃO DE ESTILO
--
-- 1. **`envio_id` é ANULÁVEL, de propósito.** Token revogado, expirado ou
--    simplesmente inexistente NÃO impede o descadastro — quem quer sair, sai
--    (plano, Subetapa 9.00, "Qualidade"). Nesses casos a linha entra sem
--    vínculo resolvido, guardando o token informado em `token_informado` para
--    que alguém possa reconciliar depois. Exigir a FK aqui transformaria uma
--    falha de token num obstáculo à saída, que é exatamente o que a decisão (b)
--    da subetapa proíbe.
--
-- 2. **`motivo` é ANULÁVEL, mesmo sendo obrigatório na tela.** A obrigação vive
--    no formulário (botão nasce desabilitado); no banco ela seria uma trava que
--    poderia recusar o INSERT e, com ele, o registro do descadastro. Além disso
--    o caminho de UM CLIQUE (RFC 8058, `via = 'um_clique'`) não tem motivo por
--    construção, e essa cobertura parcial é deliberada — ver o bloco abaixo.
--
-- 3. **NENHUM papel autenticado escreve aqui.** Como em `remessas_dados`
--    (sql/20 §10.6), a única escrita é a da Edge Function `descadastrar`, com
--    `service_role`. Se um papel autenticado inserisse, existiria um segundo
--    caminho de entrada de dado externo sem passar pelo canal com token e
--    rastro de IP.
--
-- OS DOIS CAMINHOS DE SAÍDA, E POR QUE SÓ UM TEM MOTIVO
-- Google e Microsoft somam 79,9% da lista (medido nos 4 CSVs, §10 das copies) e
-- exigem descadastro em UM CLIQUE pelo cabeçalho `List-Unsubscribe` /
-- `List-Unsubscribe-Post`. Esse botão tem de funcionar sem formulário, sem
-- confirmação e sem página intermediária — formulário obrigatório nesse caminho
-- é descumprimento, e o dano não aparece em teste nenhum: aparece semanas
-- depois, como queda de entrega. Portanto o cabeçalho continua sendo o de um
-- clique da Brevo, e o formulário vive APENAS no link do CORPO do e-mail.
-- `via = 'um_clique'` é a linha sem motivo, e ela é assim de propósito:
-- cobertura parcial é melhor que campanha barrada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DESCADASTROS_CAMPANHA — o motivo, a via e o rastro
-- ----------------------------------------------------------------------------
create table if not exists descadastros_campanha (
  id                 uuid primary key default gen_random_uuid(),

  -- `restrict` pelo mesmo motivo de `envios_campanha` (sql/20 §5): descadastro
  -- é histórico. Apagar o envio não pode apagar o rastro de que a pessoa pediu
  -- para sair. `null` = token não resolvido (ver decisão 1 no cabeçalho).
  envio_id           uuid references envios_campanha (id) on delete restrict,

  -- O que o visitante apresentou, mesmo quando não resolveu para envio nenhum.
  -- Truncado no chamador; é rastro, não credencial reutilizável.
  token_informado    text,

  -- Copiado do envio quando resolve. Redundante de propósito: se o envio for
  -- apagado um dia, ainda se sabe qual caixa pediu para sair.
  email              text,

  via                text not null default 'formulario'
                     check (via in ('formulario', 'um_clique')),

  -- Cada opção existe porque leva a uma AÇÃO diferente (plano, 9.00):
  --   nao_sou_mais_contador → higiene de base (corrige a RFB desatualizada)
  --   ja_enviei             → qualidade de dado (se enviou e a cobertura não
  --                           registra, há defeito no caminho)
  --   mensagens_demais      → ritmo (a cadência da trilha B está errada)
  --   nao_entendi           → copy (o texto falhou, e isso se conserta)
  --   prefiro_telefone      → canal (vira lista de ligação, não de e-mail)
  --   discordo              → jurídico (a única que pede resposta nominal)
  --   outro                 → campo livre
  motivo             text check (motivo in (
                       'nao_sou_mais_contador', 'ja_enviei', 'mensagens_demais',
                       'nao_entendi', 'prefiro_telefone', 'discordo', 'outro'
                     )),
  motivo_livre       text,

  ip_origem          inet,
  user_agent         text,

  -- A remoção no ESP é o SEGUNDO passo, e pode falhar sem derrubar o primeiro
  -- (plano, decisão (c) — "mantém o registro mesmo se a chamada à Brevo falhar,
  -- fica pendente e se repete"). `null` em `brevo_removido_em` com `brevo_erro`
  -- preenchido é exatamente a fila de repetição.
  brevo_removido_em  timestamptz,
  brevo_erro         text,

  created_at         timestamptz not null default now()
);

comment on table descadastros_campanha is
  'Subetapa 9.00: quem pediu para sair da campanha, por qual via e por quê. `motivo` só existe na via '
  '`formulario` (link do corpo do e-mail); a via `um_clique` (RFC 8058, botão do Gmail/Outlook) não '
  'pode ter formulário e por isso entra sem motivo — cobertura parcial deliberada.';
comment on column descadastros_campanha.envio_id is
  'Anulável: token revogado/expirado/inexistente NÃO impede o descadastro. Linha sem vínculo resolvido '
  'guarda o token em `token_informado` para reconciliação posterior.';
comment on column descadastros_campanha.via is
  'formulario = link do CORPO do e-mail, com motivo. um_clique = cabeçalho List-Unsubscribe-Post, sem '
  'motivo por exigência de Google/Microsoft (79,9% da lista).';
comment on column descadastros_campanha.brevo_removido_em is
  'Carimbo da remoção no ESP. Nulo com `brevo_erro` preenchido = pendente de repetição; o registro do '
  'motivo persiste de qualquer forma, porque o dado é subproduto e o direito de sair é o ato principal.';

create index if not exists idx_descadastros_envio on descadastros_campanha (envio_id);
create index if not exists idx_descadastros_motivo on descadastros_campanha (motivo);
create index if not exists idx_descadastros_pendente_brevo
  on descadastros_campanha (created_at) where brevo_removido_em is null;

-- ----------------------------------------------------------------------------
-- 2. ENVIOS_CAMPANHA.DESCADASTRADO_EM
--
-- Por que uma coluna nova em vez de deduzir por join com a tabela acima: a tela
-- de cobertura precisa distinguir "não respondeu" de "pediu para não ser mais
-- contatado E não respondeu" — situações diferentes, encaminhamentos
-- diferentes. É leitura de listagem, e um `exists` por linha em 951
-- contabilidades é o tipo de custo que a 08.11 já pagou uma vez ao evitar
-- paginar 7.438 vínculos no navegador (orientacoes.md §2.4).
--
-- A coluna é ESTADO ATUAL; a tabela é o HISTÓRICO com o motivo. Uma não
-- substitui a outra.
-- ----------------------------------------------------------------------------
alter table envios_campanha
  add column if not exists descadastrado_em timestamptz;

comment on column envios_campanha.descadastrado_em is
  'Preenchido pela Edge Function `descadastrar` (Subetapa 9.00). Estado atual do envio; o motivo e a '
  'via ficam em `descadastros_campanha`. Envio descadastrado não recebe as ondas seguintes.';

create index if not exists idx_envios_descadastrado
  on envios_campanha (descadastrado_em) where descadastrado_em is not null;

-- ----------------------------------------------------------------------------
-- 3. RLS + POLICY EXPLÍCITA
--
-- Leitura no mesmo recorte de `envios_campanha` (§10.5): Admin, Presidente e
-- Secretaria — são os três que operam a campanha e fazem o follow-up. O
-- Jurídico fica de fora da leitura direta: o motivo `discordo` chega a ele pela
-- Secretaria, nominalmente, e não por varredura de tabela.
--
-- SEM policy de INSERT, de UPDATE e de DELETE — mesma escolha de
-- `remessas_dados` (sql/20 §10.6). A escrita é exclusivamente da Edge Function
-- com `service_role`, que não passa por RLS. Ausência de policy aqui é código
-- deliberado, não esquecimento.
-- ----------------------------------------------------------------------------
alter table descadastros_campanha enable row level security;

drop policy if exists pol_descadastros_select on descadastros_campanha;
create policy pol_descadastros_select on descadastros_campanha for select
  to authenticated using (fn_eh('admin', 'presidente', 'secretaria'));

-- ----------------------------------------------------------------------------
-- 4. GRANTS — o portão, independente da RLS (orientacoes.md §2.16 e §2.6c)
--
-- `anon` perde TUDO: a página `/descadastrar/:token` NÃO lê o banco, exatamente
-- como `/enviar-dados/:token` (sql/20 §11). Ela conversa só com a Edge Function.
-- Sem grant, `anon` nem chega à avaliação da policy — e o 42501 é a asserção
-- forte do teste adversarial, porque conjunto vazio só prova que a RLS filtrou.
--
-- `authenticated` recebe SELECT e NADA MAIS. Não é `grant all` com policy
-- faltando: é o privilégio exato do único uso que existe (ler o motivo na tela
-- de cobertura). E os três privilégios de fábrica que ninguém pediu saem —
-- TRUNCATE não passa por RLS, é privilégio de tabela (§2.16).
-- ----------------------------------------------------------------------------
revoke all on descadastros_campanha from anon;
grant select on descadastros_campanha to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on descadastros_campanha from authenticated;

-- ----------------------------------------------------------------------------
-- 5. V_COBERTURA_CONTABILIDADES — a marcação da 9.00, item 6
--
-- A coluna nova entra por SUBCONSULTA ESCALAR, nunca por `join`. Um
-- `join envios_campanha` multiplicaria a linha da contabilidade por quantos
-- envios ela tem (hoje 1, mas "revogar token" cria um segundo — 08.11), e as
-- duas contagens da view, que são `count()` sobre outra tabela, sairiam
-- infladas em silêncio. É a armadilha do orientacoes.md §2.2, e ela custaria
-- uma tela de cobertura mentindo para cima justamente onde a decisão é "quem
-- ainda falta".
--
-- `security_invoker = on` é mantido: quem lê a view enfrenta a RLS de
-- `envios_campanha` como se lesse a tabela. O Jurídico, que não tem policy de
-- SELECT lá, vê `descadastrado_em` nulo — não recebe erro e não ganha coluna
-- nova. Isso é o comportamento certo, e o teste o afirma explicitamente em vez
-- de deixá-lo implícito.
-- ----------------------------------------------------------------------------
create or replace view v_cobertura_contabilidades
with (security_invoker = on) as
with estab_cobertos as (
  select distinct estabelecimento_id from vinculos_empregaticios
)
select
  c.id as contabilidade_id,
  c.nome,
  c.email,
  count(ce.estabelecimento_id)::int as total_estabelecimentos,
  count(ec.estabelecimento_id)::int as estabelecimentos_cobertos,
  (
    select max(e.descadastrado_em)
      from envios_campanha e
     where e.contabilidade_id = c.id
  ) as descadastrado_em
from contabilidades c
join contabilidade_estabelecimentos ce on ce.contabilidade_id = c.id
left join estab_cobertos ec on ec.estabelecimento_id = ce.estabelecimento_id
group by c.id, c.nome, c.email;

comment on view v_cobertura_contabilidades is
  'Uma linha por contabilidade (Subetapa 08.11): total de estabelecimentos vinculados × quantos já '
  'têm ao menos um trabalhador. Cobertura é sempre calculada aqui, nunca gravada em coluna — evita o '
  'erro de um booleano que escondesse o número de empresas faltando. Desde a 9.00 traz também '
  '`descadastrado_em`, por subconsulta escalar (join inflaria as contagens), para separar "não '
  'respondeu" de "pediu para sair E não respondeu".';

grant select on v_cobertura_contabilidades to authenticated;
revoke select on v_cobertura_contabilidades from anon;

-- ----------------------------------------------------------------------------
-- 6. CONFERÊNCIA — rodar DEPOIS de aplicar.
--     Medem o que o CATÁLOGO guardou, não o que este arquivo diz. A suíte mede
--     comportamento; estas medem privilégio, que é o que a leitura de código
--     não enxerga (orientacoes.md §2.15, §2.16b).
--
-- (1) RLS ligada e a policy no lugar:
--   select relname, relrowsecurity,
--          (select count(*) from pg_policies p where p.tablename = c.relname) as policies
--     from pg_class c where relname = 'descadastros_campanha';
--   -- esperado: t · 1
--
-- (2) `anon` sem NENHUM privilégio, `authenticated` só com SELECT:
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_name = 'descadastros_campanha' and grantee in ('anon','authenticated')
--    group by grantee;
--   -- esperado: uma linha só — authenticated | SELECT
--
-- (3) A view não perdeu o `security_invoker` no `create or replace`:
--   select c.relname, c.reloptions from pg_class c
--    where c.relname = 'v_cobertura_contabilidades';
--   -- esperado: {security_invoker=on}
--
-- (4) A coluna nova existe e nasceu vazia:
--   select count(*) filter (where descadastrado_em is not null) as descadastrados,
--          count(*) as total
--     from envios_campanha;
--   -- esperado no dia da aplicação: 0 · 9189
-- ----------------------------------------------------------------------------
