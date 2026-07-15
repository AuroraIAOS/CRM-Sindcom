-- Subetapa 02.1: RPC para definir o PIN do recepcionista com hash.
-- O frontend usa apenas a anon key e não pode chamar crypt()/gen_salt()
-- diretamente sobre a tabela recepcionistas — só esta função, security definer,
-- faz a gravação. Guardada por fn_eh('admin','secretaria'), mesma autonomia de
-- UPDATE que a RLS já concede em recepcionistas (sql/03_rls.sql §5).
create or replace function fn_definir_pin_recepcionista(p_recepcionista_id uuid, p_pin text)
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  -- `is not true` (não `not fn_eh(...)`): fn_eh() retorna NULL sem sessão/perfil
  -- ativo, e `not null` é null — o `if` trataria isso como falso e deixaria
  -- passar. `is not true` classifica null corretamente como negado.
  if fn_eh('admin', 'secretaria') is not true then
    raise exception 'Sem permissão para definir PIN de recepcionista';
  end if;

  if p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN deve ter de 4 a 6 dígitos';
  end if;

  update recepcionistas
     set pin_hash = crypt(p_pin, gen_salt('bf')),
         updated_at = now()
   where id = p_recepcionista_id;

  if not found then
    raise exception 'Recepcionista não encontrado';
  end if;
end $$;

revoke execute on function fn_definir_pin_recepcionista(uuid, text) from public, anon;
grant execute on function fn_definir_pin_recepcionista(uuid, text) to authenticated;
