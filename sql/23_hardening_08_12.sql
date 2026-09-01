-- ============================================================================
-- CRM SINDCOM — sql/23_hardening_08_12.sql
-- ETAPA 08 · Subetapa 08.12 — correções do portão de segurança adversarial
--
-- STATUS: APLICADO NO BENCH (`ikculjjvvyajhfxifuga`) e, em 2026-08-27, TAMBÉM
-- EM PRODUÇÃO (`vcswvscjqifelslsdjth`) — **por ordem explícita do Maxwell**, de
-- posse do relatório, nunca por iniciativa do CODE. Verificação pós-aplicação
-- em docs/RELATORIO_08_ADVERSARIAL.md §11. O merge para `main` continua NÃO
-- executado: é atribuição exclusiva do Maxwell.
--
-- Achados que este arquivo fecha (`docs/RELATORIO_08_ADVERSARIAL.md`):
--   A-08.01  anônimo consome a numeração da guia de pagamento pela API REST
--   A-08.02  o privilégio de fábrica volta em TODA relação nova — o hardening
--            da ETAPA 07 não é hereditário, e a 08.11 já nasceu com ele
--
-- IDEMPOTENTE: reaplicar tem delta zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A-08.01 — `fn_gera_guia_pagamento()` chamável por `anon` via RPC
--
-- MEDIDO no bench, sem login nenhum, só com a anon key (que é pública, vai no
-- bundle de crm.sindcompassos.org):
--
--   POST /rest/v1/rpc/fn_gera_guia_pagamento   → 200  "GP-2026-000017"
--                                              → 200  "GP-2026-000018"  ... (5x)
--
-- A função faz `nextval('seq_guia_pagamento')`: cada chamada CONSOME a
-- numeração do documento de cobrança que vai para a empresa. Em laço, a próxima
-- guia real nasce como `GP-2026-847392` — não corrompe dado, mas destrói a
-- sequência que dá rastreabilidade ao documento e revela quantas guias já foram
-- emitidas.
--
-- É o GÊMEO do achado A-02 da ETAPA 07. Lá, `fn_gera_numero_guia` (numeração da
-- guia de SERVIÇO) saiu do alcance da API. A da guia de PAGAMENTO ficou — e o
-- advisor de segurança não a acusa, porque ela é SECURITY INVOKER e o lint só
-- olha funções DEFINER. Só a varredura de catálogo a encontrou.
--
-- POR QUE REVOGAR NÃO QUEBRA O MOTOR DE COBRANÇA: diferente do caso da ETAPA 07,
-- esta função NÃO é `DEFAULT` de coluna nenhuma (conferido em
-- information_schema.columns). A única chamadora legítima é `fn_gerar_guias`
-- (sql/10_cobrancas.sql), que é SECURITY DEFINER com dono `postgres` — o
-- privilégio conferido lá dentro é o do dono, não o de quem chamou.
-- Medido depois de revogar, no bench: `fn_gerar_guias` continua gerando guia.
-- ----------------------------------------------------------------------------
revoke execute on function public.fn_gera_guia_pagamento() from public, anon, authenticated;

-- Defesa em profundidade, custo zero: nenhum caminho legítimo chega à sequência
-- por fora da função, e `nextval` mora em `pg_catalog`, que o PostgREST não
-- expõe. Fica revogado pelo mesmo motivo da §2.16 — no dia em que uma função
-- INVOKER nova tocar a sequência, a diferença entre ter e não ter este GRANT é
-- a numeração inteira. `seq_numero_guia` entra junto: a ETAPA 07 tirou a função
-- do alcance da API, mas deixou o privilégio da sequência de pé.
revoke usage, select, update on sequence public.seq_guia_pagamento from anon, authenticated;
revoke usage, select, update on sequence public.seq_numero_guia   from anon, authenticated;

-- ----------------------------------------------------------------------------
-- A-08.02 — o privilégio de fábrica NÃO é hereditário, e volta em todo objeto novo
--
-- A ETAPA 07 varreu `public` e revogou TRUNCATE/REFERENCES/TRIGGER de `anon` e
-- `authenticated` (sql/19). Medido agora, em produção: a única relação criada
-- DEPOIS daquela varredura — `v_cobertura_contabilidades`, da 08.11 — está com
-- os três de volta, para os dois papéis. Ninguém escreveu esse GRANT; ele nasceu
-- com o objeto.
--
-- A CAUSA, medida em `pg_default_acl` e não suposta:
--
--   dono=postgres · schema=public · tipo=relação
--   {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- `arwdDxtm` = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
-- MAINTAIN. Ou seja: **toda tabela ou view nova criada por `postgres` em
-- `public` concede tudo — inclusive SELECT — a `anon`**, sem que migration
-- nenhuma peça. É a mesma raiz do achado A-01 da ETAPA 07 (a view
-- `empresas_estabelecimentos` legível por qualquer anônimo): a view não recebeu
-- o GRANT de ninguém, ela nasceu com ele.
--
-- Explorável hoje? Não: `v_cobertura_contabilidades` é view, e não se trunca
-- view; e o SELECT dela já foi revogado de `anon` no sql/22. O que este bloco
-- fecha não é uma porta aberta, é a FÁBRICA que reabre a porta a cada objeto
-- novo — e a ETAPA 07 mediu quanto custa quando um objeto novo escapa.
-- ----------------------------------------------------------------------------

-- (a) A varredura, de novo — por `pg_class`, não por `pg_tables`: as VIEWS
--     também carregam esses privilégios, e foi por usar `pg_tables` que a
--     primeira tentativa da ETAPA 07 deixou 78 grants de pé.
do $do$
declare r record;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as alvo
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','v','m','p')
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', r.alvo);
  end loop;
end $do$;

-- (b) A raiz: relação nova para de nascer aberta para o anônimo.
--
--     SÓ `anon`. `authenticated` fica de fora de propósito: tirá-lo do default
--     faria toda tabela nova responder 42501 ao app até alguém lembrar do GRANT
--     explícito — e 42501 se disfarça de RLS quebrada, que é a investigação mais
--     cara deste projeto (§2.6b, §2.6c). O ganho estaria no anônimo, e é o
--     anônimo que este bloco fecha.
--
--     Nenhuma tela perde nada: o CRM inteiro consulta autenticado, e as três
--     superfícies públicas (as 2 RPCs do QR e as 2 Edge Functions) não leem
--     tabela como `anon` — as RPCs são SECURITY DEFINER e as funções usam
--     `service_role`. Conferido por medição, não por leitura.
alter default privileges for role postgres in schema public revoke all on tables from anon;

--     De `authenticated` saem só os TRÊS privilégios que nenhum caminho legítimo
--     usa. O DML continua nascendo concedido, então nenhuma tela nova quebra —
--     mas a varredura de TRUNCATE/REFERENCES/TRIGGER passa a se manter zerada
--     sozinha, em vez de depender de alguém lembrar de reexecutar o laço (a).
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

--     PROVA de que a raiz fechou, medida no bench criando uma tabela DEPOIS da
--     correção (e apagada em seguida) — o controle negativo vem na mesma linha:
--       anon SELECT   = false   ·   anon TRUNCATE          = false
--       auth SELECT   = true    ·   auth INSERT            = true
--       auth TRUNCATE = false

-- (c) O passivo que sobra, e que este arquivo NÃO fecha por decisão registrada:
--     43 das 51 relações de `public` ainda concedem SELECT/INSERT/UPDATE/DELETE
--     a `anon` — herança da mesma fábrica, de antes desta correção. Hoje quem
--     nega é só a RLS: `anon` em `trabalhadores` recebe `[]` (HTTP 200), não
--     `42501`. As seis tabelas da ETAPA 08 são a exceção — elas revogam `anon`
--     explicitamente (sql/20 §11) e respondem `42501`, com as DUAS camadas.
--
--     Revogar as 43 é um `revoke all ... from anon` por relação e fecharia a
--     lacuna — mas muda o que o PWA recebe numa consulta disparada antes de a
--     sessão ser restaurada: de lista vazia para erro. Isso é decisão de
--     produto, com risco de regressão visível na tela, e por isso fica como
--     RECOMENDAÇÃO no relatório, não como linha executada aqui.

-- ----------------------------------------------------------------------------
-- A-08.04 — `empresas_estabelecimentos` continua sem definição no repositório
--
-- Ela é a view do achado A-01 da ETAPA 07 — a que vazou 16.687 empresas e
-- 17.319 estabelecimentos para qualquer anônimo. O vazamento foi fechado lá
-- (`alter view ... set (security_invoker = on)`, sql/19), mas o CORPO da view
-- nunca entrou no repositório: ela foi criada direto no banco durante a carga
-- da RFB. A comparação de `pg_class` com os arquivos `sql/` nesta subetapa
-- mostra que ela segue sendo o ÚNICO objeto de `public` sem definição
-- versionada.
--
-- Por que isso ainda importa depois de corrigida: um `create or replace view`
-- futuro, escrito por quem só conhece o banco e não a história, reabre o
-- vazamento inteiro — `create or replace` NÃO preserva `reloptions`, e a view
-- voltaria a rodar com o privilégio do dono. Versionar aqui, com o corpo
-- exatamente como está em produção (extraído por `pg_get_viewdef`) e com a
-- opção presente, faz a próxima alteração passar por revisão.
-- ----------------------------------------------------------------------------
create or replace view empresas_estabelecimentos
with (security_invoker = on) as
select
  e.cnpj_basico,
  e.razao_social,
  e.porte,
  e.capital_social,
  est.id,
  est.cnpj_completo,
  est.nome_fantasia,
  est.cnae_principal,
  est.convencao_id,
  est.municipio_id,
  est.email
from empresas e
join estabelecimentos est on est.cnpj_basico = e.cnpj_basico;

comment on view empresas_estabelecimentos is
  'Join empresas × estabelecimentos, criada ad hoc na carga da RFB (ETAPA 06) e versionada só na '
  '08.12. Foi o achado A-01 da ETAPA 07: sem security_invoker, entregava a base inteira a anônimo.';

-- A segunda camada, que na ETAPA 07 não chegou a ser posta nesta view: com o
-- SELECT revogado, `anon` recebe `42501` em vez de `[]`, e a proteção deixa de
-- depender exclusivamente de a opção acima continuar de pé. Nenhuma consulta do
-- app usa esta view (conferido por busca em `src/`, `tests/`, `scripts/` e
-- `n8n/`: só aparece nos tipos gerados), então revogar não custa nada.
revoke all on empresas_estabelecimentos from anon;
grant select on empresas_estabelecimentos to authenticated;

-- ----------------------------------------------------------------------------
-- A-08.03 — a máscara de `envios_campanha.token`: NÃO aplicar a Parte 2 do sql/22
--
-- Registrado aqui porque a decisão foi pedida a esta subetapa e a resposta é
-- "não", com motivo medido — não com preferência.
--
-- A view `v_envios_campanha_mascarada` (sql/22, Parte 2) apaga o token para
-- quem não é Admin. Ela não fecha nada: `pol_envios_select` autoriza Presidente
-- e Secretaria a ler `envios_campanha`, e o GRANT de SELECT na tabela continua
-- de pé — quem quisesse o token consultaria a TABELA, não a view. Uma view só
-- restringe quem não tem caminho até a base, e aqui os dois papéis têm.
--
-- O mecanismo que fecharia de fato é o narrowing de COLUNA da ETAPA 08 (A-03,
-- `recepcionistas.pin_hash`): `revoke select (token)` da tabela. Mas ele é
-- tudo-ou-nada para o papel `authenticated` do Postgres, e Admin e Secretaria
-- são o MESMO papel do Postgres — fechar para ela fecha para ele, e o Admin
-- precisa do token (é dele que saem os CSVs das 4 listas da 08.13). É o mesmo
-- beco de `solicitacoes_servico.token_publico`, que a ETAPA 07 aceitou pelo
-- mesmo motivo.
--
-- Severidade real do que fica exposto, medida em vez de suposta: o token só
-- permite ENVIAR uma remessa, e remessa não vira cadastro sem o clique da
-- Denise (provado por teste na 08.12). A Secretaria É a Denise e já tem escrita
-- direta em `trabalhadores` — para ela o token não concede nada de novo.
--
-- O caminho que fecharia, se um dia valer o custo: `revoke select (token)` da
-- tabela + uma função SECURITY DEFINER guardada por `fn_eh('admin')` para
-- devolver o token ao Admin. Custa reescrever `scripts/gerar_campanha_08_13.mjs`
-- e qualquer gerador futuro de lista. GATILHO DE REAVALIAÇÃO: no dia em que o
-- token deixar de ser credencial de baixo poder — se um envio passar a virar
-- cadastro sem revisão humana, ou se o papel Secretaria for dado a alguém de
-- fora da secretaria.

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA (rodar depois de aplicar)
--
--   -- A-08.01: a função sai do alcance da API REST
--   select has_function_privilege('anon','public.fn_gera_guia_pagamento()','EXECUTE'),
--          has_function_privilege('authenticated','public.fn_gera_guia_pagamento()','EXECUTE');
--   -- esperado: false, false   · e GET /rest/v1/rpc/fn_gera_guia_pagamento → 404 (era 405)
--
--   -- A-08.01 controle negativo: o motor de cobrança continua gerando guia
--   -- (tests/adversarial/05_comunicacao.spec.ts, "o motor de cobrança continua gerando guia")
--
--   -- A-08.02: nenhum privilégio de fábrica sobrando
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='public' and grantee in ('anon','authenticated')
--      and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');   -- esperado: vazio
--
--   -- A-08.02 raiz: o default deixou de conceder ao anônimo
--   select defaclacl::text from pg_default_acl d
--     join pg_namespace n on n.oid = d.defaclnamespace
--    where n.nspname='public' and d.defaclobjtype='r'
--      and pg_get_userbyid(d.defaclrole)='postgres';
--   -- esperado: sem `anon=` na lista
-- ----------------------------------------------------------------------------
