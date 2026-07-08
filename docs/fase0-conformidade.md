# Fase 0 — Relatório de conformidade + plano da metade-código

> Diagnóstico produzido antes de escrever qualquer código. Verifica que o schema
> aplicado no Supabase corresponde aos arquivos SQL do repositório e define o plano
> da **metade-código** da Fase 0 (skeleton React + suíte de testes RLS).
> Regra inviolável: nenhuma tela é desenvolvida antes de a suíte RLS estar 100% verde.

Projeto Supabase verificado: `vcswvscjqifelslsdjth` (Sindcom CRM · sa-east-1 · Postgres 17).

---

## 1. Relatório de conformidade

**Veredito: schema aplicado === arquivos SQL. Conformidade estrutural total.**

| Item | Esperado (SQL) | No banco | OK |
|---|---|---|---|
| Enums | 15 (`01_schema` §1) | 15, valores e ordem idênticos (bronze<prata<ouro etc.) | ✅ |
| Tabelas `01_schema` | 26 | 26, todas com RLS habilitado | ✅ |
| Tabelas `04_dashboard` | `configuracoes`, `eventos_nivel`, `snapshots_dashboard` | 3 presentes, RLS on | ✅ |
| Funções | fn_* do 01 + 03 + 04 | todas presentes (fn_role, fn_eh, fn_parceiro_id, fn_titular_bloqueado, fn_valida_*, fn_guarda_parceiro_solicitacao, fn_dados_guia_publica, fn_registrar_checkin, fn_reclassificar_convencao, fn_snapshot_dashboard, fn_evoluir_solicitacoes, fn_marcar_*, fn_registra_evento_nivel, fn_config…) | ✅ |
| Políticas RLS | matriz do `03_rls` | contagem por tabela bate (4 CRUD nas de negócio, 2 nas de referência, políticas especiais de perfis/notificações/solic_admin/config/eventos/snapshots) | ✅ |
| Triggers | updated_at + auditoria + negócio | todos presentes (valida_solicitacao, valida_atendimento, guarda_parceiro, notifica_solic_admin, evento_nivel) | ✅ |
| Views | v_base_calculo, v_mensalidade, v_fila_parceiro, v_relatorio_convencao, v_dash_* | 11 views presentes | ✅ |
| Extensões | pg_trgm, pgcrypto, pg_cron | instaladas | ✅ |
| pg_cron | F1–F4 | 4 jobs `active` (evoluir-solicitacoes, guias-em-atraso, boletos-inadimplentes, snapshot-dashboard) | ✅ |
| PostgREST cache | NOTIFY reload | API enxerga todas as tabelas/RPCs | ✅ |
| Perfis | 5 (1/role) | Maxwell(admin), Davi(presidente), Denise(secretaria), Adenilson(juridico), Ana(parceiro) — todos ativos, ligados a auth.users | ✅ |
| Parceiro-teste | 1 | 1 (Ana Agent) | ✅ |
| municipios | 5.570 / 29 base | 5.570 linhas, 29 base_territorial, 1 sede | ✅ |

### Gaps e observações (não bloqueiam a metade-código)

1. **`codigo_rfb` de MG = 0 preenchidos** e tabelas de referência RFB
   (`naturezas_juridicas`, `qualificacoes_responsavel`, `cnaes`, `motivos_situacao_cadastral`)
   **vazias**. É o item de infra "carga RFB + de-para TOM→IBGE" (`importacao.md` §2), fora da
   metade-código, porém é **critério de aceite da Fase 0** ("codigo_rfb resolvido para 100% dos
   municípios de MG"). → Pendência de infra a resolver separadamente.
2. **`assets/` com logos ausente** — `docs/design-tokens.md` §5 referencia `logo_vertical.png`,
   `logo_horizontal_com_texto.png`, `logo_horizontal_sem_texto.png`, inexistentes no repo. O
   AppShell (header) e o ícone do PWA precisam deles. → Solicitar os arquivos.
3. **Advisors de segurança** (`get_advisors`): a maioria é *by design* — `v_fila_parceiro` é
   `security definer` de propósito (esconde CPF do parceiro). Hardening **opcional** (não previsto
   nos SQLs, decisão do Maxwell): `search_path` mutável em funções; `EXECUTE` a PUBLIC/anon em
   funções security-definer (o `03_rls` revoga de `anon`, não do PUBLIC); `pg_trgm` no schema
   public; proteção de senha vazada (HaveIBeenPwned) desligada no Auth.

### Decisões tomadas
- **Harness RLS:** Vitest + login real (supabase-js, signInWithPassword por role; anon sem login).
- **Credenciais de teste:** Maxwell fornece as senhas dos 5 usuários → `.env.test` (gitignored).
- **Deploy:** Hostgator, build estático + `.htaccess` SPA fallback (segue CLAUDE.md).

---

## 2. Plano da metade-código da Fase 0

Stack fixa (CLAUDE.md): React 18 + TS + Vite + vite-plugin-pwa · Tailwind + shadcn/ui ·
React Router v7 · TanStack Query v5 · react-hook-form + zod · supabase-js v2 (**anon key only**).

### Passo 1 — Scaffold
- Vite (react-ts) na raiz; deps da stack. Tailwind com tokens de `design-tokens.md` §4
  (cores, fontes Playfair/Lato, radius) + Google Fonts + CSS vars em `styles/`.
- shadcn/ui com tema sindcom (nada hardcoded fora dos tokens).
- vite-plugin-pwa: manifest + precache do shell; `/guia/:token` **fora** do precache.
- Estrutura de pastas conforme `frontend.md` §5.

### Passo 2 — Supabase + Auth
- `lib/supabase.ts` (cliente único, anon key do `.env`).
- `lib/auth.tsx` (contexto de sessão; carrega `perfis` uma vez).
- `lib/mensagens.ts` (mapa central `PostgrestError.message → texto PT-BR`, semeado com os erros
  dos triggers).

### Passo 3 — AppShell / RoleGate / navegação por role
- `RoleGate` (guard de rota e de elemento; rota negada → redirect + toast).
- `AppShell` (sidebar de config central filtrada por role; header com busca + NotificationBell stub).
- Rotas do `frontend.md` §2 como stubs; foco em provar o redirecionamento pós-login:
  `parceiro`→`/portal`, `juridico`→`/juridico`, demais→`/dashboard`. `/login` e `/recuperar-senha`
  funcionais (Supabase Auth).

### Passo 4 — Suíte de testes RLS (entregável crítico)
- Vitest + supabase-js; `.env.test` (gitignored) com as 5 senhas.
- 6 clientes: um por role (signInWithPassword) + anon. **Um assert por célula** da matriz do
  `03_rls.sql`, cobrindo o rodapé do arquivo e a suíte contínua do `plano_fases.md` (item 1):
  - Secretária: INSERT/DELETE **negado** nas 6 tabelas "CRU-baixa"; INSERT **permitido** em
    `solicitacoes_admin`, `vinculos`, `faturas`, `repasses`, `solicitacoes_servico`, `cartas`,
    `taxas/pisos/convencoes`.
  - Jurídico: SELECT amplo; INSERT só em `atendimentos_juridicos`; sem financeiro.
  - Presidente: leitura ampla, sem escrita em negócio.
  - Parceiro: SELECT só dos próprios via `fn_parceiro_id()`; UPDATE de status apenas;
    `v_fila_parceiro` sem CPF.
  - Anon: negado no que exige `authenticated`; **permitido** só nas RPCs públicas do QR.
  - Admin: baseline positivo (acesso pleno).
  - `solicitacoes_admin`: solicitante cancela a própria pendente; não altera analisadas; vê só as suas.
- Cada assert valida caminho permitido **e** negado. `npm run test:rls` → **100% verde** = aceite.

### Passo 5 — Deploy (Hostgator)
- `npm run build` → `dist/` + `.htaccess` (SPA fallback). Publicar em `crm.sindcompassos.org`;
  validar login/redirect de cada role. Documentar no README.

**Ordem:** 1→2→3 em paralelo com o 4; **Passo 5 só após a suíte 100% verde**. Telas reais (Fase 1)
começam depois disso.

---

## 3. Verificação de conclusão da Fase 0
1. `npm run test:rls` verde (log por ator/tabela/operação).
2. Login de cada um dos 5 usuários redireciona à área correta; rota negada → redirect + toast.
3. `/guia/:token` abre sem login e chama `fn_dados_guia_publica`.
4. `npm run build` gera `dist/`; Hostgator serve o SPA com refresh em rota profunda.

## Pendências que dependem do Maxwell
- Enviar os 3 logos para `assets/`.
- Fornecer as 5 senhas de teste para `.env.test`.
- Decidir se/quando rodar a carga RFB + `codigo_rfb` (infra) para fechar o aceite completo da Fase 0.
