# HANDOFF 02 — Início da Etapa 02 (Convênio + Motor Financeiro)

> Ponte entre etapas. A Etapa 01 (MVP Cadastral) está **concluída e no ar** em `crm.sindcompassos.org`. 
> Este documento abre a próxima sessão do Claude CODE e orienta o início da **Etapa 02** conforme `specs/plano_fases.md`.

---

## 0. Texto de abertura da próxima sessão (colar no primeiro prompt)

> Estamos retomando o CRM SINDCOM para iniciar a **Etapa 02 — Convênio + Motor Financeiro**. A Etapa 01 já está 100% concluída, testada e em produção. Antes de qualquer coisa, leia na ordem: `CLAUDE.md` → `docs/handoff_02.md` (este) → `specs/plano_fases.md` (seção ETAPA 02) → `sql/01_schema.sql` → `sql/03_rls.sql` → `specs/frontend.md` (§2.2, §4). Depois me proponha o plano da **Subetapa 02.1** (Parceiros + recepcionistas + catálogo de benefícios) usando `/goal`, sem começar a codar antes da minha aprovação. Regras invioláveis do motor financeiro valem desde já: funções SQL `security definer` de cobrança **não** rodam por `/goal` (Manual estrito); `service_role` só em n8n/Edge, nunca no front.

---

## 1. O que já está pronto (não refazer)

### Infraestrutura (Fase 0) — no ar

- Projeto Supabase isolado; SQLs `01→04` aplicados; `pg_cron` agendado; `NOTIFY pgrst`; 5 perfis + 1 parceiro-teste. `.env` com `VITE_SUPABASE_URL` /  `VITE_SUPABASE_ANON_KEY` (anon only no front).
- Skeleton React+Vite+TS+PWA, AppShell, RoleGate, Auth, navegação por papel, mapa central de erros. Suíte de testes **RLS 100% verde** (portão do projeto).
- Fechamento em `docs/fase0-conformidade.md`.

### Etapa 01 — MVP Cadastral (COMPLETA)

Todas as subetapas entregues, testadas e deployadas:

- **01.1** Trabalhadores: lista + ficha (hoje em **layout mestre-detalhe com acordeões**, ver melhorias abaixo).
- **01.2** Vínculos, beneficiados, cartas de oposição (ciclo carta→Bronze OK; beneficiado≠titular pelo trigger).
- **01.3** Empresas/Estabelecimentos + Convenções (CCT) com pisos, taxas, data limite de oposição e migração em lote.
- **01.4** Fila de solicitações ao Admin (`solicitacoes_admin`) + aprovação de cadastros pendentes.
- **01.5** Importação/exportação CSV (empresas, estabelecimentos, trabalhadores, beneficiados) com relatório de rejeitadas e proteção das flags de nível.
- **01.6** Notificações in-app + badge via Realtime.

### Duas rodadas de melhorias de usabilidade (mergeadas em `main`, no ar)

- **Trabalhadores mestre-detalhe** com 7 acordeões (Dados · Vínculos · Beneficiados · Cartas · Faturas · Solicitações · Atendimentos). Faturas/Solicitações/Atendimentos estão como acordeões **vazios** aguardando a Etapa 02 — **manter esse padrão de acordeon ao preenchê-los** (não voltar para abas).
- **Auto-preenchimento função→salário** no vínculo, a partir dos pisos da CCT.
- **ENUM `parentesco_beneficiado`** (`sql/08`) — 7 valores.
- **Ações em massa** (seleção múltipla): Admin executa direto; **Secretária gera 1 solicitação de lote no fila-admin** (`payload.lote`, executada em `fila-admin/api.ts → executarOperacao` via `trabalhadores/bulk.ts`). Popup de atribuição por seções (DADOS/VÍNCULOS/CARTAS).
- **CSV export restrito ao Admin** em todas as telas.
- **Convenções viraram domínio Jurídico** (`sql/09`): matriz nova `SELECT: admin,presidente,secretaria,juridico · INSERT/UPDATE/DELETE: admin,juridico`. Secretária/Presidente só leitura. Aplicado na UI **e** na RLS.
- Confirmação de edição padronizada (`ConfirmarEdicaoDialog`), botões "Nova empresa"/"Novo estabelecimento", layout de filtros em barra superior.

### Estado técnico atual

- Branch: **`main`** (commit `d4295dd`), sincronizada com `origin` e deployada.
- Migrations aplicadas no banco: `sql/01`…`sql/09` (a `07` habilita Realtime em `notificacoes`; `08` ENUM parentesco; `09` RLS Convenções→Jurídico).
- Suíte de testes: `npm run test` = **29/29 verde** (19 RLS + 10 navegação).
- Dados **DEMO —** permanecem no banco (regra do `CLAUDE.md`) para visualização incremental. Há **1 solicitação de lote de teste** (status `aprovada`, "Atribuição em massa — Dados") no histórico da fila-admin, criada na verificação do ciclo Secretária→Admin — inofensiva; remover só se incomodar.
- Deploy é **manual** (build + FTP via `docs/deploy.md`; `.env.deploy` gitignored). Convenção de preview isolado: `--base=/preview-usabilidade-01/` → subpasta FTP própria + `.htaccess` com `RewriteBase` ajustado + `basename: import.meta.env.BASE_URL` no router (já implementado).

---

## 2. Etapa 02 — Convênio + Motor Financeiro (o que fazer agora)

Objetivo geral: **convênio girando + dinheiro cobrado e conciliado.** Gerar `HANDOFF_UPGRADE` ao final. Modo predominante: **[Manual] + [Goal]** — UI por `/goal`; funções SQL `security definer` e conciliação em **Manual estrito**.

As telas-alvo hoje são `Placeholder` (não há `src/features/` para elas): **Parceiros, Benefícios, Serviços (além do QR público), Financeiro, Jurídico.**

Os objetos SQL já existem no schema da Fase 0 (tabelas `parceiros`, `recepcionistas`, `beneficios`, `solicitacoes_servico`, `faturas`, `repasses`; RPCs `fn_titular_bloqueado`, `fn_dados_guia_publica`, `fn_registrar_checkin`, `fn_parceiro_id`; views `v_fila_parceiro`, `v_base_calculo_trabalhador`, `v_mensalidade_titular`, `v_relatorio_convencao`; funções
`fn_reclassificar_convencao` e as `fn_gerar_*`). A Etapa 02 é majoritariamente **frontend + as funções de geração de cobrança da 02.6**.

### Subetapas (ordem, modo, LLM sugerida — de `plano_fases.md`)

| Subetapa | Escopo | Modo | LLM |
|---|---|---|---|
| **02.1** | Parceiros + recepcionistas (PIN com **hash**) + catálogo `beneficios` (por nível mínimo) | [Goal]+[Manual] | Sonnet→Opus |
| **02.2** | Solicitações de serviço + guia A4 com QR + página pública `/guia/:token` + check-in com PIN | [Goal]+[Manual] | Opus |
| **02.3** | Portal do parceiro: fila (`v_fila_parceiro`, **sem CPF**) + confirmação em lote mensal | [Goal]+[Manual] | Sonnet |
| **02.4** | Telas financeiro: faturas (incl. excepcionais: multa/acordo/taxa) + guias de pagamento | [Manual] | Sonnet |
| **02.5** | `v_relatorio_convencao` + "Executar organização interna" (`fn_reclassificar_convencao`) | [Manual estrito] | Opus |
| **02.6** | **Motor de cobrança** (`fn_gerar_faturas_*`, `fn_gerar_guias`) + e-mails de guias via n8n | [Manual estrito] | Opus |

**Sugestão de ponto de partida:** Subetapa **02.1** (menor risco, destrava o catálogo e o vocabulário do convênio).

### Critérios de aceite da Etapa 02

1. Ciclo real de solicitação até **check-in por QR em celular físico** na sede.
2. **Primeira geração mensal completa** (faturas → guias → e-mails) em empresa piloto.
3. **Conciliação guia = Σ faturas exata**; vencimento geração + 30; idempotência garantida (`unique (trabalhador_id, tipo, competencia)` em `faturas`).

---

## 3. Regras invioláveis que valem na Etapa 02 (não violar)

- **Motor financeiro é sensível:** funções SQL de geração de cobrança (`security definer`, guarda de Admin) **NÃO rodam por `/goal`** — Manual estrito, com aprovação explícita. Duplo clique não pode duplicar cobrança.
- **`service_role` só em n8n/Edge Functions**, jamais no frontend (anon key only).
- **Vocabulário canônico:** `beneficios` = catálogo (oferta) · `solicitacoes_servico` = "carrinho" (demanda que vira guia). Respeitar em nomes de telas e código.
- **PIN de recepcionista** sempre com **hash**, nunca em texto puro.
- **`v_fila_parceiro` nunca expõe CPF** — o portal do parceiro só vê os próprios via `fn_parceiro_id()`.
- **Boletos individuais v1 sem API bancária** (registrar `boleto_url`/ `boleto_codigo` + e-mail via n8n). Integração bancária com baixa automática é Etapa 04.
- **Reclassificação/organização interna** é ato deliberado e **idempotente** (`reclassificada_em`); **Ouro com carta intocado**.
- Toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack; componentes não chamam supabase-js direto. A segurança real é RLS + triggers; o front só traduz erros pelo mapa central (`lib/mensagens.ts`).
- Textos em pt-BR; identidade visual por `docs/design-tokens.md`; transparência total de erros/limitações.

---

## 4. Padrões já estabelecidos para reaproveitar (evitar retrabalho)

- **Mestre-detalhe same-page:** `ListaEmpresasPage.tsx` / `ListaTrabalhadoresPage.tsx` (grid `DataTable` + painel de detalhe na mesma página, seleção por estado local). Usar isso para reestruturar **Parceiros** (contêineres Recepcionistas / Benefícios do Parceiro — já no backlog do `CLAUDE.md`).
- **Acordeões:** `components/ui/accordion.tsx` + `DetalheTrabalhador.tsx`.
- **DataTable** com seleção múltipla, densidade externa e `onExportar` (CSV via `lib/csv.ts`); **restringir Exportar CSV a Admin** nas telas novas também.
- **Formulários:** `EntityForm` (react-hook-form + zod) + `Dialog`; confirmação via `ConfirmDialog` / `ConfirmarEdicaoDialog`; erros via `mensagemErro`.
- **Fila de aprovação da Secretária:** `fila-admin/api.ts` (`useCriarSolicitacaoAdmin`, `useCriarSolicitacaoLote`, `executarOperacao`). Se a Etapa 02 der à Secretária operações fora da sua autonomia RLS, reutilizar esse fluxo — **estender `TABELAS_EXECUTAVEIS`/`executarOperacao`**, sem inventar caminho paralelo.
- **QR:** `qrcode.react`; página pública `/guia/:token` já existe (`servicos/GuiaPublicaPage.tsx`) consumindo `fn_dados_guia_publica`.

---

## 5. Backlog e vigilâncias herdadas (ver `CLAUDE.md` para o texto completo)

- **Exportar CSV** em Jurídico/Parceiros/Benefícios/Solicitações quando essas telas nascerem (mesmo padrão `DataTable` + `lib/csv.ts`, **Admin only**).
- **Faturas/Solicitações/Atendimentos** na ficha do trabalhador: acordeões já criados, vazios — preencher com conteúdo real na Etapa 02 mantendo o acordeon.
- **Catálogo geral de Benefícios** (`/beneficios`) e **reestruturação de Parceiros** em mestre-detalhe = escopo da própria Subetapa 02.1.
- **Botões "Novo atendimento/parceiro/recepcionista/benefício"** nascem junto das telas, no padrão visual já usado ("Nova empresa"/"Novo estabelecimento").
- **Visão anual de cartas de oposição** (`/cartas` + export) — adiada para o **final do roteiro** (decisão de Maxwell), não antecipar.
- **Segurança:** `auth_leaked_password_protection` (HaveIBeenPwned) segue **DESATIVADO** (recurso do Supabase pago). Ativar ao migrar de plano e conferir com `get_advisors`. Toda sessão que tocar em Auth/segurança deve lembrar Maxwell.

---

## 6. Suíte de testes contínua (rodar em toda etapa)

`npm run test` deve permanecer verde. Além da matriz RLS e navegação já cobertas, a Etapa 02 acrescenta cenários a vigiar: triggers de negócio (nível mínimo do benefício, bloqueio por inadimplência, guarda do parceiro, orientação livre para Bronze), máquina de estados do check-in (a partir de `solicitada` e `pendente_confirmacao`; guia já processada; PIN inválido), cálculos (piso + teto R$ 100, mensalidade com mix de beneficiados) e geração financeira (idempotência, conciliação guia = Σ faturas, vencimento geração + 30).

---

**Pronto para começar.** Sugestão: abra com a Subetapa 02.1 via `/goal`.