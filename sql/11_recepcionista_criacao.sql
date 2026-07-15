-- Subetapa 02.1: RPC de criação de recepcionista.
-- recepcionistas.pin_hash é NOT NULL (sql/01_schema.sql), então o INSERT
-- genérico da fila-admin (executarOperacao) não serve aqui — nem o Admin
-- consegue inserir sem hash via anon key. Esta função cria a linha e já
-- grava o hash em um único passo, guardada por admin (mesma autonomia de
-- INSERT que a RLS já concede em recepcionistas — sql/03_rls.sql §5:
-- pol_recep_insert = admin only). Secretária cria via fila-admin: o payload
-- da solicitação carrega { parceiro_id, nome, pin } e, na aprovação, o
-- frontend chama esta RPC com a sessão do Admin em vez de um .insert() direto.
create or replace function fn_criar_recepcionista(p_parceiro_id uuid, p_nome text, p_pin text)
returns uuid language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
begin
  -- `is not true` (não `not fn_eh(...)`): fn_eh() retorna NULL quando não há
  -- sessão/perfil ativo, e `not null` é null — o `if` trataria isso como falso
  -- e deixaria passar. `is not true` classifica null corretamente como negado.
  if fn_eh('admin') is not true then
    raise exception 'Sem permissão para criar recepcionista';
  end if;

  if p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN deve ter de 4 a 6 dígitos';
  end if;

  insert into recepcionistas (parceiro_id, nome, pin_hash)
  values (p_parceiro_id, p_nome, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function fn_criar_recepcionista(uuid, text, text) from public, anon;
grant execute on function fn_criar_recepcionista(uuid, text, text) to authenticated;
