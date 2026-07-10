# CRM SINDCOM

CRM do **Sindicato dos Empregados no Comércio de Passos e Região (MG)** — gestão de trabalhadores em três níveis de proteção (Bronze/Prata/Ouro), empresas e estabelecimentos, convenções coletivas (CCTs), convênio de benefícios com parceiros e controle financeiro.

> **Repositório privado.** Contém regras de negócio e, em produção, dá acesso a dados pessoais protegidos pela LGPD. Não tornar público, não versionar `.env`, não commitar dados reais.

## Como este repositório funciona

O blueprint completo está aprovado e versionado aqui. **A arquitetura não se redesenha — se implementa.** O desenvolvimento é feito via Claude Code, que segue as instruções de [`CLAUDE.md`](./CLAUDE.md).

```
.
├── CLAUDE.md                    # Instruções de trabalho para o Claude Code (leia primeiro)
├── README.md                    # Este arquivo
├── docs/
│   └── design-tokens.md         # Identidade visual (cores, tipografia, tom)
├── specs/
│   ├── plano_fases.md           # Fases, escopos e critérios de aceite
│   ├── frontend.md              # Stack, mapa de telas, componentes, pastas
│   ├── dashboard.md             # KPIs, gráficos, mapa, dicas estratégicas
│   └── importacao.md            # Fluxo de importação/exportação CSV
├── sql/
│   ├── 01_schema.sql            # Schema completo (fonte de verdade das regras)
│   ├── 02_seed_municipios.sql   # 5.570 municípios (29 da base territorial flagados)
│   ├── 03_rls.sql               # Políticas de Row Level Security por role
│   └── 04_dashboard.sql         # Views, motor de dicas e rotinas automáticas
└── src/                         # Aplicação (criada pelo Claude Code a partir da Fase 0)
```

## Stack

React 18 · TypeScript · Vite · vite-plugin-pwa · Tailwind CSS + shadcn/ui · TanStack Query/Table · react-hook-form + zod · Recharts · Leaflet · supabase-js v2 · Supabase (Postgres + Auth + RLS + pg_cron) · n8n (e-mails e webhooks) · Hostgator (hospedagem do PWA).

## Setup do banco (uma vez)

1. Criar projeto Supabase **isolado** (região `sa-east-1`).
2. SQL Editor, na ordem — cada arquivo deve terminar **sem erro** antes do próximo: `sql/01_schema.sql` → `sql/02_seed_municipios.sql` → `sql/03_rls.sql` → `sql/04_dashboard.sql`
3. Habilitar a extensão `pg_cron` e rodar os `cron.schedule` comentados no final do `04_dashboard.sql`.
4. Rodar `NOTIFY pgrst, 'reload schema';`
5. Criar os usuários no Auth e as linhas correspondentes em `perfis` (roles: admin, presidente, secretaria, juridico, parceiro).

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev            # servidor de desenvolvimento
npm run build          # tsc --noEmit + build de produção (gera dist/)
```

### Testes RLS (portão da Fase 0)

A suíte valida a matriz de `03_rls.sql` com 6 atores (5 papéis + anon), fazendo login
real via supabase-js. Requer um `.env.test` (gitignored) com as credenciais dos usuários
de teste:

```bash
# .env.test  (não versionar)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
TEST_USER_PASSWORD=...
TEST_ADMIN_EMAIL=...   TEST_PRESIDENTE_EMAIL=...   TEST_SECRETARIA_EMAIL=...
TEST_JURIDICO_EMAIL=...   TEST_PARCEIRO_EMAIL=...
```

```bash
npm run test:rls
```

Regra de portão: **nenhuma tela real antes da suíte de testes RLS 100% verde** (Fase 0).

## Deploy (Hostgator)

```bash
npm run build
```

Subir **todo** o conteúdo de `dist/` para a pasta do subdomínio `crm.sindcompassos.org` (cPanel/FTP). O `.htaccess` de SPA fallback + cache já vive em `public/.htaccess` e é copiado para `dist/` no build — nada a ajustar à mão (garanta que o FTP envie arquivos ocultos). HTTPS obrigatório (AutoSSL) — PWA não instala sem ele.

## Fases

| Fase | Entrega | Status |
|---|---|---|
| 0 | Fundação: banco, auth, shell, suíte RLS | ✅ concluída · suíte RLS verde · no ar em crm.sindcompassos.org |
| 1 | MVP cadastral (Denise operando) | ⬜ |
| 2 | Convênio + motor financeiro | ⬜ |
| 3 | Dashboard, integrações (site + agente WhatsApp) | ⬜ |
| 4 | Backlog pós-MVP (API bancária, auto-aprovações) | ⬜ |

Detalhes, critérios de aceite e riscos: [`specs/plano_fases.md`](./specs/plano_fases.md).
