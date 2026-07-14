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
- **Dados de demonstração permanecem no banco.** Ao implementar e verificar qualquer subetapa que crie trabalhadores, beneficiados, empresas, estabelecimentos, parceiros ou solicitações de serviço, os registros de demonstração/verificação usados no teste **ficam gravados** ao final da sessão — não apagar. Isso dá a Maxwell uma visualização real e incremental do sistema, subetapa a subetapa, em `crm.sindcompassos.org`. Nomeie esses registros de forma clara (prefixo `DEMO —` ou nome obviamente fictício) para nunca serem confundidos com cadastro real quando a importação da Etapa 01.5 começar. Só remover dados de demonstração por reparo técnico ou motivo de segurança — e, nesse caso, avisar Maxwell explicitamente sobre o que e por que foi removido.

## Ambiente

- `.env`: `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY`
- Deploy: build estático (`npm run build` → `dist/`) hospedado na Hostgator em `crm.sindcompassos.org` (SPA fallback via `.htaccess`). Runbook completo (host FTP real, armadilha da Cloudflare, verificação): `docs/deploy.md`.
- **Deploy automático autorizado.** Ao final de cada subetapa/processo que altere o frontend, faça o deploy para `crm.sindcompassos.org` (build + envio FTP via `docs/deploy.md`, credenciais em `.env.deploy`) sem pedir confirmação a cada vez — Maxwell autorizou isso explicitamente em 2026-07-13. Racional: o CRM já exige login/senha, então publicar uma tela nova não é um risco crítico. Ainda assim, nunca faça deploy com a suíte de testes (`npm run test`) ou o `typecheck`/`build` quebrados, e avise Maxwell no resumo de cada subetapa que o deploy foi feito (com o resultado da verificação pós-deploy do runbook).
- Jobs: pg_cron (rotinas SQL) + n8n (e-mails de guias e webhooks do site).

## Backlog (decisões adiadas)

- [ ] **Visão anual de cartas de oposição** (`/cartas`: quem entregou, quem falta, exportação da lista de reclassificação — `specs/frontend.md` §2.2) — adiada para o **final do roteiro**, decisão de Maxwell em 2026-07-13. Não implementar junto de nenhuma subetapa intermediária; só entra quando todo o resto estiver pronto. **Exportar CSV nesta tela também espera esse momento** (branch `feature/melhorias-usabilidade-01`, 2026-07-14).
- [x] ~~Exportação CSV incompleta (Subetapa 01.5)~~ — **Empresas, Estabelecimentos e Convenções** ganharam "Exportar CSV" na branch `feature/melhorias-usabilidade-01` (2026-07-14), usando o botão nativo do `DataTable` (`onExportar`/`exportando`) + `lib/csv.ts`. **Beneficiados continua sem exportação própria** (não tem tela de listagem independente — só existe dentro da ficha do trabalhador); avaliar quando fizer sentido uma visão transversal de beneficiados.
- [ ] **Telas de Faturas/Solicitações/Atendimentos dentro da ficha do trabalhador** (acordeões "Faturas"/"Solicitações"/"Atendimentos" em `DetalheTrabalhador.tsx`, branch `feature/melhorias-usabilidade-01`, 2026-07-14) — hoje ficam vazias/somente-leitura até o motor de cobrança e o convênio (Etapa 02) existirem. **Quando implementar:** manter o mesmo padrão de acordeon já criado (não voltar para abas) — layout já pronto, só falta o conteúdo real de cada seção.
- [ ] **Exportar CSV em Jurídico, Parceiros, Benefícios e Solicitações** — essas 4 telas ainda são `Placeholder` (não existem como feature — são as Subetapas 01.2/02.1/02.2 completas). Registrar aqui para não esquecer: quando cada tela ganhar sua listagem real, adicionar "Exportar CSV" seguindo o mesmo padrão (`DataTable` + `lib/csv.ts`) usado em Trabalhadores/Empresas/Estabelecimentos/Convenções.
- [ ] **Catálogo geral de Benefícios** (`/beneficios` como visão transversal de todos os parceiros — `specs/frontend.md` §2.2) — é o escopo da própria **Subetapa 02.1**; a tela ainda é `Placeholder` (sem `src/features/beneficios/`). Não antecipar fora do faseamento aprovado — pedido no documento de melhorias de usabilidade (2026-07-14), mas fica para quando a Etapa 02 começar.
- [ ] **Reestruturação de Parceiros em mestre-detalhe** (com contêineres "Recepcionistas" e "Benefícios do Parceiro", no mesmo padrão de `ListaEmpresasPage.tsx`/`ListaTrabalhadoresPage.tsx`) — idem acima: `/parceiros` ainda é `Placeholder`, isso é a Subetapa 02.1. **Quando implementar:** seguir o padrão mestre-detalhe já estabelecido (grid `DataTable` + painel de detalhe na mesma página, sem navegação de rota).
- [ ] **Botões "Novo atendimento" / "Novo parceiro" / "Novo recepcionista" / "Novo benefício"** — mesma razão: Jurídico (parcial, subetapa 01.2), Parceiros e Benefícios (Subetapa 02.1) ainda não têm telas reais. Nascem junto com essas telas, seguindo o padrão visual já usado em "Nova empresa"/"Novo estabelecimento"/"Novo trabalhador" (botão + `Dialog` + `EntityForm` + popup de confirmação de edição).

## Vigilância de segurança pendente (lembrar o Maxwell)

- **`auth_leaked_password_protection` (HaveIBeenPwned) está DESATIVADO** — é recurso do plano pago do Supabase; o projeto roda no Free. Mitigação atual: política de senha forte no Auth (mín. 8 caracteres, maiúsculas+minúsculas+dígitos+símbolos). **Assim que o projeto migrar para o Supabase pago, ativar este recurso** (Authentication → Sign In / Providers → Password) e conferir com `get_advisors`. Toda sessão que tocar em Auth/segurança deve checar se essa migração já ocorreu e lembrar o Maxwell.
