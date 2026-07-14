-- Refinamento de permissões (Tarefa 03.3): Convenções Coletivas passam a ser
-- domínio JURÍDICO (+ Admin). A Secretária perde escrita e fica só com consulta;
-- o Jurídico ganha CRUD completo. Presidente segue só leitura.
--
-- Matriz nova (SELECT inalterado: admin,presidente,secretaria,juridico):
--   Perfil       INSERT  UPDATE  DELETE
--   admin          ✓       ✓       ✓
--   juridico       ✓       ✓       ✓   (antes: negado)
--   secretaria     ✗       ✗       ✗   (antes: INSERT/UPDATE)
--   presidente     ✗       ✗       ✗
--
-- Aplica-se às 3 tabelas do domínio: convencoes_coletivas, pisos_convencao,
-- taxas_convencao. Aditivo/idempotente por drop+create das políticas de escrita.

-- convencoes_coletivas
drop policy if exists pol_convencoes_insert on convencoes_coletivas;
create policy pol_convencoes_insert on convencoes_coletivas for insert
  to authenticated with check (fn_eh('admin','juridico'));
drop policy if exists pol_convencoes_update on convencoes_coletivas;
create policy pol_convencoes_update on convencoes_coletivas for update
  to authenticated using (fn_eh('admin','juridico')) with check (fn_eh('admin','juridico'));
drop policy if exists pol_convencoes_delete on convencoes_coletivas;
create policy pol_convencoes_delete on convencoes_coletivas for delete
  to authenticated using (fn_eh('admin','juridico'));

-- pisos_convencao
drop policy if exists pol_pisos_insert on pisos_convencao;
create policy pol_pisos_insert on pisos_convencao for insert
  to authenticated with check (fn_eh('admin','juridico'));
drop policy if exists pol_pisos_update on pisos_convencao;
create policy pol_pisos_update on pisos_convencao for update
  to authenticated using (fn_eh('admin','juridico')) with check (fn_eh('admin','juridico'));
drop policy if exists pol_pisos_delete on pisos_convencao;
create policy pol_pisos_delete on pisos_convencao for delete
  to authenticated using (fn_eh('admin','juridico'));

-- taxas_convencao
drop policy if exists pol_taxas_insert on taxas_convencao;
create policy pol_taxas_insert on taxas_convencao for insert
  to authenticated with check (fn_eh('admin','juridico'));
drop policy if exists pol_taxas_update on taxas_convencao;
create policy pol_taxas_update on taxas_convencao for update
  to authenticated using (fn_eh('admin','juridico')) with check (fn_eh('admin','juridico'));
drop policy if exists pol_taxas_delete on taxas_convencao;
create policy pol_taxas_delete on taxas_convencao for delete
  to authenticated using (fn_eh('admin','juridico'));
