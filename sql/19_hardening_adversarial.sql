-- ============================================================================
-- CRM SINDCOM — 19_hardening_adversarial.sql
-- Correções dos achados do portão de segurança adversarial (ETAPA 07).
--
-- Cada bloco fecha um achado MEDIDO AO VIVO — nenhum é hipotético. A prova de
-- cada um está em tests/adversarial/ (ataque que passava antes desta migration
-- e passa a ser barrado depois).
--
--   A-01 (CRÍTICO) — view empresas_estabelecimentos vazava a base para anon
--   A-02 (MÉDIO)   — fn_gera_numero_guia() chamável por RPC queima a sequência
--   A-03 (ALTO)    — recepcionistas.pin_hash legível por todos os papéis
--   A-05 (ALTO)    — força bruta do PIN no endpoint público, sem freio nenhum
--   A-07 (BAIXO)   — TRUNCATE/REFERENCES/TRIGGER concedidos a anon/authenticated
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================================

-- ============================================================================
-- A-01 — VIEW SEM security_invoker VAZAVA A BASE EMPRESARIAL PARA ANÔNIMO
--
-- Medido: GET /rest/v1/empresas_estabelecimentos com a anon key (que é pública,
-- vai no bundle do PWA) devolvia 200 com CNPJ, razão social, capital social e
-- e-mail corporativo. A view roda com os privilégios do dono e ignora a RLS das
-- tabelas base — que estavam corretas (anon recebia [] em empresas).
--
-- Esta view não existe em nenhum arquivo do repositório: foi criada direto no
-- banco durante a carga da RFB (ETAPA 06). Por não estar versionada, nunca
-- passou por revisão. Fica aqui para que passe a existir no código.
--
-- Já aplicada em produção em 2026-08-21, fora desta migration, por ser
-- vazamento ativo. Este bloco a torna reproduzível e idempotente.
-- ============================================================================
do $$
begin
  if to_regclass('public.empresas_estabelecimentos') is not null then
    execute 'alter view public.empresas_estabelecimentos set (security_invoker = on)';
  end if;
end $$;

-- ============================================================================
-- A-02 — fn_gera_numero_guia() CHAMÁVEL POR RPC QUEIMA A NUMERAÇÃO
--
-- Medido: a Secretaria (e qualquer papel autenticado, inclusive o PARCEIRO, que
-- é externo ao sindicato) executa `POST /rest/v1/rpc/fn_gera_numero_guia` e
-- recebe um número novo. A função faz nextval('seq_numero_guia'), então cada
-- chamada CONSOME a numeração: em loop, a próxima guia real sai como
-- 2026-847392. Não corrompe dado, mas destrói a sequência de um documento de
-- cobrança — que é o que lhe dá rastreabilidade — e revela quantas guias já
-- foram emitidas.
--
-- Por que não bastava revogar EXECUTE: a função é o DEFAULT da coluna
-- solicitacoes_servico.numero_guia, e o DEFAULT roda com os privilégios de quem
-- insere. Revogar sozinho impediria a Secretaria de criar guia.
--
-- Correção: a numeração sai do DEFAULT e vira trigger BEFORE INSERT. Função de
-- trigger devolve `trigger`, tipo que o PostgREST não sabe representar — deixa
-- de existir como RPC —, e não exige EXECUTE do usuário que insere.
-- ============================================================================
alter table solicitacoes_servico alter column numero_guia drop default;

-- SECURITY DEFINER não é enfeite aqui, e custou uma regressão para ficar claro:
-- a primeira versão deste trigger era SECURITY INVOKER, então ele rodava com os
-- privilégios de quem inseria — e como o EXECUTE de fn_gera_numero_guia acabara
-- de ser revogado de `authenticated`, a Secretaria deixou de conseguir criar
-- guia ("permission denied for function fn_gera_numero_guia" em 12 testes da
-- suíte de RLS). Como DEFINER, o trigger chama a geradora como `postgres`, e o
-- usuário segue sem alcançá-la pela API.
create or replace function fn_numera_guia()
returns trigger language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.numero_guia is null then
    new.numero_guia := fn_gera_numero_guia();
  end if;
  return new;
end $$;

alter function fn_numera_guia() owner to postgres;

drop trigger if exists trg_numera_guia on solicitacoes_servico;
create trigger trg_numera_guia
  before insert on solicitacoes_servico
  for each row execute function fn_numera_guia();

-- Agora sim: ninguém do app chama a geradora direto. O trigger acima roda no
-- contexto da tabela e não passa por esta permissão.
revoke execute on function fn_gera_numero_guia() from public, anon, authenticated;
revoke execute on function fn_numera_guia() from public, anon, authenticated;

-- ============================================================================
-- A-03 — recepcionistas.pin_hash LEGÍVEL POR TODOS OS PAPÉIS
--
-- Medido: os cinco papéis leem a coluna. O PIN tem de 4 a 6 dígitos
-- (fn_definir_pin_recepcionista valida `^\d{4,6}$`) — de 10^4 a 10^6
-- candidatos. Quem tem o hash quebra offline sem tocar no servidor, e o PIN é
-- o que autoriza o check-in — que por sua vez é o que faz o convênio cobrar do
-- sindicato. O parceiro, que é externo, lê o hash das próprias recepcionistas.
--
-- Correção: narrowing de coluna. REVOKE SELECT da tabela e reconceder SELECT só
-- nas colunas que não são credencial, com a lista derivada do CATÁLOGO — assim
-- coluna nova entra sozinha, sem reabrir esta migration.
--
-- ORDEM IMPORTA: nenhum GRANT amplo sobre esta tabela pode vir DEPOIS deste
-- bloco; ele reconcederia a coluna de segredo por cima, em silêncio.
--
-- CONSEQUÊNCIA ACEITA E MEDIDA: `select('*')` em recepcionistas passa a devolver
-- 42501 para authenticated. O frontend foi ajustado na mesma etapa
-- (src/features/parceiros/api.ts) para listar colunas explicitamente. O erro se
-- disfarça de falha de RLS — está registrado em orientacoes.md.
-- ============================================================================
do $$
declare
  v_cols text;
begin
  execute 'revoke select on recepcionistas from authenticated, anon';

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'recepcionistas'
     and column_name <> 'pin_hash';

  execute format('grant select (%s) on recepcionistas to authenticated', v_cols);
end $$;

-- service_role (Edge Functions, n8n, jobs) continua enxergando tudo — é quem
-- legitimamente opera a credencial.
grant select on recepcionistas to service_role;

-- ============================================================================
-- A-05 — FORÇA BRUTA DO PIN NO ENDPOINT PÚBLICO, SEM FREIO NENHUM
--
-- Medido ao vivo: 15 tentativas de PIN em 731ms (49ms cada), todas atendidas,
-- ZERO bloqueios. Um PIN de 4 dígitos são 10.000 candidatos: ~8 minutos em
-- série, e nada impede paralelizar. O endpoint é anônimo — não exige login — e
-- o prêmio é marcar guias como `executada`, que é o que dispara o repasse ao
-- parceiro.
--
-- Correção: freio por TOKEN, não por parceiro. Bloquear o parceiro inteiro
-- deixaria um atacante derrubar o balcão de um convênio legítimo só errando o
-- PIN de propósito — trocaria uma fraude por uma negação de serviço. O token é
-- o recurso efetivamente atacado, e é ele que fica protegido.
--
-- POR QUE A FUNÇÃO DEIXOU DE LEVANTAR EXCEÇÃO NO CAMINHO DE RECUSA
--
-- A primeira versão desta correção não funcionou, e o teste provou: as 15
-- tentativas continuaram passando. `RAISE EXCEPTION` aborta a transação inteira
-- da chamada — e o `INSERT` que registrava a tentativa ia junto no rollback. O
-- contador nunca saía de zero.
--
-- Não existe transação autônoma em plpgsql. Então a recusa passou a ser um
-- RESULTADO (`{"ok": false, "erro": "..."}`) em vez de uma exceção: a transação
-- confirma, o registro persiste e o freio conta de verdade. `error` do
-- supabase-js segue reservado para falha real de transporte.
-- ============================================================================
create table if not exists tentativas_checkin (
  id           bigserial primary key,
  token_alvo   uuid        not null,
  sucesso      boolean     not null,
  ocorrida_em  timestamptz not null default now()
);

create index if not exists idx_tentativas_checkin_janela
  on tentativas_checkin (token_alvo, ocorrida_em desc);

alter table tentativas_checkin enable row level security;
-- Sem policy: nega por ausência para anon e authenticated. Só a função
-- SECURITY DEFINER abaixo (e a service_role) escreve e lê aqui.
revoke all on tentativas_checkin from anon, authenticated;
revoke all on sequence tentativas_checkin_id_seq from anon, authenticated;

create or replace function fn_registrar_checkin(
  p_token uuid,
  p_pin text,
  p_atendido boolean,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sol    solicitacoes_servico%rowtype;
  v_recep  recepcionistas%rowtype;
  v_falhas integer;
begin
  -- Janela de freio: 5 falhas em 15 minutos travam o token por 15 minutos.
  -- Uma recepcionista que errou o PIN algumas vezes continua trabalhando; um
  -- atacante que precisa de 10.000 tentativas leva ~500 horas por token.
  select count(*) into v_falhas
    from tentativas_checkin
   where token_alvo = p_token
     and not sucesso
     and ocorrida_em > now() - interval '15 minutes';

  if v_falhas >= 5 then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Muitas tentativas seguidas para esta guia. Aguarde 15 minutos e tente de novo.'
    );
  end if;

  select * into v_sol from solicitacoes_servico where token_publico = p_token;
  if not found then
    -- Tentativa com token inexistente também conta: sem isso, varrer tokens
    -- sairia de graça.
    insert into tentativas_checkin (token_alvo, sucesso) values (p_token, false);
    return jsonb_build_object('ok', false, 'erro', 'Guia não encontrada');
  end if;

  if v_sol.status not in ('solicitada', 'pendente_confirmacao') then
    -- Não conta como tentativa: é estado, não palpite de senha. Contar aqui
    -- deixaria alguém travar a guia de um parceiro só recarregando a página.
    return jsonb_build_object(
      'ok', false,
      'erro', format('Guia já processada (status atual: %s)', v_sol.status)
    );
  end if;

  select r.* into v_recep
    from recepcionistas r
   where r.parceiro_id = v_sol.parceiro_id
     and r.ativo
     and r.pin_hash = crypt(p_pin, r.pin_hash)
   limit 1;

  if not found then
    insert into tentativas_checkin (token_alvo, sucesso) values (p_token, false);
    return jsonb_build_object('ok', false, 'erro', 'Senha de recepcionamento inválida');
  end if;

  update solicitacoes_servico set
    status = case when p_atendido then 'executada' else 'rejeitada' end::status_solicitacao,
    motivo_rejeicao = case when not p_atendido then p_justificativa else motivo_rejeicao end,
    checkin_por = v_recep.id,
    checkin_em = now(),
    checkin_justificativa = p_justificativa
  where id = v_sol.id;

  insert into tentativas_checkin (token_alvo, sucesso) values (p_token, true);

  -- Higiene: a tabela é registro de segurança de curta duração, não histórico.
  delete from tentativas_checkin where ocorrida_em < now() - interval '7 days';

  return jsonb_build_object(
    'ok', true,
    'numero_guia', v_sol.numero_guia,
    'resultado', case when p_atendido then 'executada' else 'rejeitada' end,
    'recepcionista', v_recep.nome
  );
end $$;

-- Mantém o contrato público da RPC do QR (03_rls.sql §18): a página do
-- check-in não tem login.
revoke execute on function fn_registrar_checkin(uuid, text, boolean, text) from public;
grant  execute on function fn_registrar_checkin(uuid, text, boolean, text) to anon, authenticated;

-- ============================================================================
-- A-07 — TRUNCATE / REFERENCES / TRIGGER CONCEDIDOS A anon E authenticated
--
-- Medido: os dois papéis têm os três privilégios em TODAS as 43 relações de
-- `public`. Não é migration nossa — é privilégio de fábrica do projeto Supabase
-- (o mesmo achado que o CRM Vitrine registrou).
--
-- Medido também que NÃO é explorável hoje: `anon` e `authenticated` têm
-- rolcanlogin=false (ninguém se conecta como elas direto), o PostgREST não tem
-- verbo TRUNCATE, e nenhuma das duas tem CREATE em `public` nem no banco — logo
-- não podem criar a função que faria o TRUNCATE por dentro.
--
-- Revoga-se assim mesmo: é privilégio que nenhum caminho legítimo usa, e
-- TRUNCATE não passa por RLS. O dia em que uma função SECURITY INVOKER nova
-- apagar linhas, a diferença entre ter e não ter este GRANT é a base inteira.
-- ============================================================================
do $$
declare
  r record;
begin
  -- pg_class, não pg_tables: as VIEWS também carregam os três privilégios de
  -- fábrica, e usar pg_tables deixava 78 grants de pé (medido).
  for r in
    select format('%I.%I', n.nspname, c.relname) as alvo
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p')   -- tabela, view, matview, particionada
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', r.alvo);
  end loop;
end $$;

-- Tabela nova nasce sem esses três — o default estreito não se propaga sozinho.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============================================================================
-- FIM · 19_hardening_adversarial.sql
--
-- ACHADOS ACEITOS SEM CORREÇÃO (medidos, com o motivo registrado):
--
--  · solicitacoes_servico.token_publico legível por authenticated — o token é
--    credencial de operação, não segredo de sistema: a Secretaria PRECISA lê-lo
--    para imprimir e enviar a guia (src/features/servicos/GuiaPrint.tsx), e o
--    narrowing de coluna é tudo-ou-nada para o papel `authenticated`, sem como
--    distinguir papel do app. A RLS de LINHA já garante o que importa: cada
--    parceiro só alcança o token das próprias guias — provado em
--    tests/adversarial/02_superficie.spec.ts. Reavaliar se a impressão da guia
--    migrar para função SECURITY DEFINER.
--
--  · O token da guia pública não expira. Quem recebeu o link uma vez continua
--    vendo nome, serviço, parceiro e valores para sempre. Não é falha de
--    implementação — é uma decisão que nunca foi tomada. Registrada no relatório
--    da ETAPA 07 como pendência de produto.
-- ============================================================================
