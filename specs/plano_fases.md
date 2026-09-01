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

## ETAPA 06 — REPOVOAMENTO DA BASE REAL (RFB) · Complexidade: ALTA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

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
| 06.1 — Ferramenta de filtragem + validação em 1 arquivo | ✅ CONCLUÍDA (2026-07-23) |
| 06.2 — Passe completo sobre os 22 GB | ✅ CONCLUÍDA (2026-07-24) |
| 06.3 — Normalização + reconciliação de FKs | ✅ CONCLUÍDA (2026-07-24) |
| 06.4 — Carga em produção | ✅ CONCLUÍDA (2026-07-24) |
| 06.5 — Auditoria pós-carga | ✅ CONCLUÍDA (2026-07-24) |
| 06.6 — Skill `atualizar-sindcom` (ciclo mensal) | ✅ CONCLUÍDA (2026-07-24) |

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

### Subetapa 06.1 — Ferramenta de filtragem + validação em 1 arquivo [Goal] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: `scripts/rfb/filtrar.mjs`, provado em streaming contra 1 arquivo antes do passe
completo nos 22 GB.
Conclusão (2026-07-23): rodado contra `estabelecimentos1.csv` (4.753.435 linhas, 61,1s) —
contagem de controle reproduzida exata (2853), RAM achatada em 74-132 MB, acentuação correta
verificada bit a bit e dentro do próprio resultado filtrado ("PRAÇA..."). Primeira medição
real da decisão D1: só 22,0% dos estabelecimentos da amostra estão ativos.
Qualidade: parser real (papaparse) — aspas com `;` embutido não quebraram nenhuma linha das
40 amostras inspecionadas; sem dependência desnecessária (`iconv-lite` descartado a favor do
`setEncoding('latin1')` nativo, `orientacoes.md` §2.11).
Evidência: script + log completo da execução, contagem batendo com o número medido
manualmente na sessão anterior.

### Subetapa 06.2 — Passe completo sobre os 22 GB [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: rodar o filtro nos 20 arquivos (22,1 GB) e produzir os NDJSON filtrados.
Conclusão (2026-07-24): 71.874.448 linhas lidas em estabelecimentos + 68.629.148 em empresas
(todo o Brasil, lido de fato) → **17.319 estabelecimentos / 16.687 empresas** aprovados nos 29
municípios + CNAE 45/46/47 + situação ativa — abaixo até da faixa recalibrada de 20-35 mil.
Qualidade: 3 asserções de integridade — anti-truncamento (arquivo a arquivo, com 3 divergências
pequenas investigadas e explicadas: 7 registros com quebra de linha literal no `nome_fantasia`,
não truncamento, `orientacoes.md` §2.12), cascata 100% íntegra (0 CNPJ órfão), saída 100% dentro
dos 3 filtros reverificada no próprio NDJSON gerado.
Evidência: `relatorio_06_2.json` + `log_06_2.txt` em `D:\BD\filtrados\` (fora do repo) + amostra
de dados inspecionada a olho.

### Subetapa 06.3 — Normalização + reconciliação de FKs [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: normalizar (datas, decimais, município TOM→id, vazio→NULL) e provar que toda FK casa
**antes** de qualquer INSERT.
Conclusão (2026-07-24): 17.319 + 16.687 registros normalizados com **0 violações de CHECK**,
**0 duplicatas** de PK/índice único e **0 órfãos** nas 5 referências (204 CNAEs, 11 naturezas,
10 qualificações, 1 motivo, 29 municípios). As 158 datas descartadas eram todas o literal `"0"`
da RFB ("sem data") — conversão para NULL correta, sem perda.
Qualidade: dry-run com **lote adversarial** (22 casos escolhidos por cobertura de constraint, não
100 linhas arbitrárias) contra o banco real em transação com ROLLBACK — acentuação, apóstrofo,
`cnpj_completo` GENERATED e `numeric(15,2)` todos verificados; rollback sem rastro em `auditoria`.
Evidência: `reconciliacao_06_3.json` + query de reconciliação com as 5 referências em 0 órfãos +
mensagem do dry-run com os valores conferidos.

### Subetapa 06.4 — Carga em produção [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: subir empresas → estabelecimentos, logado como Admin.
Conclusão (2026-07-24): **16.687 empresas + 17.319 estabelecimentos** no ar em 20s, contagens
idênticas ao NDJSON. 0 órfãos, 29 municípios, `cnpj_completo` gerado em 100%, `convencao_id`
NULL em todas. Banco em 35 MB dos 500 MB do Free.
Qualidade: rodou pela **anon key como Admin** (sem `service_role`, respeitando o `CLAUDE.md`);
idempotência provada — 2ª execução com contagem igual **e 0 linhas com `updated_at <> created_at`**;
triggers de auditoria religados e verificados em dois níveis (flag `pg_trigger.tgenabled` +
teste funcional com rollback provando que voltou a gravar).
Evidência: contagens antes/depois, 2ª execução com delta zero, estado dos triggers conferido,
5 registros conferidos a olho contra a origem (acentuação, CNPJ, município, CNAE), suíte 93/98.

### Subetapa 06.5 — Auditoria pós-carga [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
Objetivo: provar que a base é confiável, não só que "subiu".
Conclusão (2026-07-24): contagem por município **29/29 batendo** com `relatorio_06_2.json`
(comparação programática, não a olho) e por divisão CNAE idem; 13 asserções de conformidade
todas verdes (0 órfãos, 0 `convencao_id` preenchido, 0 fora de situação/UF/CNAE/município,
0 FK quebrada, `cnpj_completo` correto em 100%).
Qualidade: cada número saiu de uma query mostrada; app em produção listando 16.687 empresas
com paginação server-side ("Página 1 de 835") e mestre-detalhe abrindo as 13 filiais da
Telefônica. **Prova de ponta a ponta da 06.0**: a ficha mostra "Sociedade Anônima Aberta" e
"Presidente" — JOINs nas tabelas de referência que não resolveriam com os códigos antigos.
Evidência: relatório de asserções + comparação por município + screenshot da tela real +
suíte 93/98 (as 5 falhas pré-existentes de conteúdo).

### Subetapa 06.6 — Skill `atualizar-sindcom` (ciclo mensal) [Goal] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: transformar as 06.1–06.5 num procedimento mensal repetível, dando sequência à skill
`atualizar-cnpj` (que só baixa os arquivos).
Conclusão (2026-07-24): skill em `~/.claude/skills/atualizar-sindcom/` (cópia versionada em
`skills/`) + `exportar_conhecidos.mjs`, `delta.mjs` e ampliação do `passe_06_2.mjs` para emitir
`rejeitados_conhecidos.ndjson` com o motivo de cada rejeição.
Qualidade: **ela nunca apaga** — sumidos viram relatório agrupado por motivo, jamais DELETE; e
`convencao_id` não entra no payload de update, então o vínculo de CCT feito à mão pela Denise
sobrevive a todo ciclo mensal por construção.
Evidência: delta zero nas 6 categorias contra a base recém-carregada (idempotência) **e**
detecção provada com cenário adulterado em diretório separado (1 nova · 1 alterada com diff
campo a campo · 1 sumida nomeada), mais a classificação de motivo verificada nos 3 casos reais
(baixada · CNAE fora de comércio · município fora da base). Produção intacta após os testes.

**Aceite da Etapa 06 (cumprido):** (1) base populada só com os 29 municípios, CNAE 45/46/47 e
situação ativa, conferida município a município; (2) 0 órfãos de FK e `cnpj_completo` íntegro;
(3) triggers de auditoria religados e verificados; (4) suíte verde (93/98, sem regressão) e
telas listando dados reais; (5) skill rodada com delta zero na segunda execução.

---

## ETAPA 07 — PORTÃO DE SEGURANÇA ADVERSARIAL · Complexidade: ALTA · Status: ✅ CONCLUÍDA (no ar em `crm.sindcompassos.org`)

Objetivo geral: submeter o CRM já em produção a um **teste de fogo adversarial** — atacar de
propósito, procurando o caminho **não pretendido**, em vez de confirmar o caminho feliz. Método
portado do CRM Vitrine (repo irmão, mesma stack), que institucionalizou este portão e, na primeira
execução, encontrou 6 falhas reais num projeto que estava com a suíte 100% verde e o advisor limpo.

Motivo: a suíte funcional prova que o comportamento *pretendido* funciona; ela não tem como provar
que não existe um caminho *não pretendido*. O Sindcom nunca havia passado por esse teste, e a base
tem CPF de trabalhadores, 16.687 empresas e 17.319 estabelecimentos.

Modo: auditoria adversarial, sem teto de tentativas · LLM: Opus do início ao fim.

**Bench:** branch `bench/07-seguranca-adversarial` + projeto Supabase descartável
`CRM Sindcom - TESTE` (`ikculjjvvyajhfxifuga`), com os 18 SQLs aplicados e fixture **fictícia** —
nenhum dado real do sindicato foi copiado para lá (LGPD).

**Regra herdada e não negociável:** o CODE executa, corrige e relata dentro do bench, mas **nunca**
funde o bench no `main` por conta própria — mesmo com tudo verde e parecer favorável. Ordenar o
merge é atribuição exclusiva do Maxwell.

### Subetapa 07.0 — Análise do repositório CRM Vitrine [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: extrair do repo irmão o método, os 7 vetores, os achados e as técnicas de teste, medindo
o que se aplica ao Sindcom e o que não se aplica.
Evidência: `docs/RELATORIO_ANALISE_VITRINE.md`. Diferença estrutural registrada: o Vitrine é
multi-inquilino (a fronteira é `account_id`), o Sindcom é mono-organização (a fronteira é o papel e,
para o parceiro, `parceiro_id`) — o achado A06 de lá, de travessia entre contas, não tem análogo aqui.

### Subetapa 07.1 — Bench isolado [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: branch dedicada + banco descartável, para que ataque destrutivo nunca toque a base real.
Conclusão: 18 SQLs aplicados no projeto de teste, 5 usuários (um por papel), 2 parceiros (isolamento
entre parceiros não se prova com um), 2 trabalhadores, 2 guias e 5.570 municípios — tudo fictício.
Qualidade: a trava `exigirBench()` recusa ataque destrutivo se a URL for a de produção, com o ref de
produção **cravado no código** em vez de vir de variável de ambiente.

### Subetapa 07.2 — Infraestrutura de teste adversarial [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: dar à suíte o que ela não tinha — `service_role` para semear fixture, usuário descartável,
sessão reaproveitada e trava de alvo.
Conclusão: `tests/rls/helpers.ts` estendido por adição (`clienteServico`, `criarUsuarioDescartavel`,
`loginAvulso`, `exigirBench`, `ehProducao`, `ataqueBarrado`) e `tests/rls/globalSetup.ts` novo.
**Duas armadilhas de método vencidas aqui**, ambas em `orientacoes.md`: a suíte anunciava
`alvo=BENCH` enquanto atacava **produção** (§2.20), e `getUser()` por arquivo estourava o rate limit
de auth com sintoma idêntico ao de RLS quebrada (§2.21).

### Subetapa 07.3 — Os ataques [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: escrever o ataque deliberado sobre os 7 vetores.
Conclusão: **49 ataques** em 4 arquivos — `tests/adversarial/01_nucleo.spec.ts` (V1/V5, destrutivo,
só no bench), `02_superficie.spec.ts` (V2/V4/V6/V7, seguro em produção), `03_publico.spec.ts` (os 3
endpoints públicos) e `04_renderizacao.spec.ts` (V3: XSS e CSV).
Qualidade: todo caso afirma o comportamento **seguro** — vermelho é achado, não teste mal escrito.
E todo vermelho foi confirmado por medição independente antes de virar achado: **3 falsos achados
foram descartados** exatamente assim (relatório §5).

### Subetapa 07.4 — Correções [Goal] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: fechar cada falha real, com controle negativo provando que o acesso legítimo sobrevive.
Conclusão: `sql/19_hardening_adversarial.sql` (idempotente) + 3 arquivos de frontend.
**5 falhas reais, 5 corrigidas:** A-01 vazamento anônimo da base empresarial (CRÍTICO, já aplicado em
produção com autorização do Maxwell), A-04 força bruta do PIN sem freio (ALTO), A-03 hash do PIN
legível pelos 5 papéis (ALTO), A-05 injeção de fórmula no CSV (MÉDIO/ALTO), A-02 numeração de guia
consumível por RPC (MÉDIO). **1 regressão introduzida e corrigida:** o trigger de numeração nascera
`SECURITY INVOKER` e quebrou a criação de guias em 12 testes — `orientacoes.md` §2.17.

### Subetapa 07.5 — Relatório e parecer [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Evidência: `docs/RELATORIO_07_PORTAO_ADVERSARIAL.md` — achado a achado, com o que resistiu, os
achados aceitos com motivo, os falsos achados e a verificação final. **Parecer favorável ao merge.**
Suíte no bench: **159/160** (a única falha é anterior a esta etapa, por falta de dados).

### Subetapa 07.6 — Merge, aplicação em produção e deploy [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
Objetivo: fundir o bench no `main`, aplicar o hardening no Supabase de produção e publicar o PWA.
**Ordenada por Maxwell em 2026-08-24**, com o relatório e o parecer em mãos — o CODE havia entregado
o parecer e parado, como manda a regra.

Conclusão: merge `--no-ff` (`11ab2d5`), `main` e bench no remoto. **Ordem de aplicação escolhida de
propósito: frontend ANTES do SQL.** O frontend novo é compatível com as duas versões da função de
check-in (checa `error` antes de `data.ok`), mas o SQL novo quebraria o frontend antigo, que fazia
`select('*')` em `recepcionistas` — inverter a ordem abriria uma janela com a tela de parceiros
quebrada. Deploy FTP: 21/21 arquivos, zero falhas. SQL aplicado em 4 migrations verificadas uma a uma.

**Verificação em produção, medida:** `anon` na view devolve `[]`; `fn_gera_numero_guia` devolve
`42501`; `pin_hash` fechada e `nome` aberta (o narrowing não fechou a tabela); trigger de numeração
instalado e `DEFAULT` removido; `anon` mantém o check-in (contrato público preservado); zero grants
de `TRUNCATE`/`REFERENCES`/`TRIGGER`. PWA: `GET /` e `GET /dashboard` → 200.

**Suíte contra produção: 155 de 160** — os 49 ataques adversariais **todos verdes**, e as 5 falhas
restantes são exatamente as 5 que já existiam antes desta etapa (ver pendência 3 abaixo).
`get_advisors` (security): nenhum achado novo problemático. O único item novo é
`tentativas_checkin` com RLS ligada e sem policy — nível INFO e **deliberado**: nega por ausência,
porque só a função `SECURITY DEFINER` e a `service_role` escrevem ali.

**Pendências abertas por esta etapa (ver relatório §3 e §6):**
1. O token da guia pública **não expira** — decisão de produto nunca tomada, com teste que vira
   vermelho no dia em que houver expiração.
2. `solicitacoes_servico.token_publico` é legível por `authenticated` — aceito e medido: é
   credencial de operação (a Secretaria precisa dela para imprimir a guia) e a RLS de linha já
   garante que cada parceiro só alcança as próprias.
3. **A suíte já não estava 100% verde em produção antes desta etapa** — 5 falhas em `dashboard` e
   `cartas`, todas porque a base tem 3 trabalhadores e nenhum aprovado, e os testes esperam números
   da base antiga. Não é risco de segurança; é decisão pendente entre restaurar os dados ou
   reescrever os testes.

---

## ETAPA 08 — COMUNICAÇÃO EXTERNA E COLETA DE DADOS · Complexidade: ALTA · Status: ✅ CONCLUÍDA (2026-09-01)

Objetivo geral: converter a base de **empresas** em base de **pessoas**. O CRM está em produção
com 17.300 estabelecimentos e 16.671 empresas vinculados às suas CCTs, e com **1 trabalhador e
zero vínculos** — sem pessoas, nada do produto opera: não há a quem prestar serviço Prata, não há
a quem oferecer o convênio Ouro, e o motor de cobrança construído na Etapa 02 não tem base de
cálculo. Esta etapa constrói a campanha de comunicação externa que resolve o gargalo, o canal de
retorno dos dados e o rastreio dentro do CRM.

**Spec aprovada por Maxwell:** [`docs/superpowers/specs/2026-08-24-comunicacao-externa-design.md`](../docs/superpowers/specs/2026-08-24-comunicacao-externa-design.md)
— decisões D1 a D8, modelo de dados, segurança do canal público e cronograma de ondas. **Este
plano executa a spec; não a redesenha.**

Prioridades declaradas: **P0 — obter os dados dos trabalhadores** · **P1 — converter Prata em Ouro**.

Modo predominante: [Manual] estrito no que toca RLS, superfície pública, dado pessoal e escrita em
massa; [Goal] só no frontend de critério mecânico. **LLM: Opus em tudo que toca segurança, dado
pessoal ou endpoint público** — a ETAPA 07 mediu o custo de errar aí (5 falhas reais num CRM que
estava com a suíte verde e o advisor limpo). **A ordem real de execução está em "Circuito de
execução" abaixo, não na numeração das subetapas.**

### ✅ CIRCUITOS 1, 2 E 3 CONCLUÍDOS — 2026-08-26

**Três quartos da ETAPA 08 estão fechados.** Resta só o Circuito 4 (Opus: 08.12 → 08.14 → 08.15,
portão adversarial e disparo). A 08.3(b) — que a tabela de execução original também listava neste
circuito — **já fechou em 2026-08-26**, dentro do Circuito 1: ver linha 937 abaixo.

**Circuito 3 — Superfície do contador (Sonnet), 08.7 → 08.8 → 08.11 → 08.13, todas em produção.**
Modelo `.xlsx` pré-preenchido gerado no navegador (08.7); formulário direto para os 8.241 grupos de
1 estabelecimento (08.8); tela `/cobertura` com drill-down nominal e revogação de token (08.11) —
com a view de mascaramento do token ESCRITA mas **não aplicada**, pendente de revisão de Maxwell
(`sql/22_cobertura_08_11.sql` Parte 2, orientacoes.md §2.24); e, **com confirmação explícita de
Maxwell antes da escrita**, os 9.186 tokens reais das 4 campanhas (08.13) — 5 a menos que os 9.191
"medidos", por 5 e-mails isolados malformados na RFB, descartados e reportados em vez de semeados
em silêncio. Nenhum e-mail disparado — isso é a 08.15, sob ordem de Maxwell. Suíte ao fim do
circuito: **222 testes, as mesmas 3 falhas de sempre** (`cartas`, §7.1b) — zero regressão em três
subetapas.

**Circuito 1 — Preparo externo.** DMARC organizacional publicado e `dmarc=pass` medido em Gmail e
Outlook; `envios.sindcompassos.org` autenticado na Brevo; 11 páginas do site conferidas por
requisição real; 6 assinaturas institucionais instaladas; e os **três textos jurídicos em forma
final**, com as correções de Maxwell e do Dr. Adenilson, assinados por **OAB/MG 96.522**. A
conversão para `.docx`/`.pdf` ficou com Maxwell, fora do repositório.



**08.4 → 08.9 → 08.5 → 08.6 → 08.10**, as cinco em produção. O caminho completo do dado existe:
tabela fechada → contabilidade semeada → recepção → página do contador → cadastro pela Denise.

**A métrica da etapa saiu de zero.** Estabelecimentos com ao menos um trabalhador vinculado:
**0 → 2**. `trabalhadores` 3 → 6, `vinculos_empregaticios` 0 → 3. `contabilidades` 0 → **951**
(950 semeadas + 1 DEMO) e `contabilidade_estabelecimentos` 0 → **7.440**.

**Suíte: 202 testes, 3 falhas.** Eram 5 na abertura do circuito; **duas desapareceram sozinhas**
quando a 08.10 criou os primeiros vínculos — as de `dashboard`, exatamente como o handoff previu.
As 3 remanescentes são de `cartas`, que fixa contagens do cenário DEMO Kabum (§7.1b).

**Quatro achados reais, todos corrigidos e registrados em `orientacoes.md`:**
§2.16b (`REVOKE` que não é seu é no-op silencioso) · §2.17b (função de trigger nasce chamável como
RPC) · §2.22 (três armadilhas do primeiro bucket privado) · §2.23 e §2.23b (o vocabulário
"sindicalizado" virava Bronze; e cabeçalho ausente é pior que valor errado, porque nem gera aviso).

**Circuito 1 fechou por completo em 2026-08-26.** A 08.3(b) — textos jurídicos revisados e
assinados por **Adenilson Antonio Silva, OAB/MG 96.522** — foi a última peça, e destrava o eixo
Requisição (08.14/08.15). Resta só publicar a página pública no site e conferir que a URL responde
200 — isso é verificação da própria 08.14, não uma subetapa à parte.

**O merge continua sendo atribuição exclusiva de Maxwell.** A branch é `feature/comunicacao-externa`.

### Estado medido em 2026-08-24 (reconferido nesta sessão, contra produção)

| | |
|---|---|
| `trabalhadores` / `vinculos_empregaticios` | **1** / **0** |
| Estabelecimentos com trabalhador vinculado | **0** ← é esta a métrica da etapa |
| Estabelecimentos / empresas | 17.300 / 16.671 |
| Estabelecimentos com e-mail | 15.679 |
| **Caixas de e-mail únicas** | **9.191** |
| Concentração A (20+) · B (5–19) · C (2–4) · D (1) | 89 / 248 / 613 / 8.241 caixas → 3.758 / 2.189 / 1.491 / 8.241 estabs |
| SPF do domínio | `v=spf1 include:spf.titan.email ~all` |
| **DMARC** | **não existe** (`_dmarc.sindcompassos.org` → NXDOMAIN) |
| `envios.sindcompassos.org` | **não existe** (NXDOMAIN) |
| Tabelas da spec já existentes | **nenhuma** das 5 |
| Buckets de Storage no projeto | **zero** — o Storage nunca foi usado neste CRM |

Todos os números da spec foram reconferidos por query e batem **exatamente**. Nada precisou ser
recalibrado.

### Três correções de medição à spec (medidas, não supostas)

1. **A gravação em lote de 500 linhas NÃO é uma Edge Function** (a spec §4 diz que é). Ela vive em
   `src/features/importacao/api.ts` e roda no navegador, pela anon key, como o Admin logado. Isso
   é melhor, não pior: continua sem `service_role` no frontend, como manda o `CLAUDE.md`. A
   Subetapa 08.10 reaproveita `importarTrabalhadores` de lá — a Edge Function nova (08.5) só
   **recebe** o arquivo e cria a remessa, e nunca escreve em `trabalhadores`.
2. **Não existe biblioteca de planilha no projeto.** `papaparse` lê CSV; a D6 (só `.xls`/`.xlsx`)
   e o modelo pré-formatado da §7 exigem uma dependência nova de leitura/escrita de XLSX no
   navegador. **Decisão tomada por Maxwell em 2026-08-24: entra `exceljs`** — tem formatação de
   célula (`numFmt: '@'`, que é a defesa contra o Excel comer zero à esquerda) e é mantido, ao
   contrário do pacote `xlsx` do npm, parado em 0.18.5. Não é troca de stack: `papaparse` continua
   sendo o leitor de CSV da importação interna, e o `exceljs` só atende o canal externo (08.7 e
   08.6), onde a D6 proíbe CSV.
3. **Zero buckets de Storage existem.** O bucket privado da 08.5 é território novo neste projeto —
   policies de `storage.objects` são um mecanismo distinto da RLS das tabelas e entram no escopo
   do portão adversarial da 08.12.

### Dependências externas (não são tarefa do CODE)

| Dependência | De quem | O que bloqueia |
|---|---|---|
| Registro **DMARC** e DNS do subdomínio | Maxwell (painel DNS) | **tudo** — sem isso o aquecimento é desperdício |
| Conta no ESP e verificação de domínio | Maxwell | 08.13 em diante |
| **Nota técnica jurídica** (LGPD art. 11) | Adenilson | só o **eixo Requisição**; os eixos Estrutural e Informativo seguem sem ela |
| Aprovação das copies e ordem de disparo | Maxwell | 08.15 |

### Ordem de construção e caminho crítico (spec §11)

**Caminho crítico: 08.1 → 08.4 → 08.5 → 08.6 → 08.12 → 08.15.** Um dia parado na 08.1 é um dia
parado no fim.

Uma dependência que a spec não explicita e que a execução exige: **a 08.9 (semeadura) vem antes da
08.7**, porque o modelo pré-preenchido precisa saber quais estabelecimentos são de cada contador —
e antes da 08.13, que gera um `envios_campanha` por contabilidade. Ela só depende das tabelas
(08.4), então sobe cedo.

### Circuito de execução (cravado — 4 circuitos, 2 trocas de modelo)

As subetapas **não se executam na ordem numérica**: elas se executam em blocos que respeitam a
dependência **e** agrupam o mesmo modelo, para que uma sessão vá do começo ao fim sem trocar de
LLM no meio. Numeração é endereço; circuito é itinerário.

| Circuito | Subetapas, nesta ordem | LLM | O que fecha o circuito |
|---|---|---|---|
| **1 — Preparo externo** ✅ | **08.1** → 08.0 → 08.2 → 08.3 | **Opus** | **CONCLUÍDO em 2026-08-26.** DMARC publicado e `dmarc=pass` medido nos dois receptores; links conferidos; assinaturas instaladas; três textos jurídicos em forma final, revisados por Maxwell e pelo Dr. Adenilson |
| **2 — Núcleo seguro** ✅ | **08.4** → **08.9** → **08.5** → **08.6** → **08.10** | **Opus** | **CONCLUÍDO em 2026-08-26.** O caminho completo do dado: tabela fechada → contabilidade semeada → recepção → página do contador → cadastro pela Denise |
| **3 — Superfície do contador** ✅ | 08.7 → 08.8 → 08.11 → 08.13 | **Sonnet** | **CONCLUÍDO em 2026-08-26.** Modelo `.xlsx`, formulário, tela de cobertura (token mascarado pendente de revisão) e os 9.186 tokens reais das 4 listas por caixa |
| **4 — Portão e copies** ✅ | **08.12** → 08.14 | **Opus** | **CONCLUÍDO em 2026-09-01.** Relatório adversarial verde e aplicado em produção; as 4 copies fechadas e revisadas por Maxwell. **A 08.15 (onda 1) saiu deste circuito e virou a Subetapa 9.2 da ETAPA 09** — disparar não é construir |

**Por que assim:**

- **O circuito 1 roda em Opus mesmo carregando duas subetapas de Sonnet** (08.0 e 08.2). São
  medição curta e configuração de assinatura; trocar de modelo por elas custaria mais que
  executá-las no modelo já carregado.
- **O circuito 2 é o que não pode ser partido.** As cinco subetapas são a mesma cadeia de
  raciocínio sobre a mesma superfície — RLS, token, bucket, dado pessoal, escrita cadastral —, e
  todas são Opus por decisão da etapa. Partir aqui é justamente onde a ETAPA 07 mostrou que se
  perde contexto de segurança. **A 08.6 se prova com um token de bench criado à mão**; ela não
  espera a 08.13, que é a geração dos tokens reais da campanha.
- **O circuito 3 é o único bloco Sonnet**, e é inteiro de frontend com critério mecânico — os três
  `[Goal]` da etapa e a exportação. Entra depois do 2 porque tudo ali consome o que o 2 criou.
- **O circuito 4 volta para Opus** e absorve a 08.15, que isolada seria Sonnet: é 1 item, está
  colada no portão adversarial, e uma anomalia de entregabilidade precisa ser diagnosticada na
  hora, não numa sessão seguinte.

**Os circuitos 1 e 2 podem correr na mesma sessão Opus** (o 1 depende de Maxwell no painel de DNS;
o 2 não espera por ele). Só a **08.3(b)** e a **08.15** dependem de terceiros para fechar — e
ambas estão no fim, de propósito.

**Trocas de modelo em toda a etapa: duas** — 2→3 e 3→4.

### Portão de saída da etapa

**Métrica principal, e é uma só: estabelecimentos com ao menos um trabalhador vinculado.** Hoje
zero. Abertura e clique são diagnóstico, não resultado.

**Gatilho de revisão (não de comemoração):** ao fim da onda 2, ter recebido remessa de **pelo menos
15 das 337 contabilidades** (≈4,5%). Abaixo disso, o problema está na copy ou no argumento
jurídico — e insistir com volume maior só queima base.

**Regra herdada da ETAPA 07 e não negociável:** o CODE executa, mede e relata; **ordenar o disparo
para fora e ordenar qualquer merge são atribuição exclusiva do Maxwell** — mesmo com tudo verde.

### Fora de escopo nesta etapa (YAGNI declarado, spec §12)

Login de contador / Área do Contador completa · editor de campanhas dentro do CRM · espelhamento
de métricas de abertura/clique no CRM · WhatsApp, agente de resposta automática e agente 24/7.
**Nada de n8n e nada de `pg_cron` no envio** (decisão D2): o n8n ainda não é self-hosted 24/7 e
depender dele cria falha invisível — "achar que enviou". O `pg_cron` volta depois, e só para
vigilância interna.

---

### Subetapa 08.0 — Verificação do site e dos links públicos [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
**Executada em 2026-08-24.** As 11 páginas do site respondem 200. Os cinco 301
(`/servicos/`, `/curriculo`, `/vaga`, `/denuncia`, `/termos`) são normalização de barra
final e um rename, e todos terminam em 200. A página da nota técnica ainda não existe (404),
como previsto. **Dois achados fora do previsto:** (1) `http://sindcompassos.org` responde
**200 direto, sem redirecionar para HTTPS**, e não há HSTS — numa campanha cuja copy
argumenta LGPD, mandar o contador para um site que aceita HTTP puro é um contra-argumento
de graça; (2) o DKIM institucional **já existia** (`titan1._domainkey` do Titan e
`default._domainkey` do Exim), o que reduziu o risco previsto na 08.1. A lista precisa ser
reconferida imediatamente antes da 08.15.
Objetivo: saber, antes de mandar 9.191 pessoas para o site, que tudo que a copy vai citar está de pé.
Conclusão: tabela URL → código HTTP de todas as páginas e links que as copies citarão (home, quem
somos, CCTs, contatos institucionais, formulário de filiação), com **zero** respostas fora de 200 —
e as pendentes (a página da nota técnica, que ainda não existe) nomeadas explicitamente como
pendentes, não como falhas.
Qualidade: verificação por requisição real, nunca por leitura de menu. Link quebrado citado em
e-mail de campanha custa credibilidade em escala, e a lista precisa ser reconferida imediatamente
antes da 08.15, não só aqui.
Evidência: tabela de URLs com status, datada, em `docs/plano_comunicacao_externa.md`.
Esforço máximo: 1 passada (não é `/goal`).
Escalonamento de LLM: Sonnet; não escala — é medição.
Se esgotar: listar o que está quebrado e parar; corrigir o site não é escopo desta etapa.

### Subetapa 08.1 — Subdomínio de envio, ESP e autenticação de e-mail [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Feito e medido em 2026-08-24.** DMARC organizacional publicado (`p=none`, `rua` para
`deploycrm@`, `adkim=r`, `aspf=r`) e conferido idêntico em 3 resolvedores. ESP escolhido:
**Brevo**, conta criada por Maxwell. `envios.sindcompassos.org` **autenticado e com a marca**
(subdomínio de rastreio `em`), com os **7 registros** publicados na HostGator e conferidos um
a um por `nslookup` antes da verificação do fornecedor. Remetente
`sindicato@envios.sindcompassos.org` criado e verificado, com DKIM e DMARC verdes no painel.
**E-mail de teste real recebido**, com `spf=pass`, `dkim=pass` (`header.i=@envios.sindcompassos.org`,
seletor `brevo2`) e `dmarc=pass` no Gmail.

**Duas decisões contra a recomendação do fornecedor**, ambas deliberadas: recusada a
delegação de **NS** e a configuração automática (entregariam a terceiro autoridade de DNS
sob `sindcompassos.org` — ampliação de superfície por comodidade, logo antes de um portão
adversarial); e o `_dmarc.envios` foi publicado com o **nosso** `rua` em vez do da Brevo,
que receberia os relatórios da nossa própria campanha (`orientacoes.md` §3.8). A verificação
da Brevo passou verde nas duas.

**Fechamento em 2026-08-25.** No primeiro teste o Outlook devolvia `dkim=timeout` — DMARC
passava pelo SPF, mas o DKIM não era verificado. **Resolvido sozinho no dia seguinte, sem
alteração nossa**: medido no código-fonte da mensagem recebida, `dkim=pass` **true**,
`dkim=timeout` **false**, mais `spf=pass`, `dmarc=pass` e `compauth=pass`, com
`header.d=envios.sindcompassos.org` e seletor `brevo2`. O Gmail passa igual. **Critério
cumprido nos dois receptores.**

**Correção de diagnóstico, registrada de propósito.** Atribuí o timeout à latência da cadeia
de CNAME da Brevo. **A medição do dia seguinte falseou essa explicação:** a cadeia ficou mais
lenta (108–923 ms, contra 83–239 ms na véspera), com o salto da Brevo firme em 243–503 ms — e
mesmo assim passou. Logo, latência não era a causa. A hipótese remanescente é cache negativo
no resolvedor da Microsoft, com TTL expirado, **mas não foi medida e não deve ser afirmada**.
O que fica é operacional: **a verificação DKIM de domínio recém-autenticado pode falhar nas
primeiras horas e se corrigir sozinha** — reconfirmar antes da onda 1 em vez de concluir pela
primeira leitura.

**Cautela mantida:** não endurecer o DMARC para `quarantine` sem reconfirmar o DKIM na
Microsoft. Se o contador **encaminhar** o e-mail internamente — e a spec §5.5 conta com isso —,
o encaminhamento quebra o alinhamento de SPF e o DMARC passa a depender só do DKIM.

**Defeito conhecido, correção agendada para a 08.14:** o `Reply-To` sai como
`sindicato@envios.sindcompassos.org`, e **esse subdomínio não tem MX** — quem responder recebe
erro de entrega. Toda campanha real com `Reply-To: secretaria@sindcompassos.org`.

Objetivo: `envios.sindcompassos.org` existindo, verificado no ESP, com SPF, DKIM e **DMARC** —
que hoje não existe — de modo que o disparo em massa não queime o e-mail institucional (D1).
Conclusão: (1) `nslookup -type=TXT _dmarc.sindcompassos.org` devolve um registro `v=DMARC1`;
(2) o painel do ESP mostra SPF e DKIM **verificados** para o subdomínio; (3) um e-mail de teste
enviado pelo ESP chega à caixa de entrada de um Gmail **e** de um Outlook, e o cabeçalho
`Authentication-Results` do original mostra `spf=pass dkim=pass dmarc=pass`.
Qualidade: o DMARC nasce em `p=none` com `rua` apontando para uma caixa monitorada — endurecer
para `quarantine` só depois de duas semanas de relatório limpo, porque `p=reject` com DKIM mal
configurado derruba o e-mail institucional inteiro. E **o SPF do Titan não é tocado**: a
comunicação institucional (contato, presidência, jurídico) não pode parar por causa da campanha.
Evidência: saída literal do `nslookup` das três consultas + cabeçalho `Authentication-Results`
colado dos dois e-mails de teste recebidos.
Esforço máximo: 2 rodadas de ajuste de DNS (propagação conta como espera, não como tentativa).
Escalonamento de LLM: Opus desde a 1ª — é identidade de e-mail, superfície de spoofing.
Se esgotar: parar e relatar qual dos três (SPF/DKIM/DMARC) não fecha e por quê. **Nenhum disparo
acontece com este item vermelho.**

### Subetapa 08.2 — Assinaturas institucionais padronizadas [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
**Instaladas e conferidas por Maxwell em 2026-08-25.**
**Duas correções no caminho, e a segunda desmentiu a primeira.** (1) O botão de cópia
falhava sempre: os dois caminhos usavam `navigator.clipboard`, que exige `clipboard-write`,
não concedida ao iframe — caminho de recuo que compartilha a dependência do principal não é
recuo. (2) Corrigido isso, a cópia funcionava mas **o editor do Titan normalizava os estilos
inline** e a assinatura chegava sem a barra vermelha e sem hierarquia. Ou seja: o problema
nunca foi o escape de tags que eu supus no início, era a normalização. **A solução real é
colar HTML cru no editor de código do Titan** — a página passou a exibir o código de cada
assinatura, indentado e legível, com cópia em texto puro, e o botão de cópia formatada foi
removido por produzir resultado errado.
**Entregue em 2026-08-24:** `docs/assinaturas_institucionais.md` (fonte de verdade) + página
publicada com as 6 assinaturas renderizadas em fidelidade e botões que copiam `text/html` +
`text/plain` — o que contorna o editor do Titan, que escapa tags quando se cola HTML cru.
As 6 caixas e seus papéis, definidos por Maxwell: `contato@` (público), `secretaria@`
(empresas/estabelecimentos/contabilidades e campanhas em massa), `comercial@` (parceiros),
`juridico@`, `presidencia@`, `deploycrm@` (dev).
Qualidade: identidade conforme `docs/design-tokens.md`; **sem imagem**, porque Outlook e
Hotmail bloqueiam imagem externa por padrão e o logotipo viraria retângulo vazio justamente
para o contador que abre o primeiro e-mail; tabela com estilo inline (o Outlook renderiza com
o motor do Word); fontes da marca com pilha de fallback real, já que e-mail não carrega
Google Fonts. Assinatura **setorial** onde a caixa é operada por várias pessoas — nome de uma
só pessoa passa a mentir quando ela sai.
**Bug corrigido em 2026-08-25.** O botão "Copiar assinatura" falhava com "Não foi possível
copiar", e a causa era minha: os **dois** caminhos usavam `navigator.clipboard`, que exige a
permissão `clipboard-write` — não concedida ao iframe onde o artefato roda. As duas
tentativas eram rejeitadas e o código caía no erro final. Corrigido com **seleção de DOM +
`execCommand('copy')`**, que funciona em iframe sob gesto do usuário e preserva o HTML com
estilos inline (que é o que o editor do Titan precisa); e com um último recuo que **seleciona**
a assinatura e instrui Ctrl+C. Lição: caminho de recuo que compartilha a mesma dependência do
caminho principal não é recuo nenhum.
**Não concluída porque o critério exige a assinatura instalada e conferida em Gmail (web e
celular) e no Outlook.** A instalação é por caixa, no webmail do Titan, e exige a senha de
cada uma — o CODE não digita credencial. **Faltam 3 dados** que não serão inventados:
sobrenome do Adenilson, **sua inscrição OAB/MG** (a nota da 08.3 vai ao ar assinada) e
sobrenome do Davi. Prioridade: `secretaria@` primeiro, por ser o Reply-To de toda a etapa.
Objetivo: toda caixa institucional respondendo com a mesma assinatura, para que a resposta humana
à campanha pareça a mesma instituição que mandou o e-mail.
Conclusão: cada caixa institucional em uso tem assinatura configurada com nome, cargo, telefone e
site; um e-mail de teste enviado de cada uma exibe a assinatura corretamente no Gmail web e no
aplicativo de celular.
Qualidade: identidade visual conforme `docs/design-tokens.md` — nunca inventar paleta; sem imagem
remota pesada (assinatura com imagem externa é bloqueada por padrão em muitos clientes e vira
retângulo vazio); texto em pt-BR.
Evidência: print de um e-mail recebido por caixa, nas duas telas.
Esforço máximo: 1 passada por caixa.
Escalonamento de LLM: Sonnet; não escala.
Se esgotar: relatar as caixas que ficaram sem assinatura. Não bloqueia o caminho crítico.

### Subetapa 08.3 — Nota técnica jurídica (LGPD art. 11) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**(a) Rascunho entregue em 2026-08-24:** `docs/nota_tecnica_lgpd_rascunho.md`, marcado
"RASCUNHO — não publicar", com aviso explícito de que não é parecer e de que as citações
foram escritas de memória e precisam ser conferidas na fonte. Traz os fatos medidos, os seis
campos separados entre comuns (art. 7º) e o único sensível (art. 5º, II), as hipóteses
candidatas do art. 11 com o argumento de cada uma, a estrutura da página pública e as
perguntas abertas — cada decisão marcada **[DECISÃO JURÍDICA]**.
Dois pontos que o rascunho levanta e que não estavam na spec: (1) **o melhor argumento
inverte a intuição** — registrar quem se opôs é a *condição* para respeitar a oposição, ou
seja, o dado sensível é coletado para produzir uma abstenção do sindicato, não uma ação
contra o trabalhador; (2) **a contabilidade e a empresa também são controladoras** e
precisam de base própria para *compartilhar* — sem responder "por que **você** pode nos
enviar", o contador cauteloso trava mesmo concordando com o resto.
**Lacuna operacional descoberta no caminho:** a pergunta mais forte da nota — se alguma
CCT/ACT já obriga a empresa a informar o quadro de empregados — **não pôde ser verificada**:
as 27 convenções (5 CCTs + 22 ACTs) estão cadastradas com `documento_url` vazio em 27 de 27,
e só 1 tem `data_limite_oposicao` preenchida. Fora do escopo desta etapa, mas vale fechar.
**Atualizado em 2026-08-25 com as decisões de Maxwell**, que reorganizam a nota: as **CCTs já
obrigam** contabilidades e empresas a fornecer a relação de funcionários quando solicitadas —
o argumento sai da interpretação e vira **contratual**; base do art. 11 decidida (**II "a"**
para os controladores, **II "d"** para o Sindcom); **CLT art. 513 "e"** (impor contribuições)
entra e fecha o encadeamento do campo sensível — se o STF só valida a cobrança *com* direito
de oposição assegurado, **registrar a oposição é condição de legalidade da cobrança**; Tema
935 / ARE 1018459 confirmado; política de guarda definida (Carta de Exclusão, retenção
mínima, 20 anos por analogia à Lei 13.787/2018); canais do art. 18 nomeados.
**Três ressalvas técnicas registradas no esboço:** a Lei 13.787/2018 trata de prontuário de
paciente, então é **analogia** e a nota deve dizê-lo; "CPF anonimizado" guardado junto de
iniciais, município e histórico provavelmente permite reidentificação — é
**pseudonimização**, e prometer anonimização é mais difícil de sustentar; e o Brasil **não
ratificou a Convenção 87 da OIT**, erro comum ao tratar de ato antissindical.
**Escopo ampliado: três produtos**, não um — Nota Oficial (PDF denso, com o enquadramento de
ato antissindical), Nota Resumida (1 folha) e a página pública. **Conflito a decidir:** a
Resumida iria como **anexo** nos e-mails, mas a 08.14 tem "nenhum anexo" como critério de
qualidade, porque anexo em disparo em massa derruba entregabilidade — recomendação: hospedar
o PDF e mandar link.
**Literatura recebida e lida em 2026-08-25** — 12 PDFs em `docs/fundamentos` (fora do git,
por `.gitignore`): 5 CCTs, Cartilha e Manual de Atos Antissindicais, Convenção 98 da OIT,
CF/88, CLT, LGPD e Lei 13.787.

**A cláusula foi encontrada, e a premissa de Maxwell se confirmou.** Cuidado de método que
vale registrar: a primeira cláusula localizada — **"RELAÇÃO DE FUNCIONÁRIOS"** — **não
serve**, porque é condicionada ao interesse da empresa nas cláusulas de trabalho em feriado
e seu objeto é FGTS Digital/GFIP/RAIS. Concluir ali teria produzido um relatório errado
dizendo que a premissa não se sustentava. A cláusula correta é outra, **incondicional**, na
**Contribuição dos Empregados, Parágrafo Segundo** (Cl. 34ª no Fecomércio Atacadista, 32ª no
SindSuper): *"Dentro de 15 dias do desconto, as empresas encaminharão à Entidade Profissional
cópias de comprovação dos recolhimentos dos valores, acompanhadas das relações de empregados
contribuintes, das quais constem os salários anteriores e os corrigidos."*

**Achado que fortalece o argumento além do previsto:** a CCT permite que o trabalhador se
oponha **por escrito perante a empresa**, e obriga o sindicato a **devolver** valor
descontado de quem se opôs. Logo, quando a oposição é manifestada na empresa, **só a empresa
sabe** — e, se ela não informa, o sindicato cobra de quem se opôs e passa a dever devolução.
O pedido de dados **não cria dever novo: resolve a assimetria que a própria convenção
instituiu.** É o clímax dos três documentos.

**Recuo recomendado no enquadramento antissindical** (aceito por Maxwell em 2026-08-25): o
Manual confirma que o catálogo clássico gira em torno de dispensa, greve, negociação e
filiação — recusar dados cadastrais **não figura nele**. O argumento principal passa a ser o
descumprimento da cláusula convencional, com o antissindical em plano subsidiário e **apenas
na Nota Oficial**. Confirmado também que a **Convenção 87 não foi ratificada pelo Brasil**,
devendo ser citada como princípio de observância obrigatória (Declaração da OIT de 1998), e
não como norma interna; a **Convenção 98** é o Decreto 33.196/1953, vigente.

**Três textos entregues** em `docs/juridico/`, em `.md` (fonte versionada) e **`.docx`**
gerado via automação do Word, para o Dr. revisar com controle de alterações: Nota Oficial
(10 páginas), Resumida (3) e página pública (4). **Decisão de sequência: nada foi
diagramado** — os textos vão mudar na revisão dele, e formatar antes seria retrabalho. As
instruções de diagramação estão escritas em cada arquivo.

**Decisão de Maxwell em 2026-08-25: nenhum anexo nos e-mails**, nem a Nota Resumida — tudo
por link, alinhando a 08.3 ao critério de entregabilidade da 08.14. Conflito resolvido.

**⚠️ Pendência:** **duas CCTs não puderam ser lidas** — `Sincovaga Alimentício` e `SinPas
Varejista` são PDFs digitalizados (zero texto extraível), e o ambiente não tem OCR nem
`pdftoppm` para renderizar página. Não é limitação de esforço, é de ferramenta. Maxwell está
providenciando versões em texto. Até lá o §5.1 da Nota Oficial cobre **3 das 5 CCTs**, e os
**22 ACTs** não foram examinados.
**(b) ✅ FECHADA em 2026-08-26.** As correções de Maxwell e do Dr. Adenilson foram aplicadas nos
três textos: os **dois pontos centrais** no item 2 da Nota Oficial (o pedido dos dados dos
sindicalizados, pela via dos direitos individuais que a contribuição gera, ao lado do argumento já
existente sobre a oposição); a tabela de cláusulas completa nas **5 CCTs**; o quadro dos quatro
prazos de oposição; a explicação em linguagem corrente das medidas de segurança; e assinatura e
data preenchidas — **Adenilson Antonio Silva, OAB/MG 96.522**.

**A conversão para `.docx` e `.pdf` fica com Maxwell**, que a executa fora do repositório e
apresentará os arquivos finais depois. Os `.md` versionados seguem sendo a fonte de verdade. Há em
`scripts/md_para_html_juridico.mjs` um conversor `.md → .html` funcionando; o
`scripts/gerar_docx_juridico.ps1`, que fecharia o ciclo pelo Word, **trava** e está commitado com
aviso no topo e as quatro hipóteses já refutadas.

**O eixo Requisição (08.14/08.15) deixa de estar bloqueado por este item.** Resta apenas publicar
a página no site e conferir que a URL responde 200 — verificação da própria 08.14.
Objetivo: ter, público e assinado, o fundamento legal do pedido — porque "sindicalizado ou
oposição" é **dado pessoal sensível** (LGPD art. 5º, II) e não se apoia nas bases comuns do art. 7º.
Conclusão: **duas metades, e só a segunda fecha a subetapa.** (a) O CODE entrega ao Adenilson um
rascunho estruturado com a linha de argumentação e os dispositivos — CF art. 8º, III; CLT art. 513;
LGPD art. 7º e art. 11 com as hipóteses candidatas e o motivo de cada uma. (b) A versão **revisada
e assinada pelo Adenilson** está publicada como página fixa no site e a URL responde 200.
Qualidade: **o CODE não decide a base legal e não assina nada.** Um contador bem informado que
perguntar "qual sua base do art. 11?" precisa receber resposta precisa e citada; resposta genérica
nesse ponto desmonta o pedido inteiro — e não só com aquele contador, porque contadores conversam
entre si.
Evidência: o rascunho commitado em `docs/` + a URL pública da nota assinada respondendo 200.
Esforço máximo: 1 rascunho + 1 rodada de ajuste após leitura do jurídico.
Escalonamento de LLM: Opus desde a 1ª — argumentação jurídica sobre dado sensível.
Se esgotar / se o Adenilson não devolver: **o eixo Requisição fica bloqueado** (08.14 e 08.15); os
eixos Estrutural e Informativo seguem. Relatar o bloqueio a Maxwell, nunca improvisar fundamentação.

### Subetapa 08.4 — Esquema das tabelas novas, com RLS e policy explícita [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Aplicada em 2026-08-26**, em `sql/20_comunicacao_externa.sql`, no bench e em produção.
As seis tabelas existem com RLS ligada e policy explícita (4 policies cada, exceto
`modelos_coleta` com 2 e `remessas_dados` com 3). **Idempotência medida, não suposta:** a 2ª
aplicação em produção deixou colunas, policies, constraints, índices, triggers e grants com
`md5` **idêntico**, e `modelos_coleta` em 1 linha.

**Divergência do critério, e ela é para mais, não para menos.** O critério dizia "`anon`
recebendo `[]` nas seis tabelas". Medido por requisição real com a anon key, `anon` recebe
**HTTP 401 / 42501** — `revoke all ... from anon` derruba a chamada no GRANT, **antes** de a
policy ser avaliada. `[]` seria a negativa por ausência de policy; 401 é a negativa uma camada
acima. A suíte asserta as duas coisas: dado nenhum sai **e** o erro é de privilégio.

**Um achado real, encontrado pelo advisor logo após a migração subir.** As duas funções de
trigger novas (`fn_normaliza_email_contabilidade`, `fn_remessa_imutavel`) nasceram com
`EXECUTE` para PUBLIC — privilégio de fábrica de toda função nova —, e o PostgREST publica
toda função de `public` como RPC. É a **segunda das três brechas** que o `CLAUDE.md` manda
procurar. Revogado de `public, anon, authenticated`, e **medido depois**: o INSERT continua
normalizando o e-mail e o UPDATE continua sendo recusado — o Postgres confere `EXECUTE` de
função de trigger na hora de **criar** o trigger, não na de disparar (`orientacoes.md` §2.17b).

**Duas decisões de escopo, declaradas:**
1. **A tabela de tentativas do rate limit não está aqui.** Ela é da 08.5, ao lado da Edge
   Function que a usa — mesmo arranjo de `tentativas_checkin` em `19_hardening_adversarial.sql`.
   A 08.4 entrega exatamente as seis tabelas da spec.
2. **A Secretaria lê `envios_campanha` inteira, e a coluna `token` está nela.** RLS restringe
   quais *linhas*, nunca quais *colunas*. Adiar essa leitura não era opção: a 08.10 é a tela
   dela, e sem `envios_campanha` não há caminho de `remessas_dados` até o nome da contabilidade.
   **A 08.11 fecha isso** com view `SECURITY DEFINER` de filtro interno (padrão de
   `v_fila_parceiro`) — e o requisito "o token não aparece em claro para quem não é Admin" já é
   critério de conclusão dela. Registrado aqui para entrar no escopo do portão da 08.12.

**Evidência:** `tests/rls/comunicacao.spec.ts` — **18/18 em produção** (1 pulado: imutabilidade
da remessa só pode ser exercitada por quem insere remessa, e por desenho isso é exclusividade da
`service_role`) e **19/19 no bench**. Suíte completa: **179 testes, 5 falhas — as mesmas 5
pré-existentes**, em `cartas` e `dashboard`, por a base não ter trabalhador aprovado nem vínculo.
Nenhuma regressão. `typecheck` limpo. Varredura de catálogo: 14 views, e a única sem
`security_invoker` é `v_fila_parceiro`, exceção deliberada já documentada em §2.15.

Objetivo: `contabilidades`, `contabilidade_estabelecimentos`, `modelos_coleta`, `campanhas`,
`envios_campanha` e `remessas_dados` no banco, nascidas fechadas (spec §5).
Conclusão: `sql/20_comunicacao_externa.sql` aplicado e **idempotente** (2ª execução com delta
zero), e as quatro medições abaixo, todas por query de catálogo — não por leitura de migration:
(1) toda tabela nova com `rowsecurity = true` **e** ao menos uma policy nomeada;
(2) zero grants de `TRUNCATE`/`REFERENCES`/`TRIGGER` para `anon`/`authenticated` nelas (§2.16);
(3) nenhuma view nova sem `security_invoker = on` (§2.15);
(4) `tests/rls/comunicacao.spec.ts` verde, com `anon` recebendo `[]` nas seis tabelas e o Admin
lendo — o controle negativo prova que a política não é "negar tudo".
Qualidade: `envios_campanha.token_expira_em` é **NOT NULL com default de 90 dias** — o token da
guia pública não expira, e isso ficou como pendência aberta da ETAPA 07; não repetir o erro numa
tabela nova. `token_revogado_em` desde a criação. `check (contabilidade_id is not null or
estabelecimento_id is not null)`. `remessas_dados` é **imutável**: correção cria remessa nova.
Nenhum `DEFAULT` de coluna chamando função cujo `EXECUTE` será revogado depois (§2.17).
`modelos_coleta` recebe o modelo v1 "Cadastro sindical 2026" por `INSERT` na própria migration,
com as 6 colunas mapeadas ao template de `specs/importacao.md` §3.3 — **nenhuma alteração em
`trabalhadores` é necessária**, e `nivel` continua coluna gerada, jamais escrita.
Evidência: saída das 4 queries de catálogo + resultado da suíte + delta zero na 2ª aplicação.
Esforço máximo: 2 tentativas (não é `/goal` — RLS é Manual estrito por regra do projeto).
Escalonamento de LLM: Opus desde a 1ª.
Se esgotar: parar com o SQL **não aplicado** e relatar. Tabela nova aberta é pior que tabela nova
inexistente.

### Subetapa 08.5 — Bucket privado + Edge Function de recepção da remessa [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**No ar em produção em 2026-08-26.** `sql/21_remessas_recepcao.sql` (bucket privado `remessas`,
policy de leitura interna e `tentativas_remessa`) aplicado em produção e no bench; Edge Function
`receber-remessa` publicada com `verify_jwt = false`.

**As seis medições do critério, todas por requisição real contra produção, com token DEMO:**

| # | O que | Resultado medido |
|---|---|---|
| 1 | POST token válido + `.xlsx` | `ok:true` · objeto de 3.640 B no bucket privado · `remessas_dados` com `status='recebida'`, `ip_origem` e `user_agent` (`curl/8.21.0`) preenchidos |
| 2 | Token inexistente / expirado / revogado | **HTTP 200 + `{ok:false, erro:...}`** nos três, com mensagem distinta. Zero exceções |
| 3 | 7 tentativas no mesmo token | 1–5 passam · **6ª e 7ª freadas** · e `tentativas_remessa` tem **5 linhas** — o contador subiu de verdade, que é exatamente onde a 1ª correção do check-in falhou em silêncio |
| 4 | Bucket por `anon` | URL pública → 400 · objeto direto → `NoSuchKey` · **listar → `[]` com objeto DENTRO** · assinar → negado · escrever → 403 RLS |
| 5 | `.csv` renomeado `.xlsx` | Recusado **por conteúdo**: falta assinatura ZIP e `[Content_Types].xml` |
| 6 | Base cadastral | `trabalhadores = 3`, `vinculos = 0` — **inalterados**. A função não tem uma linha de código que escreva neles |

Extras medidos: arquivo de 22 MB recusado (teto de 5 MB no servidor **e** no bucket); `DELETE`
devolve 405; preflight CORS responde 204 com a origem de `crm.sindcompassos.org`.

**Dois achados que só apareceram porque se mediu comportamento, e não configuração:**

1. **Bucket privado sem policy nenhuma nega o `authenticated` também** — e o sintoma é
   `"Object not found"`, não "permissão negada". Medido com login de Admin **antes** de existir
   policy: `list = []`, `createSignedUrl` = "Object not found". A 08.10 exige abrir a planilha por
   URL assinada; sem esta medição, ela teria sido construída contra um bucket ilegível.
   Corrigido com uma policy de `select` restrita ao bucket e a Admin/Presidente/Secretaria. O
   controle negativo confirma o recorte: Jurídico, Parceiro e `anon` continuam em zero.
2. **O `REVOKE` do TRUNCATE de fábrica em `storage.*` não funcionou, e não deu erro.** O
   `postgres` deste projeto não é superuser nem membro de `supabase_storage_admin`, e `REVOKE` do
   que não é seu é **no-op silencioso**. Item **ACEITO COM MOTIVO** para a 08.12, não resolvido:
   o schema `storage` não é exposto pelo PostgREST (medido) e não há verbo TRUNCATE em REST.
   Registrado em `orientacoes.md` §2.16b e §2.22.

**Três decisões de projeto, declaradas:**
- **Duas ações no mesmo endpoint**, e o freio vale para as duas: `GET ?token=` devolve o nome da
  contabilidade e a carteira dela; `POST` recebe a planilha. Se o freio valesse só no upload,
  adivinhar token pela consulta sairia de graça — e é a consulta que revela a carteira. Devolver a
  carteira é exigência da spec §7 (modelo pré-preenchido, que elimina o CNPJ digitado errado) e do
  §5.5 (o contador repassa o link para a equipe dividir os clientes); nada de trabalhador sai dali,
  CNPJ e razão social são dado público da RFB.
- **Só falha de TOKEN alimenta o freio.** Planilha no formato errado é registrada mas não conta: o
  freio existe para encarecer adivinhação de token, e um contador tentando três vezes com o `.csv`
  do sistema contábil dele não pode se trancar para fora do próprio link. Limite **por token**
  também significa, honestamente, que ele **não** freia uma varredura por tokens *distintos* — a
  defesa ali é o espaço do UUIDv4, e frear por IP trancaria um escritório inteiro atrás de um NAT.
- **Só `.xlsx`, estreitando a D6** (que diz `.xls`/`.xlsx`). O `.xls` legado é OLE2 e o `exceljs`
  — biblioteca decidida para o projeto — não o lê: aceitar criaria remessa que a 08.10 não abriria,
  com o contador achando que já enviou. Quem mandar `.xls` recebe instrução de salvar como `.xlsx`.

**Infraestrutura de teste criada:** `scripts/gerar_xlsx_demo.mjs` escreve um `.xlsx` OOXML real
sem dependência nova (ZIP "stored" na mão + CRC32) — o `exceljs` só entra na 08.7, e provar a
checagem de conteúdo com arquivo falso provaria o teste, não a função.

**Mundo DEMO gravado em produção** (fica, por regra do `CLAUDE.md`): empresa `99999901`
"DEMO — Comercio Modelo de Passos Ltda", dois estabelecimentos, "DEMO — Contabilidade Modelo",
"DEMO — Campanha de coleta 2026" e **três tokens** — válido, revogado e expirado. Nada disso toca
empresa real: a alternativa seria fabricar vínculo entre um escritório de verdade e clientes de
verdade, que é asserção falsa gravada no banco.

**Pendência declarada:** a Edge Function está publicada **só em produção**. O bench tem o SQL
(bucket, policy e `tentativas_remessa`), mas a função precisa ser publicada lá pela 08.12, que é
quem vai atacá-la em ambiente descartável.

Objetivo: o endpoint que recebe a planilha do contador — **público, sem login, recebendo dado
pessoal**: mesma classe de risco do check-in por QR da Subetapa 02.2.
Conclusão: seis comportamentos medidos por requisição real, não por leitura de código:
(1) POST com token válido + `.xlsx` grava o objeto no bucket **privado** `remessas` e cria a linha
em `remessas_dados` com `status='recebida'`, `ip_origem` e `user_agent` preenchidos;
(2) token inexistente, expirado ou revogado devolve **`{ok:false, erro:...}` como resultado, com
HTTP 200** — nunca `raise exception`, porque a exceção desfaz o próprio registro da tentativa (§2.18);
(3) a partir da 6ª tentativa no mesmo token dentro da janela, recusa por rate limit **e o
contador de tentativas realmente subiu** — foi exatamente aqui que a 1ª correção do check-in
falhou em silêncio na ETAPA 07;
(4) GET direto na URL pública do objeto devolve erro — o bucket não é legível nem listável por `anon`;
(5) arquivo `.csv` renomeado para `.xlsx` é **recusado no servidor**, por assinatura de conteúdo e
não por extensão (D6);
(6) a função **não escreve uma linha sequer** em `trabalhadores` nem em `vinculos_empregaticios`.
Qualidade: `service_role` só **dentro** da função, pela variável que o Supabase injeta — nunca no
frontend (padrão já usado em `supabase/functions/formulario-filiacao`). **Rate limit por token,
nunca por contabilidade** — travar a contabilidade inteira deixaria um atacante silenciar um
contador legítimo só errando token de propósito, que é a mesma lição do freio do check-in. Tamanho
máximo de arquivo validado no servidor. Quem abre o link **só consegue enviar**: nunca listar,
nunca ler.
Evidência: log das 6 requisições com corpo e código de resposta + a linha de `remessas_dados`
gerada + o `select count(*)` provando que `trabalhadores` não mudou.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Opus desde a 1ª — endpoint público com dado pessoal.
Se esgotar: parar com a função **não publicada** e emitir relatório curto (problema + causas +
2-3 alternativas).

### Subetapa 08.6 — Página pública `/enviar-dados/:token` (planilha) [Goal] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Publicada em `crm.sindcompassos.org` em 2026-08-26.** Rota pública em `src/app/router.tsx`, fora
do `AppShell` e fora do `RoleGate`, no mesmo padrão de `/guia/:token`. Código em
`src/features/coleta/` (`api.ts`, `lerPlanilha.ts`, `EnviarDadosPage.tsx`).

**Links para conferir (tokens DEMO, gravados em produção):**
- válido → `https://crm.sindcompassos.org/enviar-dados/73e4234e-46a0-42ef-8af9-aa3a14ab9325`
- revogado → `https://crm.sindcompassos.org/enviar-dados/cdaf52fb-9203-4d67-aec5-8dae955b9194`
- expirado → `https://crm.sindcompassos.org/enviar-dados/1237ad75-1ea7-4a37-8ee9-9418f5b3b0c1`

**Decisão que o plano deixava em aberto e foi de Maxwell (2026-08-26): o `exceljs` entra agora.**
O handoff dizia "não instale ainda — quem precisa é a 08.7"; o próprio plano da 08.7 diz que é o
`exceljs` que **lê** o `.xlsx` devolvido na 08.6. A dependência era ao contrário do que o handoff
supunha. A alternativa — escrever um leitor de `.xlsx` só para esta tela — criaria o segundo
leitor que a 08.7 duplicaria, que é a mesma classe de problema da regra "sem fork".

**Carregado sob demanda, e isso é medição, não zelo:** importado no topo, o `exceljs` levava o
bundle principal de **1.204 kB para 2.144 kB** — o CRM inteiro, inclusive a tela de login da
Secretaria num celular, pagando por uma biblioteca que a maioria das sessões nunca usa. Com
`await import("exceljs")` dentro de `lerPlanilhaXlsx`, ele virou chunk próprio de 938 kB, baixado
só por quem anexa planilha, e o principal voltou aos 1.204 kB de antes.

**Sem fork, e o teste prova:** `lerPlanilha.ts` só CONVERTE FORMATO (`.xlsx` → o mesmo
`ParseResultado` do CSV) e não tem uma linha de regra de negócio. Quem valida é o
`validarTrabalhadores.ts` do resto do CRM, e quem desenha é o `PreviewTable.tsx`.

**A página não lê o banco.** Nenhum `supabase-js` sai de `features/coleta/` — há teste de
varredura garantindo isso. O único servidor que ela conhece é a Edge Function, em troca do token.
E o `ContextoTrabalhadores` nasce com **`cpfsExistentes` vazio de propósito**: preenchê-lo exigiria
ler `trabalhadores`, e a tela passaria a responder "este CPF já está na nossa base" para qualquer
visitante com um link. Há teste guardando essa linha também — é a "melhoria" mais tentadora desta
tela.

**Evidência medida — `tests/rls/coleta.spec.ts`, 10/10:** planilha correta com 3 linhas
aproveitáveis; planilha com defeitos acendendo **a mensagem certa na linha certa** (DV de CPF
inválido, nome vazio, CPF vazio — as três bloqueantes — e CNPJ fora da carteira como aviso, porque
a linha entra mas sem vínculo); planilha só com linhas ruins **não** habilitando o envio; `.csv`
disfarçado recusado ainda no navegador; e **CPF `00123456797` sobrevivendo à leitura com os dois
zeros à esquerda**. Mais os três tokens contra a Edge Function real: o válido devolve nome e
carteira, o revogado e o expirado devolvem `ok:false` com mensagem — e a página troca o formulário
inteiro por "Link inválido".

**Envio completo exercitado uma vez, à mão:** POST com `linhas_recebidas=3`, `linhas_com_erro=0`
→ `remessas_dados` com **`status='validada'`**, que é exatamente o critério. **A suíte NÃO envia
remessa a cada execução** — uma por rodada de `npm run test` encheria a fila de revisão da Denise
(08.10) de arquivo de teste.

**Defeito meu, corrigido no caminho:** a planilha de demonstração trazia o CPF `00123456789`, que
tem **DV inválido**. O teste pegou. Trocado por `00123456797`, que é válido e mantém os dois zeros
à esquerda — que era o ponto do dado.

**Ajuste pedido por Maxwell após conferir a tela (2026-08-26):** modelo `.xlsx` para download e
logotipo institucional na página.
- **Logotipo** — `logo_horizontal_colorido.png`, o mesmo do AppShell, do login e da guia
  (design-tokens §5), no cabeçalho das três telas (formulário, link inválido, envio recebido), mais
  rodapé com o link do site. Não é enfeite: esta é a primeira página do sindicato que o contador vê,
  chegando por um e-mail que pede dado pessoal de terceiros — sem marca, o pedido parece phishing.
- **Modelo** — `public/modelos/quadro-de-empregados.xlsx`, gerado por
  `scripts/gerar_modelo_coleta.mjs`, num bloco "1. Baixe o modelo" que vem **antes** do campo de
  anexo. **O binário NÃO é versionado**: o `*.xlsx` do `.gitignore` continua valendo como está, e
  o arquivo é regenerado pelos hooks `predev` e `prebuild` do `package.json`. A decisão veio de uma
  medição — as datas dos metadados foram fixadas, mas o `exceljs` carimba a hora atual em cada
  entrada do ZIP e isso não é configurável, então o arquivo **nunca** sai byte-idêntico entre
  execuções. Versioná-lo sujaria todo `git status` futuro. Conferido simulando clone limpo: apagado
  o arquivo, `npm run build` o recria e o `dist/` sai completo.

**O modelo que Maxwell rascunhou tinha dois defeitos, e ambos eram silenciosos.** O arquivo em
`dados/exemplos_importacao/quadro.xlsx` trazia os cabeçalhos
`cnpj_estabelecimento | nome | cpf | telefone | piso | status`. Medido contra o validador:
1. **`piso` e `status` não casavam com campo nenhum.** `telefone` casava (o apelido já existia);
   os outros dois não. Consequência de `status` não casar: `campo()` devolve `""`, e string vazia é
   o caso "padrão legal" — que aplica **contribui** SEM AVISO. Ou seja, **todo trabalhador marcado
   como oposição entraria Prata**, em silêncio. É o espelho exato do defeito da §2.23, entrando
   pela porta do cabeçalho em vez de pela do valor.
2. **Nenhuma coluna formatada como texto.** CPF com zero à esquerda seria comido pelo Excel do
   próprio contador, antes de o arquivo sair da máquina dele (§2.10) — e é essa formatação que
   justifica a D6 ter escolhido `.xlsx` em vez de CSV.

**Resolvido mantendo os rótulos que Maxwell escolheu** — contador fala "piso" e "status", não
`salario_informado` e `recolhe_contribuicao`. Os apelidos entraram no `CAMPOS` de
`validarTrabalhadores.ts` (`piso`, `piso salarial`, `salario`; `situacao`, `situação`,
`situacao sindical`, `status`), e o modelo passou a ser gerado por script — arquivo binário
commitado à mão não tem como ser revisado, ninguém vê num diff que o `numFmt` caiu. O modelo tem
aba **Dados** (só o cabeçalho, **sem linha de exemplo**: exemplo ali seria lido como pessoa de
verdade) e aba **Instruções**, que o leitor nunca abre.

**Correção de regra de negócio (Maxwell, 2026-08-26): o piso salarial é OBRIGATÓRIO.** A célula
`B9` da aba Instruções dizia "não". O motivo dado muda a natureza do campo e não estava no plano:
**a guia de recolhimento é emitida por EMPRESA, não por empregado** — um único piso em branco não
deixa só aquela pessoa fora do cálculo, impede fechar o boleto da empresa inteira. O campo estava
opcional em **três** lugares, e os três foram corrigidos: a célula do modelo, o contrato de
`modelos_coleta` v1 no banco (produção e bench) e o validador. Só `telefone_whatsapp` segue
opcional — é o único dos seis que não entra em conta nem em classificação.

**No validador virou AVISO, não rejeição, e a escolha é deliberada:** rejeitar a linha descartaria
a PESSOA e o VÍNCULO, que é justamente a métrica desta etapa. Cadastrar com a lacuna **visível** é
melhor que não cadastrar, e o motor de cobrança já reporta nominalmente quem ficou sem base de
cálculo em vez de inventar um valor (§2.1). Se a preferência for barrar a linha, é uma linha de
código — mas aí uma planilha de 40 pessoas com 3 pisos em branco entrega 37, não 40.

**Três testes novos em `tests/rls/coleta.spec.ts` (13/13)** cobrem exatamente isso: a aba lida é a
primeira e vem sem linhas; os rótulos do contador mapeiam nos campos certos, com
`sindicalizado → true` e `oposição → false` medidos; e as colunas de CPF/CNPJ nascem com
`numFmt: '@'`. Verificado em produção: o `.xlsx` é servido com o MIME correto, 8.819 bytes,
**byte a byte idêntico ao local** — não é o `index.html` do fallback de SPA disfarçado.

**Regressão minha, pega pela suíte adversarial:** o link do modelo nasceu como
`href={CONSTANTE}`, e o guard de `04_renderizacao.spec.ts` barrou — ele existe para que desligar o
escape do React custe uma decisão explícita. Trocado por caminho literal, que é a convenção do
próprio projeto para assets de `public/` (o logotipo já é assim). O guard ficou intacto. Curiosidade
que vale registrar: na primeira correção o teste continuou vermelho porque **o meu comentário
explicando o guard continha o padrão que o guard procura** — é grep sobre o código-fonte.

**Conferida no navegador por Maxwell e aprovada em 2026-08-26 — subetapa CONCLUÍDA.** O pipeline
já estava provado por `tests/rls/coleta.spec.ts`; faltava o pixel, e o projeto não tem jsdom nem
testing-library (testa renderização por análise estática). A conferência visual foi de Maxwell, no
link real. Suíte na entrega: **202 testes, 3 falhas** — as herdadas de `cartas`; `typecheck` e
`build` limpos; deploy com 0 falhas e 0 divergências de tamanho.

Objetivo: a tela que o contador abre pelo link do e-mail, valida a planilha **no navegador dele** e
envia — sem login (D3).
Conclusão: o contador abre `/enviar-dados/:token` sem sessão, vê o nome da própria contabilidade,
anexa um `.xlsx`, o preview mostra erro por linha (DV de CPF inválido, CNPJ fora da carteira dele,
obrigatória vazia), o envio só habilita sem erro bloqueante, e **ao enviar aparece uma remessa em
`remessas_dados` com `status='validada'`**. Com token expirado ou revogado, a página mostra "link
inválido" e não oferece upload nenhum.
Qualidade: reaproveita `validarTrabalhadores.ts` e `PreviewTable.tsx` **sem fork** — duas cópias
divergentes da validação de CPF é como a regra some. A página **não lê o banco**: só ecoa o que o
próprio arquivo trouxe, e jamais exibe CPF de quem já está cadastrado. Rota pública no mesmo padrão
de `/guia/:token` em `src/app/router.tsx`, fora do `AppShell`. Toda query em
`features/<domínio>/api.ts` como hook TanStack. Texto em pt-BR, tokens de `docs/design-tokens.md`.
Evidência: gravação/print do ciclo completo com um token real de bench + a linha de
`remessas_dados` resultante + o print do token revogado recusando.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Opus nas 2 primeiras; **não rebaixar para Sonnet na 3ª** — é superfície pública.
Se esgotar: parar e emitir relatório curto (problema + causas + 2-3 alternativas).

### Subetapa 08.7 — Modelo `.xlsx` gerado sob demanda, pré-preenchido [Goal] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
**Executada em 2026-08-26** (Circuito 3, Sonnet). `src/features/coleta/gerarModelo.ts`
(`gerarModeloColeta`) gera o `.xlsx` **no navegador**, com `await import("exceljs")` dentro da
função — nunca no topo do módulo (orientacoes.md §4.8). Medido no `npm run build`: bundle
principal **1.221 kB**, `exceljs` isolado num chunk próprio de **938 kB**, baixado só por quem
anexa ou baixa planilha.

**O modelo estático saiu de cena.** `scripts/gerar_modelo_coleta.mjs`, `public/modelos/quadro-de-empregados.xlsx`
e os hooks `predev`/`prebuild` do `package.json` foram removidos — nenhum arquivo binário a manter,
como o plano previa.

**Sete colunas, não seis.** Os SEIS cabeçalhos que `validarTrabalhadores.ts` espera continuam
idênticos aos de `specs/importacao.md` §3.3 (`cnpj_estabelecimento`, `nome`, `cpf`, `telefone`,
`piso`, `status`); `razao_social` entra como sétima coluna, puramente informativa — o validador não
a conhece, e ela é ignorada por regra (`specs/importacao.md` §4: "colunas extras são ignoradas").
Uma linha por estabelecimento da carteira do token, com `cnpj_estabelecimento` e `razao_social`
(ou o nome fantasia, quando existe) já preenchidos; o resto em branco para o contador completar.
Estabelecimentos já cobertos vêm **marcados** (fundo verde + "(já enviado)" na razão social) —
não escondidos, porque a empresa pode ter contratado gente nova desde o último envio.

**Achado real, corrigido no caminho — `descartarLinhasSemPessoa`.** Uma linha do modelo em que o
contador não mexeu tem `cnpj_estabelecimento` preenchido (pré-carga) e `nome`/`cpf` vazios. Sem
tratamento, cada estabelecimento ainda não completado apareceria como linha **REJEITADA** ("CPF é
obrigatório") — ruído que não é erro nenhum. Nova função em `validarTrabalhadores.ts`, chamada nos
dois pontos que leem planilha de trabalhador (`EnviarDadosPage` e a revisão da Denise em
`/remessas`): descarta linhas em que `nome` **e** `cpf` estão vazios, antes de `validarTrabalhadores`.

**Segundo achado, pego pela suíte adversarial — não meu comentário desta vez, mas quase.** Ao
escrever a função de download (link temporário via DOM, nunca `href={variável}` em JSX — que a
`04_renderizacao.spec.ts` recusaria mesmo aqui, onde o valor é um Blob local), o PRÓPRIO comentário
explicando a regra continha o padrão que o guard procura via grep sobre o código-fonte — mesma
armadilha da 08.6, registrada de novo para não se repetir uma terceira vez.

**Terceiro achado, este de produção real — `orientacoes.md` §7.1d.** `tests/rls/remessas.spec.ts`
(08.10) quebrou sozinho: a remessa mais recente da campanha DEMO passou a ser uma das **3** que
Maxwell enviou testando o link real no navegador (mesmo IP, mesmo dia), com os cabeçalhos do
modelo atual (`status`) em vez do `recolhe_contribuicao` do arquivo manual mais antigo. Mesma
classe do §7.1b (teste que fixa o que o dado de demonstração vai mudar), agora em cabeçalho —
corrigido para checar as colunas de identidade e **algum** apelido reconhecido de situação
sindical, não um rótulo específico.

**Suíte: 208 testes, 3 falhas — as mesmas de sempre (`cartas`, §7.1b), zero regressão.** 10 testes
novos em `tests/rls/coleta.spec.ts` cobrem: os sete cabeçalhos; uma linha por estabelecimento com
CNPJ e razão social preenchidos; a marcação de já cobertos; o descarte de linhas não tocadas; o
ciclo completo gera→salva→lê com CPF `00123456797` sobrevivendo com os dois zeros à esquerda; os
apelidos do contador mapeando nos campos certos; o piso declarado obrigatório na aba Instruções
(buscado por texto, não por número de linha); e as colunas de CPF/CNPJ nascendo com `numFmt: '@'`.
Mais 3 testes unitários de `descartarLinhasSemPessoa`. `typecheck` e `build` limpos.

**Deploy feito e verificado** — `bash scripts/deploy.sh`, 22 arquivos, 0 falhas, 0 divergências de
tamanho; bundle publicado (`index-itPy4R_t.js`) idêntico ao de `dist/`. **Conferência visual
pendente de Maxwell**, como na 08.6: a extensão do Chrome não conectou nesta sessão, então não foi
possível abrir o link real e baixar o modelo pelo navegador de fato. A evidência automatizada
(ciclo gera→salva→lê via `exceljs`, o mesmo motor que o Excel usaria, com o CPF sobrevivendo)
cobre o pipeline; falta o pixel. Tokens DEMO para conferir:
`https://crm.sindcompassos.org/enviar-dados/73e4234e-46a0-42ef-8af9-aa3a14ab9325`.

Objetivo: eliminar o erro mais provável do contador — CNPJ digitado errado — entregando a planilha
já com as empresas dele nas linhas (spec §7).
Conclusão: "baixar modelo" gera **no navegador** um `.xlsx` com uma linha por estabelecimento
daquele token (CNPJ e razão social preenchidos) e cabeçalhos idênticos aos de `specs/importacao.md`
§3.3; reaberto no Excel e salvo, **um CPF com zero à esquerda continua com 11 dígitos** e o CNPJ
não vira notação científica; a partir da 2ª visita, os estabelecimentos já cobertos vêm marcados.
Qualidade: as colunas `cpf` e `cnpj_estabelecimento` nascem formatadas como **texto**
(`numFmt: '@'`) — essa é a defesa, e ela **só existe por causa da D6**: em CSV não há formatação de
célula (§2.10). Nenhum arquivo estático a manter. O mapeamento
"sindicalizado → `recolhe_contribuicao = true`" / "oposição → `false`" vive num **único** lugar,
compartilhado com 08.8 e 08.10. **A dependência `exceljs` está cravada** (decisão de Maxwell em
2026-08-24, ver "correções de medição" acima): é ela que fornece o `numFmt: '@'`, e é ela também
que **lê** o `.xlsx` que o contador devolve na 08.6 — um único formato de planilha no projeto, sem
uma segunda biblioteca para manter. `papaparse` permanece intocado como leitor de CSV da
importação interna.
Evidência: o arquivo gerado, aberto no Excel de verdade e reexportado, com o CPF `00123456789`
sobrevivendo ao ciclo completo.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e relatar. Modelo que corrompe CPF é pior que modelo nenhum.

### Subetapa 08.8 — Formulário direto na página (empresa isolada) [Goal] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
**Executada em 2026-08-26** (Circuito 3, Sonnet). `EnviarDadosPage` decide o caminho por
`estabelecimentos.length === 1`: nesse caso troca o bloco de modelo+upload por
`FormularioDireto` (`src/features/coleta/FormularioDireto.tsx`), que deixa a empresa digitar de 1 a
N funcionários direto na página, sem baixar nem anexar arquivo nenhum.

**Nenhum segundo caminho de escrita, e nenhuma segunda validação.** As linhas digitadas viram um
`.xlsx` de verdade no navegador (`gerarPlanilhaDoFormulario`, com `await import("exceljs")` — a
biblioteca continuou isolada no chunk de 938 kB, medido no build) e passam pela MESMA
`useEnviarRemessa` — mesma Edge Function, mesma remessa, mesma revisão humana na 08.10. Quem valida
CPF e mapeia a situação sindical é `validarTrabalhadores`/`interpretarSituacaoSindical`, os mesmos
do caminho da planilha; o `react-hook-form` + `zod` do formulário só garante que os campos
obrigatórios (nome, CPF, piso) não ficaram vazios — nunca reimplementa o dígito verificador.

**A Edge Function valida por CONTEÚDO, não por extensão (assinatura de ZIP +
`[Content_Types].xml`), e não podia ser alterada nesta subetapa.** Por isso o arquivo do formulário
precisa ser um `.xlsx` genuíno — não um JSON disfarçado — e é exatamente o que
`gerarPlanilhaDoFormulario` produz, com os mesmos seis cabeçalhos do modelo da 08.7
(`cnpj_estabelecimento`, `nome`, `cpf`, `telefone`, `piso`, `status`), sem a coluna informativa
`razao_social` (aqui é uma linha por FUNCIONÁRIO, não por estabelecimento).

**Pendência transparente: não existe token DEMO de empresa isolada em produção.** Os três tokens
DEMO gravados na 08.5/08.6 são todos de CONTABILIDADE (`estabelecimento_id is null`, conferido por
query direta) — é a 08.13 que vai gerar os primeiros tokens reais de empresa isolada. Criar um
novo token/campanha em produção só para testar este caminho seria escrita em `envios_campanha` fora
do escopo do Circuito 3. A evidência desta subetapa é por isso **automatizada e sem rede**: gera o
`.xlsx`, prova que ele passaria na validação por conteúdo da Edge Function (réplica fiel da checagem
de bytes, sem tocar nela), lê de volta e valida com o pipeline real. **O ciclo ponta a ponta contra
a Edge Function fica para quando a 08.13 gerar tokens de empresa isolada de verdade** (ou para
Maxwell testar manualmente então) — mesmo espírito de honestidade da pendência de pixel da 08.7.

**Suíte: 213 testes, 3 falhas — as mesmas de sempre (`cartas`, §7.1b), zero regressão.** 5 testes
novos em `tests/rls/coleta.spec.ts` cobrem: o arquivo gerado passando na validação por conteúdo real
da Edge Function; os seis cabeçalhos idênticos ao caminho da planilha; o ciclo completo com 2
funcionários fictícios (sindicalizado → Prata, oposição → Bronze, ambos vinculados ao CNPJ único da
carteira); CPF inválido rejeitado pela mesma regra de DV; e o CPF com zero à esquerda sobrevivendo
ao ciclo gera→salva→lê. `typecheck` e `build` limpos (bundle principal 1.232 kB, `exceljs` isolado).

**Deploy feito e verificado** — `bash scripts/deploy.sh`, 0 falhas, 0 divergências de tamanho.

Objetivo: atender os **8.241 grupos de 1 estabelecimento — 53% da base** — que têm 2 ou 3
funcionários e nunca vão baixar planilha alguma. Ignorar esse caso perderia mais da metade do alcance.
Conclusão: na mesma página do token, sem download, a empresa preenche de 1 a N trabalhadores e o
envio produz uma remessa em `remessas_dados` **pelo mesmo caminho da planilha** — mesma Edge
Function, mesmo status inicial, mesma revisão humana depois.
Qualidade: mesma validação de DV de CPF do caminho da planilha, mesmo mapeamento de status,
`react-hook-form` + `zod` como no resto do projeto. Não abre um segundo caminho de escrita: se o
formulário virar um atalho que pula a revisão, a garantia central da etapa cai.
Evidência: ciclo completo com 2 trabalhadores fictícios + a remessa gerada, lado a lado com uma
remessa vinda de planilha, mostrando o mesmo formato.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 08.9 — Semeadura de `contabilidades` e dos vínculos [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Executada em produção em 2026-08-26**, por `scripts/semear_contabilidades_08_9.mjs`, logado como
Admin com a anon key — passando pelas mesmas policies que a Denise enfrentaria, sem `service_role`
(padrão da carga da 06.4).

**Os números bateram exatamente com o previsto, sem recalibragem:**
`contabilidades = 950` · `contabilidade_estabelecimentos = 7.438` · `origem='agrupamento_email'` e
`confirmado=false` em **100%** · as 8.241 caixas de 1 estabelecimento **não** viraram contabilidade.
**2ª execução: delta zero** (`+0` / `+0`), com os dois casos grandes reconferidos —
`juridico@contss.com.br` 129/129 e `rm2091adm@gmail.com` 114/114.

**Conferência independente por SQL** (não pelo mesmo código que gravou): 950 e-mails distintos em
950 linhas — zero duplicata; zero vínculo com origem diferente; zero já confirmado; zero caixa
isolada promovida a contabilidade; zero grupo de 2+ deixado de fora; e **zero vínculo incoerente**
(todo vínculo casa com o `email` do próprio estabelecimento).

**Decisão que o plano deixava em aberto: o que vai em `contabilidades.nome`.** A coluna é NOT NULL
e a RFB **não traz razão social do escritório** — só a das empresas-cliente. Usar a razão social de
um cliente como nome do contador seria inventar informação. Então `nome = email`, e cada linha
carrega em `observacoes` que o nome é **provisório**, derivado do agrupamento, e que o escritório
ainda não confirmou razão social nem carteira. A Denise renomeia conforme fala com cada um.

**Guarda que hoje não exclui ninguém, e existe para o ciclo mensal da RFB:** caixa com 2+
estabelecimentos mas e-mail malformado é **descartada e reportada**, nunca semeada em silêncio —
um link enviado a um endereço inválido nunca chega e sumiria da conta de cobertura sem sinal.
Medido hoje: **0 descartadas**, e os 8 maiores grupos são visivelmente escritórios reais
(`contss`, `contpacheco`, `csj.cnt.br`, `contabilidadepessoni`, `pedrosocontabilidade`,
`mondocontabil`, `contabilidadeitamarati`).

**A semeadura nunca apaga.** O script não tem `DELETE`. Contabilidade que o agrupamento atual não
sustenta mais (escritório que caiu para 1 cliente, perdeu todos, ou teve o e-mail alterado na RFB)
entra em **relatório** ao fim da execução, para a Denise decidir uma a uma. Hoje: 0 órfãs.

**Suíte após a escrita em massa: 179 testes, as mesmas 5 falhas pré-existentes.** Nenhuma
regressão. Ajuste feito no caminho: dois casos de `comunicacao.spec.ts` comparavam papéis por
`select('id')`, que com 7.438 linhas voltaria **truncado em 1000 sem avisar** (§2.4) — passariam
comparando dois conjuntos truncados. Trocados por contagem exata via `head: true`.

Objetivo: transformar o agrupamento por e-mail — que hoje é implícito e se perde quando a empresa
troca de escritório — em entidade persistida e editável (spec §5.2).
Conclusão: `contabilidades` com **950 linhas** (as caixas com 2+ estabelecimentos: 89 + 248 + 613)
e `contabilidade_estabelecimentos` com **7.438 vínculos** `origem = 'agrupamento_email'`,
`confirmado = false` em 100% — números que batem exatamente com a medição desta etapa. Segunda
execução com **delta zero**.
Qualidade: **a semeadura nunca apaga** — mesmo princípio da skill `atualizar-sindcom` (06.6):
divergência vira relatório, jamais `DELETE`. Nenhum e-mail duplicado em `contabilidades`.
`confirmado = false` porque o agrupamento é heurística, não declaração do contador — o dia em que
ele disser "essa empresa não é mais minha", o CRM registra em vez de esquecer. Roda pela anon key
como Admin, sem `service_role` (padrão da carga da 06.4). As 8.241 caixas de 1 estabelecimento
**não** viram contabilidade: são empresas isoladas.
Evidência: contagens antes/depois, 2ª execução com delta zero, e conferência a olho de casos
grandes contra a origem (`juridico@contss.com.br` = 129, `rm2091adm@gmail.com` = 114).
Esforço máximo: 2 tentativas.
Escalonamento de LLM: Opus desde a 1ª — escrita em massa em produção.
Se esgotar: parar sem gravar e relatar.

### Subetapa 08.10 — Revisão e importação da remessa pela Denise [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**No ar em 2026-08-26.** Tela `/remessas` (Admin e Secretaria), em
`src/features/remessas/`. A gravação é a `importarTrabalhadores` **já existente**, agora extraída
do hook para função pura — a tela e a suíte chamam a MESMA função, e o hook virou invólucro.

**A MÉTRICA DA ETAPA SAIU DE ZERO.** Estabelecimentos com ao menos um trabalhador vinculado:
**0 → 2**. `trabalhadores` 3 → 6, `vinculos_empregaticios` 0 → 3, com 5 Prata e 1 Bronze. É a
primeira vez que o CRM tem pessoa ligada a empresa.

**Consequência medida e prevista:** duas das cinco falhas herdadas da suíte **desapareceram
sozinhas** — as de `dashboard`, que falhavam por não haver trabalhador aprovado nem vínculo. O
handoff previa exatamente isso como sinal de progresso. Restam **3 falhas, todas em `cartas`**,
que fixam contagens do cenário DEMO Kabum (§7.1b). Suíte: **197 testes, 3 falhas**.

**Evidência — `tests/rls/remessas.spec.ts`, 8/8:**
- a planilha só sai do bucket por **URL assinada**, e o recorte é medido papel a papel: Admin e
  Secretaria assinam e baixam 3.640 bytes; Jurídico, Parceiro e `anon` são negados;
- **reimportar o mesmo arquivo não cria ninguém** — contagem de `trabalhadores` e de `vinculos`
  idêntica na 2ª passada. É esta propriedade que torna o token reutilizável seguro por construção;
- os três CPFs DEMO estão na base com o vínculo apontando para o estabelecimento certo, e o
  mapeamento do modelo v1 confere: sindicalizado → Prata, oposição → Bronze;
- **a regra inviolável, atacada de propósito**: uma planilha com os mesmos CPFs e **todas as três
  flags invertidas**, importada com a política mais permissiva (`atualizar_contato`), não mexeu em
  nenhuma delas;
- Jurídico e Parceiro não concluem remessa — e o UPDATE barrado devolve **zero linhas sem erro**,
  conferido como manda a §2.6d;
- alterar a **evidência** da remessa (`arquivo_path`) é recusado pelo trigger de imutabilidade.

**⚠️ DEFEITO REAL ENCONTRADO E CORRIGIDO — o mais grave da etapa até aqui.**
`paraBooleano` só reconhecia `sim/1/true/verdadeiro`. A palavra que o modelo de coleta pede ao
contador é **"sindicalizado"** — que não está na lista e, portanto, virava `false`. Medido numa
remessa real: o CPF marcado como sindicalizado entrou com `recolhe_contribuicao_sindical = false`
e `nivel = 'bronze'`. **Em escala, isso classificaria a base coletada inteira como Bronze**,
inclusive quem se sindicalizou — zerando a base de cálculo da contribuição e o P1 da etapa. Não
havia erro em lugar nenhum: coluna válida, booleano válido, linha importada. Só o significado
invertido.
Corrigido com `interpretarSituacaoSindical` em `parsers.ts` — **o "único lugar" que o plano da
08.7 exige**, a ser compartilhado com 08.7 e 08.8 —, que reconhece os dois vocabulários e, quando
**não** reconhece, aplica o padrão **com aviso visível na linha** em vez de decidir em silêncio.
Registrado em `orientacoes.md` §2.23. As três pessoas DEMO já gravadas foram corrigidas por
**UPDATE deliberado** — porque a importação, corretamente, não consegue fazê-lo.

**Dois efeitos colaterais do meu próprio teste, corrigidos:** (1) o teste hostil usava um nome
fixo e renomeou as três pessoas DEMO em produção para "tentativa de reclassificação" — `nome` é
dado de contato e é legitimamente atualizável; nomes restaurados e o teste passou a reenviar o
nome que já está gravado; (2) a suíte pegava a remessa mais ANTIGA, que é a da 08.5 e contém o
arquivo anterior à correção do CPF — passou a pegar a mais recente, que é como a tela lista.

**Dívida que os tipos velhos escondiam, exposta ao regenerar `database.types.ts`:**
`solicitacoes_servico.numero_guia` perdeu o `DEFAULT` de coluna na ETAPA 07 (§2.17) e passou a ser
preenchido por trigger — o gerador não enxerga trigger, só `column_default`, e passou a exigir a
coluna no Insert. Resolvido com um cast estreito e documentado no único ponto que insere.

**D7 registrado na tela:** quem vem marcado como oposição entra Bronze **sem carta registrada** —
a declaração é do contador, não há documento. A tela avisa isso em destaque, e `/cartas` ganha o
grupo que ela não previa. Decisão consciente de Maxwell, não defeito.

Objetivo: o único ponto em que dado vindo de fora vira cadastro — **e ele é humano**.
Conclusão: com uma remessa `recebida`, a tela interna abre a planilha por **URL assinada**, mostra
o preview e exige confirmação; ao confirmar, `trabalhadores` e `vinculos_empregaticios` recebem as
linhas válidas via a `importarTrabalhadores` **já existente** em
`src/features/importacao/api.ts`, a remessa passa a `importada` com `processada_por` e
`processada_em` preenchidos, e **reenviar o mesmo arquivo não duplica ninguém** — a política de
duplicata de `trabalhadores` casa por CPF e ignora existentes (`specs/importacao.md` §5). É essa
propriedade que torna o token reutilizável seguro por construção (spec §5.5).
Qualidade: **nenhuma remessa vira cadastro sem clique humano** — é a garantia central da etapa.
A remessa é imutável: correção cria remessa nova, preservando o histórico de quem enviou o quê e
quando. As três flags de nível (`recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio`,
`forma_pagamento_preferida`) seguem **protegidas de alteração em registro existente** — regra
inviolável do `CLAUDE.md`, e é a que impede uma planilha reclassificar 500 pessoas em silêncio.
A URL assinada expira. Os trabalhadores marcados como oposição entram **sem lastro documental**
(D7): a tela `/cartas` passa a ter um grupo que ela não previa — **Bronze sem carta registrada** —
e isso é decisão consciente de Maxwell, não bug a corrigir.
Evidência: ciclo completo com remessa de demonstração (registros nomeados `DEMO —`, que **ficam
gravados**) + reenvio do mesmo arquivo com contagem de `trabalhadores` inalterada + query provando
as 3 flags intocadas.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Opus desde a 1ª — escreve na base cadastral.
Se esgotar: parar e relatar.

### Subetapa 08.11 — Acompanhamento por cobertura e revogação de token [Goal] [LLM: Sonnet] · Status: ✅ CONCLUÍDA (com um item pendente de revisão)
**Executada em 2026-08-26** (Circuito 3, Sonnet). Tela `/cobertura` (Admin, Presidente e
Secretaria), em `src/features/cobertura/` (`api.ts`, `CoberturaContabilidadesPage.tsx`): lista as
951 contabilidades ordenadas da pior para a melhor cobertura, com drill-down nominal dos
estabelecimentos pendentes por linha, exportação CSV (`lib/csv.ts`) e botão "Revogar token"
(Admin apenas, com confirmação).

**Cobertura por VIEW no banco, não por join no navegador.** `v_cobertura_contabilidades`
(`sql/22_cobertura_08_11.sql`, aplicada) agrega `contabilidades` × `contabilidade_estabelecimentos`
× `vinculos_empregaticios` — 951 linhas de saída, uma por contabilidade, contra as 7.440 linhas de
`contabilidade_estabelecimentos` que um join client-side teria que paginar (orientacoes.md §2.4).
`security_invoker = on`: nenhuma exposição nova, é a mesma RLS de origem que já valia para essas
três tabelas.

**O token nunca é lido nesta feature — nem pelo Admin.** "Revogar" só faz duas escritas
sequenciais (UPDATE marcando `token_revogado_em` na linha ativa + INSERT de uma linha nova, que
recebe token novo por `DEFAULT` do banco): o valor do token não passa em nenhuma resposta que este
código leia. Prova em `tests/rls/cobertura.spec.ts`: `git grep` confirmando que a palavra `token`
não aparece em `src/features/cobertura/`.

**⚠️ Item aplicado com escopo reduzido — decisão registrada para revisão de Maxwell.**
`sql/20_comunicacao_externa.sql` (linhas 384-403) já apontava que Presidente e Secretaria leem
`envios_campanha` inteira, com o `token` em claro (RLS restringe LINHAS, nunca COLUNAS), e sugeria
resolver com uma view `SECURITY DEFINER` no padrão de `v_fila_parceiro`. **Medido e reavaliado**:
esse padrão desliga RLS para refazer um filtro de LINHA à mão — necessário em `v_fila_parceiro`
(esconder a fila de outro parceiro, que a RLS crua apagaria por completo), desnecessário aqui (a
RLS já decide certo QUEM vê a linha; falta só apagar o CONTEÚDO de uma coluna). Escrevi a
alternativa mais simples e mais segura — `security_invoker = on` com
`case when fn_eh('admin') then token else null end` — comentada em `sql/22_cobertura_08_11.sql`
(Parte 2) e registrada em `orientacoes.md` §2.24, mas **não apliquei**: é decisão de segurança
(muda o que um papel autenticado consegue ler via a API do Supabase), e a regra da ETAPA 08 para o
Circuito 3 é escrever o SQL e pedir revisão antes de aplicar. A tela entregue **não depende** dela
— funciona por completo sem essa view, porque nunca precisou ler o token para nada.

**Suíte: 222 testes, 3 falhas — as mesmas de sempre (`cartas`, §7.1b), zero regressão.** 9 testes
novos em `tests/rls/cobertura.spec.ts`: a view bate com contagem independente por SQL cru (não
número fixo — total de contabilidades e soma de estabelecimentos, comparados contra `count()` cru
das tabelas de origem); nenhuma linha tem `cobertos > total`; uma contabilidade DEMO com
trabalhador real aparece com cobertura > 0; admin/presidente/secretaria/jurídico leem a view (mesmo
recorte das tabelas de origem) e parceiro vê zero linhas sem erro (§2.6b); anon é barrado no GRANT;
nenhum arquivo da feature toca a palavra `token`; e a tentativa de revogação por Secretaria/Jurídico/
Parceiro devolve zero linhas afetadas sem erro (§2.6d). `typecheck` e `build` limpos (bundle
principal 1.240 kB — cresceu só o esperado da tela nova; `exceljs` seguiu isolado).

**Deploy feito e verificado** — `bash scripts/deploy.sh`, 0 falhas, 0 divergências de tamanho.
`database.types.ts` regenerado (só a view nova no diff).

**Pendência explícita para Maxwell:** revisar e, se aprovado, aplicar
`sql/22_cobertura_08_11.sql` Parte 2 (comentada) — fecha em definitivo a brecha registrada em
`sql/20_comunicacao_externa.sql` de Presidente/Secretaria conseguirem ler `token` em claro via API
direta (não pela tela, que nunca o expõe). Item para o relatório da 08.12.

Objetivo: responder "quais contabilidades ainda não mandaram, e o que exatamente falta em cada
uma" como tela, não como cruzamento manual repetido a cada rodada de cobrança (D4).
Conclusão: a tela lista as contabilidades ordenadas por cobertura, mostrando
**`juridico@contss.com.br — 40 de 129 (31%)`**; abre a lista **nominal** dos estabelecimentos
daquele contador ainda sem trabalhador vinculado; exporta CSV; e o botão "revogar token" preenche
`token_revogado_em`, gera um novo token e faz o link antigo passar a ser recusado pela página
pública — **sem apagar histórico**.
Qualidade: cobertura é **query**, nunca campo materializado — um `respondido_em` booleano
esconderia 89 empresas faltando, e é justamente esse número que dirige o follow-up. O token não
aparece em claro para quem não é Admin. A exportação passa por `lib/csv.ts`, que neutraliza
fórmula do Excel (§2.19). Nenhum teste fixa contagem que o dado de demonstração vá quebrar (§7.1b).
Evidência: print da tela com uma cobertura parcial real + o CSV exportado + prova de que o link
revogado é recusado e o novo funciona.
Esforço máximo: 3 tentativas.
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na 3ª.
Se esgotar: parar e emitir relatório curto.

### Subetapa 08.12 — Portão de segurança adversarial da nova superfície [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Executada em 2026-08-27** (Circuito 4, Opus). Relatório completo:
[`docs/RELATORIO_08_ADVERSARIAL.md`](../docs/RELATORIO_08_ADVERSARIAL.md).

**50 ataques** em `tests/adversarial/05_comunicacao.spec.ts` · **3 falhas reais**, todas corrigidas,
provadas no bench e **aplicadas em produção no mesmo dia, por ordem explícita de Maxwell**
(`sql/23_hardening_08_12.sql`; verificação pós-aplicação no §11 do relatório) · **4 achados aceitos
com motivo** · **3 falsos achados descartados por medição**. **O merge para `main` não foi
executado** — segue sendo atribuição exclusiva de Maxwell.

**As três falhas apareceram na varredura de catálogo, antes de eu escrever um único ataque** — e
nenhuma sairia de leitura de código, porque duas não estão escritas em lugar nenhum: são
privilégios que o objeto ganha ao nascer.

- **A-08.01 (médio/alto, ABERTO em produção):** `fn_gera_guia_pagamento()` é executável por `anon`
  via RPC e faz `nextval` — anônimo sem login queima a numeração da guia de pagamento (medido: 5
  números consumidos no bench). Gêmeo não corrigido do A-02 da ETAPA 07; o advisor não a acusa
  porque só olha função `SECURITY DEFINER`, e esta é `INVOKER` (orientacoes.md §2.26).
- **A-08.02 (médio):** `pg_default_acl` faz **toda relação nova nascer com tudo concedido a `anon`,
  inclusive SELECT** — a varredura de hardening da ETAPA 07 não é hereditária, e a view da 08.11 já
  nasceu com os grants de fábrica de volta. É a raiz do achado A-01 da ETAPA 07 (orientacoes.md
  §2.25). Corrigido nos objetos e **na raiz**, com prova em tabela criada depois.
- **A-08.04 (baixo):** `empresas_estabelecimentos` — a view do A-01 — seguia sendo o único objeto de
  `public` sem definição versionada. Versionada e com a segunda camada de GRANT fechada.

**A superfície que a etapa construiu resistiu inteira:** isolamento entre contadores nos dois
sentidos, token expirado/revogado sem oráculo, freio engatando na 6ª tentativa, bucket privado
negado a `anon` **com o caminho exato em mãos**, 5 formatos de arquivo hostil recusados por
conteúdo, injeção de fórmula neutralizada no caminho completo, e a garantia central — **nem o envio
aceito escreve em `trabalhadores` ou em `vinculos_empregaticios`**.

**Decisão de segurança que a 08.11 deixou pendente, agora fechada: NÃO aplicar a Parte 2 do
`sql/22`.** A view de mascaramento não fecharia nada — Presidente e Secretaria leem a TABELA, e uma
view só restringe quem não tem caminho até a base. O narrowing de coluna, que fecharia, é
tudo-ou-nada para o papel `authenticated` e tiraria o token do Admin, que precisa dele para as
listas da 08.13. Aceito com severidade medida e gatilho de reavaliação declarado (§4 do relatório).

**Suíte: 272 testes em produção, 3 falhas** — só as 3 pré-existentes de `cartas` (§7.1b), depois da
aplicação. **Zero regressão** (eram 222 testes com as mesmas 3 falhas). `typecheck` limpo, advisor
sem achado novo, nenhum deploy necessário (nada em `src/`). Nenhum e-mail disparado.

Objetivo: atacar de propósito o que esta etapa criou. **Obrigatório pelo `CLAUDE.md`** — o gatilho
é "qualquer etapa nova, integração nova ou deploy que amplie a superfície exposta", e esta etapa é
as três coisas.
Conclusão: `tests/adversarial/05_comunicacao.spec.ts` verde, cobrindo no mínimo: token de outra
contabilidade; token expirado; token revogado; força bruta de token; leitura das seis tabelas novas
por `anon`; leitura do objeto do bucket sem URL assinada; **listagem** do bucket por `anon`; CSV
disfarçado de `.xlsx`; fórmula do Excel chegando pela planilha do contador e saindo na exportação
da 08.11 (§2.19); e a **varredura de catálogo** de views sem `security_invoker` e de grants de
fábrica (§2.15 e §2.16). A suíte completa roda **sem regressão** contra o número anterior.
Qualidade: **rodar a varredura de catálogo, não reler migrations** — 2 dos 5 achados da ETAPA 07
apareceram assim, e nenhum sairia de leitura de código. Ataque destrutivo só no bench, com
`exigirBench()` (§2.20). **Todo vermelho é hipótese até ser medido de novo**: 3 "achados" da ETAPA
07 eram testes meus mal escritos. Policies de `storage.objects` são mecanismo distinto da RLS de
tabela e precisam de caso próprio — é território novo neste projeto.
Evidência: `docs/RELATORIO_08_ADVERSARIAL.md` — achado a achado, o que resistiu, os aceitos com
motivo, os falsos achados descartados e a verificação final, no formato do relatório da ETAPA 07.
Esforço máximo: sem teto — é auditoria, não implementação.
Escalonamento de LLM: Opus do início ao fim.
Se esgotar / se houver achado aberto: **nenhum disparo acontece.** O CODE entrega o relatório e
**para**; ordenar o merge e o disparo é atribuição exclusiva do Maxwell.

### Subetapa 08.13 — Listas segmentadas por caixa e campanhas registradas [Manual] [LLM: Sonnet] · Status: ✅ CONCLUÍDA
**Executada em 2026-08-26** (Circuito 3, Sonnet), **com confirmação explícita de Maxwell antes da
escrita em massa** — 9.186 tokens reais e funcionais em produção é ação difícil de reverter, e a
regra de segurança do projeto pede confirmação para esse tipo de ação mesmo quando o plano já
autoriza o passo. `scripts/gerar_campanha_08_13.mjs` (padrão de `semear_contabilidades_08_9.mjs`:
anon key + login de Admin, `--dry` para conferir antes de gravar, guarda contra rodar duas vezes).

**Números batem exatamente com a medição prévia, e o `--dry` provou isso ANTES de gravar qualquer
coisa:** A=89 (3.758 estabs) · B=248 (2.189) · C=613 (1.491) — os três batendo 1:1 com uma query
independente por SQL cru rodada antes de escrever o script. **D saiu diferente do número
"medido": 8.236, não 8.241.** A diferença são 5 caixas isoladas com e-mail literalmente malformado
na RFB (ponto final sobrando, espaço antes do `.br`, TLD truncado como `.co,` ou `.com.b`) — o
"8.241" da medição anterior era uma contagem crua por tamanho de grupo, sem o filtro de formato que
a 08.9 já aplicava para grupos de 2+. Aplicado o MESMO filtro aqui por consistência: as 5 foram
**descartadas e reportadas** (nunca semeadas em silêncio — um token que não chega some da conta sem
sinal), com o estabelecimento de cada uma nomeado no console para acompanhamento manual da Denise.
**Total real: 9.186, não 9.191.**

**4 campanhas criadas** (`Coleta 2026 · Contabilidades grandes/médias/pequenas` e
`Coleta 2026 · Empresas isoladas`), sem `eixo` nem `assunto` — a 08.14 (Circuito 4, ainda não
executada) é quem define a copy; `modelo_coleta_id` aponta para o único modelo ativo
(`Cadastro sindical 2026`). **9.186 `envios_campanha` inseridos, um por caixa**, conferidos por
`count(*)` por campanha batendo com o esperado (89/248/613/8.236) e por uma query independente pós-
escrita: `9.186` e-mails únicos em `9.186` linhas — **zero duplicata**, dentro e entre as 4
campanhas.

**Os 4 CSVs saíram em `dados/campanha_08_13/`** (pasta inteira `.gitignore`d — são 9.186 e-mails
reais, PII, não entram no repositório). Três colunas só: `nome` (o `contabilidades.nome` para
A/B/C — hoje ainda o e-mail, até a Denise renomear; nome fantasia ou razão social para D),
`email`, `link` (com o token). **Nenhum CPF, nenhum dado de trabalhador.** Reaproveita a mesma
neutralização de fórmula de `lib/csv.ts` (§2.19), reimplementada no script porque ele roda em Node
puro fora do bundle TypeScript — `Papa.unparse` com o mesmo delimitador, aspas e `\r\n`.

**Suíte: 222 testes, 3 falhas pré-existentes (`cartas`, §7.1b) — zero regressão.** Esta subetapa não
alterou nenhum arquivo em `src/`; `typecheck` e `build` seguem limpos, e o bundle publicado não
muda (nenhum deploy necessário). **Achado no caminho, registrado em `orientacoes.md` §4.9:** um
teste novo de `cobertura.spec.ts` (da 08.11) que faz `git grep` por "token" pegou os PRÓPRIOS
comentários explicando por que a feature nunca lê o token — terceira vez que esse padrão aparece na
etapa; corrigido estreitando o grep para casar só `.select(...token...)`, não a palavra em prosa.

Objetivo: os 4 CSVs que vão para o ESP e os `envios_campanha` correspondentes, com um token por
destinatário.
Conclusão: 4 arquivos exportados — **89 / 248 / 613 / 8.241 linhas, somando 9.191** — montados
**por caixa de e-mail**, com **zero e-mail repetido dentro de um arquivo e zero entre arquivos**
(conferido por query, não a olho); as campanhas correspondentes existem em `campanhas` e os
`envios_campanha` batem **1:1** com as linhas de cada CSV.
Qualidade: **a lista é montada por CAIXA, nunca por estabelecimento** — um contador com 129
estabelecimentos receberia 129 e-mails idênticos, e isso é marcação como spam garantida logo no
aquecimento, exatamente na semana em que a reputação do subdomínio novo está se formando. O CSV
que sobe para o ESP **não leva CPF nem dado de trabalhador nenhum**: nome da caixa, e-mail e o
link com token, e nada mais. Reaproveita a exportação nativa do `DataTable` (`onExportar` +
`lib/csv.ts`), que já neutraliza fórmula.
Evidência: as 4 contagens + a query de e-mail duplicado devolvendo zero + amostra de 3 linhas de
cada arquivo + `count(*)` de `envios_campanha` por campanha.
Esforço máximo: 2 tentativas.
Escalonamento de LLM: Sonnet; Opus se a conferência de duplicata não fechar.
Se esgotar: parar e relatar. Lista errada não se corrige depois do disparo.

### Subetapa 08.14 — Copies das trilhas A e B [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA
**Redigida em 2026-08-27 e revisada por Maxwell em 2026-09-01**:
[`docs/copies_campanha_08_14.md`](../docs/copies_campanha_08_14.md) — as 4 copies (trilha A: 1 e-mail ·
trilha B: estrutural, informativo, requisição), com assunto, pré-cabeçalho, corpo, assinatura e
descadastro. **Arquivo único**: a revisão de Maxwell veio em `copies_campanha_corrigida.md`, e os
dois foram fundidos — copy com duas versões vivas é copy que se dispara errada. O que a fusão
acrescentou está listado em §9 do próprio arquivo.

**Prazo decidido por onda:** 20 dias (onda 01) · 15 (02) · 10 (03) · 10 (04).

**O critério "página jurídica respondendo 200" migrou para a Subetapa 9.0**, e o motivo é que ele
nunca foi um critério de TEXTO: o material jurídico está final e assinado (`01_nota_tecnica.pdf`,
`02_nota_resumida.pdf`, `03_pagina_dados.json` — Adenilson Antônio Silva, OAB/MG 96.522, 28/08/2026),
e a URL final é **`/dados/`**, não `/base-legal-dados/`. O que falta é publicar e conferir, e isso é
pré-voo de disparo, não redação de copy.

**Duas medições mudaram a copy antes de ela ser escrita:**
- **`{{ contact.NOME }}` não é usável em nenhuma das 4.** Em A/B/C o campo `nome` **é o próprio
  e-mail** (0 de 89, 0 de 248 e 0 de 613 linhas têm nome ≠ e-mail — o `contabilidades.nome` ainda é
  a caixa, como a 08.13 registrou); e em D ele é a razão social crua da RFB, que no empresário
  individual **contém o CPF** (`"DULCE TERRA DA SILVA 04181495698"`). Usá-lo imprimiria um CPF no
  corpo de milhares de e-mails. O único campo de mesclagem das 4 copies é `{{ contact.LINK }}`.
- **`envios.sindcompassos.org` não tem MX** (medido por DNS hoje): resposta ao `Reply-To` naquele
  subdomínio volta com erro, numa copy que diz "responda este e-mail". Correção é na Brevo, não no
  DNS — `Reply-To: secretaria@sindcompassos.org`, que alinha porque o DMARC está em `aspf=r`.

**Bloqueio medido:** `https://sindcompassos.org/base-legal-dados/` → **HTTP 404**. O texto está
pronto e assinado (OAB/MG 96.522), mas a publicação no site é de Maxwell. Sem ela, a copy de
Requisição apontaria para um 404 justamente no e-mail que carrega o argumento jurídico.

Objetivo: os textos — **1 e-mail** para contabilidades (trilha A) e **3** para empresas isoladas
(trilha B: estrutural, informativo, requisição), spec §9.
Conclusão: as 4 copies escritas e **aprovadas por Maxwell**; a do eixo **Requisição** só é dada por
pronta quando o link da nota técnica (08.3) responder 200 dentro do próprio texto.
Qualidade: contador não lê newsletter institucional — a trilha A é pedido objetivo, com os 6
campos, prazo, link do modelo já preenchido e canal humano para dúvida. A orientação **"envie
quantas vezes quiser, com quantas empresas conseguir por vez"** está no texto: é consequência
direta do token reutilizável (§5.5), e sem ela o contador de 129 empresas trava esperando terminar
tudo — **envio parcial vale muito mais que envio nenhum**. Descadastro nas quatro. Nenhum anexo
(anexo em disparo em massa derruba entregabilidade). O link com token é o único CTA da copy de
Requisição. Texto em pt-BR, tom conforme `docs/design-tokens.md`.
Evidência: as 4 copies em `docs/`, com o registro da aprovação de Maxwell e a URL da nota técnica
conferida.
Esforço máximo: 2 rodadas de revisão por copy.
Escalonamento de LLM: Opus — a copy de Requisição carrega o argumento jurídico.
Se esgotar: entregar as 3 copies não bloqueadas e relatar que a de Requisição aguarda a 08.3.

### Subetapa 08.15 — Onda 1 · **MOVIDA PARA A ETAPA 09 (Subetapa 9.2)** em 2026-09-01

**Esta subetapa não pertence mais à Etapa 08.** Decisão de Maxwell, e o motivo é o certo:

> A onda 1 é, de fato, a melhor prova de que a estrutura inteira funciona — Brevo, copy, jurídico,
> página pública, token, importação e telas do CRM. **Mas usá-la como primeira prova significa
> testar em 89 contabilidades e 3.758 estabelecimentos, 24% da base.** Uma base de e-mail é finita
> e não se recompra: se a copy, o link ou a página estiverem errados, o custo do aprendizado é
> permanente e recai sobre quem não tem nada a ver com o erro.

A prova ponta a ponta passa a ser feita **antes**, contra caixas do próprio Maxwell — a **Onda 00**,
Subetapa 9.1. Só depois dela a onda 1 real sai, como Subetapa 9.2.

**O que a Etapa 08 entrega, portanto, é a estrutura pronta e provada por teste; quem a coloca em
produção é a Etapa 09.** Ver "ETAPA 09 — EXECUÇÃO DAS CAMPANHAS" abaixo.

---

**Aceite da Etapa 08** (revisto em 2026-09-01, quando a onda 1 saiu para a Etapa 09): (1) DMARC
publicado e um e-mail de teste passando `spf/dkim/dmarc=pass` nas duas caixas; (2) as seis tabelas
novas com RLS, policy explícita e zero grant de fábrica sobrando; (3) um contador envia `.xlsx` pelo
token e a remessa aparece em `remessas_dados` com status `validada`, **sem tocar `trabalhadores`**;
(4) a Denise revisa e importa, e o reenvio do mesmo arquivo não duplica ninguém; (5) portão
adversarial verde, com relatório; (6) **as 4 copies fechadas e o material jurídico assinado**;
(7) a métrica que decide tudo — **estabelecimentos com ao menos um trabalhador vinculado — saiu de
zero**.

> **O item (6) mudou.** Ele era "onda 1 disparada com rejeição abaixo de 2%". Disparo é agora
> critério de aceite da **Etapa 09**, não da 08 — a 08 constrói e prova a estrutura, a 09 a usa.
> E a métrica (7) continua sendo a que decide a etapa: ela saiu de 0 e está em 2 estabelecimentos
> cobertos, com 4 trabalhadores vinculados.

**Riscos (spec §14):** domínio marcado como spam (mitigado por D1 + aquecimento + regra dos 2%) ·
contador recusa por LGPD (nota técnica pública e assinada) · contador não responde (tela de
cobertura + telefone nas 89 maiores) · planilha volta com CPF corrompido pelo Excel (coluna texto +
DV validado antes do envio) · um contador recebe N e-mails iguais (lista por caixa) · dado pessoal
exposto no canal público (bucket privado, token com validade, rate limit, sem leitura pela página,
revisão humana antes de qualquer escrita).

---

## ETAPA 09 — EXECUÇÃO DAS CAMPANHAS · Complexidade: MÉDIA · Status: ⬜

Objetivo geral: **usar** a estrutura que a ETAPA 08 construiu. Uma subetapa por onda, cada uma
organizando, disparando e acompanhando o seu público. A ETAPA 08 termina com tudo pronto e provado
por teste automatizado; esta etapa é a que põe e-mail na caixa de gente real.

**Por que ela existe como etapa separada** (decisão de Maxwell, 2026-09-01): a 08.15 original
faria do primeiro disparo real, em 24% da base, também o primeiro teste humano da estrutura inteira.
Construir e validar são atividades de natureza diferente e com riscos diferentes — **construção
errada se corrige, base de e-mail queimada não se recompra.** Separá-las permite intercalar a
Onda 00, que valida sem custo nenhum de reputação.

**Regra que governa a etapa inteira:** cada onda só sai depois que a anterior fechou no verde.
Rejeição acima de **2%** ou queda em spam **interrompe** — nunca "tenta de novo com mais volume".

**Ritmo de aquecimento (spec §8), que não se atropela:**

| Onda | Volume/dia | Público | Alcance acumulado |
|---|---|---|---|
| 00 | punhado | caixas do próprio Maxwell | — (é prova, não alcance) |
| 01 | 20 → 40 | 89 contabilidades grandes | 3.758 estabs (24%) |
| 02 | 50 → 80 | 248 médias | 5.947 (38%) |
| 03 | 100 → 150 | 613 pequenas | 7.438 (47%) |
| 04 | 200 → 300 | 8.236 empresas isoladas | 15.679 (100%) |

**Estrutura:** uma subetapa de CONSTRUÇÃO (**9.00**, a tela de descadastramento) e sete de
OPERAÇÃO (9.0 a 9.6).

**Copies:** `docs/copies_campanha_08_14.md` — arquivo único, texto fechado, prazo decidido por onda
(20 / 15 / 10 / 10). **Segurança:** o portão adversarial da 08.12 já está verde e aplicado em
produção (`docs/RELATORIO_08_ADVERSARIAL.md`).

> **Sobre a numeração:** a **9.00** vem antes da **9.0**. Ela nasceu depois, na discussão de
> 2026-09-01, e é a única subetapa de CONSTRUÇÃO desta etapa — as demais são operação. Manteve-se a
> numeração das outras para não invalidar as referências já escritas nos documentos e nos commits.

### Subetapa 9.00 — Tela de descadastramento e coleta de dados [Goal] [LLM: Sonnet] · Status: ⬜

Objetivo: transformar o descadastro de **perda** em **sinal**. Hoje quem sai da lista some dentro da
Brevo e o Sindcom não fica sabendo nem quem saiu, nem por quê. Esta subetapa constrói a página que
recebe quem clicou em "descadastre-se aqui", **reforça que sair da lista não extingue a obrigação da
empresa**, e coleta o motivo antes de concluir.

**Origem:** discussão de 2026-09-01 (`docs/copies_campanha_08_14.md` §10). Maxwell propôs retirar o
descadastro, por ser comunicação a pessoa jurídica com dever legal. A medição mostrou que 87,2% da
lista é caixa pessoal e que 79,9% dela é Google + Microsoft, que **exigem** descadastro em um clique
— então o link fica, e o que muda é o que ele diz e o que ele registra.

Conclusão:

1. **Página pública `/descadastrar/:token`**, sem login, no mesmo padrão de `/enviar-dados/:token`
   (não lê o banco pelo navegador; conversa só com Edge Function).
2. Ela **abre explicando**, antes de qualquer campo, que o descadastro **encerra os envios desta
   campanha e não afasta as obrigações da empresa perante a convenção coletiva** — mesmo texto do
   rodapé dos e-mails, para que quem chegou ali por aquele link reencontre a mesma frase.
3. **Formulário de motivo, de resposta obrigatória**, com múltipla escolha (uma opção) + campo livre
   opcional. O botão **"Confirmar descadastro" nasce desabilitado** e só habilita depois da escolha.
4. **Nova tabela `descadastros_campanha`** guardando o motivo, a via, o vínculo com
   `envios_campanha` e o rastro (IP, user-agent, momento) — dado estratégico, não operacional.
5. **`envios_campanha` ganha `descadastrado_em`**, para que a tela `/cobertura` possa distinguir
   "não respondeu" de "pediu para não ser mais contatado e não respondeu" — que são situações
   diferentes e pedem encaminhamentos diferentes.
6. A tela de cobertura (08.11) passa a **marcar** o descadastrado na listagem e na exportação.

**As opções do formulário não são genéricas — cada uma existe porque leva a uma ação diferente:**

| Motivo | O que o Sindcom faz com isso |
|---|---|
| Não sou mais o contador desta empresa / a empresa encerrou | **higiene de base** — o mais valioso: corrige a RFB, que está desatualizada |
| Já enviei os dados solicitados | **qualidade de dado** — se enviou e a cobertura não registra, há defeito no caminho |
| Recebo mensagens demais deste remetente | **ritmo** — se aparecer muito, a cadência da trilha B está errada |
| Não entendi o que o sindicato está pedindo | **copy** — o texto falhou, e isso se conserta |
| Prefiro tratar por telefone ou pessoalmente | **canal** — vira lista de ligação, não de e-mail |
| Discordo do pedido ou o considero indevido | **jurídico** — vai para o Dr. Adenilson, e é a única que pede resposta nominal |
| Outro | campo livre |

**TRÊS DECISÕES DE CONSTRUÇÃO QUE PRECISAM SER TOMADAS ANTES DE CODAR** — e a primeira é
bloqueante, porque errá-la derruba a campanha inteira:

**(a) Os dois caminhos de descadastro coexistem, e só um passa pelo formulário.** Google e Microsoft
exigem **descadastro em um clique** pelo cabeçalho `List-Unsubscribe` / `List-Unsubscribe-Post`
(RFC 8058): é o botão "Cancelar inscrição" que o Gmail desenha **acima** do e-mail, e ele tem de
funcionar **sem formulário, sem confirmação e sem página intermediária**. Um formulário obrigatório
nesse caminho é descumprimento, e o custo é entregabilidade do domínio inteiro.

> **Portanto:** o cabeçalho continua sendo o de um clique da Brevo, e **o formulário vive apenas no
> link do CORPO do e-mail** — que é o que a maioria das pessoas clica, porque é o que elas leem.
> Quem sai pelo botão do Gmail sai sem motivo registrado, e a tabela registra isso como
> `via = 'um_clique'`. **Cobertura parcial de propósito é melhor que campanha barrada.**

**(b) O formulário nunca pode virar obstáculo à saída.** Uma pergunta obrigatória é defensável; um
questionário não é. **Uma única pergunta de múltipla escolha, uma tela, um clique depois da
escolha** — e, se a gravação do motivo falhar por qualquer razão, **o descadastro acontece assim
mesmo** e o erro vai para o log. O dado é subproduto; o direito de sair é o ato principal.

**(c) Quem efetiva o descadastro na Brevo, e em que ordem.** A escolha muda o comportamento:
- *Recomendado* — a Edge Function grava o motivo e **em seguida** chama a API da Brevo para remover
  o contato da lista. Dá a ordem que a subetapa pede (motivo → descadastro) e mantém o registro
  mesmo se a chamada à Brevo falhar (fica pendente e se repete).
- *Alternativa* — usar a página de descadastro personalizada da Brevo, que remove o contato **antes**
  de redirecionar para a nossa página. Mais simples, mas inverte a ordem: quando o formulário
  aparece, a pessoa já saiu, e responder vira opcional na prática.

Qualidade: **o token do link é a mesma credencial de `/enviar-dados/`** — é ele que diz qual envio
está se descadastrando, e é o que permite ligar o motivo à contabilidade. Token revogado ou expirado
**não impede** o descadastro (quem quer sair sai), só entra na tabela sem vínculo resolvido.
`descadastros_campanha` nasce com RLS, policy explícita e `revoke all ... from anon` — o padrão da
seção 11 do `sql/20`, e o portão da 08.12 conferiu que ele funciona. A escrita é da Edge Function
com `service_role`, como em `receber-remessa`: **nenhum papel autenticado insere ali**, e a página
não lê o banco. Texto em pt-BR, tom conforme `docs/design-tokens.md` — a página **não confronta**,
pela mesma razão pela qual as copies não confrontam.

Evidência: uma passagem completa pelo link do corpo (motivo gravado + contato removido na Brevo +
`descadastrado_em` preenchido), uma pelo botão de um clique do Gmail (contato removido, linha com
`via = 'um_clique'`), a marcação aparecendo em `/cobertura`, e o teste de RLS da tabela nova.

Esforço máximo: 3 tentativas.
Escalonamento de LLM: Sonnet; **Opus se tocar no cabeçalho `List-Unsubscribe`** — ali o erro não
aparece em teste, aparece em reputação de domínio, semanas depois.
Se esgotar: **a campanha não fica bloqueada por isto.** O descadastro padrão da Brevo já funciona e
já é conforme; esta subetapa acrescenta a coleta do motivo. Se ela não fechar, dispara-se sem ela e
perde-se o dado — não a onda.

### Subetapa 9.0 — Pré-voo: o que tem de estar de pé antes de qualquer disparo [Manual] [LLM: Sonnet] · Status: ⬜
Objetivo: fechar as pendências de infraestrutura que a Etapa 08 identificou e não podia resolver
sozinha, porque nenhuma delas mora no repositório.
Conclusão: **(a) ✅ site institucional respondendo 200** — feito em 2026-09-01. O `.htaccess` tinha
perdido as ~7 primeiras linhas e começava no meio de um `RewriteCond` (`commerce_session_) [NC]`),
o que faz o Apache recusar o diretório inteiro — até arquivo estático dava 500. Restaurado do
backup versionado; método de diagnóstico em `orientacoes.md` §1.6. **(b) ✅
`https://sindcompassos.org/dados/` no ar, respondendo 200**, com o conteúdo conferido na página
servida (assinatura de Adenilson Antônio Silva, OAB/MG 96.522, e a citação do art. 11, II) — 200 em
WordPress também é o que uma página vazia devolve, então conferir o conteúdo não é preciosismo.
**(c) ⬜ redirecionamento HTTP → HTTPS**, **acima** do bloco de cache (§1.5): `http://` ainda
responde 200 sem redirecionar. **Reintroduzir separadamente, e provar** — foi mexer nesse arquivo
que derrubou o site. **(d) ⬜ `Reply-To`** da Brevo apontando para `secretaria@sindcompassos.org`.
**(e) ⬜ os 4 CSVs** importados na Brevo, contagens conferidas (89 / 248 / 613 / 8.236).
**(f) ⬜ `campanhas.eixo` e `campanhas.assunto`** preenchidos no CRM.
Qualidade: **cada item se prova por requisição ou por resposta que chega, nunca por tela de
configuração.** Ler "Reply-To: secretaria@" no painel da Brevo não prova que a resposta chega —
responder ao e-mail e ver a mensagem em `secretaria@` prova.
Evidência: as 6 conferências, cada uma com o resultado medido.
Esforço máximo: sem teto — é pré-requisito, não entrega.
Se esgotar: **nenhuma onda sai.** Onda que depende de link quebrado queima base sem aprender nada.

### Subetapa 9.1 — Onda 00: prova ponta a ponta em caixas do próprio Maxwell [Manual] [LLM: Opus] · Status: ⬜
Objetivo: **provar a estrutura inteira com dado real e destinatário controlado, antes de tocar em
uma única contabilidade de verdade.** É a subetapa que a decisão de 2026-09-01 criou, e é ela que
transforma a onda 1 de experimento em execução.
Conclusão: as **4 copies disparadas de verdade pela Brevo** (trilha A + B1 + B2 + B3) para
contabilidades e empresas **fictícias**, semeadas para este fim, com `envios_campanha` e token
reais, e endereçadas a caixas de e-mail às quais Maxwell tem acesso. Para cada uma:

1. **chegou** — e chegou na caixa de entrada, não em spam, no Gmail **e** no Outlook;
2. **está legível** — sem imagem quebrada, sem campo de mesclagem à mostra, sem texto cortado, no
   desktop e no celular;
3. **autenticou** — `spf=pass`, `dkim=pass`, `dmarc=pass` no cabeçalho original da mensagem;
4. **o `Reply-To` funciona** — responder ao e-mail e a resposta chegar em `secretaria@`;
5. **o link do token abre**, mostra a carteira certa da contabilidade fictícia e aceita uma planilha;
6. **a remessa aparece** em `/remessas` e o estabelecimento aparece coberto em `/cobertura`;
7. **o descadastro funciona** e remove o contato da lista na Brevo;
8. **o link de `/dados/` abre** a partir do corpo da B3, no cliente de e-mail real.

Qualidade: **dados fictícios claramente nomeados** (prefixo `DEMO —`, CNPJ da faixa 999999…), para
nunca serem confundidos com cadastro real — e eles **ficam gravados** ao final, como todo dado de
demonstração deste projeto. A Onda 00 é a única em que **errar é barato**: qualquer defeito
encontrado aqui é defeito que não alcançou contabilidade nenhuma. **Ler as 4 copies na caixa de
entrada é parte do teste, não formalidade** — texto que se lê bem no Markdown pode quebrar no
cliente de e-mail.
Evidência: um print por copy por cliente (8), o cabeçalho de autenticação de uma delas, a resposta
recebida em `secretaria@`, a remessa em `remessas_dados` e a leitura de `/cobertura`.
Esforço máximo: sem teto — é a prova que autoriza tudo o que vem depois.
Escalonamento de LLM: Opus — é aqui que um defeito sutil de copy ou de token tem de ser percebido.
Se esgotar / se qualquer um dos 8 falhar: **corrigir e repetir a Onda 00.** A onda 1 não sai com
qualquer item no vermelho, e repetir a Onda 00 não custa reputação nenhuma.

### Subetapa 9.2 — Onda 01: as 89 contabilidades grandes [Manual] [LLM: Opus] · Status: ⬜
*(era a Subetapa 08.15; movida para cá em 2026-09-01, com o conteúdo preservado)*

Objetivo: o primeiro disparo real — 89 envios que alcançam **3.758 estabelecimentos, 24% da base**.
Se a copy estiver ruim, descobre-se com 89 e não com 9.000 (D8) — **e agora, com a Onda 00 no
verde, a copy já foi lida em caixa real antes de chegar aqui.**
Conclusão: os 89 e-mails enviados no ritmo de aquecimento (**20 → 40 por dia**), com
`envios_campanha.enviado_em` preenchido nos 89, **taxa de rejeição medida abaixo de 2%** no painel
do ESP, e a tela de cobertura (08.11) mostrando as primeiras remessas chegando.
Qualidade: **nunca subir volume com rejeição acima de 2%**, e **parar e investigar ao cair em
spam** em vez de insistir — insistir com volume maior só queima a base, e a base é finita e não se
recompra. O disparo é **ordenado por Maxwell**, nunca iniciado pelo CODE. Os links são reconferidos
imediatamente antes (08.0). As 89 maiores caixas valem contato telefônico direto no follow-up:
são 24% da base em 89 ligações.
Pré-requisito duro: **9.0 e 9.1 fechadas**.
Evidência: print do painel do ESP com entregues/rejeitados/spam + `select count(*) from
envios_campanha where enviado_em is not null` = 89 + a primeira leitura de cobertura.
Esforço máximo: 1 disparo; qualquer anomalia interrompe em vez de reenviar.
Se esgotar: parar o agendamento no ESP e relatar. **Onda 2 não sai com a onda 1 no vermelho.**

### Subetapa 9.3 — Onda 02: as 248 contabilidades médias [Manual] [LLM: Sonnet] · Status: ⬜
Objetivo: 248 envios, 2.189 estabelecimentos, levando o alcance acumulado a 38%.
Conclusão: 248 enviados a 50 → 80/dia, rejeição abaixo de 2%, `enviado_em` preenchido, cobertura
subindo. Prazo da copy: **15 dias**.
Pré-requisito duro: **onda 01 fechada no verde**, com a taxa de resposta medida — se a onda 01
converteu mal, o que se ajusta é a copy, não o volume.
Se esgotar: parar e relatar.

### Subetapa 9.4 — Onda 03: as 613 contabilidades pequenas [Manual] [LLM: Sonnet] · Status: ⬜
Objetivo: 613 envios, 1.491 estabelecimentos, alcance acumulado 47%. Prazo da copy: **10 dias**.
Conclusão: idem 9.3, a 100 → 150/dia.
Pré-requisito duro: onda 02 fechada no verde.

### Subetapa 9.5 — Onda 04: as 8.236 empresas isoladas (trilha B, três e-mails) [Manual] [LLM: Opus] · Status: ⬜
Objetivo: o maior público e o único com **sequência de três e-mails** — estrutural, informativo e
requisição, com no mínimo 5 dias entre eles. 8.236 caixas, 8.236 estabelecimentos, alcance
acumulado 100%.
Conclusão: as três copies disparadas na ordem e no intervalo, a 200 → 300/dia, rejeição abaixo de
2% **em cada uma das três**, e `enviado_em` preenchido. Prazo da copy: **10 dias**, contado do
disparo da B3.
Qualidade: é a onda com maior risco de spam — público que nunca ouviu falar do sindicato, três
mensagens seguidas, volume alto. **A taxa de descadastro depois da B1 é o termômetro**: se ela vier
alta, a B2 sai menor, não maior. Os **5 e-mails malformados na RFB** descartados na 08.13 continuam
fora e precisam de correção manual da Denise se quiserem ser alcançados.
Pré-requisito duro: onda 03 fechada no verde.
Escalonamento de LLM: Opus — sequência de três, público frio e volume alto é onde a decisão de
"seguir ou parar" precisa de julgamento, não de regra.

### Subetapa 9.6 — Follow-up e telefone [Manual] [LLM: Sonnet] · Status: ⬜
Objetivo: converter quem não respondeu. A tela `/cobertura` (08.11) já mostra, nominalmente, quem
falta.
Conclusão: as contabilidades da onda 01 sem remessa após o prazo, contatadas por telefone; um
segundo e-mail para quem abriu e não enviou.
Qualidade: **as 89 maiores caixas valem ligação, não e-mail** — são 24% da base em 89 ligações, e
ligação não queima reputação de domínio.

---

**Aceite da Etapa 09:** (1) Onda 00 verde nos 8 pontos, com evidência; (2) as 4 ondas reais
disparadas, cada uma com rejeição abaixo de 2%; (3) `envios_campanha.enviado_em` preenchido em
9.186 linhas; (4) a métrica que decide tudo — **estabelecimentos com ao menos um trabalhador
vinculado** — medida antes e depois de cada onda, e crescendo; (5) **todo descadastro com motivo
registrado** em `descadastros_campanha`, exceto os que vierem pelo botão de um clique do provedor,
que por construção não têm motivo (9.00).

**Riscos:** domínio marcado como spam (mitigado pelo aquecimento, pela regra dos 2% e pela Onda 00,
que agora testa antes) · contador não responde (cobertura + telefone) · a onda 04 é o público mais
frio e o maior volume, e é onde a reputação construída nas três primeiras pode ser perdida de uma vez
· **descumprir o descadastro em um clique** (RFC 8058) por causa do formulário da 9.00 — este é o
único risco desta etapa cujo dano não aparece em teste nenhum: ele aparece semanas depois, como
queda de entrega no Gmail, e já terá custado a base.

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
| 06 | Alta | Etapa 04 | Base empresarial real: 16.687 empresas + 17.319 estabelecimentos ✅ |
| 07 | Alta | Etapa 06 | Portão adversarial: 5 falhas reais fechadas ✅ |
| 08 | Alta | Etapa 07 (portão) + DMARC + nota jurídica | Base de **pessoas**: campanha, coleta por token e rastreio por cobertura |
| 05 | Variável | Etapa 08 + dados de uso | Refinamentos guiados por evidência |

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
