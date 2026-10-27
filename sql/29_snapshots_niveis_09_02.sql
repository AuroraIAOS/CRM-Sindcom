-- ============================================================================
-- CRM SINDCOM — sql/29_snapshots_niveis_09_02.sql
-- ETAPA 09 · Subetapa 9.2 — o gráfico "Evolução por nível" mostrava gente que
-- não existe, e parava de desenhar quando a base esvaziava
--
-- O QUE FOI RELATADO, E O QUE A MEDIÇÃO MOSTROU
--
-- Maxwell viu, em produção: linhas subindo até ~40 e ~13 num CRM cujo cartão de
-- KPI diz "Trabalhadores: 1". A leitura natural é "erro de escala do eixo Y" —
-- e ela está ERRADA. Os valores desenhados são reais:
--
--   data_ref     bronze  prata  total(aprovados)
--   2026-08-26        1      3   4
--   2026-09-08       12     27  39
--   2026-09-09       13     40  53   <- véspera da limpeza da base
--   2026-09-10        -      -   0   <- só a linha global; nenhuma por nível
--
-- Ou seja: o eixo está certo e o gráfico é fiel. **O que está errado é a
-- história**, e por dois motivos distintos:
--
-- (1) AS FOTOGRAFIAS CONTAVAM GENTE DEMO. A limpeza de 2026-09-09 apagou os 55
--     trabalhadores fictícios, mas não apagou os SNAPSHOTS que os contaram. O
--     gráfico seguiu exibindo uma população de 53 pessoas que nunca foi real —
--     exatamente o que a regra de dados do CLAUDE.md existe para impedir.
--     Dado derivado de dado DEMO também é dado DEMO.
--
-- (2) NÍVEL SEM NINGUÉM NÃO VIRAVA ZERO — VIRAVA AUSÊNCIA. O `group by nivel`
--     sobre uma base vazia não produz linha nenhuma. Em 2026-09-10 gravou-se a
--     linha global (0) e NENHUMA linha por nível; como o gráfico monta a série
--     a partir das linhas por nível, aquele dia simplesmente não existe para
--     ele. Resultado: em vez de a linha CAIR para zero, ela PARA no último dia
--     em que havia gente — e o leitor vê um platô em 40 onde deveria ver uma
--     queda a zero. É o §4.5 (série temporal com pontos ausentes), na sua forma
--     mais enganosa: ausência que parece continuidade.
--
-- E UM TERCEIRO DEFEITO, LATENTE, que a mesma correção fecha: se algum
-- trabalhador aprovado tivesse `nivel` nulo, o `group by nivel` original
-- gravaria uma linha com `nivel = null` — indistinguível da linha GLOBAL, que
-- também usa `nivel = null`. Duas linhas globais no mesmo dia, uma com o total
-- e outra com os sem-nível, e a tela somando as duas. Nunca aconteceu porque
-- `nivel` é derivado e sempre preenchido, mas dependia disso.
--
-- IDEMPOTENTE: `create or replace` + delete por faixa de data já apagada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A função passa a gravar SEMPRE os três níveis, inclusive com zero.
--
-- A diferença está em `unnest(enum_range(...))` + `left join`: a fotografia
-- passa a ser tirada a partir dos NÍVEIS QUE EXISTEM, não das pessoas que
-- existem. Base vazia agora produz bronze=0, prata=0, ouro=0 — que é o que um
-- gráfico de evolução precisa para desenhar uma queda.
-- ----------------------------------------------------------------------------
create or replace function fn_snapshot_dashboard()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  perform fn_guarda_job();
  delete from snapshots_dashboard where data_ref = current_date;

  -- Por nível: uma linha por valor do enum, SEMPRE. `count(t.id)` devolve 0
  -- quando o left join não acha ninguém — `count(*)` devolveria 1 e mentiria.
  insert into snapshots_dashboard (data_ref, nivel, qtd_trabalhadores)
  select current_date, n.nivel, count(t.id)
    from unnest(enum_range(null::nivel_protecao)) as n(nivel)
    left join trabalhadores t
           on t.nivel = n.nivel
          and t.status_cadastro = 'aprovado'
   group by n.nivel;

  -- Linha global (nivel is null) com o total e o MRR — inalterada.
  insert into snapshots_dashboard (data_ref, qtd_trabalhadores, mrr_mensalidades, mrr_contribuicoes)
  select current_date,
         (select count(*) from trabalhadores where status_cadastro = 'aprovado'),
         (select coalesce(sum(vm.valor_mensalidade), 0)
            from v_mensalidade_titular vm
            join trabalhadores t on t.id = vm.trabalhador_id and t.status_cadastro = 'aprovado'),
         (select round(coalesce(sum(bc.valor_contribuicao_anual), 0) / 12, 2)
            from v_base_calculo_trabalhador bc
            join trabalhadores t on t.id = bc.trabalhador_id
           where t.status_cadastro = 'aprovado' and t.nivel in ('prata', 'ouro'));

  -- Por município × nível — inalterada. Aqui a ausência é correta: município
  -- sem ninguém não precisa de linha, porque o mapa lê "sem registro" como
  -- estado válido, ao contrário de uma série temporal.
  insert into snapshots_dashboard (data_ref, municipio_id, nivel, qtd_trabalhadores)
  select current_date, mun.municipio_id, mun.nivel, count(*)
    from (
      select coalesce(e.municipio_id, t.municipio_id) as municipio_id, t.nivel
      from trabalhadores t
      left join vinculos_empregaticios v
             on v.trabalhador_id = t.id and v.principal and v.data_desligamento is null
      left join estabelecimentos e on e.id = v.estabelecimento_id
      where t.status_cadastro = 'aprovado'
    ) mun
   where mun.municipio_id is not null
   group by mun.municipio_id, mun.nivel;
end $function$;

-- ----------------------------------------------------------------------------
-- 2. Apagar as fotografias que contaram gente DEMO.
--
-- Faixa fechada 2026-08-26 .. 2026-09-09: a primeira é o dia em que apareceram
-- os primeiros níveis DEMO; a última é a véspera da limpeza da base. As
-- fotografias ANTERIORES a 2026-08-26 registram "0 aprovados", o que era
-- verdade então e continua sendo — história honesta, fica.
--
-- Dump das 18 linhas em docs/snapshots_demo_apagados_2026-09-11.json, porque
-- `auditoria` registra que a linha sumiu, não o conteúdo dela (§2.30).
-- ----------------------------------------------------------------------------
delete from snapshots_dashboard
 where data_ref between '2026-08-26' and '2026-09-09';

-- ----------------------------------------------------------------------------
-- 3. Retirar a fotografia de hoje com a função já corrigida, para o ponto mais
--    recente da série nascer completo (três níveis, em zero).
-- ----------------------------------------------------------------------------
select fn_snapshot_dashboard();

-- ----------------------------------------------------------------------------
-- 4. A VIEW zera o que falta, inclusive nas fotografias ANTIGAS.
--
-- O item 1 conserta daqui para a frente; este conserta a história já gravada.
-- As fotografias de julho e agosto têm só a linha global (0 aprovados) e nenhuma
-- linha por nível — sem este `cross join`, elas continuariam invisíveis para o
-- gráfico, e a série começaria direto em setembro como se não houvesse passado.
--
-- `security_invoker = on` preservado: a RLS de `snapshots_dashboard` continua
-- decidindo quem lê. E o `revoke` fecha a escrita herdada do default ACL
-- (§2.25) — com o `cross join` a view nem é auto-atualizável, mas privilégio
-- que ninguém usa é superfície de graça.
-- ----------------------------------------------------------------------------
create or replace view v_dash_evolucao_niveis
with (security_invoker = on) as
select d.data_ref,
       n.nivel,
       coalesce(s.qtd_trabalhadores, 0) as qtd_trabalhadores
  from (select distinct data_ref from snapshots_dashboard where municipio_id is null) d
 cross join unnest(enum_range(null::nivel_protecao)) as n(nivel)
  left join snapshots_dashboard s
         on s.data_ref = d.data_ref
        and s.municipio_id is null
        and s.nivel = n.nivel
 order by d.data_ref, n.nivel;

comment on view v_dash_evolucao_niveis is
  'Série do gráfico G1. Devolve os três níveis para toda data fotografada, com zero onde não há '
  'linha — ausência numa série temporal desenha continuidade falsa (orientacoes.md §4.5). Subetapa 9.2.';

grant select on v_dash_evolucao_niveis to authenticated, anon;
revoke insert, update, delete on v_dash_evolucao_niveis from authenticated, anon;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — rodar DEPOIS. Mede o efeito, não a ausência de erro (§7.2).
--
-- (1) O dia de hoje tem os TRÊS níveis, e todos em zero:
--   select nivel, qtd_trabalhadores from snapshots_dashboard
--    where data_ref = current_date and municipio_id is null order by nivel;
--   -- esperado: bronze|0, prata|0, ouro|0  (+ a linha global, nivel null)
--
-- (2) Nenhuma fotografia sobrou contando gente que não existe:
--   select coalesce(max(qtd_trabalhadores), 0) from snapshots_dashboard
--    where nivel is not null;
--   -- esperado: 0 enquanto a base tiver só o Isac (pendente, não aprovado)
--
-- (3) A view do gráfico devolve a série já com os zeros:
--   select * from v_dash_evolucao_niveis order by data_ref, nivel;
-- ----------------------------------------------------------------------------
