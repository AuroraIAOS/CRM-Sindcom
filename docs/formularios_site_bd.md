# Banco dos formulários do site — contrato e como aplicar

`sql/35_formularios_site.sql` · teste `tests/rls/formularios_site.spec.ts` · função `supabase/functions/formularios-site/`.
**Status: escrito e revisado por leitura; NÃO aplicado em lugar nenhum.** Aplicar em produção é decisão do Maxwell, e só depois do portão adversarial.

## Tabelas
| Tabela | Quem grava | Quem lê (RLS) | Observação |
|---|---|---|---|
| `site_contatos` | Edge Function (`service_role`) | Admin, Secretaria | mensagem do formulário de contato |
| `site_curriculos` | idem | Admin, Secretaria | só metadado do anexo (nome, bytes); o arquivo vai por e-mail |
| `site_vagas` | idem | Admin, Secretaria (+ UPDATE de `status_moderacao`) | nasce `pendente`; `publicada_em` é do banco |
| `site_denuncias` | idem | **Admin e Jurídico** (+ UPDATE de `status` e `responsavel_id`) | anônima garantida por CHECK: sem nome, e-mail, telefone nem hash de IP |
| `site_limites` | função `fn_site_limite` | ninguém | hash com sal, apagado após 1 dia |

- **Escrita pública não existe:** `anon` e `authenticated` não têm INSERT (sem GRANT e sem policy). Toda validação, Turnstile, honeypot e limite ficam na Edge Function.
- `authenticated` lê por **coluna** (sem `origem_ip_hash`): o frontend do CRM lista as colunas; `select *` dá 42501.
- Vitrine pública: `fn_vagas_publicas()` + `v_vagas_publicas` devolvem só `id, cargo, descricao, requisitos_resumo, publicada_em` das vagas **aprovadas**. Nunca empresa, CNPJ ou contato.
- Revisão de 2026-11-12: `relato` passou a 8000 caracteres (igual ao formulário) e reverter a moderação de uma vaga agora limpa `publicada_em`.

## Como aplicar (nesta ordem)
1. Criar/usar um **projeto Supabase descartável (bench)** com os SQLs 01→34 aplicados.
2. Aplicar `sql/35_formularios_site.sql` no bench.
3. `.env.bench` com `SUPABASE_SERVICE_ROLE_KEY` do bench; rodar `SITE_FORMS_APPLIED=1 SINDCOM_ALVO=bench npx vitest run tests/rls/formularios_site.spec.ts`. O teste recusa rodar contra produção.
4. `get_advisors` (security) no bench: nada novo.
5. Só então, com ordem do Maxwell: aplicar em produção, `notify pgrst, 'reload schema'` já vai no arquivo.

## Pendente
- Confirmar a política de retenção dos dados (Termos, seção 12) e, se houver prazo, criar o job de expurgo.
- O CRM (ETAPA 3) lê estas tabelas; nenhuma tela foi construída.
