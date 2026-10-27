-- ============================================================================
-- 34 — Excluir ciclo de boletos (ETAPA 10, pós-implantação)
-- Só Admin. Apaga o ciclo e tudo que depende dele: boletos, respostas, vínculos
-- de caixa e de convenção. As caixas de e-mail e seus links permanentes ficam.
--
-- POR QUE UMA FUNÇÃO: `respostas_boleto` é imutável por trigger (até o DELETE em
-- cascata é barrado) e o operador não tem GRANT de DELETE em ciclos/boletos.
-- A imutabilidade continua valendo para todo o resto: só esta função, que
-- confere o papel por dentro, acende a bandeira `app.excluindo_ciclo` na
-- transação, e a bandeira morre no commit.
-- ============================================================================

create or replace function fn_resposta_imutavel()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' and current_setting('app.excluindo_ciclo', true) = '1' then
    return old;
  end if;
  raise exception 'Resposta é imutável: um reenvio cria resposta nova.' using errcode = '42501';
end $fn$;
alter function fn_resposta_imutavel() owner to postgres;

create or replace function fn_excluir_ciclo_boleto(p_ciclo uuid)
returns jsonb language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_nome   text;
  v_boletos integer;
  v_respostas integer;
begin
  if not fn_eh('admin') then
    raise exception 'Só o administrador pode excluir um ciclo.' using errcode = '42501';
  end if;
  select nome into v_nome from ciclos_boleto where id = p_ciclo;
  if v_nome is null then
    raise exception 'Ciclo inexistente.' using errcode = '22023';
  end if;

  perform set_config('app.excluindo_ciclo', '1', true);

  update boletos set quantidade_resposta_id = null
   where ciclo_id = p_ciclo and quantidade_resposta_id is not null;

  delete from respostas_boleto
   where boleto_id in (select id from boletos where ciclo_id = p_ciclo);
  get diagnostics v_respostas = row_count;

  delete from boletos where ciclo_id = p_ciclo;
  get diagnostics v_boletos = row_count;

  delete from ciclos_boleto where id = p_ciclo;   -- cascata: ciclo_convencoes, ciclo_caixas

  perform set_config('app.excluindo_ciclo', '0', true);

  insert into auditoria (tabela, registro_id, operacao, dados_antes, usuario_id)
  values ('ciclos_boleto', p_ciclo::text, 'DELETE',
          jsonb_build_object('acao', 'ciclo_excluido', 'nome', v_nome,
                             'boletos', v_boletos, 'respostas', v_respostas), auth.uid());

  return jsonb_build_object('boletos', v_boletos, 'respostas', v_respostas);
end $fn$;
alter function fn_excluir_ciclo_boleto(uuid) owner to postgres;

revoke execute on function fn_excluir_ciclo_boleto(uuid) from public, anon;
grant  execute on function fn_excluir_ciclo_boleto(uuid) to authenticated;
