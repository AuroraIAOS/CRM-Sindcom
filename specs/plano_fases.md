# CRM SINDCOM — Plano de Desenvolvimento em Fases

> Documento de sequenciamento para o Claude Code. Complexidade é dimensionada; prazo não — Maxwell dita o ritmo.
> Princípios: valor operacional o quanto antes (Denise cadastrando); risco técnico antecipado (RLS testado antes de qualquer tela); toda fase termina com critérios de aceite verificáveis.

---

## Fase 0 — Fundação · Complexidade: BAIXA

**Escopo**
- Projeto Supabase isolado do Sindcom; executar na ordem: `sql/01_schema.sql` → `02_seed_municipios.sql` → `03_rls.sql` → `04_dashboard.sql`.
- Habilitar `pg_cron` e agendar F1–F4 (comentários do `04_dashboard.sql`); rodar `NOTIFY pgrst, 'reload schema'`.
- Carga das tabelas de referência RFB + de-para TOM→IBGE (aba §2 de `importacao.md` — nesta fase pode ser via script, a tela vem na Fase 1).
- Criação dos perfis reais: Maxwell (admin), Davi (presidente), Denise (secretaria), Adenilson (juridico), 1 parceiro de teste.
- Skeleton React + Vite + TS + PWA deployado na Vercel (`crm.sindcompassos.org`); Supabase Auth funcionando; `AppShell` + `RoleGate` + navegação por role.
- **Suíte de testes RLS**: cada célula da matriz de permissões vira um assert (6 atores: 5 roles + anon).

**Aceite:** login de cada role redireciona corretamente; suíte RLS 100% verde; `municipios` com 5.570 linhas e 29 flagadas; `codigo_rfb` resolvido para 100% dos municípios de MG.

---

## Fase 1 — MVP cadastral · Complexidade: ALTA

**Escopo**
- Trabalhadores: lista (DataTable server-side) + ficha com abas (Dados · Vínculos · Beneficiados · Cartas · Faturas · Solicitações · Atendimentos — as duas últimas vazias até a Fase 2).
- Vínculos empregatícios (CRUD Denise), beneficiados, cartas de oposição (registro + visão anual).
- Empresas/estabelecimentos: leitura + update; vínculo com CCT.
- Convenções completas: CRUD + pisos por função + `taxas_convencao` + **data limite de oposição** + migração de estabelecimentos em lote.
- Fila de solicitações ao Admin (CRU-baixa da Denise): criação com payload, diff para o Admin, aprovação executa a operação real.
- Fila de aprovação de cadastros pendentes.
- Importação CSV completa (spec `importacao.md`) + exportação cru (Admin, logada) / mascarado.
- Notificações in-app + badge Realtime.

**Aceite:** (1) importação dos CSVs reais de empresas+estabelecimentos dos 29 municípios com relatório de rejeitadas; (2) ciclo completo: Denise cria trabalhador → fila-admin → Maxwell aprova → ficha com vínculo e nível correto; (3) carta registrada refletindo Bronze na ficha.

**Riscos:** gargalo do Admin na fila (medir tempo médio de aprovação desde o dia 1 — se doer, a válvula da Fase 4 é auto-aprovação por entidade); qualidade dos CSVs da Receita (mitigada pela política importa-válidas + relatório de rejeitadas).

---

## Fase 2 — Convênio + Motor Financeiro · Complexidade: ALTA

**Escopo**
- Parceiros + recepcionistas (gestão de PIN com hash) + catálogo `/beneficios`.
- Solicitações de serviço: form com pré-validação de nível/bloqueio (`fn_titular_bloqueado`), guia A4 com QR, página pública `/guia/:token`, check-in com PIN.
- Portal do parceiro: fila (`v_fila_parceiro`) + confirmação em lote mensal.
- Telas financeiro: faturas (incl. excepcionais: multa/acordo/taxa da CCT) e guias de pagamento.
- Relatório final da CCT (`v_relatorio_convencao`) + botão "Executar organização interna" (`fn_reclassificar_convencao`).
- **Motor de geração de cobranças** (abaixo) + e-mails via n8n (remetente `estrategico@sindcompassos.org`, template com identidade da skill `sindcom`).

### Motor de geração de cobranças (item 7 do fluxo de CCT)

Funções SQL a implementar (security definer, guarda de Admin, chamadas por botão ou cron):

| Função | Disparo | Efeito |
|---|---|---|
| `fn_gerar_faturas_contribuicao(convencao_id)` | Botão, pós-organização interna | 1 fatura `contribuicao_sindical`/ano por Prata e Ouro da CCT — valor da `v_base_calculo` (5% do piso, teto R$ 100), `forma_cobranca` = preferência do trabalhador, `data_vencimento` = geração + `dias_vencimento_boleto` |
| `fn_gerar_faturas_mensalidade(competencia)` | Cron mensal (dia 1) | 1 fatura `mensalidade_convenio` por Ouro aprovado — valor da `v_mensalidade_titular`, idem vencimento |
| `fn_gerar_guias(tipo, competencia)` | Cron (após a geração de faturas) | Agrupa faturas `holerite` sem repasse por empresa → cria a guia (`GP-`, valor = Σ faturas, status `previsto`, vencimento geração + 30) e vincula `faturas.repasse_id` |
| n8n `guia-email` | Guias `previsto` com PDF | E-mail ao RH (e-mail do estabelecimento matriz; fallback: contato validado pela Denise no 1º envio) → status `enviado` |

Resultado = a matriz do item 7: **boleto anual coletivo** (guia da empresa) · **boletos anuais individuais** · **boleto mensal coletivo** · **boletos mensais individuais**. Boletos individuais no v1: **sem API bancária** — registro de `boleto_url/codigo` + e-mail ao trabalhador via n8n; a integração bancária com baixa automática é Fase 4. Idempotência garantida pelo `UNIQUE (trabalhador, tipo, competencia)` — duplo clique não duplica cobrança.

**Aceite:** ciclo real de solicitação até check-in por QR em celular físico na sede; primeira geração mensal completa (faturas → guias → e-mails) em empresa piloto; conciliação guia = Σ faturas exata.

**Riscos:** e-mails de RH dos CSVs da Receita desatualizados (plano B: validação da Denise por empresa no primeiro envio); impressão da guia nas margens da impressora real.

---

## Fase 3 — Inteligência e Integrações · Complexidade: MÉDIA

**Escopo**
- Dashboard completo: 5 KPIs, 5 gráficos, mapa Leaflet coroplético (GeoJSON IBGE × `codigo_ibge`), 11 dicas estratégicas.
- Snapshots mensais ativos; primeiro histórico visível.
- Integração dos formulários do site: webhook n8n → service_role → `status_cadastro = 'pendente'` + notificação à Denise.
- PWA offline de leitura (TanStack persister em IndexedDB) + banner de dados desatualizados.
- **Agente WhatsApp passa a consumir o CRM**: RPC de nível/bloqueio por CPF substitui a lookup em Google Sheets — nasce a fonte única de verdade prometida desde o Produto 1.
- Tela `/configuracoes` (parâmetros + perfis).

**Aceite:** dashboard bate com queries manuais de conferência; formulário do site vira pendente em <1 min; agente identifica nível e bloqueio via CRM em produção.

---

## Fase 4 — Backlog pós-MVP (prioriza-se com dado real, não com opinião)

API bancária de boletos (geração + webhook de baixa, `origem_baixa = integracao`) · notificações WhatsApp para parceiros e RHs · regras de auto-aprovação na fila-admin (se o gargalo do Admin doer nos números) · RPC transacional de aprovação · fila de agenda/vagas dos parceiros (V2 do fluxo de solicitações) · otimizações conhecidas (select-wrap em `fn_eh` para relatórios full-table) · RAG/pgvector do agente.

---

## Sequência e dependências

| Fase | Complexidade | Depende de | Valor entregue |
|---|---|---|---|
| 0 | Baixa | Pacote SQL final | Banco seguro + app logável |
| 1 | Alta | Fase 0 | Denise operando: cadastros, CCTs, importação da base |
| 2 | Alta | Fase 1 | Convênio girando + dinheiro cobrado e conciliado |
| 3 | Média | Fase 2 (dashboard usa dados financeiros) | Gestão estratégica + integrações |
| 4 | Variável | Fase 3 + dados de uso | Refinamentos guiados por evidência |

## Suíte de testes contínua (roda em toda fase)

1. **RLS matrix** — 6 atores × todas as células da matriz (incl. secretária sem INSERT/DELETE nas 6 tabelas CRU-baixa).
2. **Triggers de negócio** — nível mínimo do benefício, bloqueio por inadimplência (contribuição×Prata, mensalidade×Ouro), beneficiado≠titular, guarda do parceiro, orientação livre para Bronze.
3. **Máquina de estados** — check-in a partir de `solicitada` e de `pendente_confirmacao`; guia já processada; PIN inválido.
4. **Cálculos** — piso por função + fallback geral, teto R$ 100, mensalidade com mix de beneficiados, override `salario_informado`.
5. **Organização interna** — 5.1/5.2/5.3, Ouro com carta intocado, idempotência (`reclassificada_em`), origem dos eventos.
6. **Importação** — DV de CPF/CNPJ, zeros do Excel, políticas de duplicata, proteção das flags de nível.
7. **Geração financeira** — idempotência, conciliação guia = Σ faturas, vencimento geração+30.

## Handoff para o Claude Code

Ordem de leitura no repositório: `CLAUDE.md` → `specs/plano_fases.md` (este) → `sql/01_schema.sql` → `sql/03_rls.sql` → `specs/frontend.md` → `specs/dashboard.md` + `sql/04_dashboard.sql` → `specs/importacao.md`. O seed (`sql/02_seed_municipios.sql`) executa-se, não se lê.
