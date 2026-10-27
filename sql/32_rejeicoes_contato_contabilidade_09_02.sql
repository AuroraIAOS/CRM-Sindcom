-- ============================================================================
-- CRM SINDCOM — sql/32_rejeicoes_contato_contabilidade_09_02.sql
-- ETAPA 09 · Subetapa 9.2 — a view de rejeições enxergando a CONTABILIDADE
--
-- O QUE A MEDIÇÃO MOSTROU (2026-09-14, com duas linhas de verificação)
-- A view da sql/31 devolvia, para uma rejeição de contabilidade:
--     nome = o próprio e-mail · cnpj = null · telefone = null · município = null
-- Ou seja: EXATAMENTE nada do que a abordagem por outra via exige, para o grupo
-- que mais importa. E não é caso de borda — são **951 dos 9.187 envios**, e cada
-- contabilidade responde por uma carteira inteira de empresas. Uma rejeição de
-- contabilidade custa muito mais que uma de empresa isolada.
--
-- POR QUE ESTAVA VAZIO, e não é culpa da view
-- `contabilidades` nasceu do AGRUPAMENTO POR E-MAIL na Subetapa 08.9: não há
-- razão social, não há CNPJ, não há telefone — o próprio `nome` é o e-mail, e a
-- coluna `observacoes` de cada linha diz isso em letras claras. A Receita não
-- publica cadastro de escritório contábil; publica as EMPRESAS que ele atende.
--
-- ONDE O TELEFONE ESTAVA O TEMPO TODO
-- Na carteira. E há um sinal forte dentro dela: o telefone que **se repete**
-- entre os clientes de uma mesma contabilidade é, quase sempre, a linha do
-- próprio escritório — o contador informou o telefone dele ao cadastrar os
-- clientes na Receita. Medido na primeira carteira examinada: três empresas
-- diferentes, três CNPJs diferentes, o MESMO `35 35611154`.
--
-- Então a regra aqui não é "pegue um telefone qualquer da carteira", que daria
-- o número de um cliente aleatório e mandaria ligar para a pessoa errada. É
-- **pegue o telefone mais repetido**, e diga em quantas empresas ele aparece —
-- porque 1 em 1 é palpite e 7 em 9 é o escritório. Quem vai ligar decide com o
-- número na frente, em vez de confiar num palpite escondido dentro de um SQL.
--
-- IDEMPOTENTE: `create or replace view`. As 12 colunas da sql/31 mantêm nome,
-- tipo e POSIÇÃO — o Postgres recusa renomear ou reordenar coluna de view
-- existente (armadilha medida na 9.2 com `v_cobertura_empresas`); o que muda é
-- a EXPRESSÃO de `telefone` e `municipio`, que é permitido, e as 4 colunas
-- novas entram no FIM.
-- ============================================================================

create or replace view v_rejeicoes_para_contato
with (security_invoker = on) as
select
  r.id,
  r.email,
  r.tipo,
  r.motivo,
  r.ocorrido_em,
  r.campanha,
  case when r.envio_id is null then 'fora da base' else 'na base' end as situacao,
  coalesce(c.nome, emp.razao_social, est.nome_fantasia) as nome,
  est.cnpj_completo,

  -- Ordem de preferência, da mais forte para a mais fraca, e é ela que decide
  -- para quem a Secretaria liga:
  --   1. o telefone da própria contabilidade, se um dia for confirmado;
  --   2. o do estabelecimento, quando o envio foi para uma empresa isolada;
  --   3. o telefone mais repetido da carteira — ver `telefone_em_n_empresas`.
  -- `nullif(concat_ws(...), '')` e o nullif NÃO É DECORAÇÃO: **concat_ws nunca
  -- devolve null**, devolve string vazia. Sem ele, numa rejeição de
  -- contabilidade (em que `est` é nulo) o coalesce pararia no '' e jamais
  -- chegaria ao telefone da carteira — medido em 2026-09-14: a view dizia
  -- `telefone_origem = 'carteira'` e `telefone = null` na mesma linha, que é
  -- uma contradição que só apareceu porque a conferência olhou as duas colunas
  -- juntas.
  nullif(trim(coalesce(
    c.telefone,
    nullif(concat_ws(' ', nullif(est.ddd_1, ''), nullif(est.telefone_1, '')), ''),
    fone.telefone
  )), '') as telefone,

  coalesce(m.nome, mun.nome) as municipio,
  (r.envio_id is not null) as tem_envio,

  -- ---- colunas novas (9.2), sempre no fim ----------------------------------

  -- Contador e empresa não se abordam do mesmo jeito, e a tela precisa saber
  -- qual dos dois está olhando antes de sugerir carta ou visita.
  case
    when e.contabilidade_id is not null then 'contabilidade'
    when e.estabelecimento_id is not null then 'empresa'
    else 'desconhecido'
  end as tipo_destinatario,

  -- O TAMANHO DO ESTRAGO. Uma contabilidade que não recebeu não é uma caixa
  -- perdida: são todas as empresas da carteira dela sem o link. É por este
  -- número que a fila de ligação deve ser ordenada.
  coalesce(carteira.atendidos, 0) as estabelecimentos_atendidos,

  -- De onde veio o telefone mostrado. Sem isto, um número da carteira pareceria
  -- ser do escritório, e alguém ligaria para um cliente achando que fala com o
  -- contador.
  case
    when c.telefone is not null then 'propria'
    when est.id is not null and nullif(trim(est.telefone_1), '') is not null then 'propria'
    when fone.telefone is not null then 'carteira'
    else null
  end as telefone_origem,

  -- A CONFIANÇA, explícita: em quantas empresas da carteira aquele mesmo número
  -- aparece. 1 é palpite; 7 é o escritório.
  fone.repeticoes as telefone_em_n_empresas

from rejeicoes_campanha r
left join envios_campanha e on e.id = r.envio_id
left join contabilidades c on c.id = e.contabilidade_id
left join estabelecimentos est on est.id = e.estabelecimento_id
left join empresas emp on emp.cnpj_basico = est.cnpj_basico
left join municipios m on m.id = est.municipio_id

-- Só para envio de contabilidade: `on true` com a guarda no `where` interno
-- mantém o lateral inerte nos envios de empresa (o `e.contabilidade_id` é null
-- e nenhuma linha casa), sem precisar de condição no join.
left join lateral (
  select count(*)::int as atendidos
    from contabilidade_estabelecimentos ce
   where ce.contabilidade_id = e.contabilidade_id
) carteira on e.contabilidade_id is not null

left join lateral (
  select
    nullif(trim(concat_ws(' ', nullif(est2.ddd_1, ''), nullif(est2.telefone_1, ''))), '') as telefone,
    count(*)::int as repeticoes
    from contabilidade_estabelecimentos ce
    join estabelecimentos est2 on est2.id = ce.estabelecimento_id
   where ce.contabilidade_id = e.contabilidade_id
     and nullif(trim(est2.telefone_1), '') is not null
   group by 1
   -- O mais repetido ganha; o desempate por texto só existe para o resultado
   -- ser estável entre execuções (senão a tela mudaria de telefone sozinha).
   order by count(*) desc, 1
   limit 1
) fone on e.contabilidade_id is not null

left join lateral (
  select m2.nome
    from contabilidade_estabelecimentos ce
    join estabelecimentos est3 on est3.id = ce.estabelecimento_id
    join municipios m2 on m2.id = est3.municipio_id
   where ce.contabilidade_id = e.contabilidade_id
   group by m2.nome
   order by count(*) desc, m2.nome
   limit 1
) mun on e.contabilidade_id is not null;

comment on view v_rejeicoes_para_contato is
  'Rejeições com o que a abordagem por outra via exige: nome, CNPJ, TELEFONE e município (Subetapa 9.2). '
  'Para contabilidade — que não tem cadastro próprio na Receita — o telefone vem do mais REPETIDO na '
  'carteira, e `telefone_em_n_empresas` diz o quanto confiar nele.';

grant select on v_rejeicoes_para_contato to authenticated;
revoke insert, update, delete on v_rejeicoes_para_contato from authenticated, anon;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA — efeito observável, não ausência de erro (§7.2):
--
--   select now() as medido_em, tipo_destinatario, telefone_origem,
--          telefone, telefone_em_n_empresas, estabelecimentos_atendidos, municipio
--     from v_rejeicoes_para_contato order by ocorrido_em desc;
--
-- Esperado para a linha de contabilidade: telefone PREENCHIDO,
-- telefone_origem = 'carteira', municipio preenchido, atendidos > 0.
-- ----------------------------------------------------------------------------
