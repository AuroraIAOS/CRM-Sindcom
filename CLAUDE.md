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

0. `orientacoes.md`        ← armadilhas já vencidas (leia antes de depurar qualquer coisa)
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
- **Manter `orientacoes.md` atualizado.** É o compilado de armadilhas já vencidas neste projeto (infra, banco, integrações, frontend, ambiente Windows, segurança, método). **Leia antes de começar** — várias horas já foram perdidas em problemas que estão documentados lá. E **sempre que um problema real for diagnosticado e resolvido**, acrescente uma entrada no formato **(a) problema · (b) solução · (c) como implantar**, com o comando/trecho concreto que funcionou. Isso não é opcional: faz parte do fechamento de qualquer sessão que tenha vencido um obstáculo. Só entra o que foi verificado de fato — o arquivo é registro de solução comprovada, não de suspeita ou de tentativa. Se um item de lá se provar errado ou obsoleto, corrija-o em vez de acumular contradição.
- **Marcar conclusão em `specs/plano_fases.md`.** Sempre que uma ETAPA ou Subetapa for concluída com sucesso (código, testes e — quando aplicável — deploy/verificação em produção), editar `specs/plano_fases.md` e acrescentar **"Status: ✅ CONCLUÍDA"** logo após o título da etapa/subetapa correspondente (mesmo padrão já usado no cabeçalho das ETAPAs, ex.: `## ETAPA 01 — MVP CADASTRAL · Complexidade: ALTA · Status: ✅ CONCLUÍDA`; para subetapas, que hoje não têm campo de status, acrescentar o mesmo sufixo ` · Status: ✅ CONCLUÍDA` ao final da linha do cabeçalho `### Subetapa X.Y — ...`). Isso deixa visível, de forma incremental, o progresso tanto entre etapas quanto entre subetapas — não é opcional, faz parte do fechamento de qualquer subetapa.

## Ambiente

- `.env`: `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY`
- Deploy: build estático (`npm run build` → `dist/`) hospedado na Hostgator em `crm.sindcompassos.org` (SPA fallback via `.htaccess`). Runbook completo (host FTP real, armadilha da Cloudflare, verificação): `docs/deploy.md`.
- **Deploy automático autorizado.** Ao final de cada subetapa/processo que altere o frontend, faça o deploy para `crm.sindcompassos.org` (build + envio FTP via `docs/deploy.md`, credenciais em `.env.deploy`) sem pedir confirmação a cada vez — Maxwell autorizou isso explicitamente em 2026-07-13. Racional: o CRM já exige login/senha, então publicar uma tela nova não é um risco crítico. Ainda assim, nunca faça deploy com a suíte de testes (`npm run test`) ou o `typecheck`/`build` quebrados, e avise Maxwell no resumo de cada subetapa que o deploy foi feito (com o resultado da verificação pós-deploy do runbook).
- Jobs: pg_cron (rotinas SQL) + n8n (e-mails de guias e webhooks do site).

## Subetapa 02.6 — motor de cobrança + e-mail das guias · CONCLUÍDA (2026-07-20)

Ciclo completo funcionando: faturas → guias → e-mail com PDF → guia marcada como `enviado`.

- **SQL:** `sql/10_cobrancas.sql` (as 3 `fn_gerar_*`) e `sql/12_email_guias.sql` (`v_repasses_para_email`), aplicados em produção.
- **Frontend:** botões de disparo (só Admin) na aba Relatório da CCT, em `/financeiro/faturas` e em `/financeiro/guias` — diálogos em `src/features/financeiro/GerarCobrancasDialog.tsx`, hooks em `features/financeiro/api.ts`.
- **Testes:** `tests/rls/cobrancas.spec.ts` — 67/67 na suíte.
- **n8n:** workflow "Sindcom — Guia de pagamento por e-mail" (id `3rLxjOI0yTFiiBKT`), ativo com agendamento de 15 min. **Documentação completa e runbook de restauração em `n8n/README.md`** — leia lá antes de mexer na integração.

**Duas armadilhas que custaram horas e estão detalhadas no `n8n/README.md`:**
1. **Titan grátis não faz SMTP externo.** As caixas `@sindcompassos.org` são Titan no plano grátis, onde acesso por cliente externo é recurso PAGO ("Habilite o Titan em outros aplicativos" aparece na lista de upgrade). Mesmo a senha correta dá `535 authentication failed`. **Não redefina senha do Titan tentando resolver isso** — não é senha, é plano. O envio usa `sindcompassos@gmail.com` com senha de app (exige verificação em 2 etapas), que ainda por cima tem reputação consolidada na região há décadas.
2. **Header `apikey` sozinho no Supabase roda como `anon`** — a RLS filtra tudo e devolve array vazio SEM erro, então o workflow "passa" processando zero itens. Só `Authorization: Bearer` estabelece o papel `service_role`.

**Bug de cobrança corrigido no caminho:** `v_base_calculo_trabalhador` usava `least(valor * 0.05, 100.00)`, e como `least()` ignora NULLs, quem NÃO tinha base de cálculo (sem piso na CCT e sem salário informado) recebia exatamente o TETO de R$ 100 — o valor máximo, para a pessoa sobre quem menos se sabe. Atingiria 14 dos 18 trabalhadores da base. Hoje: sem base → NULL → o motor pula e reporta nominalmente na tela.

## Backlog (decisões adiadas)

- [x] ~~**Visão anual de cartas de oposição** (`/cartas`)~~ — **entregue na Subetapa 04.2 (2026-07-22)**, com exportação CSV. A tela mostra **4 situações, não 2**: entregou→Bronze · sem carta→Prata · Ouro sem carta · **Ouro COM carta (não regride — pendente de cancelamento da adesão)**. Ver `docs/plano_cartas_juridico.md`.
- [x] ~~Exportação CSV incompleta (Subetapa 01.5)~~ — **Empresas, Estabelecimentos e Convenções** ganharam "Exportar CSV" na branch `feature/melhorias-usabilidade-01` (2026-07-14), usando o botão nativo do `DataTable` (`onExportar`/`exportando`) + `lib/csv.ts`. **Beneficiados continua sem exportação própria** (não tem tela de listagem independente — só existe dentro da ficha do trabalhador); avaliar quando fizer sentido uma visão transversal de beneficiados.
- [x] ~~**Telas de Faturas/Solicitações/Atendimentos dentro da ficha do trabalhador**~~ — os 7 acordeões de `DetalheTrabalhador.tsx` têm conteúdo real: Faturas e Solicitações na Etapa 02, **Atendimentos na Subetapa 04.1 (2026-07-22)**. O acordeão de Atendimentos reaproveita os diálogos de `features/juridico/` — a ficha e a tela transversal compartilham o mesmo formulário e as mesmas regras.
- [ ] **Exportar CSV em Solicitações** — única tela real que ainda não exporta. (Registro anterior dizia "Jurídico, Parceiros, Benefícios e Solicitações" e afirmava que as 4 eram `Placeholder`: **estava desatualizado** — Parceiros e Benefícios já exportam desde a Etapa 02, e Jurídico ganhou exportação na Subetapa 04.1.) Seguir o mesmo padrão (`DataTable` + `lib/csv.ts`).
- [x] ~~**Catálogo geral de Benefícios** (`/beneficios`)~~ — entregue na Subetapa 02.1 (`src/features/beneficios/`, com listagem, detalhe e exportação CSV). O registro anterior dizia que a tela ainda era `Placeholder`: estava desatualizado.
- [ ] **Reestruturação de Parceiros em mestre-detalhe** (contêineres "Recepcionistas" e "Benefícios do Parceiro", no padrão de `ListaEmpresasPage.tsx`) — `/parceiros` **já existe** como tela real desde a Subetapa 02.1 (o registro anterior dizia `Placeholder`, desatualizado); o que continua pendente é só a reorganização visual em mestre-detalhe.
- [x] ~~**Botões "Novo atendimento" / "Novo parceiro" / "Novo recepcionista" / "Novo benefício"**~~ — todos existem: Parceiros/Recepcionistas/Benefícios na Etapa 02, **"Novo atendimento" na Subetapa 04.1** (visível só para Admin e Jurídico — a Secretaria lê mas não registra, por RLS).
- [ ] **Criação de login novo em `/configuracoes`** (Subetapa 03.5, 2026-07-21) — a tela hoje só EDITA perfis existentes (nome/papel/parceiro vinculado/ativo), porque criar um login exige gravar em `auth.users`, e isso só é possível com `service_role` (`auth.admin.createUser`), que o `CLAUDE.md` proíbe no frontend. Os 5 perfis atuais nasceram direto no Supabase, na Fase 0. **Quando implementar:** exige uma Edge Function dedicada (padrão já usado em `specs/importacao.md` para a gravação em lote) que receba nome/e-mail/papel do Admin autenticado, valide com `fn_eh('admin')` antes de chamar a Admin API, e crie o `auth.users` + `perfis` numa operação — decisão de arquitetura que vale confirmar com Maxwell antes de começar, não é extensão trivial da tela atual.


## Vigilância de segurança pendente (lembrar o Maxwell)

- **`auth_leaked_password_protection` (HaveIBeenPwned) está DESATIVADO** — é recurso do plano pago do Supabase; o projeto roda no Free. Mitigação atual: política de senha forte no Auth (mín. 8 caracteres, maiúsculas+minúsculas+dígitos+símbolos). **Assim que o projeto migrar para o Supabase pago, ativar este recurso** (Authentication → Sign In / Providers → Password) e conferir com `get_advisors`. Toda sessão que tocar em Auth/segurança deve checar se essa migração já ocorreu e lembrar o Maxwell.
