-- ============================================================================
-- CRM SINDCOM — 06_trigger_beneficiado_titular.sql
-- Subetapa 01.2: um beneficiado não pode ser a mesma pessoa que o titular.
-- Aplicado sobre o schema já em produção (01→05 aplicados). Idempotente
-- (create or replace function; drop trigger if exists antes de recriar).
-- ============================================================================

create or replace function fn_valida_beneficiado()
returns trigger language plpgsql as $$
declare
  v_cpf_titular text;
begin
  select cpf into v_cpf_titular from trabalhadores where id = new.titular_id;
  if v_cpf_titular is not null and v_cpf_titular = new.cpf then
    raise exception 'O beneficiado não pode ser a mesma pessoa que o titular (mesmo CPF)';
  end if;
  return new;
end $$;

drop trigger if exists trg_valida_beneficiado on beneficiados;
create trigger trg_valida_beneficiado
  before insert or update of cpf, titular_id on beneficiados
  for each row execute function fn_valida_beneficiado();
