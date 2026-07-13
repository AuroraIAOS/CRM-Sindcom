# PLANO_E_CRITERIOS — CRM SINDCOM

> Documento **norteador** do ESTÁGIO PRÁTICO (lido pelo Claude CODE para dirigir os loops `/goal`).
> Reorganização do antigo `plano_fases.md` no formato rígido do Estágio Criativo — **Etapa → Subetapa**, com tags `[Modo] [Função] [LLM]` e, em cada subetapa, **Objetivo / Conclusão / Qualidade / Evidência** (+ teto de tentativas e escalonamento de LLM quando `[Goal]`).
> **Conteúdo original preservado.** Nenhuma tabela, coluna, função, trigger, view ou cron foi renomeada — apenas dois identificadores foram alinhados ao schema **já implantado** (marcados com `※` nas notas de rodapé).
> Adaptação de projeto *brownfield*: em vez das 3 etapas genéricas do template greenfield, mantêm-se as **Fases 0–4 reais** do projeto como Etapas — a Fase 0 já está concluída e no ar.
> Complexidade é dimensionada; prazo não — Maxwell dita o ritmo.

---

## Princípio-guia

Entregar um MVP em uma semana é sempre melhor que passar uma eternidade construindo algo surreal. Foco: **fatia vertical funcional (100% verde)** antes de qualquer sofisticação. Valor operacional o quanto antes (Denise cadastrando); risco técnico antecipado (RLS testado antes de qualquer tela); toda etapa termina com critérios de aceite verificáveis.

---

## Idea lock (fechado — blueprint aprovado e versionado)

- **Problema/persona:** o Sindcom (Denise/secretaria como operadora primária; Maxwell/admin; Davi/presidente; Adenilson/jurídico; parceiros) precisa gerir ~24.500 trabalhadores do comércio em 3 níveis de proteção (Bronze/Prata/Ouro), empresas/estabelecimentos, CCTs, convênio de benefícios e cobranças — hoje sem fonte única de verdade.
- **Escopo do MVP (dentro):** banco seguro (RLS + triggers) → cadastro/importação (Fase 1) → convênio + motor financeiro (Fase 2) → dashboard + integrações site/agente WhatsApp (Fase 3).
- **Fora do MVP (depois):** API bancária de boletos, notificações WhatsApp para parceiros/RHs, auto-aprovação na fila-admin, RPC transacional de aprovação, fila de agenda/vagas dos parceiros, RAG/pgvector do agente (Fase 4).
- **Stack essencial v01:** React 18 + TS + Vite + vite-plugin-pwa · Tailwind + shadcn/ui · TanStack Query v5 / Table v8 · react-hook-form + zod · Recharts · Leaflet · qrcode.react · papaparse · supabase-js v2 (**anon key no front; service_role só em Edge Functions/n8n**) · Supabase (Postgres + Auth + RLS + pg_cron) · n8n · Hostgator.
- **Coração do modelo de dados:** trabalhadores (nível derivado das flags `recolhe_contribuicao_sindical` / `recolhe_mensalidade_convenio`) · empresas/estabelecimentos · convencoes + taxas_convencao + pisos · beneficios (catálogo) · solicitacoes_servico (carrinho→guia) · faturas/repasses (financeiro) · municipios (5.570, 29 na base territorial).
- **Restrições inegociáveis (compliance/ética/segurança):** RLS + triggers são a segurança real (o front só traduz erros do Postgres); importação CSV **nunca** altera `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio` ou `forma_pagamento_preferida` de registros existentes; repositório privado (LGPD); nenhum segredo commitado; textos de UI em pt-BR; identidade visual conforme `docs/design-tokens.md`; transparência total de erros.
- **Decisões pendentes:** WhatsApp API (BSP oficial vs Evolution) — decisão de Maxwell, não bloqueia; ativar `auth_leaked_password_protection` ao migrar para o Supabase pago.

---

# ESTÁGIO PRÁTICO (executado no Claude CODE)

## ETAPA 00 — FUNDAÇÃO · Complexidade: BAIXA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: banco seguro + app logável, com a suíte de testes RLS 100% verde antes de qualquer tela.
Modo predominante: [Manual Mode] (infra já pronta — metade-código executada).
Observações: infra da Fase 0 já aplicada (não recriar): projeto Supabase isolado, SQLs 01→04 aplicados, `pg_cron` agendado, `NOTIFY pgrst`, 5 perfis + 1 parceiro-teste. Deploy **Hostgator** (build estático + `.htaccess` SPA fallback) — **não Vercel**.※¹ Fechamento formal em `docs/fase0-conformidade.md`.

### Subetapa 00.1 — Conformidade schema aplicado × SQL do repo [Plan] [LLM: Sonnet]
Objetivo: provar que o schema no Supabase corresponde aos arquivos `sql/01→04`.
Conclusão: enums, tabelas, funções, políticas RLS, triggers, views, extensões e jobs `pg_cron` conferidos 1:1 (relatório em `docs/fase0-conformidade.md`).
Qualidade: conformidade estrutural total; gaps registrados, não escondidos.
Evidência: tabela de conformidade preenchida + advisors de segurança revisados.

### Subetapa 00.2 — Carga de referência RFB + de-para TOM→IBGE [Manual] [LLM: Sonnet]
Objetivo: resolver `codigo_rfb` para 100% dos municípios de MG.
Conclusão: `municipios` com 5.570 linhas, 29 `base_territorial`; `codigo_rfb` = 5.570/5.570 (MG 853/853); tabelas RFB (`cnaes`, `naturezas_juridicas`, `qualificacoes_responsavel`, `motivos_situacao_cadastral`) carregadas.
Qualidade: staging temporária removida ao fim; nenhuma alteração de schema.
Evidência: contagens por query + Passos = TOM 4957.

### Subetapa 00.3 — Skeleton React + Vite + TS + PWA (tokens Sindcom) [Manual] [LLM: Sonnet]
Objetivo: scaffold com Tailwind/shadcn temados por `docs/design-tokens.md` §4 e PWA (manifest + precache do shell; `/guia/:token` fora do precache).
Conclusão: `npm run build` gera `dist/` sem erro; estrutura de pastas conforme `specs/frontend.md` §5.
Qualidade: nada hardcoded fora dos tokens.
Evidência: build limpo + assets de marca em `public/assets/brand/` e ícones PWA.

### Subetapa 00.4 — Camada Supabase + Auth + mapa de erros [Manual] [LLM: Sonnet]
Objetivo: `lib/supabase.ts` (cliente único, anon key), `lib/auth.tsx` (sessão + `perfis`), `lib/mensagens.ts` (mapa `PostgrestError.message → pt-BR`).
Conclusão: login real por role funcionando; erros de trigger traduzidos.
Qualidade: componentes não chamam supabase-js direto.
Evidência: sessão carregada + toasts amigáveis.

### Subetapa 00.5 — AppShell + RoleGate + navegação por papel [Manual] [LLM: Sonnet]
Objetivo: guarda de rota/elemento; redirecionamento pós-login (`parceiro`→`/portal`, `juridico`→`/juridico`, demais→`/dashboard`); `/login` e `/recuperar-senha` funcionais.
Conclusão: cada role redireciona à área correta; rota negada → redirect + toast.
Qualidade: sidebar filtrada por role.
Evidência: teste de navegação/redirect (10 asserts) verde.

### Subetapa 00.6 — Suíte de testes RLS (portão da etapa) [Manual] [LLM: Opus]
Objetivo: transformar cada célula da matriz de `sql/03_rls.sql` em assert (6 atores: 5 roles + anon), com login real via supabase-js.
Conclusão: **`npm run test:rls` 100% verde** — secretária sem INSERT/DELETE nas 6 tabelas CRU-baixa; jurídico só INSERT em `atendimentos_juridicos`; presidente leitura ampla sem escrita; parceiro só os próprios via `fn_parceiro_id()`, `v_fila_parceiro` sem CPF; anon só nas RPCs públicas do QR; admin baseline positivo; `solicitacoes_admin` com regra de solicitante. **Regra de portão: nenhuma tela real antes disto.**
Qualidade: cada assert valida caminho permitido **e** negado.
Evidência: suíte 27/27 verde (17 RLS × 6 atores + 10 navegação) — log por ator/tabela/operação.

### Subetapa 00.7 — Hardening + deploy inicial (Hostgator) [Manual] [LLM: Sonnet]
Objetivo: aplicar `sql/05_hardening.sql` (idempotente) e publicar `dist/` em `crm.sindcompassos.org`.
Conclusão: `search_path` fixo em todas as `fn_*`; `EXECUTE` revogado de PUBLIC/anon com reconcessão cirúrgica; `pg_trgm` no schema `extensions`; SPA servido com refresh em rota profunda; HTTPS/AutoSSL ativo (PWA instalável).
Qualidade: único item aceito como pendência — `auth_leaked_password_protection` (plano pago), vigiado em `CLAUDE.md`/`README.md`.
Evidência: runbook `docs/deploy.md` + app no ar.

**Aceite da Etapa 00 (cumprido):** login de cada role redireciona corretamente; suíte RLS 100% verde; `municipios` com 5.570 linhas e 29 flagadas; `codigo_rfb` resolvido para 100% dos municípios de MG.

---

## ETAPA 01 — MVP CADASTRAL · Complexidade: ALTA · Status: ⬜ ATIVA

Objetivo geral: Denise operando — cadastros, vínculos, CCTs e importação da base real. Gerar HANDOFF_BUILD ao final.
Modo predominante: [Manual Mode] + [Goal] (um `/goal` por subetapa de baixo risco).
Observações: subetapas que tocam RLS/triggers/migração em lote ficam **fora do `/goal`** (Manual estrito, aprovação explícita). Toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack; commit comentado + push ao fim de cada subetapa.

### Subetapa 01.1 — Trabalhadores: lista + ficha com abas [Goal] [Manual] [LLM: Sonnet]
Objetivo: DataTable server-side + ficha com abas (Dados · Vínculos · Beneficiados · Cartas · Faturas · Solicitações · Atendimentos — as duas últimas vazias até a Etapa 02).
Conclusão: lista pagina/filtra no servidor; ficha abre por trabalhador com nível derivado correto (Bronze/Prata/Ouro) a partir das flags — **nível é computado, nunca editável**.
Qualidade: nível nunca escrito à mão; abas vazias sinalizadas, não quebradas.
Evidência: print da ficha + query conferindo nível vs flags.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; escalar p/ Opus na 3ª.
Se esgotar: parar e emitir relatório curto (problema + causas + 2-3 alternativas).

### Subetapa 01.2 — Vínculos, beneficiados e cartas de oposição [Goal] [Manual] [LLM: Sonnet]
Objetivo: CRUD de vínculos empregatícios (Denise), beneficiados, e registro de cartas de oposição (+ visão anual).
Conclusão: carta registrada reflete Bronze na ficha; beneficiado ≠ titular respeitado pelo trigger.
Qualidade: mensagens de trigger traduzidas pelo mapa central.
Evidência: ciclo carta→Bronze na ficha + rejeição de beneficiado=titular.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 01.3 — Empresas/estabelecimentos + Convenções (CCT) [Manual] [LLM: Opus]
Objetivo: leitura/update de empresas/estabelecimentos e vínculo com CCT; CRUD completo de convenções + pisos por função + `taxas_convencao` + **data limite de oposição** + migração de estabelecimentos em lote.
Conclusão: convenção criada com pisos e taxas; migração em lote move estabelecimentos sem violar RLS/triggers.
Qualidade: migração em lote é ato deliberado e auditável (Manual, sem `/goal`).
Evidência: CCT completa + relatório da migração em lote.

### Subetapa 01.4 — Fila de solicitações ao Admin + aprovação de cadastros [Manual] [LLM: Opus]
Objetivo: CRU-baixa da Denise → `solicitacoes_admin` com payload + diff para o Admin; aprovação executa a operação real. Fila de aprovação de cadastros pendentes.
Conclusão: ciclo completo — Denise cria trabalhador → fila-admin → Maxwell aprova → ficha com vínculo e nível correto.
Qualidade: nada destrutivo sem aprovação; medir tempo médio de aprovação desde o dia 1 (input p/ a válvula de auto-aprovação da Etapa 04).
Evidência: diff exibido ao Admin + operação real pós-aprovação.

### Subetapa 01.5 — Importação/exportação CSV [Goal] [Manual] [LLM: Sonnet]
Objetivo: importação CSV completa (spec `specs/importacao.md`) + exportação crua (Admin, logada) / mascarada.
Conclusão: importação dos CSVs reais de empresas+estabelecimentos dos 29 municípios **com relatório de rejeitadas**; DV de CPF/CNPJ validado; zeros do Excel preservados; políticas de duplicata aplicadas.
Qualidade: **importação nunca altera** `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio` nem `forma_pagamento_preferida` de registros existentes (política importa-válidas).
Evidência: relatório de rejeitadas + prova de que as flags de nível ficaram intocadas.
Esforço máximo do /goal: 4 tentativas.
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na 4ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 01.6 — Notificações in-app + badge Realtime [Goal] [Manual] [LLM: Haiku]
Objetivo: notificações in-app com badge via Realtime.
Conclusão: nova solicitação/pendência gera notificação à Denise em tempo real.
Qualidade: badge zera ao ler; sem polling desnecessário.
Evidência: print do badge reagindo a evento Realtime.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Haiku nas 2 primeiras; Sonnet na 3ª.
Se esgotar: parar e emitir relatório curto.

**Aceite da Etapa 01:** (1) importação dos CSVs reais dos 29 municípios com relatório de rejeitadas; (2) ciclo completo Denise→fila-admin→Maxwell aprova→ficha com vínculo e nível correto; (3) carta registrada refletindo Bronze na ficha.
**Riscos:** gargalo do Admin na fila (medir tempo médio desde o dia 1 — válvula é auto-aprovação por entidade na Etapa 04); qualidade dos CSVs da Receita (mitigada por importa-válidas + relatório de rejeitadas).

---

## ETAPA 02 — CONVÊNIO + MOTOR FINANCEIRO · Complexidade: ALTA · Status: ⬜

Objetivo geral: convênio girando + dinheiro cobrado e conciliado. Gerar HANDOFF_UPGRADE ao final.
Modo predominante: [Manual Mode] + [Goal] (UI por `/goal`; funções SQL `security definer` e conciliação em Manual estrito).
Observações: motor financeiro é sensível — funções de geração de cobrança **não** rodam por `/goal`. E-mails via n8n (remetente `estrategico@sindcompassos.org`, template com identidade da skill `sindcom`).

### Subetapa 02.1 — Parceiros + recepcionistas + catálogo de benefícios [Goal] [Manual] [LLM: Sonnet]
Objetivo: gestão de parceiros e recepcionistas (PIN com hash) + catálogo `beneficios`.
Conclusão: PIN armazenado com hash; catálogo lista ofertas por nível mínimo.
Qualidade: `beneficios` = catálogo (oferta); vocabulário canônico respeitado.
Evidência: PIN nunca em texto puro + catálogo filtrando por nível.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.2 — Solicitações de serviço + guia A4 com QR + página pública + check-in [Goal] [Manual] [LLM: Opus]
Objetivo: form com pré-validação de nível/bloqueio (`fn_titular_bloqueado`), guia A4 com QR, página pública `/guia/:token`, check-in com PIN.
Conclusão: ciclo real de solicitação até **check-in por QR em celular físico** na sede; `solicitacoes_servico` = carrinho que vira guia; máquina de estados respeita check-in a partir de `solicitada` e `pendente_confirmacao`, rejeita guia já processada e PIN inválido.
Qualidade: orientação livre para Bronze; guarda do parceiro no trigger.
Evidência: check-in real filmado/print + `fn_dados_guia_publica` respondendo a anon.
Esforço máximo do /goal: 4 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus nas 2 últimas.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.3 — Portal do parceiro [Goal] [Manual] [LLM: Sonnet]
Objetivo: fila (`v_fila_parceiro`) + confirmação em lote mensal.
Conclusão: parceiro vê apenas os próprios (sem CPF) e confirma em lote.
Qualidade: `v_fila_parceiro` nunca expõe CPF.
Evidência: fila filtrada por `fn_parceiro_id()` + confirmação em lote.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.4 — Telas financeiro (faturas + guias de pagamento) [Manual] [LLM: Sonnet]
Objetivo: faturas (incl. excepcionais: multa/acordo/taxa da CCT) e guias de pagamento.
Conclusão: fatura excepcional criada e refletida na ficha; guia lista faturas agregadas.
Qualidade: valores conferem com as views de base de cálculo.
Evidência: fatura excepcional + guia na tela.

### Subetapa 02.5 — Relatório da CCT + organização interna [Manual] [LLM: Opus]
Objetivo: `v_relatorio_convencao` + botão "Executar organização interna" (`fn_reclassificar_convencao`).
Conclusão: organização interna 5.1/5.2/5.3 com **Ouro com carta intocado**; idempotência via `reclassificada_em`; origem dos eventos registrada.
Qualidade: reclassificação é ato deliberado e idempotente (Manual, sem `/goal`).
Evidência: relatório da CCT + prova de idempotência (2ª execução não duplica).

### Subetapa 02.6 — Motor de geração de cobranças + e-mails n8n [Manual] [LLM: Opus]
Objetivo: implementar as funções SQL (security definer, guarda de Admin, disparo por botão ou cron) e os e-mails de guias via n8n.
Conclusão: matriz de cobrança do item 7 gerada — boleto anual coletivo (guia da empresa), boletos anuais individuais, boleto mensal coletivo, boletos mensais individuais; **conciliação guia = Σ faturas exata**; vencimento geração+30; idempotência garantida.
Qualidade: boletos individuais v1 **sem API bancária** (registro de `boleto_url`/`boleto_codigo`※² + e-mail via n8n); duplo clique não duplica cobrança.
Evidência: primeira geração mensal completa (faturas → guias → e-mails) em empresa piloto + conciliação exata.

| Função | Disparo | Efeito |
|---|---|---|
| `fn_gerar_faturas_contribuicao(convencao_id)` | Botão, pós-organização interna | 1 fatura `contribuicao_sindical`/ano por Prata e Ouro da CCT — valor da `v_base_calculo_trabalhador`※³ (5% do piso, teto R$ 100), `forma_cobranca` = preferência do trabalhador, `data_vencimento` = geração + `dias_vencimento_boleto` |
| `fn_gerar_faturas_mensalidade(competencia)` | Cron mensal (dia 1) | 1 fatura `mensalidade_convenio` por Ouro aprovado — valor da `v_mensalidade_titular`, idem vencimento |
| `fn_gerar_guias(tipo, competencia)` | Cron (após a geração de faturas) | Agrupa faturas `holerite` sem repasse por empresa → cria a guia (`GP-`, valor = Σ faturas, status `previsto`, vencimento geração + 30) e vincula `faturas.repasse_id` |
| n8n `guia-email` | Guias `previsto` com PDF | E-mail ao RH (e-mail do estabelecimento matriz; fallback: contato validado pela Denise no 1º envio) → status `enviado` |

Idempotência garantida pelo `unique (trabalhador_id, tipo, competencia)`※⁴ em `faturas` — duplo clique não duplica cobrança. Integração bancária com baixa automática (`origem_baixa = integracao`) é Etapa 04.
Esforço máximo do /goal: n/a (Manual estrito).

**Aceite da Etapa 02:** ciclo real de solicitação até check-in por QR em celular físico na sede; primeira geração mensal completa (faturas → guias → e-mails) em empresa piloto; conciliação guia = Σ faturas exata.
**Riscos:** e-mails de RH dos CSVs da Receita desatualizados (plano B: validação da Denise por empresa no 1º envio); impressão da guia nas margens da impressora real.

---

## ETAPA 03 — INTELIGÊNCIA E INTEGRAÇÕES · Complexidade: MÉDIA · Status: ⬜

Objetivo geral: gestão estratégica + integrações (site + agente WhatsApp) sobre o produto já em uso.
Modo predominante: [Manual Mode] + [Goal] (dashboard por `/goal`; webhook com service_role em Manual).
Observações: dashboard depende dos dados financeiros da Etapa 02. Versionamento: +0.1 para ajustes, +1.0 para novas integrações.

### Subetapa 03.1 — Dashboard completo + snapshots [Goal] [Manual] [LLM: Sonnet]
Objetivo: 5 KPIs, 5 gráficos, mapa Leaflet coroplético (GeoJSON IBGE × `codigo_ibge`), 11 dicas estratégicas; snapshots mensais ativos.
Conclusão: dashboard **bate com queries manuais de conferência**; primeiro histórico de snapshot visível (`fn_snapshot_dashboard`).
Qualidade: nenhum número inventado — todo KPI rastreável a uma query.
Evidência: dashboard × queries de conferência lado a lado.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 03.2 — Integração dos formulários do site [Manual] [LLM: Sonnet]
Objetivo: webhook n8n → service_role → `status_cadastro = 'pendente'` + notificação à Denise.
Conclusão: formulário do site vira cadastro pendente em **< 1 min**.
Qualidade: service_role só no n8n/Edge, nunca no front.
Evidência: submissão real do site → pendente + notificação.

### Subetapa 03.3 — PWA offline de leitura [Goal] [Manual] [LLM: Sonnet]
Objetivo: TanStack persister em IndexedDB + banner de dados desatualizados.
Conclusão: leitura offline funciona; banner sinaliza staleness.
Qualidade: escrita nunca ocorre offline (só leitura).
Evidência: modo avião → leitura + banner.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 03.4 — Agente WhatsApp consome o CRM [Manual] [LLM: Sonnet]
Objetivo: RPC de nível/bloqueio por CPF substitui a lookup em Google Sheets — nasce a fonte única de verdade.
Conclusão: agente identifica nível e bloqueio via CRM em produção.
Qualidade: CPF normalizado; sem vazamento de dados sensíveis na resposta.
Evidência: consulta real por CPF retornando nível/bloqueio do CRM.

### Subetapa 03.5 — Tela `/configuracoes` [Goal] [Manual] [LLM: Haiku]
Objetivo: parâmetros + perfis.
Conclusão: parâmetros editáveis por Admin refletem no comportamento do sistema.
Qualidade: acesso restrito por role.
Evidência: alteração de parâmetro surtindo efeito.
Esforço máximo do /goal: 2 tentativas.
Escalonamento de LLM: Haiku na 1ª; Sonnet na 2ª.
Se esgotar: parar e emitir relatório curto.

**Aceite da Etapa 03:** dashboard bate com queries manuais; formulário do site vira pendente em < 1 min; agente identifica nível e bloqueio via CRM em produção.

---

## ETAPA 04 — BACKLOG PÓS-MVP (prioriza-se com dado real, não com opinião) · Status: ⬜

Objetivo geral: refinamentos guiados por evidência sobre o produto lançado.
Modo predominante: definir por subetapa quando priorizado (depende de dados de uso da Etapa 03).
Observações: nada aqui quebra o fluxo do MVP; entra por versionamento (+0.1 correções/melhorias · +1.0 novas funcionalidades).

- **API bancária de boletos** — geração + webhook de baixa (`origem_baixa = integracao`).
- **Notificações WhatsApp** para parceiros e RHs.
- **Auto-aprovação na fila-admin** — só se o gargalo do Admin doer nos números.
- **RPC transacional de aprovação**.
- **Fila de agenda/vagas dos parceiros** (V2 do fluxo de solicitações).
- **Otimizações conhecidas** — select-wrap em `fn_eh` para relatórios full-table.
- **RAG/pgvector** do agente.

---

## Sequência e dependências

| Etapa | Complexidade | Depende de | Valor entregue |
|---|---|---|---|
| 00 | Baixa | Pacote SQL final | Banco seguro + app logável ✅ |
| 01 | Alta | Etapa 00 | Denise operando: cadastros, CCTs, importação da base |
| 02 | Alta | Etapa 01 | Convênio girando + dinheiro cobrado e conciliado |
| 03 | Média | Etapa 02 (dashboard usa dados financeiros) | Gestão estratégica + integrações |
| 04 | Variável | Etapa 03 + dados de uso | Refinamentos guiados por evidência |

---

## Suíte de testes contínua (roda em toda etapa)

1. **RLS matrix** — 6 atores × todas as células da matriz (incl. secretária sem INSERT/DELETE nas 6 tabelas CRU-baixa).
2. **Triggers de negócio** — nível mínimo do benefício, bloqueio por inadimplência (contribuição×Prata, mensalidade×Ouro), beneficiado≠titular, guarda do parceiro, orientação livre para Bronze.
3. **Máquina de estados** — check-in a partir de `solicitada` e de `pendente_confirmacao`; guia já processada; PIN inválido.
4. **Cálculos** — piso por função + fallback geral, teto R$ 100, mensalidade com mix de beneficiados, override `salario_informado`.
5. **Organização interna** — 5.1/5.2/5.3, Ouro com carta intocado, idempotência (`reclassificada_em`), origem dos eventos.
6. **Importação** — DV de CPF/CNPJ, zeros do Excel, políticas de duplicata, proteção das flags de nível.
7. **Geração financeira** — idempotência, conciliação guia = Σ faturas, vencimento geração+30.

---

## Backlog de versionamento (documento vivo)

Anotar aqui ideias de melhoria, bugs pequenos e decisões futuras. Regra: só quebra o fluxo das etapas se impactar diretamente o MVP; caso contrário, aguarda a Etapa 04.

- [ ] Ativar `auth_leaked_password_protection` (HaveIBeenPwned) — impacto no MVP? não — versão alvo: ao migrar p/ Supabase pago.
- [ ] Decisão WhatsApp API (BSP oficial vs Evolution) — impacto no MVP? não — versão alvo: +1.0 (produtos de disparo em massa).
- [ ] Medir tempo médio de aprovação na fila-admin desde o dia 1 da Etapa 01 — impacto no MVP? não — insumo p/ auto-aprovação (Etapa 04).

---

## Handoff para o Claude CODE

Ordem de leitura no repositório: `CLAUDE.md` → `specs/plano_fases.md` (este) → `sql/01_schema.sql` → `sql/03_rls.sql` → `specs/frontend.md` → `specs/dashboard.md` + `sql/04_dashboard.sql` → `specs/importacao.md`. O seed (`sql/02_seed_municipios.sql`) executa-se, não se lê. Ponte entre etapas = **repo + HANDOFF** (sessões separadas por etapa, evitando contaminação de contexto).

---

## Notas de alinhamento (reformatação — sem alterar o que está implantado)

- **※¹** Deploy corrigido de "Vercel" → **Hostgator** (build estático `dist/` + `.htaccess` SPA fallback em `crm.sindcompassos.org`), conforme `CLAUDE.md`, `README.md` e `docs/deploy.md`. Era a única contradição do documento original.
- **※²** `boleto_url`/`boleto_codigo`: grafia explícita das duas colunas reais (o original abreviava "boleto_url/codigo").
- **※³** `v_base_calculo_trabalhador`: nome real da view no schema aplicado (o original dizia "v_base_calculo").
- **※⁴** `unique (trabalhador_id, tipo, competencia)`: nome real da coluna/constraint em `faturas` (o original dizia "trabalhador").

Nenhuma outra referência a tabela, coluna, função, trigger, view, enum ou cron foi alterada — todas conferidas 1:1 contra `sql/01→05`.
