-- ============================================================================
-- CRM SINDCOM — 15_notificacao_formulario_site.sql · Subetapa 03.2
-- Notifica a Secretaria quando um cadastro chega pelo formulário do site.
-- ============================================================================
--
-- Por que precisa de trigger novo: `sql/01_schema.sql` já documentava a
-- decisão de que cadastros do formulário do site entram DIRETO em
-- `trabalhadores` (status_cadastro = 'pendente'), sem passar por
-- `solicitacoes_admin` — logo não herdam a notificação de
-- `fn_notifica_solicitacao_admin`. Sem isso, a Secretaria só saberia de um
-- cadastro novo abrindo `/aprovações` por conta própria.
--
-- Notifica só `secretaria` (não `admin`): é ela quem processa `/aprovações`
-- no dia a dia (frontend.md — "Fluxo diário da Denise"); o Admin tem visão
-- própria pelo dashboard (K5/dica).
-- ----------------------------------------------------------------------------

create or replace function fn_notifica_cadastro_site()
returns trigger language plpgsql security definer as $$
begin
  if new.origem_cadastro = 'formulario_site' and new.status_cadastro = 'pendente' then
    insert into notificacoes (destinatario_role, tipo, titulo, mensagem, referencia_tabela, referencia_id)
    values (
      'secretaria', 'cadastro_site_pendente',
      'Nova filiação pelo site: ' || new.nome,
      'CPF ' || substring(new.cpf, 1, 3) || '.***.***-** — aguardando aprovação em /aprovações.',
      'trabalhadores', new.id::text
    );
  end if;
  return new;
end $$;

create trigger trg_notifica_cadastro_site
  after insert on trabalhadores
  for each row execute function fn_notifica_cadastro_site();

alter function public.fn_notifica_cadastro_site() set search_path = public, extensions, pg_temp;

-- Só o trigger chama isto (roda como owner) — nenhum papel do app precisa
-- executar diretamente.
revoke execute on function public.fn_notifica_cadastro_site() from public, anon, authenticated;
