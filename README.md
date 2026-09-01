# CRM SINDCOM

CRM do **Sindicato dos Empregados no Comércio de Passos e Região (MG)** — gestão de trabalhadores em três níveis de proteção (Bronze/Prata/Ouro), empresas e estabelecimentos, convenções coletivas (CCTs), convênio de benefícios com parceiros, controle financeiro, atendimento jurídico e a campanha de coleta externa de dados.

**Em produção:** [`crm.sindcompassos.org`](https://crm.sindcompassos.org) · **Site institucional:** [`sindcompassos.org`](https://sindcompassos.org)

> **Repositório privado.** Contém regras de negócio e dá acesso a dados pessoais protegidos pela LGPD. Não tornar público, não versionar `.env`, não commitar dados reais.

---

## Estado atual (2026-09-01)

**Oito etapas concluídas e no ar.** O sistema opera de verdade: a Denise cadastra, o motor financeiro emite guias, o dashboard lê dados reais, o convênio funciona com check-in por QR na sede, e o canal público de coleta recebe planilhas de contadores.

| | Em produção hoje |
|---|---|
| Empresas / estabelecimentos | **16.672** / **17.302** |
| Convenções coletivas | **27** |
| Escritórios de contabilidade mapeados | **951**, cobrindo **7.440** estabelecimentos |
| Tabelas / views no schema `public` | **37** / **15** |
| Suíte de testes | **272 testes, 0 falhas** |
| Tokens de coleta gerados | **9.189** — **0 disparados** (isso é a ETAPA 09) |

**A métrica que governa o momento:** *estabelecimentos com ao menos um trabalhador vinculado.* Ela saiu de **0 → 2**. A base é de **empresas**; a ETAPA 08 construiu o canal para convertê-la em base de **pessoas**, e a ETAPA 09 é quem vai usá-lo. Sem pessoas, nada do produto opera — não há a quem prestar serviço Prata, nem a quem oferecer o convênio Ouro, e o motor de cobrança não tem base de cálculo.

### Etapas

| Etapa | Entrega | Status |
|---|---|---|
| **00** | Fundação: banco, auth, shell, suíte RLS | ✅ no ar |
| **01** | MVP cadastral (Denise operando) | ✅ no ar |
| **02** | Convênio + motor financeiro (faturas → guias → e-mail) | ✅ no ar |
| **03** | Dashboard, formulário do site, agente WhatsApp | ✅ no ar |
| **04** | Fechamento do mapa de telas (jurídico, cartas) | ✅ no ar |
| **06** | Repovoamento da base real a partir da RFB | ✅ no ar |
| **07** | Portão de segurança adversarial | ✅ no ar — **5 falhas reais achadas e corrigidas** |
| **08** | Comunicação externa e coleta de dados | ✅ no ar — **3 falhas reais achadas e corrigidas** |
| **09** | **Execução das campanhas** (as 4 ondas de e-mail) | ⬜ **próxima** |
| **05** | Backlog pós-MVP (API bancária, auto-aprovações) | ⬜ adiada por decisão |

Detalhes, critérios de aceite e riscos: [`specs/plano_fases.md`](./specs/plano_fases.md).

---

## Leitura obrigatória, nesta ordem

O desenvolvimento é feito via **Claude Code**, e a ordem abaixo não é sugestão — várias horas já foram perdidas por pular o passo 1.

| # | Arquivo | Para quê |
|---|---|---|
| 0 | [`CLAUDE.md`](./CLAUDE.md) | Regras invioláveis de trabalho. **Leia primeiro.** |
| 1 | [`orientacoes.md`](./orientacoes.md) | **Armadilhas já vencidas.** 81 entradas no formato *problema · solução · como implantar*, cada uma com o comando que funcionou. Leia **antes de depurar qualquer coisa**. |
| 2 | [`specs/plano_fases.md`](./specs/plano_fases.md) | Etapas, escopos, critérios de aceite |
| 3 | [`sql/01_schema.sql`](./sql/01_schema.sql) | Modelo de dados = fonte de verdade das regras de negócio |
| 4 | [`sql/03_rls.sql`](./sql/03_rls.sql) | Matriz de permissões por papel |
| 5 | [`specs/frontend.md`](./specs/frontend.md) | Stack, mapa de telas, componentes, estrutura de pastas |

---

## Estrutura

```
.
├── CLAUDE.md                 # Instruções de trabalho (leia primeiro)
├── orientacoes.md            # Armadilhas já vencidas — o arquivo mais valioso do repo
├── specs/                    # plano_fases · frontend · dashboard · importacao
├── sql/                      # 01 → 23, aplicados em ordem (ver "Banco" abaixo)
├── src/
│   ├── app/                  # AppShell, RoleGate, router, nav
│   ├── features/             # 22 domínios — cada um com api.ts + telas
│   └── lib/                  # supabase, csv, formatação, mensagens de erro
├── supabase/functions/       # Edge Functions: formulario-filiacao · receber-remessa
├── tests/
│   ├── rls/                  # 16 suítes — a matriz de permissões, com login real
│   └── adversarial/          # 5 arquivos — os portões de segurança das ETAPAs 07 e 08
├── scripts/                  # carga da RFB, semeadura, geração de campanha
├── n8n/                      # workflows de e-mail e webhooks (+ runbook)
└── docs/                     # relatórios, runbooks, jurídico, copies, design-tokens
```

### Os 22 domínios de `src/features/`

`aprovacoes` · `auth` · `beneficios` · `cartas` · `cobertura` · `coleta` · `configuracoes` · `convencoes` · `dashboard` · `empresas` · `estabelecimentos` · `fila-admin` · `financeiro` · `importacao` · `juridico` · `municipios` · `notificacoes` · `parceiros` · `portal-parceiro` · `remessas` · `servicos` · `trabalhadores`

**Regra de arquitetura:** toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack nomeado. Componentes nunca chamam `supabase-js` diretamente.

### Telas

**Internas** (por papel): `/dashboard` · `/trabalhadores` · `/empresas` · `/convencoes` · `/cartas` · `/juridico` · `/parceiros` · `/beneficios` · `/servicos` · `/financeiro/faturas` · `/financeiro/guias` · `/aprovacoes` · `/fila-admin` · `/importacao` · `/remessas` · `/cobertura` · `/notificacoes` · `/configuracoes`

**Portal do parceiro:** `/portal` · `/portal/beneficios` · `/portal/recepcionistas`

**Públicas, sem login:** `/guia/:token` (QR do balcão) · `/enviar-dados/:token` (canal de coleta do contador)

---

## Stack

React 18 · TypeScript · Vite · vite-plugin-pwa · Tailwind CSS + shadcn/ui · TanStack Query v5 / Table v8 · react-hook-form + zod · Recharts · Leaflet · qrcode.react · papaparse · exceljs · supabase-js v2 · Supabase (Postgres + Auth + RLS + Storage + pg_cron) · n8n · Hostgator.

**Fixa — não trocar.** E **somente a anon key no frontend**: a `service_role` existe apenas dentro de Edge Functions e do n8n.

---

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev            # servidor de desenvolvimento
npm run build          # tsc --noEmit + build de produção (gera dist/)
npm run typecheck      # só a checagem de tipos
```

### Testes

```bash
npm run test           # suíte completa: RLS + adversarial (272 testes)
npm run test:rls       # só a matriz de permissões
```

A suíte faz **login real** via supabase-js com os 5 papéis + `anon`, e roda **contra o banco de produção** — é lá que a RLS que vale está no ar. Requer `.env.test` (gitignored):

```bash
VITE_SUPABASE_URL=...          VITE_SUPABASE_ANON_KEY=...
TEST_USER_PASSWORD=...
TEST_ADMIN_EMAIL=...           TEST_PRESIDENTE_EMAIL=...
TEST_SECRETARIA_EMAIL=...      TEST_JURIDICO_EMAIL=...
TEST_PARCEIRO_EMAIL=...
```

**Ataque destrutivo nunca roda em produção.** Os casos que escrevem, apagam ou consomem recurso são pulados a menos que `SINDCOM_ALVO=bench`, e o helper **recusa a carga** se o alvo pedido não for o alvo real — com o ref de produção cravado no código, não em variável de ambiente:

```bash
SINDCOM_ALVO=bench npm run test    # exige .env.bench apontando para o projeto descartável
```

> **Por que essa trava existe:** na ETAPA 07 a suíte **anunciava `alvo=BENCH` e batia em produção** — o Vitest carrega `.env.test` sozinho, antes dos helpers. Um ataque destrutivo com o guard esquecido teria rodado contra a base real. Está em `orientacoes.md` §2.20.

---

## Banco

Os arquivos de `sql/` são aplicados **em ordem numérica**, e cada um deve terminar sem erro antes do próximo. Do `05` em diante são incrementos por etapa — **não são idempotentes entre si, mas cada um é idempotente sozinho**.

| Arquivos | O que trazem |
|---|---|
| `01` – `04` | Schema, municípios, RLS, dashboard |
| `05` – `09` | Hardening, triggers, realtime, RLS do jurídico |
| `10` – `18` | Cobranças, PIN de recepcionista, e-mail de guias, agente WhatsApp, jurídico, cartas |
| `19` | **Hardening adversarial da ETAPA 07** — as 5 correções |
| `20` – `22` | Comunicação externa: 6 tabelas, bucket privado, cobertura |
| `23` | **Hardening adversarial da ETAPA 08** — as 3 correções |

Depois de aplicar: habilitar `pg_cron`, agendar as rotinas do fim do `04_dashboard.sql`, rodar `NOTIFY pgrst, 'reload schema';` e criar os usuários no Auth com as linhas correspondentes em `perfis`.

---

## Deploy

```bash
npm run build     # gera dist/
```

Enviar **todo** o conteúdo de `dist/` por FTP para o subdomínio. O `.htaccess` de SPA fallback vive em `public/` e é copiado no build — garanta que o FTP envie **arquivos ocultos**.

**Runbook completo, com o host FTP real, a armadilha da Cloudflare e a verificação pós-deploy: [`docs/deploy.md`](./docs/deploy.md).** O deploy é **manual** — `git push` não publica nada.

---

## Segurança

O projeto roda **dois portões adversariais** já executados, e ambos acharam falhas reais num sistema que estava com a suíte verde e o advisor limpo:

| Portão | Achados | Relatório |
|---|---|---|
| **ETAPA 07** | **5 falhas** — uma delas com a base empresarial inteira legível por qualquer anônimo | [`docs/RELATORIO_07_PORTAO_ADVERSARIAL.md`](./docs/RELATORIO_07_PORTAO_ADVERSARIAL.md) |
| **ETAPA 08** | **3 falhas** — inclusive a **raiz** do achado crítico da 07 | [`docs/RELATORIO_08_ADVERSARIAL.md`](./docs/RELATORIO_08_ADVERSARIAL.md) |

**O portão é obrigatório** antes de qualquer etapa nova, integração nova ou deploy que amplie a superfície exposta (`CLAUDE.md`). Comece pelos três lugares que a RLS não alcança: **view sem `security_invoker`**, **função exposta como RPC** e **endpoint público com `service_role`** — foi onde as 8 falhas se concentraram.

**Duas regras de método que valeram cada achado:**

- **Rode a varredura de catálogo, não releia migrations.** As 3 falhas da ETAPA 08 apareceram assim, antes do primeiro ataque escrito — e **duas delas não estão escritas em lugar nenhum**: são privilégios que o objeto ganha ao nascer.
- **Todo vermelho é hipótese até ser medido de novo.** Três "achados" da ETAPA 07 e três da 08 eram testes mal escritos.

**O merge nunca é decisão do Claude Code.** O trabalho acontece em branch, com projeto Supabase descartável para o que é destrutivo, e mesmo com tudo verde o relatório é entregue e a sessão **para**.

### Pendência vigiada

- **Proteção contra senhas vazadas (HaveIBeenPwned) desativada** — recurso do plano pago do Supabase, e o projeto roda no Free. Mitigação: política de senha forte no Auth. **Ativar assim que migrar de plano**; a nota em `CLAUDE.md` faz o Claude Code lembrar disso em toda sessão que toque em Auth.

---

## O que vem agora — ETAPA 09

A estrutura de coleta está pronta, provada e no ar: **9.189 tokens gerados, nenhum disparado.** A ETAPA 09 é quem os usa, em oito subetapas:

**9.00** tela de descadastramento (única de construção) → **9.0** pré-voo → **9.1** Onda 00, que prova tudo em caixas do próprio Maxwell → **9.2 a 9.5** as quatro ondas reais (89 → 248 → 613 → 8.236 destinatários) → **9.6** follow-up por telefone.

**Nenhuma onda sai com a anterior no vermelho**, e rejeição acima de 2% interrompe — insistir com volume maior só queima a base, e a base é finita e não se recompra.

Handoff para a próxima sessão: [`docs/handoff_etapa09.md`](./docs/handoff_etapa09.md).
