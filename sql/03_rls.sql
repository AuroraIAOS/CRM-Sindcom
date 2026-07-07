-- ============================================================================
-- CRM SINDCOM — 03_rls.sql · Políticas de RLS (Row Level Security)
-- Executar APÓS 01_schema.sql e 02_seed_municipios.sql
--
-- PREMISSAS
--  · Todas as tabelas já têm RLS habilitado no schema. Sem política = negado.
--  · service_role (jobs pg_cron/n8n/Edge Functions) IGNORA RLS por design.
--  · Roles de aplicação (admin, presidente, secretaria, juridico, parceiro)
--    vivem em perfis.role, resolvidas por fn_role() a partir de auth.uid().
--  · Página pública do QR nunca acessa tabelas — somente as funções
--    security definer (grants na seção final).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO
-- ----------------------------------------------------------------------------
create or replace function fn_role()
returns papel_usuario language sql stable security definer
set search_path = public as $$
  select role from perfis where id = auth.uid() and ativo;
$$;

create or replace function fn_parceiro_id()
returns uuid language sql stable security definer
set search_path = public as $$
  select parceiro_id from perfis where id = auth.uid() and ativo;
$$;

create or replace function fn_eh(variadic p_roles papel_usuario[])
returns boolean language sql stable as $$
  select fn_role() = any(p_roles);
$$;

-- ----------------------------------------------------------------------------
-- 2. REFERÊNCIAS — leitura para todos autenticados, escrita Admin
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'naturezas_juridicas', 'qualificacoes_responsavel', 'cnaes',
    'motivos_situacao_cadastral', 'municipios'
  ] loop
    execute format($f$
      create policy pol_%1$s_select on %1$I for select
        to authenticated using (fn_role() is not null);
      create policy pol_%1$s_admin_all on %1$I for all
        to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. CONVENÇÕES COLETIVAS E PISOS — Secretária CRU direto
-- ----------------------------------------------------------------------------
create policy pol_convencoes_select on convencoes_coletivas for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_convencoes_insert on convencoes_coletivas for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_convencoes_update on convencoes_coletivas for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_convencoes_delete on convencoes_coletivas for delete
  to authenticated using (fn_eh('admin'));

create policy pol_pisos_select on pisos_convencao for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_pisos_insert on pisos_convencao for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_pisos_update on pisos_convencao for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_pisos_delete on pisos_convencao for delete
  to authenticated using (fn_eh('admin'));

create policy pol_taxas_select on taxas_convencao for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_taxas_insert on taxas_convencao for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_taxas_update on taxas_convencao for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_taxas_delete on taxas_convencao for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 4. EMPRESAS E ESTABELECIMENTOS — Secretária CRU (baixa): sem INSERT/DELETE
-- ----------------------------------------------------------------------------
create policy pol_empresas_select on empresas for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_empresas_insert on empresas for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_empresas_update on empresas for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_empresas_delete on empresas for delete
  to authenticated using (fn_eh('admin'));

create policy pol_estab_select on estabelecimentos for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_estab_insert on estabelecimentos for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_estab_update on estabelecimentos for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_estab_delete on estabelecimentos for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 5. PARCEIROS E RECEPCIONISTAS — Secretária CRU (baixa)
-- ----------------------------------------------------------------------------
create policy pol_parceiros_select on parceiros for select
  to authenticated using (
    fn_eh('admin','presidente','secretaria')
    or (fn_eh('parceiro') and id = fn_parceiro_id())
  );
create policy pol_parceiros_insert on parceiros for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_parceiros_update on parceiros for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_parceiros_delete on parceiros for delete
  to authenticated using (fn_eh('admin'));

create policy pol_recep_select on recepcionistas for select
  to authenticated using (
    fn_eh('admin','presidente','secretaria')
    or (fn_eh('parceiro') and parceiro_id = fn_parceiro_id())
  );
create policy pol_recep_insert on recepcionistas for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_recep_update on recepcionistas for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_recep_delete on recepcionistas for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 6. PERFIS
-- ----------------------------------------------------------------------------
create policy pol_perfis_select on perfis for select
  to authenticated using (id = auth.uid() or fn_eh('admin'));
create policy pol_perfis_admin_all on perfis for all
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 7. TRABALHADORES E BENEFICIADOS — Secretária CRU (baixa)
-- (INSERT do formulário do site entra via service_role, que ignora RLS)
-- ----------------------------------------------------------------------------
create policy pol_trab_select on trabalhadores for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_trab_insert on trabalhadores for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_trab_update on trabalhadores for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_trab_delete on trabalhadores for delete
  to authenticated using (fn_eh('admin'));

create policy pol_benef_select on beneficiados for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_benef_insert on beneficiados for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_benef_update on beneficiados for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_benef_delete on beneficiados for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 8. VÍNCULOS — Secretária CRUD pleno (operação diária: liga pessoas
--    existentes, não cria pessoas)
-- ----------------------------------------------------------------------------
create policy pol_vinc_select on vinculos_empregaticios for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_vinc_insert on vinculos_empregaticios for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_vinc_update on vinculos_empregaticios for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_vinc_delete on vinculos_empregaticios for delete
  to authenticated using (fn_eh('admin','secretaria'));

-- ----------------------------------------------------------------------------
-- 9. CARTAS DE OPOSIÇÃO — Secretária CRU direto
-- ----------------------------------------------------------------------------
create policy pol_cartas_select on cartas_oposicao for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_cartas_insert on cartas_oposicao for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_cartas_update on cartas_oposicao for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_cartas_delete on cartas_oposicao for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 10. BENEFÍCIOS — Secretária CRU (baixa); Parceiro lê os próprios
-- ----------------------------------------------------------------------------
create policy pol_beneficios_select on beneficios for select
  to authenticated using (
    fn_eh('admin','presidente','secretaria')
    or (fn_eh('parceiro') and parceiro_id = fn_parceiro_id())
  );
create policy pol_beneficios_insert on beneficios for insert
  to authenticated with check (fn_eh('admin'));
create policy pol_beneficios_update on beneficios for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_beneficios_delete on beneficios for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 11. SOLICITAÇÕES DE SERVIÇO — Secretária CRUD pleno; Parceiro evolui status
-- ----------------------------------------------------------------------------
create policy pol_solic_select on solicitacoes_servico for select
  to authenticated using (
    fn_eh('admin','presidente','secretaria')
    or (fn_eh('parceiro') and parceiro_id = fn_parceiro_id())
  );
create policy pol_solic_insert on solicitacoes_servico for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_solic_update on solicitacoes_servico for update
  to authenticated using (
    fn_eh('admin','secretaria')
    or (fn_eh('parceiro') and parceiro_id = fn_parceiro_id())
  ) with check (
    fn_eh('admin','secretaria')
    or (fn_eh('parceiro') and parceiro_id = fn_parceiro_id())
  );
create policy pol_solic_delete on solicitacoes_servico for delete
  to authenticated using (fn_eh('admin','secretaria'));

-- Guarda do UPDATE do parceiro: só evolução de status
create or replace function fn_guarda_parceiro_solicitacao()
returns trigger language plpgsql as $$
begin
  if fn_role() = 'parceiro' then
    if old.status not in ('solicitada', 'pendente_confirmacao')
       or new.status not in ('executada', 'rejeitada') then
      raise exception 'Parceiro só pode evoluir solicitações abertas para executada ou rejeitada';
    end if;

    if (to_jsonb(new) - 'status' - 'motivo_rejeicao' - 'confirmada_por'
                      - 'confirmada_em' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'motivo_rejeicao' - 'confirmada_por'
                      - 'confirmada_em' - 'updated_at') then
      raise exception 'Parceiro só pode alterar o status e o motivo da solicitação';
    end if;

    new.confirmada_por := auth.uid();
    new.confirmada_em  := now();
  end if;
  return new;
end $$;

create trigger trg_guarda_parceiro_solicitacao
  before update on solicitacoes_servico
  for each row execute function fn_guarda_parceiro_solicitacao();

-- ----------------------------------------------------------------------------
-- 12. FINANCEIRO — Secretária CRUD pleno (inclui guias excepcionais:
--     multa, acordo, taxa_adicional). Auditoria integral cobre o risco.
-- ----------------------------------------------------------------------------
create policy pol_faturas_select on faturas for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
create policy pol_faturas_insert on faturas for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_faturas_update on faturas for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_faturas_delete on faturas for delete
  to authenticated using (fn_eh('admin','secretaria'));

create policy pol_repasses_select on repasses for select
  to authenticated using (fn_eh('admin','presidente','secretaria'));
create policy pol_repasses_insert on repasses for insert
  to authenticated with check (fn_eh('admin','secretaria'));
create policy pol_repasses_update on repasses for update
  to authenticated using (fn_eh('admin','secretaria')) with check (fn_eh('admin','secretaria'));
create policy pol_repasses_delete on repasses for delete
  to authenticated using (fn_eh('admin','secretaria'));

-- ----------------------------------------------------------------------------
-- 13. ATENDIMENTOS JURÍDICOS
-- ----------------------------------------------------------------------------
create policy pol_atend_select on atendimentos_juridicos for select
  to authenticated using (fn_eh('admin','presidente','secretaria','juridico'));
create policy pol_atend_insert on atendimentos_juridicos for insert
  to authenticated with check (fn_eh('admin','juridico'));
create policy pol_atend_update on atendimentos_juridicos for update
  to authenticated using (fn_eh('admin','juridico')) with check (fn_eh('admin','juridico'));
create policy pol_atend_delete on atendimentos_juridicos for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 14. FILA DE SOLICITAÇÕES AO ADMIN
-- Todos os roles abrem chamados; cada um acompanha os seus; Admin analisa;
-- solicitante cancela a própria enquanto pendente.
-- ----------------------------------------------------------------------------
create policy pol_solic_admin_select on solicitacoes_admin for select
  to authenticated using (fn_eh('admin') or solicitante = auth.uid());
create policy pol_solic_admin_insert on solicitacoes_admin for insert
  to authenticated with check (
    fn_role() is not null
    and solicitante = auth.uid()
    and status = 'pendente'
  );
create policy pol_solic_admin_update on solicitacoes_admin for update
  to authenticated using (
    fn_eh('admin')
    or (solicitante = auth.uid() and status = 'pendente')
  ) with check (
    fn_eh('admin')
    or (solicitante = auth.uid() and status = 'cancelada')
  );
create policy pol_solic_admin_delete on solicitacoes_admin for delete
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 15. NOTIFICAÇÕES
-- ----------------------------------------------------------------------------
create policy pol_notif_select on notificacoes for select
  to authenticated using (
    fn_eh('admin')
    or destinatario_perfil_id = auth.uid()
    or destinatario_role = fn_role()
  );
create policy pol_notif_update on notificacoes for update
  to authenticated using (
    fn_eh('admin')
    or destinatario_perfil_id = auth.uid()
    or destinatario_role = fn_role()
  ) with check (
    fn_eh('admin')
    or destinatario_perfil_id = auth.uid()
    or destinatario_role = fn_role()
  );
create policy pol_notif_admin_all on notificacoes for all
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 16. IMPORTAÇÕES E AUDITORIA — exclusivos do Admin
-- ----------------------------------------------------------------------------
create policy pol_import_admin on importacoes_csv for all
  to authenticated using (fn_eh('admin')) with check (fn_eh('admin'));

create policy pol_auditoria_admin_select on auditoria for select
  to authenticated using (fn_eh('admin'));

-- ----------------------------------------------------------------------------
-- 17. PORTAL DO PARCEIRO — view sem CPF
-- ----------------------------------------------------------------------------
create or replace view v_fila_parceiro
with (security_invoker = off) as
select
  s.id,
  s.numero_guia,
  coalesce(b.nome, t.nome) as interessado,
  case when s.beneficiado_id is null then 'titular' else 'beneficiado' end as tipo_interessado,
  bf.nome  as servico,
  bf.categoria,
  s.data_agendada,
  s.horario,
  s.valor_particular,
  s.valor_convenio,
  s.status,
  s.motivo_rejeicao,
  s.checkin_em,
  s.created_at
from solicitacoes_servico s
join trabalhadores t  on t.id  = s.trabalhador_id
left join beneficiados b on b.id = s.beneficiado_id
join beneficios bf    on bf.id = s.beneficio_id
where s.parceiro_id = fn_parceiro_id();

grant select on v_fila_parceiro to authenticated;

-- ----------------------------------------------------------------------------
-- 18. GRANTS DAS FUNÇÕES PÚBLICAS (página do QR, sem login)
-- ----------------------------------------------------------------------------
revoke execute on function fn_dados_guia_publica(uuid) from public;
revoke execute on function fn_registrar_checkin(uuid, text, boolean, text) from public;
grant execute on function fn_dados_guia_publica(uuid) to anon, authenticated;
grant execute on function fn_registrar_checkin(uuid, text, boolean, text) to anon, authenticated;

revoke execute on function fn_role() from anon;
revoke execute on function fn_parceiro_id() from anon;
revoke execute on function fn_eh(variadic papel_usuario[]) from anon;

-- ============================================================================
-- FIM · Próximo arquivo: 04_dashboard.sql
-- Teste obrigatório (Claude Code): 6 usuários de teste (um por role + anon)
-- validando cada célula da matriz de permissões como assert, incluindo:
--  · Secretária INSERT/DELETE negado nas 6 tabelas "baixa"
--  · Secretária INSERT permitido em solicitacoes_admin, vinculos, faturas
--  · Solicitante cancela a própria solicitação pendente; não altera analisadas
-- ============================================================================
