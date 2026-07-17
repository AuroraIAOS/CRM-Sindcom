-- ============================================================================
-- 12_email_guias.sql · VIEW DE APOIO AO JOB DE E-MAIL DE GUIAS (Subetapa 02.6)
-- Consumida pelo workflow n8n "Sindcom — Guia de pagamento por e-mail"
-- (self-host, não versionado aqui — ver CLAUDE.md § Pendências da 02.6 para
-- o estado da instância e como reconstruir/exportar o workflow).
--
-- Modelo de PUXAR (poll), não empurrar: o n8n consulta esta view
-- periodicamente via service_role (que ignora RLS) em vez do banco chamar
-- um webhook — assim o n8n pode rodar em qualquer lugar (inclusive
-- localhost, como no ambiente self-host do Maxwell) sem precisar receber
-- conexões de fora.
-- ============================================================================

-- email_destino: prioriza o estabelecimento MATRIZ (matriz_filial = 1); na
-- ausência (comum em dados manuais, sem CSV da Receita), cai em qualquer
-- estabelecimento da empresa que tenha e-mail cadastrado. Se nenhum tiver,
-- fica NULL e o n8n usa o fallback (EMAIL_FALLBACK_RH) — e-mails de RH vindos
-- do CSV da Receita podem estar desatualizados (plano_fases.md 02.6).
--
-- faturas: agregado em jsonb SEM CPF de propósito — é o resumo que vai para
-- o corpo do e-mail/PDF do RH da empresa; o CPF cru só sai pelo export
-- logado (specs/importacao.md §8), não por um e-mail automático de terceiros.
create or replace view v_repasses_para_email with (security_invoker = on) as
select
  r.id as repasse_id,
  r.numero_guia_pagamento,
  r.tipo,
  r.competencia,
  r.valor_total,
  r.data_vencimento,
  emp.razao_social as empresa,
  r.cnpj_basico,
  dest.email as email_destino,
  (select count(*) from faturas f where f.repasse_id = r.id) as qtd_faturas,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
             'trabalhador', t.nome, 'tipo', f.tipo, 'valor', f.valor
           ) order by t.nome), '[]'::jsonb)
      from faturas f
      join trabalhadores t on t.id = f.trabalhador_id
     where f.repasse_id = r.id
  ) as faturas
from repasses r
join empresas emp on emp.cnpj_basico = r.cnpj_basico
left join lateral (
  select e.email
    from estabelecimentos e
   where e.cnpj_basico = r.cnpj_basico
     and e.email is not null
   order by (e.matriz_filial = 1) desc nulls last, e.created_at
   limit 1
) dest on true
where r.status = 'previsto'
  and r.email_enviado_em is null;

-- ============================================================================
-- FIM · 12_email_guias.sql
-- ============================================================================
