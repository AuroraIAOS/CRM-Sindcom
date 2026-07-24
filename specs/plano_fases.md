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

### Subetapa 00.1 — Conformidade schema aplicado × SQL do repo [Plan] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: provar que o schema no Supabase corresponde aos arquivos `sql/01→04`.
Conclusão: enums, tabelas, funções, políticas RLS, triggers, views, extensões e jobs `pg_cron` conferidos 1:1 (relatório em `docs/fase0-conformidade.md`).
Qualidade: conformidade estrutural total; gaps registrados, não escondidos.
Evidência: tabela de conformidade preenchida + advisors de segurança revisados.

### Subetapa 00.2 — Carga de referência RFB + de-para TOM→IBGE [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: resolver `codigo_rfb` para 100% dos municípios de MG.
Conclusão: `municipios` com 5.570 linhas, 29 `base_territorial`; `codigo_rfb` = 5.570/5.570 (MG 853/853); tabelas RFB (`cnaes`, `naturezas_juridicas`, `qualificacoes_responsavel`, `motivos_situacao_cadastral`) carregadas.
Qualidade: staging temporária removida ao fim; nenhuma alteração de schema.
Evidência: contagens por query + Passos = TOM 4957.

### Subetapa 00.3 — Skeleton React + Vite + TS + PWA (tokens Sindcom) [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: scaffold com Tailwind/shadcn temados por `docs/design-tokens.md` §4 e PWA (manifest + precache do shell; `/guia/:token` fora do precache).
Conclusão: `npm run build` gera `dist/` sem erro; estrutura de pastas conforme `specs/frontend.md` §5.
Qualidade: nada hardcoded fora dos tokens.
Evidência: build limpo + assets de marca em `public/assets/brand/` e ícones PWA.

### Subetapa 00.4 — Camada Supabase + Auth + mapa de erros [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: `lib/supabase.ts` (cliente único, anon key), `lib/auth.tsx` (sessão + `perfis`), `lib/mensagens.ts` (mapa `PostgrestError.message → pt-BR`).
Conclusão: login real por role funcionando; erros de trigger traduzidos.
Qualidade: componentes não chamam supabase-js direto.
Evidência: sessão carregada + toasts amigáveis.

### Subetapa 00.5 — AppShell + RoleGate + navegação por papel [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: guarda de rota/elemento; redirecionamento pós-login (`parceiro`→`/portal`, `juridico`→`/juridico`, demais→`/dashboard`); `/login` e `/recuperar-senha` funcionais.
Conclusão: cada role redireciona à área correta; rota negada → redirect + toast.
Qualidade: sidebar filtrada por role.
Evidência: teste de navegação/redirect (10 asserts) verde.

### Subetapa 00.6 — Suíte de testes RLS (portão da etapa) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: transformar cada célula da matriz de `sql/03_rls.sql` em assert (6 atores: 5 roles + anon), com login real via supabase-js.
Conclusão: **`npm run test:rls` 100% verde** — secretária sem INSERT/DELETE nas 6 tabelas CRU-baixa; jurídico só INSERT em `atendimentos_juridicos`; presidente leitura ampla sem escrita; parceiro só os próprios via `fn_parceiro_id()`, `v_fila_parceiro` sem CPF; anon só nas RPCs públicas do QR; admin baseline positivo; `solicitacoes_admin` com regra de solicitante. **Regra de portão: nenhuma tela real antes disto.**
Qualidade: cada assert valida caminho permitido **e** negado.
Evidência: suíte 27/27 verde (17 RLS × 6 atores + 10 navegação) — log por ator/tabela/operação.

### Subetapa 00.7 — Hardening + deploy inicial (Hostgator) [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: aplicar `sql/05_hardening.sql` (idempotente) e publicar `dist/` em `crm.sindcompassos.org`.
Conclusão: `search_path` fixo em todas as `fn_*`; `EXECUTE` revogado de PUBLIC/anon com reconcessão cirúrgica; `pg_trgm` no schema `extensions`; SPA servido com refresh em rota profunda; HTTPS/AutoSSL ativo (PWA instalável).
Qualidade: único item aceito como pendência — `auth_leaked_password_protection` (plano pago), vigiado em `CLAUDE.md`/`README.md`.
Evidência: runbook `docs/deploy.md` + app no ar.

**Aceite da Etapa 00 (cumprido):** login de cada role redireciona corretamente; suíte RLS 100% verde; `municipios` com 5.570 linhas e 29 flagadas; `codigo_rfb` resolvido para 100% dos municípios de MG.

---

## ETAPA 01 — MVP CADASTRAL · Complexidade: ALTA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: Denise operando — cadastros, vínculos, CCTs e importação da base real. Gerar HANDOFF_BUILD ao final.
Modo predominante: [Manual Mode] + [Goal] (um `/goal` por subetapa de baixo risco).
Observações: subetapas que tocam RLS/triggers/migração em lote ficam **fora do `/goal`** (Manual estrito, aprovação explícita). Toda query Supabase vive em `features/<domínio>/api.ts` como hook TanStack; commit comentado + push ao fim de cada subetapa.

### Subetapa 01.1 — Trabalhadores: lista + ficha com abas [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: DataTable server-side + ficha com abas (Dados · Vínculos · Beneficiados · Cartas · Faturas · Solicitações · Atendimentos — as duas últimas vazias até a Etapa 02).
Conclusão: lista pagina/filtra no servidor; ficha abre por trabalhador com nível derivado correto (Bronze/Prata/Ouro) a partir das flags — **nível é computado, nunca editável**.
Qualidade: nível nunca escrito à mão; abas vazias sinalizadas, não quebradas.
Evidência: print da ficha + query conferindo nível vs flags.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; escalar p/ Opus na 3ª.
Se esgotar: parar e emitir relatório curto (problema + causas + 2-3 alternativas).

### Subetapa 01.2 — Vínculos, beneficiados e cartas de oposição [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA (parcial — a "visão anual" `/cartas` foi deferida por decisão de Maxwell em 2026-07-13 e entregue na Subetapa 04.2)
Objetivo: CRUD de vínculos empregatícios (Denise), beneficiados, e registro de cartas de oposição (+ visão anual).
Conclusão: carta registrada reflete Bronze na ficha; beneficiado ≠ titular respeitado pelo trigger.
Qualidade: mensagens de trigger traduzidas pelo mapa central.
Evidência: ciclo carta→Bronze na ficha + rejeição de beneficiado=titular.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 01.3 — Empresas/estabelecimentos + Convenções (CCT) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: leitura/update de empresas/estabelecimentos e vínculo com CCT; CRUD completo de convenções + pisos por função + `taxas_convencao` + **data limite de oposição** + migração de estabelecimentos em lote.
Conclusão: convenção criada com pisos e taxas; migração em lote move estabelecimentos sem violar RLS/triggers.
Qualidade: migração em lote é ato deliberado e auditável (Manual, sem `/goal`).
Evidência: CCT completa + relatório da migração em lote.

### Subetapa 01.4 — Fila de solicitações ao Admin + aprovação de cadastros [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: CRU-baixa da Denise → `solicitacoes_admin` com payload + diff para o Admin; aprovação executa a operação real. Fila de aprovação de cadastros pendentes.
Conclusão: ciclo completo — Denise cria trabalhador → fila-admin → Maxwell aprova → ficha com vínculo e nível correto.
Qualidade: nada destrutivo sem aprovação; medir tempo médio de aprovação desde o dia 1 (input p/ a válvula de auto-aprovação da Etapa 05).
Evidência: diff exibido ao Admin + operação real pós-aprovação.

### Subetapa 01.5 — Importação/exportação CSV [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: importação CSV completa (spec `specs/importacao.md`) + exportação crua (Admin, logada) / mascarada.
Conclusão: importação dos CSVs reais de empresas+estabelecimentos dos 29 municípios **com relatório de rejeitadas**; DV de CPF/CNPJ validado; zeros do Excel preservados; políticas de duplicata aplicadas.
Qualidade: **importação nunca altera** `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio` nem `forma_pagamento_preferida` de registros existentes (política importa-válidas).
Evidência: relatório de rejeitadas + prova de que as flags de nível ficaram intocadas.
Esforço máximo do /goal: 4 tentativas.
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na 4ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 01.6 — Notificações in-app + badge Realtime [Goal] [Manual] [LLM: Haiku] · Status: ✅ CONCLUÍDA
Objetivo: notificações in-app com badge via Realtime.
Conclusão: nova solicitação/pendência gera notificação à Denise em tempo real.
Qualidade: badge zera ao ler; sem polling desnecessário.
Evidência: print do badge reagindo a evento Realtime.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Haiku nas 2 primeiras; Sonnet na 3ª.
Se esgotar: parar e emitir relatório curto.

**Aceite da Etapa 01:** (1) importação dos CSVs reais dos 29 municípios com relatório de rejeitadas; (2) ciclo completo Denise→fila-admin→Maxwell aprova→ficha com vínculo e nível correto; (3) carta registrada refletindo Bronze na ficha.
**Riscos:** gargalo do Admin na fila (medir tempo médio desde o dia 1 — válvula é auto-aprovação por entidade na Etapa 05); qualidade dos CSVs da Receita (mitigada por importa-válidas + relatório de rejeitadas).

---

## ETAPA 02 — CONVÊNIO + MOTOR FINANCEIRO · Complexidade: ALTA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: convênio girando + dinheiro cobrado e conciliado. Gerar HANDOFF_UPGRADE ao final.
Modo predominante: [Manual Mode] + [Goal] (UI por `/goal`; funções SQL `security definer` e conciliação em Manual estrito).
Observações: motor financeiro é sensível — funções de geração de cobrança **não** rodam por `/goal`. E-mails via n8n (remetente `estrategico@sindcompassos.org`, template com identidade da skill `sindcom`).

### Subetapa 02.1 — Parceiros + recepcionistas + catálogo de benefícios [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: gestão de parceiros e recepcionistas (PIN com hash) + catálogo `beneficios`.
Conclusão: PIN armazenado com hash; catálogo lista ofertas por nível mínimo.
Qualidade: `beneficios` = catálogo (oferta); vocabulário canônico respeitado.
Evidência: PIN nunca em texto puro + catálogo filtrando por nível.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.2 — Solicitações de serviço + guia A4 com QR + página pública + check-in [Goal] [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: form com pré-validação de nível/bloqueio (`fn_titular_bloqueado`), guia A4 com QR, página pública `/guia/:token`, check-in com PIN.
Conclusão: ciclo real de solicitação até **check-in por QR em celular físico** na sede; `solicitacoes_servico` = carrinho que vira guia; máquina de estados respeita check-in a partir de `solicitada` e `pendente_confirmacao`, rejeita guia já processada e PIN inválido.
Qualidade: orientação livre para Bronze; guarda do parceiro no trigger.
Evidência: check-in real filmado/print + `fn_dados_guia_publica` respondendo a anon.
Esforço máximo do /goal: 4 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus nas 2 últimas.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.3 — Portal do parceiro [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: fila (`v_fila_parceiro`) + confirmação em lote mensal.
Conclusão: parceiro vê apenas os próprios (sem CPF) e confirma em lote.
Qualidade: `v_fila_parceiro` nunca expõe CPF.
Evidência: fila filtrada por `fn_parceiro_id()` + confirmação em lote.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.4 — Telas financeiro (faturas + guias de pagamento) [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: faturas (incl. excepcionais: multa/acordo/taxa da CCT) e guias de pagamento.
Conclusão: fatura excepcional criada e refletida na ficha; guia lista faturas agregadas.
Qualidade: valores conferem com as views de base de cálculo.
Evidência: fatura excepcional + guia na tela.

### Subetapa 02.5 — Relatório da CCT + organização interna [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: `v_relatorio_convencao` + botão "Executar organização interna" (`fn_reclassificar_convencao`).
Conclusão: organização interna 5.1/5.2/5.3 com **Ouro com carta intocado**; idempotência via `reclassificada_em`; origem dos eventos registrada.
Qualidade: reclassificação é ato deliberado e idempotente (Manual, sem `/goal`).
Evidência: relatório da CCT + prova de idempotência (2ª execução não duplica).

### Subetapa 02.6 — Motor de geração de cobranças + e-mails n8n [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
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

Idempotência garantida pelo `unique (trabalhador_id, tipo, competencia)`※⁴ em `faturas` — duplo clique não duplica cobrança. Integração bancária com baixa automática (`origem_baixa = integracao`) é Etapa 05.
Esforço máximo do /goal: n/a (Manual estrito).

**Aceite da Etapa 02:** ciclo real de solicitação até check-in por QR em celular físico na sede; primeira geração mensal completa (faturas → guias → e-mails) em empresa piloto; conciliação guia = Σ faturas exata.
**Riscos:** e-mails de RH dos CSVs da Receita desatualizados (plano B: validação da Denise por empresa no 1º envio); impressão da guia nas margens da impressora real.

---

## ETAPA 03 — INTELIGÊNCIA E INTEGRAÇÕES · Complexidade: MÉDIA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: gestão estratégica + integrações (site + agente WhatsApp) sobre o produto já em uso.
Modo predominante: [Manual Mode] + [Goal] (dashboard por `/goal`; webhook com service_role em Manual).
Observações: dashboard depende dos dados financeiros da Etapa 02. Versionamento: +0.1 para ajustes, +1.0 para novas integrações.

### Subetapa 03.1 — Dashboard completo + snapshots [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: 5 KPIs, 5 gráficos, mapa Leaflet coroplético (GeoJSON IBGE × `codigo_ibge`), 11 dicas estratégicas; snapshots mensais ativos.
Conclusão: dashboard **bate com queries manuais de conferência**; primeiro histórico de snapshot visível (`fn_snapshot_dashboard`).
Qualidade: nenhum número inventado — todo KPI rastreável a uma query.
Evidência: dashboard × queries de conferência lado a lado.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 03.2 — Integração dos formulários do site [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA (backend + integração; falta só a 1ª submissão orgânica de um filiado real)
Objetivo: webhook → service_role → `status_cadastro = 'pendente'` + notificação à Denise.
Conclusão (2026-07-21): descoberto que "o site" na verdade são **dois Google Forms** (não WordPress) — "01. Filiação" (Titular, com upload de documentos) e "02. Beneficiários" (depende de achar o Titular por CPF). Escopo desta rodada, decidido com Maxwell: só Filiação; Beneficiários fica para depois. Entregue: Edge Function `formulario-filiacao` (`supabase/functions/formulario-filiacao/`, `verify_jwt=false` + segredo próprio `X-Formulario-Secret`) recebendo o payload do Apps Script, criando o trabalhador `pendente`/`origem_cadastro='formulario_site'`; trigger `fn_notifica_cadastro_site` (`sql/15_notificacao_formulario_site.sql`) notificando a Secretaria; link "Ver cadastro" novo em `/notificações`. Empresa/CNPJ do empregador ficam como texto cru em `observacoes` (decisão deliberada — evita empresa duplicada por digitação errada; Denise resolve o vínculo ao aprovar). Documentos continuam no Drive do formulário, fora do CRM por ora.
**Configuração fechada por Maxwell em 2026-07-21:** segredo `FORMULARIO_FILIACAO_SECRET` no painel do Supabase + Apps Script colado no formulário real (projeto renomeado "CRM Sindcom Filiação") + gatilho `onFormSubmit` ligado (confirmado na aba Acionadores: "Do formulário · Ao enviar o formulário · onFormSubmit"). Testado ponta a ponta contra a Edge Function REAL (não mock) com o segredo de produção: submissão válida (201, nível Prata-pendente, observações com empresa/CNPJ/cargo legíveis, notificação criada), segredo errado (401), CPF duplicado (200 `ja_cadastrado`, sem sobrescrever) — todos corretos. Único passo que não dá para simular por aqui: um filiado de verdade preenchendo o Google Forms (o gatilho já está ativo e vai capturar isso organicamente).
Qualidade: service_role só dentro da Edge Function (nunca no front); segredo do webhook fora do repositório.
Evidência: 3/3 testes em `tests/rls/formulario-site.spec.ts` + 4/4 chamadas reais à Edge Function em produção (criado/negado/duplicado, todas com acentuação correta) + gatilho do Apps Script confirmado ativo na conta que publica o formulário.

### Subetapa 03.3 — PWA offline de leitura [Goal] [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: TanStack persister em IndexedDB + banner de dados desatualizados.
Conclusão: leitura offline funciona; banner sinaliza staleness.
Qualidade: escrita nunca ocorre offline (só leitura).
Evidência: modo avião → leitura + banner.
Esforço máximo do /goal: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 03.4 — Agente WhatsApp consome o CRM [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA (canal de teste: Telegram)
Objetivo: RPC de nível/bloqueio por CPF substitui a lookup em Google Sheets — nasce a fonte única de verdade.
Conclusão (2026-07-21): `fn_consulta_nivel_bloqueio(p_cpf)` criada e aplicada em produção (`sql/14_agente_whatsapp.sql`) — recebe CPF em qualquer formatação, devolve `encontrado`, `primeiro_nome`, `nivel`, `status_cadastro`, `bloqueado_contribuicao`, `bloqueado_mensalidade`. Só `service_role` executa (revoke de public/anon/authenticated — confirmado por `pg_proc.proacl`); lógica validada via SQL direto (todos os casos: nível por CPF formatado/cru, CPF não encontrado, CPF inválido). **Agente construído e testado em produção** (decisão de Maxwell: canal de teste é Telegram, não WhatsApp — mais rápido de provisionar via BotFather, sem esperar BSP; troca para WhatsApp fica para quando o n8n for para a VPS). Bot `@Sindcom_Arthur_bot` no n8n self-host: workflow `Sindcom — Agente Telegram (consulta nível/bloqueio)` (`n8n/agente-telegram.workflow.json`, documentado em `n8n/README.md`) faz *polling* (`getUpdates`, a cada 10s — Telegram Trigger nativo exigiria webhook público, que este n8n não tem) e chama a RPC com os dois headers de service_role. Testado ponta a ponta com 3 casos reais pelo Telegram: CPF encontrado (DEMO Prata → nível/situação/contribuição corretos), CPF não encontrado (mensagem apropriada) e mensagem sem CPF (`/start` → onboarding). Workflow publicado/ativo.
Qualidade: CPF normalizado dentro da função (aceita formatado ou cru); resposta nunca ecoa CPF/e-mail/telefone/valor financeiro, só primeiro nome.
Evidência: 6/6 testes em `tests/rls/agente-whatsapp.spec.ts` provando que nenhum papel do app (nem Admin) executa a função pela sessão normal — só quem detém a service_role. **Mais:** 3/3 consultas reais feitas PELO AGENTE em produção via Telegram (encontrado/não encontrado/sem CPF), confirmadas nas respostas do bot e nos logs de execução do n8n.

### Subetapa 03.5 — Tela `/configuracoes` [Goal] [Manual] [LLM: Haiku] · Status: ✅ CONCLUÍDA
Objetivo: parâmetros + perfis.
Conclusão: parâmetros editáveis por Admin refletem no comportamento do sistema.
Qualidade: acesso restrito por role.
Evidência: alteração de parâmetro surtindo efeito.
Esforço máximo do /goal: 2 tentativas.
Escalonamento de LLM: Haiku na 1ª; Sonnet na 2ª.
Se esgotar: parar e emitir relatório curto.

**Aceite da Etapa 03:** dashboard bate com queries manuais; formulário do site vira pendente em < 1 min; agente identifica nível e bloqueio via CRM em produção.

---

## ETAPA 04 — FECHAMENTO DO MAPA DE TELAS · Complexidade: MÉDIA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: fechar a dívida de escopo do MVP — as duas telas que estão
especificadas em `specs/frontend.md` §2.2 mas nunca tiveram subetapa dona.
Diagnóstico completo em `docs/plano_cartas_juridico.md`.
Modo predominante: [Manual Mode] (regra de negócio sensível: gate do Jurídico e
regra 5.2 do convênio).
Observações: **não é backlog priorizável** — é escopo de MVP que caiu entre as
etapas. `/juridico` nunca apareceu em nenhuma subetapa (só na 00.5 como destino
de redirect e na 00.6 como célula da matriz RLS), e `/cartas` estava deferida
para o fim do roteiro por decisão de 2026-07-13.

### Subetapa 04.1 — `/juridico` (Atendimentos jurídicos) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: destravar o papel `juridico`, que caía num Placeholder como primeira
tela pós-login. Lista + registro + edição, respeitando a matriz RLS.
Conclusão (2026-07-22): `features/juridico/` completa (lista com filtros de
nome/CPF/tipo/situação/período, exportação CSV, diálogo de registro com seletor
de trabalhador por busca no servidor, detalhe/edição, exclusão só do Admin) +
aba "Atendimentos" real na ficha do trabalhador (era "disponível a partir da
Etapa 02", frase errada desde o fecho da Etapa 02) + `sql/16_juridico.sql` com
o CHECK `chk_status_atendimento` (`aberto · em_andamento · concluido ·
arquivado`, decisão de Maxwell).
Qualidade: a Secretaria **lê mas não registra** (inverso do papel dela nas
demais telas) — botão escondido e RLS negando; UPDATE/DELETE conferem
`.select()` porque policy só com `USING` devolve 200 + zero linhas
(`orientacoes.md` §2.6d).
Evidência: 11/11 em `tests/rls/juridico.spec.ts` — matriz RLS (6 atores) **e as
4 células do trigger `fn_valida_atendimento_juridico`**, que nunca tinham sido
exercidas (o teste anterior inseria `{}` e falhava no NOT NULL antes do
trigger).

### Subetapa 04.2 — `/cartas` (Visão anual de cartas de oposição) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: quem entregou, quem falta, exportação da lista de reclassificação —
por ano-base e por CCT (decisão D2 de Maxwell em 2026-07-22).
Conclusão (2026-07-22): `sql/17_cartas.sql` cria `v_cartas_ano_base` **sobre**
`v_relatorio_convencao`, então o universo da tela é o mesmo de
`fn_reclassificar_convencao` por construção, não por coincidência.
`features/cartas/` mostra **4 situações, não 2**: entregou→Bronze (5.1) · sem
carta→Prata (5.3) · Ouro sem carta (5.2) · **Ouro COM carta, que não regride e
exige ação humana** (5.2 + FAQ 15).
Qualidade: deduplicação por trabalhador antes de qualquer contagem (a view é
por vínculo — `orientacoes.md` §2.2); paginação explícita de 1000 em 1000 (§2.4);
comparação de prazo string×string (§4.2); CSV consome a MESMA lista agregada da
tela (§4.4); prazo em aberto sinalizado como contagem parcial.
Evidência: 5/5 em `tests/rls/cartas.spec.ts` — RLS da view + igualdade de
conjuntos com `v_relatorio_convencao` + os 4 baldes do cenário DEMO Kabum
(**17 · 68 · 12 · 3** em 100 pessoas, batendo com a simulação do motor).

### Subetapa 04.3 — Correção da regra 5.2 no frontend (decisão D3) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: eliminar a divergência entre frontend e motor SQL sobre o Ouro,
descoberta no diagnóstico da 04.2.
Conclusão (2026-07-22): `useRegistrarCarta` e `executarLoteCartas` zeravam **as
duas** flags de recolhimento sem olhar o nível — um Ouro que entregasse carta
pela ficha virava Bronze na hora, cancelando a adesão ao convênio por efeito
colateral (o titular perdia os benefícios sem saber; o Sindcom deixava de
receber a mensalidade). O motor `fn_reclassificar_convencao` sempre respeitou a
regra (`where t.nivel <> 'ouro'`). Agora os dois caminhos concordam: a carta é
**sempre registrada** (é fato com prazo legal), e o rebaixamento só acontece
para quem não é Ouro, via `.neq("nivel","ouro")` no próprio UPDATE — quem decide
é a coluna gerada no banco, não uma checagem do cliente.
Qualidade: a UI diz a verdade nos dois casos (texto do diálogo muda conforme o
nível) e o lote reporta `rebaixadas` × `mantidasOuro` nominalmente (§4.3).
Evidência: 2 testes dedicados em `tests/rls/cartas.spec.ts` provando que Prata
com carta vira Bronze e Ouro com carta **permanece Ouro com as duas flags
intactas**, com a carta gravada.

**Aceite da Etapa 04 (cumprido):** nenhuma das 19 rotas do `NAV` cai em
`Placeholder` (inventário `specs/frontend.md` §2.2 × chaves de `PAGINAS`);
suíte 111/111 verde; deploy publicado e verificado por hash do bundle.

---

## ETAPA 06 — REPOVOAMENTO DA BASE REAL (RFB) · Complexidade: ALTA · Status: 🔄 EM ANDAMENTO

Objetivo geral: sair das tabelas vazias (reset de 2026-07-23) para a base real dos 29
municípios — empresas e estabelecimentos filtrados dos 22 GB de Dados Abertos do CNPJ —
e automatizar o ciclo mensal numa skill.

**Plano detalhado, decisões e critérios de aceite: [`docs/plano_importacao_rfb.md`](../docs/plano_importacao_rfb.md).**

Filtros (decididos por Maxwell em 2026-07-23): município ∈ 29 `base_territorial` ·
CNAE principal ∈ `45|46|47` · situação cadastral = `02` (ativa). O filtro nasce no
**estabelecimento** (unidade de alocação do trabalhador) e cascateia para a empresa.

| Subetapa | Status |
|---|---|
| 06.0 — Zero-padding canônico das tabelas de referência | ✅ CONCLUÍDA (2026-07-23) |
| 06.1 — Ferramenta de filtragem + validação em 1 arquivo | ⬜ |
| 06.2 — Passe completo sobre os 22 GB | ⬜ |
| 06.3 — Normalização + reconciliação de FKs | ⬜ |
| 06.4 — Carga em produção | ⬜ |
| 06.5 — Auditoria pós-carga | ⬜ |
| 06.6 — Skill `atualizar-sindcom` (ciclo mensal) | ⬜ |

### Subetapa 06.0 — Zero-padding das tabelas de referência [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: alinhar `cnaes`/`naturezas_juridicas`/`qualificacoes_responsavel`/`motivos_situacao_cadastral`
ao layout oficial do CNPJ, antes de qualquer carga.
Conclusão (2026-07-23): `sql/18_padding_referencias.sql` aplicado — larguras 7/4/2/2 com as
contagens **intactas** (1359 · 91 · 68 · 63) e 0 linhas fora do padrão. Descoberto que o banco,
não a spec, estava divergente (`orientacoes.md` §2.10).
Qualidade: 3 guardas (dependentes vazios · código não-numérico/largo · colisão de PK) e
idempotência real.
Evidência: hash md5 idêntico na 2ª execução (4/4); guarda testada com dependente forjado
abortando corretamente e rollback sem rastro; suíte 93/98 (as 5 falhas pré-existentes de
conteúdo, sem regressão).

---

## ETAPA 05 — BACKLOG PÓS-MVP (prioriza-se com dado real, não com opinião) · Status: ⬜

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

### Pendências herdadas da vistoria de fecho da Etapa 03 (2026-07-21)

Levantadas na auditoria final do MVP. Nenhuma bloqueia o uso do sistema; as
duas primeiras são de **infraestrutura do n8n** e devem andar juntas, numa só
recriação de contêiner.

- [ ] **🔴 PRIORIDADE — Recriar o `n8n_container` com o bind mount correto.**
  O contêiner atual foi criado com o mount em `/home/node/n8n`, mas o n8n grava
  em **`/home/node/.n8n`** (com ponto): o mount está vazio e os 2 workflows de
  produção + as 3 credenciais (service_role, senha de app do Gmail) vivem na
  camada de escrita do contêiner — **um `docker rm` apaga tudo**. Mitigado em
  2026-07-21 com backup completo em
  `C:\Users\maxwe\GitHub\_Docker_n8n\BACKUP_n8n_2026-07-21\` (inclui o arquivo
  `config` com a `encryptionKey`, sem a qual as credenciais não descriptografam;
  backup validado: 2 workflows + 3 credenciais). **Comando pronto e ordem de
  execução em `n8n/README.md` (aviso no topo)** — é destrutivo, exige restaurar
  o backup antes e só remover o contêiner antigo após conferir que os workflows
  rodam de fato (`orientacoes.md` §7.2). Armadilha registrada em §3.7.
- [ ] **Pruning do histórico de execuções do n8n.** O agente Telegram faz
  polling a cada 10s (~3.500 execuções/dia, quase todas ciclos vazios — 264 em
  1h47 na medição). As variáveis `EXECUTIONS_DATA_PRUNE` / `_MAX_AGE` /
  `_PRUNE_MAX_COUNT` já estão no comando de recriação acima, então **sai de
  graça junto com o item anterior**. A via alternativa pela UI (*Settings →
  "Save successful production executions" → Do not save*) foi tentada em
  2026-07-21 e **não persistiu** — o diálogo fecha mas `workflow_entity.settings`
  não recebe `saveDataSuccessExecution`; se for por ali, conferir no banco.
- [ ] **Repor os valores reais do `.env.n8n`.** As três variáveis
  (`SMTP_USER`, `SMTP_PASS`, `SUPABASE_SERVICE_ROLE_KEY`) são **placeholders**
  (`eyJFICTICIO...`), não valores reais — descoberto quando um nó novo falhou
  com "Invalid API key". Hoje os valores reais existem **só** dentro do cofre do
  n8n (e no backup acima). Enquanto não forem repostos, o runbook de restauração
  depende exclusivamente do backup binário.
- [ ] **Trocar o canal do agente de Telegram para WhatsApp** quando o n8n for
  para a VPS (Railway/Oracle Free Tier). O Telegram foi decisão deliberada de
  fase de teste (Subetapa 03.4); a lógica de extração de CPF, a RPC e a
  formatação das respostas não mudam — troca-se só o par
  `getUpdates`/`sendMessage`. Depende da decisão pendente "BSP oficial vs
  Evolution".
- [ ] **Timezone do n8n está em `America/New York`** (default da instância).
  Não afeta os gatilhos atuais, que são por intervalo (10s / 15 min) e não por
  horário do dia — mas **qualquer agendamento futuro em hora cheia** (ex.: "toda
  segunda às 8h") sairá 1–2h deslocado. Ajustar para `America/Sao_Paulo` antes
  de criar o primeiro workflow com horário fixo.
- [ ] **Ativar `auth_leaked_password_protection`** (HaveIBeenPwned) assim que o
  projeto migrar para o Supabase pago — hoje é o único achado real do
  `get_advisors` fora os padrões arquiteturais by-design.

---

## Sequência e dependências

| Etapa | Complexidade | Depende de | Valor entregue |
|---|---|---|---|
| 00 | Baixa | Pacote SQL final | Banco seguro + app logável ✅ |
| 01 | Alta | Etapa 00 | Denise operando: cadastros, CCTs, importação da base |
| 02 | Alta | Etapa 01 | Convênio girando + dinheiro cobrado e conciliado |
| 03 | Média | Etapa 02 (dashboard usa dados financeiros) | Gestão estratégica + integrações |
| 04 | Média | Etapa 03 | Fechamento do mapa de telas: `/juridico` e `/cartas` ✅ |
| 05 | Variável | Etapa 04 + dados de uso | Refinamentos guiados por evidência |

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

Anotar aqui ideias de melhoria, bugs pequenos e decisões futuras. Regra: só quebra o fluxo das etapas se impactar diretamente o MVP; caso contrário, aguarda a Etapa 05.

- [ ] Ativar `auth_leaked_password_protection` (HaveIBeenPwned) — impacto no MVP? não — versão alvo: ao migrar p/ Supabase pago.
- [ ] Decisão WhatsApp API (BSP oficial vs Evolution) — impacto no MVP? não — versão alvo: +1.0 (produtos de disparo em massa).
- [ ] Medir tempo médio de aprovação na fila-admin desde o dia 1 da Etapa 01 — impacto no MVP? não — insumo p/ auto-aprovação (Etapa 05).

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
