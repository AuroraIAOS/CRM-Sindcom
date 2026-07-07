# CRM SINDCOM — Especificação do Dashboard

> Par deste documento: `sql/04_dashboard.sql` (views, motor de dicas, rotinas).
> Rota: `/dashboard` · Componentes-base: `KpiCard`, `ChartCard`, `MapaMunicipios`, `DicasList` (`frontend.md`).

---

## 1. Política de atualização

| Camada | Mecanismo | Frequência |
|---|---|---|
| KPIs, gráficos, mapa, dicas | TanStack Query sobre as views `v_dash_*` | On-load + `staleTime` 5 min + botão refresh |
| Badges de fila (aprovações, fila-admin, notificações) | Supabase Realtime (`postgres_changes`) | Tempo real |
| Séries de evolução | `snapshots_dashboard` (job mensal, dia 1 às 04h) | Batch mensal |
| Conversões/regressões | `eventos_nivel` (trigger — sem job) | Tempo real por natureza |

Racional: dashboard estratégico não precisa de realtime (custo sem valor); filas operacionais precisam.

## 2. Widgets

### Linha 1 — KPIs (`v_dash_kpis`, uma query para todos os cards)

| # | Widget | Conteúdo | Detalhe |
|---|---|---|---|
| K1 | Trabalhadores por nível | 3 cards Bronze/Prata/Ouro + total | Cores da skill `sindcom` via `NivelBadge`; clique → lista filtrada |
| K2 | Novos cadastros (30d) | `novos_30d` | Tendência vs. período anterior (calculada no cliente com `v_dash_conversoes_mensais.novos_cadastros`) |
| K3 | MRR | `mrr_mensalidades + mrr_contribuicoes` | Tooltip abre a composição: mensalidades (mensal real) + contribuições (anuidade ÷ 12). Deixar a fórmula visível — número auditável, não mágico |
| K4 | Inadimplência | Dois números lado a lado | **Empresas:** guias em atraso (qtd + R$) · **Boletos:** faturas inadimplentes (qtd + R$). A assimetria é intencional e deve ser visível (política de 03/07) |
| K5 | Filas | `cadastros_pendentes` + `fila_admin_pendente` | Badge realtime; clique → `/aprovacoes` ou `/fila-admin` |

### Linha 2 — Gráficos

| # | Widget | Tipo | Fonte | Observações |
|---|---|---|---|---|
| G1 | Evolução por nível (12 meses) | Linha (3 séries) | `v_dash_evolucao_niveis` | Eixo Y começa em 0; até existirem 2+ snapshots, exibir estado vazio "histórico em construção — primeira fotografia em {data}" |
| G2 | Conversões mensais | Barras empilhadas + linha de regressões | `v_dash_conversoes_mensais` | Séries: Bronze→Prata, Prata→Ouro, Bronze→Ouro; linha vermelha = regressões (churn). É O gráfico da métrica de sustentabilidade |
| G3 | Receita mensal | Área empilhada | `v_dash_receita_mensal` | Realizada × pendente, com filtro por tipo (contribuição/mensalidade/excepcionais) |
| G4 | Funil de níveis | Barras horizontais | `v_dash_kpis` | Bronze → Prata → Ouro com taxas de conversão calculadas no cliente (prata/bronze, ouro/prata) |
| G5 | Parceiros (90d) | Barras + tabela | `v_dash_top_parceiros` | Executadas, pendentes de confirmação, rejeitadas e **economia gerada** (argumento de marketing: "o convênio devolveu R$ X aos filiados") |

### Linha 3 — Mapa e dicas

**M1 · Mapa coroplético (`MapaMunicipios`)**
- **Lib:** Leaflet + GeoJSON da malha municipal do IBGE filtrada aos 29 (join por `codigo_ibge` — o seed 01b garante o código).
- **Fonte:** `v_dash_mapa`.
- **Métrica selecionável** (dropdown): total de trabalhadores · por nível (3 opções) · estabelecimentos ativos.
- **Definição de município do trabalhador:** onde ele **trabalha** (estabelecimento do vínculo principal ativo), com fallback para residência — decisão registrada na view. É a leitura sindicalmente correta da base territorial.
- **Escala de cor:** 5 faixas em quantis da paleta `sindcom` (do creme ao vermelho institucional); Passos destacada com contorno (sede).
- **Tooltip:** nome + total + breakdown por nível + estabelecimentos.
- **Clique:** navega para `/trabalhadores?municipio={id}`.

**D1 · Dicas estratégicas (`DicasList`)**
- **Fonte:** `v_dash_dicas` — 11 regras SQL, ordenadas por severidade (crítica → atenção → oportunidade), cada uma com CTA para a rota de ação.

| Código | Sev. | Regra (resumo) | Ação sugerida |
|---|---|---|---|
| CARTA_PENDENTE | 🔴 | Prazo de oposição de uma CCT terminando (≤30d, config) com trabalhadores não-Ouro sem carta | Divulgar o prazo aos trabalhadores daquela(s) empresa(s) |
| ORGANIZACAO_PENDENTE | 🔴 | CCT com prazo de oposição encerrado e organização interna não executada | Conferir cartas e rodar a reclassificação da CCT (botão no relatório) |
| GUIAS_ATRASO | 🔴 | Guias/boletos de empresa vencidos (data_vencimento = geração + 30d default) | Cobrança institucional |
| SEM_CCT | 🔴 | Estabelecimentos com trabalhadores ativos sem CCT vinculada | Vincular CCT — sem isso não há cálculo de fatura |
| CCT_DESATUALIZADA | 🟡 | CCT vigente há 12+ meses | Acompanhar negociação da renovação |
| OURO_SEM_USO | 🟡 | Ouros sem solicitação executada em 12m | Risco de churn — lembrar benefícios |
| APROVACAO_LENTA | 🟡 | Cadastros pendentes >7 dias | Destravar fila |
| SEM_VINCULO | 🟡 | Prata/Ouro sem vínculo ativo | Verificar desligamento → migrar p/ boleto |
| BENEFICIO_SEM_VALOR | 🟡 | Benefícios ativos sem valor particular/convênio cadastrado | Completar valores com o parceiro (pendência Alma Pura/CISMIP) — sem eles a guia sai sem o comparativo de economia |
| CAMPANHA_OURO | 🟢 | Pratas que usaram o jurídico em 12m | Campanha Prata→Ouro (já percebem valor) |
| CAMPANHA_UPGRADE | 🟢 | Pratas sem interação há 90+ dias | Campanha de reengajamento |

Regras novas exigem apenas um novo bloco `UNION ALL` na view — zero mudança de frontend.

## 3. Visibilidade por role

| Widget | Admin | Presidente | Secretária | Jurídico |
|---|:--:|:--:|:--:|:--:|
| K1–K3, G1–G4, M1 | ✅ | ✅ | ✅ | K1 apenas¹ |
| K4 (inadimplência), G3 (receita), G5 | ✅ | ✅ | ✅ | ⊘ |
| K5 (filas) | ✅ | ⊘ | aprovações apenas | ⊘ |
| D1 (dicas) | ✅ | ✅ | ✅ | ⊘ |
| Jurídico: card próprio "Meus atendimentos (30d)" + acesso rápido a `/juridico` | — | — | — | ✅ |

> ¹ O K1 do Jurídico usa **consulta direta** a `trabalhadores` (count por nível) — não a `v_dash_kpis`: a view contém subqueries financeiras que o RLS dele nega, o que derrubaria a view inteira. Detalhe análogo: `fila_admin_pendente` na `v_dash_kpis` conta sob o RLS de quem consulta (Presidente veria 0 — por isso o K5 não renderiza para ele).

Parceiro não acessa `/dashboard` — o `/portal` tem mini-KPIs próprios (pendentes de confirmação, executadas no mês, economia gerada), servidos por `v_fila_parceiro` agregada no cliente.

O corte por role é dupla camada: o frontend não renderiza o widget, e as views `security_invoker = on` fazem o RLS negar a query por baixo se alguém tentar na marra (ex.: Jurídico consultando `v_dash_kpis` recebe erro nas subqueries financeiras — o frontend simplesmente não a chama para ele).

## 4. Rotinas automáticas (no `sql/04_dashboard.sql`)

| Rotina | Frequência | Função | Efeito |
|---|---|---|---|
| Evolução de solicitações | Diária 03h00 | `fn_evoluir_solicitacoes()` | `solicitada` → `pendente_confirmacao` após a data |
| Guias em atraso | Diária 03h10 | `fn_marcar_guias_em_atraso()` | Alimenta K4 e a dica GUIAS_ATRASO |
| Boletos inadimplentes | Diária 03h20 | `fn_marcar_boletos_inadimplentes()` | Dispara os bloqueios de inadimplência do schema |
| Snapshot | Mensal, dia 1 04h00 | `fn_snapshot_dashboard()` | Alimenta G1 |
| Organização interna (por CCT) | **Manual** (Admin, botão no relatório da CCT, após o prazo de oposição) | `fn_reclassificar_convencao(cct)` | Aplica 5.1–5.3: carta → Bronze · Ouro intocado (renovação automática) · demais → Prata; carimba `reclassificada_em`; notifica a secretaria; eventos com origem `reclassificacao_anual` |

Agendador: **pg_cron** (extensão nativa do Supabase) para tudo que é 100% SQL — sem dependência do n8n para rotinas internas. O n8n entra apenas onde há efeito externo (e-mails de guias — `plano_fases.md`, Fase 2). A reclassificação anual é deliberadamente manual: é um ato administrativo com consequência financeira para centenas de pessoas; um humano aperta o botão.

## 5. Parâmetros configuráveis (tabela `configuracoes`, editável em `/configuracoes`)

| Chave | Default | Uso |
|---|---|---|
| `dias_alerta_carta` | 30 | Antecedência do alerta R2 (prazo de oposição, por CCT) |
| `dias_vencimento_boleto` | 30 | Vencimento default de boletos/guias contado da **geração** (editável por documento) |

> **A data limite da Carta de Oposição não é global** — é campo da própria CCT (`convencoes_coletivas.data_limite_oposicao`), preenchido manualmente no registro de cada convenção, junto com pisos por função e multas/taxas (`taxas_convencao`).
