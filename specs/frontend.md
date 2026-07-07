# CRM SINDCOM — Arquitetura do Frontend (PWA)

> Documento de especificação para implementação via Claude Code.
> Depende do pacote SQL executado na ordem: `sql/01_schema.sql` → `02_seed_municipios.sql` → `03_rls.sql` → `04_dashboard.sql`.
> Identidade visual: aplicar integralmente `docs/design-tokens.md` (paleta, tipografia, logotipos, tom — derivado da skill `sindcom`).

---

## 1. Decisão de tecnologia

**Recomendação: React 18 + TypeScript + Vite + vite-plugin-pwa.**

| Critério | React + Vite | Next.js | SvelteKit |
|---|---|---|---|
| Natureza do app | ✅ SPA autenticada — ideal | ⚠️ SSR/SEO não agregam atrás de login | ✅ Adequado |
| Deploy | ✅ Estático puro (Vercel ou Hostgator) | ⚠️ Precisa de servidor Node ou `output: export` (perde metade do framework) | ✅ Estático possível |
| PWA | ✅ vite-plugin-pwa maduro | ⚠️ Configuração mais trabalhosa | ⚠️ Menos ferramental |
| Ecossistema p/ CRM (tabelas, forms, charts) | ✅ O maior | ✅ O mesmo | ⚠️ Menor |
| Manutenção futura via Claude Code | ✅ Máximo treinamento/documentação | ✅ Alto | ⚠️ Menor cobertura |

Hostgator serve o build estático sem custo adicional, mas a recomendação de hospedagem é **Vercel** (deploy por git push, previews, rollback) com domínio `crm.sindcompassos.org` via CNAME. O Hostgator fica como fallback sem mudança de código.

### Bibliotecas definidas

| Função | Biblioteca | Justificativa |
|---|---|---|
| Roteamento | React Router v7 | Padrão SPA, route guards por role |
| Dados/cache | TanStack Query v5 | Cache, retry, invalidação; base do offline de leitura |
| Tabelas | TanStack Table v8 | Paginação server-side, sort, filtros |
| Formulários | react-hook-form + zod | Validação tipada espelhando constraints do banco |
| UI | Tailwind CSS + shadcn/ui | Componentes acessíveis, temáveis com os tokens da skill `sindcom` |
| Gráficos | Recharts | Suficiente para o dashboard; leve |
| Mapa | Leaflet + GeoJSON IBGE | Reaproveita os polígonos dos 29 municípios já usados no site institucional |
| QR Code | qrcode.react | Gera o QR da guia no cliente |
| Impressão da guia | CSS `@media print` | Sem lib de PDF no v1 — a guia é uma rota de impressão A4 |
| CSV | papaparse | Parse no cliente com preview antes do upload |
| Backend | supabase-js v2 | Auth + PostgREST + Realtime; **anon key somente** — service_role jamais no frontend |

---

## 2. Mapa de telas

### 2.1 Rotas públicas (sem login)

| Rota | Tela | Função |
|---|---|---|
| `/guia/:token` | Guia digital + check-in | Página mobile-first do QR Code. Exibe dados via RPC `fn_dados_guia_publica`; formulário de check-in (atendido/recusado + justificativa opcional + PIN) via RPC `fn_registrar_checkin`. Nenhum acesso a tabelas. |
| `/login` | Login | Supabase Auth e-mail/senha. Pós-login: busca `perfis` → redireciona por role. |
| `/recuperar-senha` | Recuperação | Fluxo padrão Supabase Auth. |

### 2.2 Rotas autenticadas — área interna

Redirecionamento pós-login: `parceiro` → `/portal` · `juridico` → `/juridico` · demais → `/dashboard`.

| Rota | Tela | Roles | Função |
|---|---|---|---|
| `/dashboard` | Dashboard | admin, presidente, secretaria, juridico | KPIs, gráficos, mapa, dicas estratégicas (conteúdo filtrado por role — spec em `dashboard.md`) |
| `/trabalhadores` | Lista de trabalhadores | admin, presidente, secretaria, juridico | DataTable com filtros (nome, CPF, nível, município, status) |
| `/trabalhadores/:id` | Ficha do trabalhador | idem | Abas: Dados · Vínculos · Beneficiados · Cartas de Oposição · Faturas · Solicitações · Atendimentos. Botões de criação/exclusão viram solicitação ao Admin quando o role for secretaria |
| `/aprovacoes` | Fila de cadastros pendentes | admin, secretaria | `status_cadastro = 'pendente'` (formulários do site). Aprovar/rejeitar com observação = UPDATE (autonomia da Denise) |
| `/fila-admin` | Fila de solicitações ao Admin | todos (visões distintas) | Admin: analisa, vê payload/diff, aprova (executa operação + marca aprovada) ou rejeita. Demais roles: criam e acompanham as próprias; cancelam pendentes |
| `/empresas` | Empresas e estabelecimentos | admin, presidente, secretaria, juridico | Lista mestre-detalhe (empresa → estabelecimentos); vínculo com CCT |
| `/convencoes` | CCTs, pisos e taxas | admin, presidente, secretaria, juridico | CRUD de convenções (incl. **data limite de oposição**) + pisos por função + multas/taxas + ação em lote "migrar estabelecimentos" + **relatório final da CCT** (`v_relatorio_convencao`: contagens e lista CPF por nível e forma de pagamento, com export) + botão "Executar organização interna" (`fn_reclassificar_convencao`, exclusivo Admin) |
| `/parceiros` | Parceiros | admin, presidente, secretaria | Detalhe com abas: Dados · Benefícios · Recepcionistas (gestão de PIN) |
| `/beneficios` | Catálogo de benefícios | admin, presidente, secretaria | Visão transversal do catálogo de TODOS os parceiros: filtros por parceiro, categoria, nível mínimo, faixa de desconto, ativo/inativo. Criação/edição pela Secretária segue a regra CRU (baixa). Atalho "Solicitar" abre o form de solicitação já com o benefício selecionado |
| `/beneficios/:id` | Detalhe do benefício | admin, presidente, secretaria | Dados completos, valores particular×convênio (economia calculada), condições, histórico de solicitações do benefício e indicador de utilização (90d) |
| `/servicos` | Solicitações de serviço | admin, presidente (leitura), secretaria | Fila de demanda com filtro por status; botão "Nova solicitação" (form com validação de nível/bloqueio espelhando o trigger); fila de rejeitadas para análise |
| `/servicos/:id` | Detalhe da solicitação | idem | Linha do tempo de status + botão "Imprimir guia" (rota de impressão) |
| `/servicos/:id/guia` | Guia de encaminhamento | admin, secretaria | Layout A4 `@media print`: identidade Sindcom, dados, valores, QR Code do `token_publico` |
| `/financeiro/faturas` | Faturas | admin, presidente (leitura), secretaria | DataTable + baixa manual + criação excepcional (multa, acordo, taxa adicional) |
| `/financeiro/guias` | Guias de pagamento (repasses) | idem | Ciclo previsto → enviado → recebido/em atraso; reenvio de e-mail; conciliação valor guia × soma de faturas |
| `/cartas` | Cartas de oposição | admin, presidente, secretaria, juridico | Visão por ano-base: quem entregou, quem falta, exportação da lista de reclassificação |
| `/juridico` | Atendimentos jurídicos | admin, presidente (leitura), secretaria (leitura), juridico | Lista + registro de atendimento (o gate de nível/bloqueio vem do trigger; UI mostra o motivo de recusa de forma amigável) |
| `/importacao` | Importar/Exportar CSV | admin | Spec detalhada em `importacao.md` |
| `/notificacoes` | Notificações | todos | Lista completa; badge no header via Realtime |
| `/configuracoes` | Usuários e sistema | admin | CRUD de perfis, vínculo parceiro↔usuário |

> **Distinção de vocabulário (canônica para todo o CRM):** `/beneficios` é o **catálogo** — os itens, descontos e vantagens ofertados pelas parcerias, disponíveis aos trabalhadores e seus beneficiados. `/servicos` é a fila de **solicitações** — o "carrinho" onde benefícios do catálogo são vinculados a um titular/beneficiado e viram guia de encaminhamento. As tabelas homônimas do schema (`beneficios` × `solicitacoes_servico`) seguem exatamente a mesma distinção.

### 2.3 Portal do Parceiro (mesmo app, role `parceiro`)

| Rota | Tela | Função |
|---|---|---|
| `/portal` | Fila do parceiro | Consome `v_fila_parceiro` (sem CPF). Filtros por status/período. Confirmação em lote: seleciona múltiplas `pendente_confirmacao` → marca executada/rejeitada (contra-referência mensal, obs. 4.2) |
| `/portal/beneficios` | Meus benefícios | Catálogo próprio (leitura) |
| `/portal/recepcionistas` | Meus recepcionistas | Leitura da própria equipe credenciada |

O menu lateral renderiza apenas as rotas do role (componente `RoleGate` + configuração central de navegação). Acesso direto a rota não permitida → redirect + toast.

---

## 3. Fluxos de navegação críticos

**Fluxo diário da Denise:** login → dashboard (badges: cadastros pendentes, rejeições de serviço a analisar) → `/aprovacoes` (aprova formulários do site) → `/servicos` (registra solicitações, imprime guias) → ficha do trabalhador conforme demanda. Criações/exclusões estruturais → `/fila-admin`.

**Fluxo do Admin (Maxwell):** notificação (badge/Realtime) → `/fila-admin` → análise do payload → aprovar (o frontend executa a operação real com a sessão admin e, em caso de sucesso, marca a solicitação como `aprovada`; falha = permanece pendente com erro exibido) → auditoria registra as duas ações.

**Fluxo do recepcionista (sem login):** escaneia QR da guia impressa → `/guia/:token` → confere dados → check-in atendido/recusado → digita PIN → confirmação visual. Estados de erro: guia já processada, PIN inválido, guia não encontrada.

**Fluxo mensal do parceiro:** login → `/portal` → filtro `pendente_confirmacao` → seleção em lote → confirmar. O trigger de guarda garante que nada além do status evolui.

---

## 4. Componentes principais (design system funcional)

| Componente | Descrição |
|---|---|
| `AppShell` | Layout com sidebar por role, header com busca global (trabalhador por nome/CPF) e `NotificationBell` |
| `DataTable` | Wrapper TanStack Table: paginação server-side (`.range()`), sort, filtros, densidade, export CSV (respeita RLS — exporta o que o role vê) |
| `EntityForm` | Form drawer/página com react-hook-form + zod; schemas espelham constraints do banco (CPF 11 dígitos, CNPJ, ENUMs) |
| `NivelBadge` | Bronze/Prata/Ouro com as cores da skill `sindcom` — usado em toda listagem de trabalhadores |
| `StatusBadge` | Status de solicitação, fatura, guia, cadastro — mapa central de cores |
| `KpiCard` / `ChartCard` | Blocos do dashboard (spec em `dashboard.md`) |
| `MapaMunicipios` | Leaflet + GeoJSON dos 29 municípios (join por `codigo_ibge`), coroplético por métrica selecionável |
| `GuiaPrint` | Guia A4: cabeçalho institucional, dados do interessado, serviço, valores particular×convênio (destaque da economia), QR Code, instruções ao recepcionista |
| `FilaSolicitacoesAdmin` | Cards com operação, tabela alvo, payload formatado (diff para UPDATE), justificativa, ações aprovar/rejeitar |
| `CsvImporter` | Dropzone → papaparse → preview com erros destacados → confirmação (`importacao.md`) |
| `SolicitacaoServicoForm` | Seleção titular/beneficiado → parceiro → benefício (filtrado por nível; bloqueios exibidos antes do submit) → data/hora |
| `RoleGate` | Guard de rota e de elemento (`<RoleGate roles={['admin']}>`) |

---

## 5. Estrutura de pastas

```
src/
├── app/                    # rotas (React Router) + AppShell
├── components/
│   ├── ui/                 # shadcn/ui customizado com tokens sindcom
│   └── shared/             # DataTable, badges, RoleGate, KpiCard...
├── features/
│   ├── trabalhadores/      # api.ts (queries) + components + hooks
│   ├── empresas/
│   ├── convencoes/
│   ├── parceiros/
│   ├── beneficios/         # catálogo (oferta) — distinto de servicos (demanda)
│   ├── servicos/           # inclui GuiaPrint e página pública do QR
│   ├── financeiro/
│   ├── cartas/
│   ├── juridico/
│   ├── fila-admin/
│   ├── importacao/
│   ├── dashboard/
│   └── portal-parceiro/
├── lib/
│   ├── supabase.ts         # cliente único (anon key)
│   ├── auth.tsx            # contexto de sessão + perfil/role
│   └── utils.ts            # máscaras CPF/CNPJ, moeda, datas
└── styles/                 # tokens da skill sindcom (CSS vars + Tailwind config)
```

Regra: toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack Query nomeado (`useTrabalhadores`, `useAprovarCadastro`...). Componentes não chamam supabase-js diretamente.

---

## 6. PWA e offline

- **vite-plugin-pwa** com precache do shell (JS/CSS/fonts/logo) — instalável em desktop e celular.
- **Offline de leitura:** TanStack Query + persister em IndexedDB. Dashboard e listas recentes abrem com o último snapshot + banner "dados de {timestamp} — reconectando". 
- **Sem mutações offline no v1.** Fila de escrita offline cria conflitos (aprovações, status) desproporcionais ao ganho — internet instável em Passos é intermitência de minutos, não dias. Ações de escrita offline mostram erro claro e pedem reconexão.
- Página `/guia/:token` fica fora do precache (sempre rede — status em tempo real).

## 7. Padrões de integração Supabase

- **Auth:** sessão supabase-js; contexto carrega `perfis` uma vez; role no client é UX — a segurança real é o RLS.
- **Realtime:** canal `postgres_changes` em `notificacoes` (filtro por destinatário) para o badge; canal em `solicitacoes_admin` para o Admin.
- **RPCs usadas:** `fn_dados_guia_publica`, `fn_registrar_checkin` (públicas); `fn_titular_bloqueado` (pré-validação de UX antes do submit de solicitação).
- **Erros de trigger** (nível insuficiente, bloqueio, guarda de colunas): interceptar `PostgrestError` e traduzir para mensagens amigáveis — tabela de mapeamento `message → texto UI` centralizada.
- **Jobs** (faturas, guias, reclassificação anual, evolução de status): fora do frontend — n8n/Edge Functions com service_role. O frontend apenas exibe resultados.

## 8. Riscos e pontos de atenção

1. **Aprovação na fila do Admin não é atômica** (operação real + marcação em duas chamadas). Mitigação v1: ordem fixa (executa → marca) e retry visual; se falhar entre as duas, a solicitação fica pendente e a reexecução acusa duplicidade pelas constraints UNIQUE. Válvula futura: RPC transacional por entidade.
2. **Schema cache do PostgREST:** após executar o pacote SQL completo, rodar `NOTIFY pgrst, 'reload schema'` (ou reiniciar a API no painel do Supabase) antes do primeiro acesso via supabase-js.
3. **Impressão da guia** deve ser testada na impressora real da sede (margens A4) — incluir margem de segurança de 10mm no layout.
