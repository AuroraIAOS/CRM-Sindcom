# CRM SINDCOM — Instruções para o Claude Code

## O que é este projeto

CRM do Sindicato dos Empregados no Comércio de Passos e Região (MG).
Gestão de trabalhadores em 3 níveis de proteção (Bronze/Prata/Ouro), empresas e estabelecimentos, convenções coletivas (CCTs), convênio de benefícios com parceiros e controle financeiro. O blueprint completo está aprovado — **NÃO redesenhar a arquitetura; implementar o que está especificado.**

## Estado atual da infraestrutura (LEIA ANTES DE COMEÇAR)

A infraestrutura da Fase 0 JÁ ESTÁ PRONTA — não recriar:
- Projeto Supabase isolado criado; os 4 SQLs (01→04) já aplicados sem erro; pg_cron habilitado e agendado; NOTIFY executado; 5 usuários + perfis criados.
- As credenciais estão em .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). A service_role NÃO está no .env do frontend e não deve ser usada pelo app. 

Portanto, na Fase 0 você executa APENAS a metade-código: skeleton React+Vite+TS+PWA, AppShell, RoleGate, Supabase Auth no front, navegação por role, deploy inicial e a SUÍTE DE TESTES RLS. Não crie projeto Supabase, não reaplique SQL, não recrie usuários.

## Ordem de leitura obrigatória

1. `specs/plano_fases.md`  ← fases, escopos, critérios de aceite (comece aqui)
2. `sql/01_schema.sql`     ← modelo de dados = fonte de verdade das regras de negócio
3. `sql/03_rls.sql`        ← matriz de permissões por role
4. `specs/frontend.md`     ← stack, mapa de telas, componentes, estrutura de pastas
5. `specs/dashboard.md` + `sql/04_dashboard.sql`
6. `specs/importacao.md` (`sql/02_seed_municipios.sql` executa-se, não se lê.)

## Stack (fixa — não trocar)

React 18 + TypeScript + Vite + vite-plugin-pwa · Tailwind CSS + shadcn/ui · TanStack Query v5 / Table v8 · react-hook-form + zod · Recharts · Leaflet · qrcode.react · papaparse · supabase-js v2 (**somente anon key no frontend; service_role apenas em Edge Functions/n8n**).

## Regras invioláveis

- Nenhuma tela é desenvolvida antes de a suíte de testes RLS estar 100% verde (Fase 0).
- Importação CSV **nunca** altera `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio` ou `forma_pagamento_preferida` de registros existentes — mudança de nível é ato deliberado, não efeito de planilha.
- Toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack nomeado; componentes não chamam supabase-js diretamente.
- Vocabulário canônico: `beneficios` = catálogo (oferta) · `solicitacoes_servico` = "carrinho" (demanda que vira guia).
- A segurança real são RLS + triggers no banco; o frontend só traduz os erros do Postgres em mensagens amigáveis (mapa central de mensagens).
- Textos de UI em português brasileiro. Identidade visual conforme `docs/design-tokens.md` (cores, tipografia, tom — nunca inventar paleta).
- Erros e limitações são reportados com transparência total; nada de "funciona" com ressalva escondida.

## Ambiente

- `.env`: `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY`
- Deploy: build estático (`npm run build` → `dist/`) hospedado na Hostgator em `crm.sindcompassos.org` (SPA fallback via `.htaccess`).
- Jobs: pg_cron (rotinas SQL) + n8n (e-mails de guias e webhooks do site).
