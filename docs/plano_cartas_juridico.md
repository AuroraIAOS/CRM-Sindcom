# Plano de resolução — telas `/cartas` e `/juridico`

> Diagnóstico e plano de ação elaborados em 2026-07-22, a pedido de Maxwell, a
> partir da avaliação do CRM em produção (`crm.sindcompassos.org`) —
> evidências em `screenshots/10_aba_carta_oposição.png` e
> `screenshots/11_aba_juridico.png`.
> **Status: plano EXECUTADO em 2026-07-22** (Etapa 04 do `specs/plano_fases.md`).
> As §1–§8 preservam o diagnóstico e o plano como foram escritos, antes da
> implementação — o que ficou obsoleto ali está corrigido em §9 (o que foi
> entregue) e §10 (o que falta para o aceite integral).

---

## 1. O que de fato está acontecendo

As duas abas **existem** na navegação e **são roteáveis** — o que não existe é a
tela. Ambas caem no componente `Placeholder` e exibem:

> "Tela em construção — chega na Fase 1. A fundação (auth, RLS, navegação por
> papel) é a entrega da Fase 0."

Mecânica exata, em código:

| Camada | Arquivo | Situação |
|---|---|---|
| Item de menu | `src/app/nav.ts:41-42` | ✅ `/cartas` e `/juridico` declarados, `roles = TODOS_INTERNOS` |
| Rota | `src/app/router.tsx:116-123` | ✅ criada a partir do `NAV`, protegida por `RoleGate` |
| Página | `src/app/router.tsx:56-78` (`PAGINAS`) | ❌ **nenhuma das duas tem entrada** → `?? <Placeholder>` |
| Feature | `src/features/` | ❌ **não existem** `src/features/juridico/` nem `src/features/cartas/` |

Ou seja: **não é bug de deploy, de build, de RLS nem de permissão.** É código que
nunca foi escrito. O menu funciona exatamente como projetado; ele aponta para um
destino vazio.

### 1.1 O banco, ao contrário, está pronto para as duas

Nada precisa ser criado no schema para as telas existirem:

| Objeto | Onde | Estado |
|---|---|---|
| `cartas_oposicao` (+ `unique (trabalhador_id, ano_base)`) | `sql/01_schema.sql:345` | ✅ aplicado |
| `forma_entrega_carta` enum | `sql/01_schema.sql:22` | ✅ |
| 4 policies de `cartas_oposicao` | `sql/03_rls.sql:179-186` | ✅ |
| `atendimentos_juridicos` | `sql/01_schema.sql:612` | ✅ aplicado |
| `tipo_atend_juridico` enum | `sql/01_schema.sql:30` | ✅ |
| `fn_valida_atendimento_juridico` + trigger | `sql/01_schema.sql:628-649` | ✅ aplicado |
| 4 policies de `atendimentos_juridicos` | `sql/03_rls.sql:277-284` | ✅ |
| KPI "Meus atendimentos (30 dias)" + link p/ `/juridico` | `src/features/dashboard/` | ✅ já em produção |

Contagem real em produção (medida hoje, projeto `vcswvscjqifelslsdjth`):

```
cartas_oposicao ......... 4 linhas (anos-base 2025 e 2026)
atendimentos_juridicos ... 0 linhas
trabalhadores ........... 23
```

Os **zero atendimentos não são coincidência**: não existe, em nenhum ponto da
interface, um caminho para criar um. O acordeão "Atendimentos" da ficha do
trabalhador (`DetalheTrabalhador.tsx:93-98`) ainda diz *"disponível a partir da
Etapa 02"* — e a Etapa 02 fechou sem isso.

---

## 2. Por que cada uma ficou de fora (são dois motivos diferentes)

### 2.1 `/cartas` — adiamento deliberado, corretamente registrado

Está no backlog do `CLAUDE.md`, com data e autoria:

> **Visão anual de cartas de oposição** (`/cartas`: quem entregou, quem falta,
> exportação da lista de reclassificação — `specs/frontend.md` §2.2) — adiada
> para o **final do roteiro**, decisão de Maxwell em 2026-07-13. Não implementar
> junto de nenhuma subetapa intermediária; só entra quando todo o resto estiver
> pronto. **Exportar CSV nesta tela também espera esse momento.**

Isto é **dívida planejada, não falha**. A parte operacional das cartas foi
entregue e funciona: `CartasTab` na ficha do trabalhador (registro individual com
confirmação explícita da queda para Bronze), registro em lote
(`useRegistrarCartasEmLote`) e a organização interna por CCT (`RelatorioTab` +
`fn_reclassificar_convencao`). O que falta é só a **visão transversal por
ano-base**.

**Defeito colateral de documentação:** a Subetapa 01.2 do `specs/plano_fases.md`
tem como objetivo *"registro de cartas de oposição (+ visão anual)"* e está
marcada `Status: ✅ CONCLUÍDA` sem qualquer ressalva. O documento afirma
entregue algo que foi deliberadamente adiado — quem lê o plano sem cruzar com o
`CLAUDE.md` conclui que a tela existe.

### 2.2 `/juridico` — lacuna real de planejamento (spec órfã)

Esta é a falha de verdade. A tela está **especificada** em `specs/frontend.md`
§2.2:

> `/juridico` | Atendimentos jurídicos | admin, presidente (leitura), secretaria
> (leitura), juridico | Lista + registro de atendimento (o gate de
> nível/bloqueio vem do trigger; UI mostra o motivo de recusa de forma amigável)

Mas **nenhuma subetapa do `specs/plano_fases.md` jamais assumiu a construção
dela**. Rodando a busca no plano inteiro, `/juridico` aparece apenas em:

- **Subetapa 00.5** — como destino do redirecionamento pós-login;
- **Subetapa 00.6** — como célula da matriz RLS ("jurídico só INSERT em
  `atendimentos_juridicos`").

A Subetapa 01.2 chama-se *"Vínculos, beneficiados e cartas de oposição"* e não
menciona atendimentos jurídicos em lugar nenhum. O `CLAUDE.md` registra no
backlog *"Jurídico (parcial, subetapa 01.2)"* — **essa atribuição não tem
respaldo no texto do plano**; é uma suposição que se propagou. Resultado: as
Etapas 01, 02 e 03 fecharam com a tela sem dono.

### 2.3 A consequência mais grave: o papel `juridico` não tem produto

`homeDoRole()` (`src/app/nav.ts:63-67`) manda o papel `juridico` direto para
`/juridico` no pós-login. Ou seja: **o único usuário cuja porta de entrada é
essa rota aterrissa numa página "em construção" como primeira tela do sistema.**
Adenilson, hoje, não tem o que fazer no CRM: pode ler dados, mas a única
operação que a RLS lhe concede (`INSERT` em `atendimentos_juridicos`) não tem
interface.

Dois efeitos secundários dessa lacuna:

1. **A regra de negócio mais sensível do Jurídico nunca foi exercida.** O
   trigger `fn_valida_atendimento_juridico` implementa o gate dos Direitos
   Individuais (Bronze → só `orientacao`; inadimplente na contribuição →
   bloqueado). Ele existe no banco desde a Fase 0 e **nunca rodou contra um dado
   real**. A suíte também não o cobre: `tests/rls/rls.spec.ts:139` e `:170` só
   testam a *permissão* de INSERT com payload vazio (`{}`), o que falha antes de
   chegar ao trigger. O item 2 da "suíte contínua" do plano ("Triggers de
   negócio") está, nesta célula, descoberto.
2. **`src/lib/mensagens.ts` não traduz nenhuma das duas exceções do trigger** —
   verificado por busca: não há entrada para "Bronze", "orientação" nem
   "inadimplente" vinda desse caminho. Sem isso, a UI mostraria a mensagem crua
   do Postgres, contra a regra do `CLAUDE.md`.

### 2.4 Por que isso não foi pego antes

Não houve nenhum sinal automático porque **nenhum dos portões olha para esta
classe de defeito**:

- a suíte de testes valida **banco** (RLS, triggers, cálculos), não a existência
  de tela;
- `npm run build` e `typecheck` passam — `Placeholder` é um componente válido;
- as vistorias de fecho de etapa conferiram os itens *listados* em cada
  subetapa, e `/juridico` não estava listado em nenhuma;
- o menu renderiza normalmente, então a ausência não é visível na navegação —
  só ao clicar.

**Lição transferível (candidata a `orientacoes.md` §7):** um fallback silencioso
(`PAGINAS[path] ?? <Placeholder>`) transforma "tela não construída" em "tela
construída e vazia". Sem um inventário que cruze `specs/frontend.md` §2.2 com as
chaves de `PAGINAS`, a diferença entre as duas só aparece quando um humano
clica.

### 2.5 🔴 Achado colateral — frontend e motor SQL discordam sobre o Ouro

Levantado em 2026-07-22 ao validar a decisão D2. **Não é parte do sintoma
original, mas afeta dinheiro e precisa de decisão.**

A mesma regra de negócio ("registrar carta de oposição") está implementada em
dois lugares que **não concordam**:

| Caminho | Código | O que faz com as flags | Efeito sobre um **Ouro** |
|---|---|---|---|
| Registro individual na ficha | `useRegistrarCarta` (`trabalhadores/api.ts:350-353`) | zera **as duas** flags | **vira Bronze na hora** |
| Registro em lote na lista | `executarLoteCartas` (`bulk.ts:128-133`) | zera **as duas** flags | **vira Bronze na hora** |
| Organização interna por CCT | `fn_reclassificar_convencao` (`04_dashboard.sql:536-556`) | zera só `recolhe_contribuicao_sindical`, e **exclui `nivel <> 'ouro'` do universo** | **permanece Ouro** |

Ou seja: um trabalhador Ouro que entrega carta termina **Bronze** se a Denise
registrar pela ficha, e **Ouro** se ninguém registrar individualmente e a
organização interna rodar. Mesmo fato, dois resultados, diferença de dinheiro
(Ouro paga mensalidade do convênio; Bronze não paga nada).

O SQL tem razão documentada: o comentário em `04_dashboard.sql:511-513` diz que
"Ouro que entregar carta NÃO regride por aqui: precisa antes cancelar a adesão
(fidelidade mínima de 1 ano, FAQ 15)". O próprio schema reforça — a constraint
`chk_convenio_exige_contribuicao` impede zerar só a contribuição de um Ouro, que
é o motivo técnico de a regra 5.2 tirá-lo do universo.

O frontend, ao zerar as duas flags de uma vez, **cancela a adesão ao convênio
sem passar pelo cancelamento formal** — silenciosamente, no mesmo clique.

**Situação hoje:** latente, não realizada. Há 2 trabalhadores Ouro com carta na
base (`DEMO — Ouro com carta (não regride, regra 5.2)` e `DEMO — Trabalhador
Ouro`), ambos ainda Ouro — porque essas cartas foram inseridas por SQL durante a
Subetapa 02.5, não pela tela. **Na primeira vez que a Denise registrar a carta de
um Ouro pela ficha, o convênio dele é cancelado sem aviso.**

**Decisão D3 (aberta) — ver §3.4.**

---

## 3. Plano de resolução

### 3.0 Onde registrar no roteiro

As duas telas são **escopo de MVP especificado em `specs/frontend.md` §2.2**, não
refinamento pós-MVP — colocá-las na "ETAPA 04 — BACKLOG PÓS-MVP" misturaria
dívida de escopo com melhoria oportunista.

**Recomendação:** criar em `specs/plano_fases.md` uma etapa nova entre a 03 e a
atual 04:

```
## ETAPA 04 — FECHAMENTO DO MAPA DE TELAS · Complexidade: MÉDIA · Status: ⬜
### Subetapa 04.1 — /juridico (Atendimentos jurídicos)
### Subetapa 04.2 — /cartas (Visão anual de cartas de oposição)
```

e renumerar a atual Etapa 04 para **ETAPA 05 — BACKLOG PÓS-MVP** (edição de um
único documento; nenhuma referência cruzada quebra).
*Alternativa de menor atrito:* manter a numeração e entrar como 04.1/04.2 dentro
da Etapa 04 atual, com nota explícita de que são dívida de escopo do MVP e não
backlog priorizável.

**Correções de documentação a fazer junto (não opcionais):**

- `specs/plano_fases.md` §01.2 → `Status: ✅ CONCLUÍDA (parcial — visão anual
  /cartas deferida por decisão de 2026-07-13, ver Subetapa 04.2)`.
- `CLAUDE.md` → remover a atribuição incorreta *"Jurídico (parcial, subetapa
  01.2)"*; o item de exportação CSV do backlog cita "Jurídico, Parceiros,
  Benefícios e Solicitações", mas **Parceiros e Benefícios já exportam** —
  corrigir para "Jurídico e Solicitações".
- `DetalheTrabalhador.tsx:96` → a frase "disponível a partir da Etapa 02" está
  factualmente errada desde o fecho da Etapa 02.

---

### 3.1 Subetapa 04.1 — `/juridico` (PRIORIDADE 1)

Vem primeiro porque **destrava um papel inteiro do sistema**, e porque `/cartas`
tem decisão registrada de ficar por último.

#### Matriz de permissão a respeitar na UI (fonte: `sql/03_rls.sql:277-284`)

| Operação | admin | presidente | secretaria | juridico | parceiro |
|---|:--:|:--:|:--:|:--:|:--:|
| SELECT | ✅ | ✅ | ✅ | ✅ | ⊘ |
| INSERT | ✅ | ⊘ | **⊘** | ✅ | ⊘ |
| UPDATE | ✅ | ⊘ | ⊘ | ✅ | ⊘ |
| DELETE | ✅ | ⊘ | ⊘ | ⊘ | ⊘ |

Atenção ao ponto contraintuitivo: **a Secretaria lê mas não registra** — é o
inverso do padrão dela nas demais telas. O botão "Novo atendimento" precisa ser
escondido para `presidente` e `secretaria` (mesmo padrão do `PODE_REGISTRAR` em
`CartasTab.tsx:46`).

#### Entregáveis

| # | Arquivo | Conteúdo |
|---|---|---|
| 1 | `src/features/juridico/api.ts` | Hooks TanStack: `useAtendimentos(filtros)` (paginado no servidor, embed de `trabalhadores(nome, cpf, nivel)` e `perfis(nome)`), `useAtendimentosTrabalhador(id)`, `useCriarAtendimento`, `useAtualizarAtendimento`, `useExcluirAtendimento` |
| 2 | `src/features/juridico/schemas.ts` | zod: `trabalhador_id` (uuid obrigatório), `data`, `tipo` (4 valores do enum), `resumo`, `status`, `responsavel` |
| 3 | `src/features/juridico/ListaAtendimentosPage.tsx` | `DataTable` + filtros (busca por nome/CPF, tipo, status, período) + "Novo atendimento" + "Exportar CSV" (`lib/csv.ts`) |
| 4 | `src/features/juridico/NovoAtendimentoDialog.tsx` | `EntityForm` + seletor de trabalhador com busca; **aviso preventivo de nível** quando o selecionado é Bronze e o tipo ≠ orientação (a decisão real continua sendo do trigger) |
| 5 | `src/features/juridico/DetalheAtendimentoDialog.tsx` | Edição de status/resumo (admin, juridico) + exclusão (admin) |
| 6 | `src/features/trabalhadores/abas/AtendimentosTab.tsx` | Substitui o `AbaVazia` do acordeão (`DetalheTrabalhador.tsx:93-98`) |
| 7 | `src/app/router.tsx` | `"/juridico": <ListaAtendimentosPage />` em `PAGINAS` |
| 8 | `src/lib/mensagens.ts` | Tradução das **2** exceções do trigger, em pt-BR amigável |
| 9 | `tests/rls/juridico.spec.ts` | RLS (6 atores × 4 operações) + **as 4 células do trigger** |

#### As 4 células do trigger que o teste precisa cobrir

| Nível / situação | tipo `orientacao` | tipo ≠ `orientacao` |
|---|---|---|
| Bronze | ✅ aceito (exceção deliberada, FAQ 07) | ❌ "apenas orientação geral" |
| Prata/Ouro adimplente | ✅ aceito | ✅ aceito |
| Prata/Ouro inadimplente na contribuição | ✅ aceito | ❌ "Direitos Individuais bloqueados" |

Dados de demonstração ficam gravados (regra do `CLAUDE.md`), nomeados
`DEMO — Atendimento jurídico (…)`.

#### D1 — vocabulário de `status` · ✅ FECHADA por Maxwell em 2026-07-22

A coluna é `text` livre com default `'aberto'`, sem enum e sem CHECK. **Decidido:
constraint no banco**, garantindo padronização e segurança na origem.

```sql
-- sql/16_juridico.sql (idempotente)
alter table atendimentos_juridicos drop constraint if exists chk_status_atendimento;
alter table atendimentos_juridicos add constraint chk_status_atendimento
  check (status in ('aberto','em_andamento','concluido','arquivado'));
```

O frontend consome a mesma lista a partir de uma constante única
(`ROTULO_STATUS`), no padrão já usado em `CartasTab.tsx:39` — rótulos em pt-BR
com acento na tela, valor sem acento no banco.

---

### 3.2 Subetapa 04.2 — `/cartas` (PRIORIDADE 2)

#### Escopo (`specs/frontend.md` §2.2)

Visão por ano-base: **quem entregou · quem falta · exportação da lista de
reclassificação**. Papéis: admin, presidente, secretaria, juridico (leitura para
todos; registrar carta continua sendo admin/secretaria, `sql/03_rls.sql:181`).

#### Entregáveis

| # | Arquivo | Conteúdo |
|---|---|---|
| 1 | `src/features/cartas/api.ts` | `useVisaoAnualCartas({ anoBase, convencaoId })` → `{ entregaram[], faltam[], resumo }`, já **deduplicado por `trabalhador_id`** e **paginado** |
| 2 | `src/features/cartas/ListaCartasPage.tsx` | Seletor de ano-base + seletor de CCT · 3 KPIs (entregaram / faltam / prazo) · tabela com coluna "Situação" · "Exportar CSV" |
| 3 | `src/features/cartas/ExportarCartasDialog.tsx` | Exportação da lista de reclassificação, consumindo **a mesma estrutura da tela** |
| 4 | `src/app/router.tsx` | `"/cartas": <ListaCartasPage />` |
| 5 | `tests/rls/cartas.spec.ts` | RLS por ator + conferência dos números contra query SQL manual |

#### D2 — universo de "quem falta" · ✅ FECHADA por Maxwell em 2026-07-22

O cenário descrito por Maxwell (100 trabalhadores de um estabelecimento regido
por uma CCT · prazo aberto e encerrado · 20 entregaram → Bronze · 80 seguem
Prata ou Ouro) é **exatamente a opção (a): universo por CCT**. É também o que o
motor `fn_reclassificar_convencao` já faz — universo = trabalhadores aprovados,
com vínculo ativo, em estabelecimento cuja `convencao_id` é a da CCT.

A tela adota isso, com seletor de CCT + opção "Todas as CCTs" que agrega.

#### Os 4 baldes da tela (não 2)

"Entregou / não entregou" **não descreve o resultado**, por causa da regra 5.2.
A tela precisa de quatro situações:

| # | Situação | Efeito da organização interna | Ação humana |
|---|---|---|---|
| 1 | Entregou carta (Bronze/Prata) | → **Bronze** (regra 5.1) | nenhuma |
| 2 | Não entregou | → **Prata** (regra 5.3) | nenhuma |
| 3 | Ouro sem carta | permanece **Ouro** — renovação anual automática | nenhuma |
| 4 | **Ouro COM carta** | permanece **Ouro** — regra 5.2 **exclui Ouro do universo** | ⚠️ **sim** — cancelar a adesão ao convênio (fidelidade mínima de 1 ano, FAQ 15) antes de qualquer regressão |

O balde 4 é o único que exige gente: a carta foi entregue, mas o sistema
deliberadamente não regride. **Se a tela mostrar só "entregou/faltou", esses
casos viram invisíveis** e a Secretaria conclui que a organização interna falhou.

Um efeito de borda do balde 2 que a tela também deve deixar explícito: quem está
Bronze por carta de um **ano-base anterior** e não entregou carta no ano corrente
é **promovido de volta a Prata** pela regra 5.3 — a oposição é anual, não
permanente. No cenário semeado (§7) isso atinge 5 pessoas.

#### Armadilhas já documentadas que se aplicam diretamente aqui

| Armadilha | Onde | Impacto nesta tela |
|---|---|---|
| `v_relatorio_convencao` devolve **1 linha por vínculo**, não por pessoa | `orientacoes.md` §2.2 | Contagem de "entregaram/faltam" inflada se não deduplicar |
| PostgREST trunca em **1000 linhas sem erro** | §2.4 | 23 trabalhadores hoje, ~24.500 na base real — paginação é obrigatória |
| `date` do Postgres é string; `new Date()` erra o dia | §4.2 | Comparação com `data_limite_oposicao` deve ser string × string |
| Exportação usando dado bruto em vez do dado da tela | §4.4 | O CSV vai para reclassificação — divergir da tela é erro caro |

---

### 3.3 Fechamento comum às duas subetapas

1. `npm run typecheck` e `npm run test` (suíte inteira) verdes — nunca fazer
   deploy com qualquer um quebrado (`CLAUDE.md`).
2. Deploy para `crm.sindcompassos.org` via `docs/deploy.md` (autorização
   permanente), **com a verificação pós-deploy de hash do bundle**
   (`orientacoes.md` §1.4).
3. `specs/plano_fases.md`: marcar `Status: ✅ CONCLUÍDA` nas subetapas +
   aplicar as correções da §3.0 deste documento.
4. `CLAUDE.md`: remover os itens de backlog resolvidos e corrigir os dois
   registros imprecisos apontados na §3.0.
5. `orientacoes.md`: registrar a armadilha do §2.4 deste documento (fallback
   silencioso de rota mascarando tela inexistente) no formato
   **(a) problema · (b) solução · (c) como implantar**.

---

### 3.4 D3 — o que fazer quando um Ouro entrega carta · ✅ FECHADA (opção A)

**Decidido por Maxwell em 2026-07-22: opção (A).** A carta é registrada, o nível
não muda, a UI avisa que a regressão depende do cancelamento da adesão, e
`/cartas` lista esses casos como pendência acionável. **Nenhum registro
existente foi removido** — as 5 cartas de Ouro na base continuam válidas.

Entregue na Subetapa 04.3 (ver §9).

Decorre do achado §2.5. Três saídas possíveis:

- **(A) O motor SQL está certo — corrigir o frontend.** *(recomendada)*
  `useRegistrarCarta` e `executarLoteCartas` passam a **não** rebaixar quem é
  Ouro: a carta é registrada, o nível fica intacto, e a UI avisa "carta
  registrada; a regressão de nível depende do cancelamento da adesão ao convênio
  (fidelidade mínima de 1 ano)". A tela `/cartas` lista essas pessoas no balde 4
  como pendência acionável.
  *A favor:* preserva a regra documentada (FAQ 15), alinha os três caminhos, e
  nenhum contrato de adesão é cancelado por efeito colateral de clique.
  *Custo:* mexer em código já em produção (2 funções) + teste novo.

- **(B) O frontend está certo — corrigir o motor SQL.** A carta passa a rebaixar
  qualquer nível, e a regra 5.2 sai do `fn_reclassificar_convencao`.
  *A favor:* modelo mental mais simples ("carta = Bronze, sem exceção").
  *Contra:* revoga a fidelidade de 1 ano do convênio, que é regra de contrato,
  não de software. Exige decisão do Sindicato, não só técnica.

- **(C) Bloquear na origem.** Registrar carta de um Ouro é **recusado** pela UI
  com a instrução "cancele primeiro a adesão ao convênio".
  *Contra:* a carta de oposição é um direito com prazo — recusar o registro pode
  fazer o trabalhador perder o prazo por um impedimento administrativo interno.
  Registrar o fato e tratar a consequência (opção A) é mais seguro.

Sem resposta, o plano segue por **(A)**, que é a única que não altera regra de
negócio já acordada — apenas faz o código respeitá-la nos três caminhos.

---

## 4. Critérios de cumprimento

Binários e verificáveis. O plano só está cumprido com **todos** marcados.

### `/juridico`

- [ ] **C1.** `https://crm.sindcompassos.org/juridico` renderiza a lista real de
      atendimentos — zero ocorrências da string "Tela em construção" na página.
- [ ] **C2.** Login como `juridico` cai direto numa tela funcional (não em
      placeholder), com o KPI "Meus atendimentos (30 dias)" do dashboard
      navegando para ela.
- [ ] **C3.** Um atendimento é criado pela interface em produção e aparece
      (a) na lista `/juridico`, (b) no acordeão "Atendimentos" da ficha do
      trabalhador, (c) na contagem do KPI do dashboard do Jurídico.
- [ ] **C4.** `select count(*) from atendimentos_juridicos` sai de 0 e os
      registros DEMO permanecem gravados ao fim da sessão.
- [ ] **C5.** Botão "Novo atendimento" **ausente** para `presidente` e
      `secretaria`; presente para `admin` e `juridico` — verificado com login
      real de cada papel.
- [ ] **C6.** As 4 células do trigger (§3.1) comprovadas contra o banco real, e a
      recusa aparece na UI como texto pt-BR do `lib/mensagens.ts`, nunca como
      mensagem crua do Postgres.
- [ ] **C7.** `tests/rls/juridico.spec.ts` verde, cobrindo RLS (6 atores × 4
      operações) **e** as 4 células do trigger.
- [ ] **C8.** Acordeão "Atendimentos" da ficha não contém mais a frase
      "disponível a partir da Etapa 02".

### `/cartas`

- [ ] **C9.** `https://crm.sindcompassos.org/cartas` renderiza a visão anual real
      — sem "Tela em construção".
- [ ] **C10.** Filtrando pela CCT `DEMO — CCT Lojas do Kabum 2026`, ano-base
      2026, a tela reproduz **exatamente** a distribuição medida em §7:
      **17 · 68 · 12 · 3** nos quatro baldes, com os nomes listados
      nominalmente. Os 3 do balde 4 (Ouro com carta) aparecem sinalizados como
      pendência, não escondidos entre "entregou".
- [ ] **C10b.** A CCT `DEMO — CCT Supermercados de Passos 2026` (prazo até
      2026-11-30, ainda aberto) exibe a contagem como **parcial**, com o prazo em
      aberto explícito — e o botão de organização interna do `RelatorioTab`
      continua bloqueado para ela.
- [ ] **C11.** Os totais da tela batem com uma query SQL de conferência escrita
      à parte — **e** com os números do `RelatorioTab` da mesma CCT/ano. Duas
      telas sobre o mesmo fato não podem divergir.
- [ ] **C11b.** Os 5 trabalhadores Bronze-por-carta-2025 sem carta em 2026
      aparecem no balde 2 com a indicação de que **serão promovidos de volta a
      Prata** — a oposição é anual.
- [ ] **C12.** "Exportar CSV" gera a lista de reclassificação, e o **arquivo
      aberto** (não só a tela) contém exatamente as mesmas linhas e colunas
      exibidas — conferido no arquivo, conforme `orientacoes.md` §4.4.
- [ ] **C13.** Nenhuma contagem duplica trabalhador com dois vínculos na mesma
      CCT (`orientacoes.md` §2.2).
- [ ] **C14.** `tests/rls/cartas.spec.ts` verde.

### Transversais

- [ ] **C15.** `npm run test` 100% verde (nenhuma regressão nos 67+ testes
      existentes) e `npm run typecheck` limpo.
- [ ] **C16.** Deploy publicado e **verificado por hash** do bundle
      (`orientacoes.md` §1.4) — "está no ar" comprovado, não presumido.
- [ ] **C17.** `specs/plano_fases.md` e `CLAUDE.md` atualizados conforme §3.0,
      incluindo a correção da marca de conclusão da Subetapa 01.2.
- [ ] **C18.** Nenhuma rota do `NAV` restante aponta para `Placeholder` sem que
      isso esteja **explicitamente** registrado como pendência no
      `specs/plano_fases.md` — inventário `specs/frontend.md` §2.2 × chaves de
      `PAGINAS` conferido e anexado ao fecho.

---

## 5. Parâmetros de qualidade

Não são caixas de seleção; são a régua com que o resultado é julgado.
Uma entrega que cumpra §4 mas viole §5 **não** está satisfatória.

**Q1 — Conformidade arquitetural.** Toda query Supabase vive em
`features/<domínio>/api.ts` como hook TanStack nomeado; nenhum componente chama
`supabase-js` diretamente. Nada de RPC nova onde uma consulta com policy resolve.

**Q2 — Segurança no banco, não na tela.** Esconder botão é ergonomia, não
segurança. Toda operação negada precisa ser negada **pela RLS/trigger** e provada
por teste com login real. Corolário do `orientacoes.md` §2.6d: em UPDATE/DELETE,
`error === null` não é sucesso — encadear `.select()` e conferir se voltou linha.

**Q3 — Transparência total de erro.** Toda recusa do trigger vira mensagem pt-BR
do mapa central, dizendo **o motivo e o que fazer**. Nada de "erro ao salvar".
Quem for pulado/excluído de uma lista aparece **nominalmente** (§4.3).

**Q4 — Nenhum número sem rastro.** Todo total exibido é reproduzível por uma
query manual escrita à parte. Vale para os KPIs de `/cartas` e para a contagem de
atendimentos. Divergência entre duas telas sobre o mesmo fato é defeito, não
arredondamento.

**Q5 — "Passou" ≠ "funcionou" (`orientacoes.md` §7.2).** A evidência de aceite é
efeito observável em produção — linha no banco, arquivo gerado, balão na tela —
não ausência de erro no console nem verde de suíte.

**Q6 — Testes sem número mágico (§7.1b).** Assertar o **recorte** que a RLS
promete, não a quantidade absoluta — os dados DEMO continuarão crescendo, e teste
que fixa contagem está programado para quebrar. E um login por papel **por
arquivo**, no `beforeAll`, nunca dentro de cada `it()` (§7.4, cota do
`signInWithPassword`).

**Q7 — Escala desde já.** Paginação obrigatória em qualquer listagem
(`orientacoes.md` §2.4). O que funciona com 23 trabalhadores precisa continuar
funcionando com 24.500 — especialmente a lista "quem falta" e a exportação.

**Q8 — Identidade e idioma.** Textos em pt-BR; cores, tipografia e tom conforme
`docs/design-tokens.md` — nenhuma paleta inventada. Reaproveitar os componentes
já estabelecidos (`DataTable`, `EntityForm`, `ConfirmDialog`, `StatusBadge`) em
vez de criar variantes paralelas; mestre-detalhe segue o padrão de
`ListaEmpresasPage`. Estado vazio é informativo ("Nenhum atendimento
registrado"), nunca tela em branco.

**Q9 — Ato deliberado continua deliberado.** Registrar carta rebaixa para Bronze
e muda a cobrança da pessoa: o fluxo mantém a confirmação explícita já existente
em `CartasTab`, inclusive se `/cartas` ganhar atalho de registro. Exclusão de
atendimento é só do Admin e passa por `ConfirmDialog` destrutivo.

**Q10 — Dados de demonstração ficam.** Prefixo `DEMO —` com nome que descreve o
caso coberto; fixtures automatizadas usam prefixo da subetapa e saem no
`afterAll`. Remoção de DEMO só por reparo técnico ou segurança, e avisada.

**Q11 — Documentação que não mente.** O fecho corrige as imprecisões que este
diagnóstico encontrou (§3.0) em vez de acumular mais uma camada. `orientacoes.md`
recebe a armadilha nova. Se algo não couber no escopo, é **declarado como não
feito** — o defeito que originou este plano foi exatamente uma conclusão marcada
sem ressalva.

---

## 6. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Definição de "quem falta" divergir do motor de reclassificação | Média | D2 resolvida antes de codar; critério C11 exige que os números batam com o `RelatorioTab` |
| Trigger do jurídico rejeitar casos legítimos por nível desatualizado | Baixa | As 4 células testadas (C6/C7) contra dados reais antes do deploy |
| Cota de `signInWithPassword` estourar com a suíte crescendo (§7.4) | Média | Um login por papel por arquivo; espaçar rodadas completas |
| Proteção de borda do Supabase durante testes intensos (§2.6e) | Baixa | Reconhecer o padrão (timeout puro), parar de bater na API e esperar — não mexer em código |
| Escopo inflar (`/cartas` virar relatório completo) | Média | O escopo é o da `specs/frontend.md` §2.2, literal: quem entregou, quem falta, exportação |

---

## 7. Cenário de demonstração semeado (2026-07-22)

Criado em produção a pedido de Maxwell, para ilustrar e testar a visão anual de
cartas e o dashboard. **Todos os registros são DEMO e permanecem gravados**
(regra do `CLAUDE.md`); o nome de cada trabalhador declara a própria situação,
o que torna a conferência visual imediata.

### Estrutura

| Objeto | Registro |
|---|---|
| CCT | `DEMO — CCT Lojas do Kabum 2026` · ano-base 2026 · limite de oposição **2026-06-30 (encerrado)** · piso R$ 1.620,00 |
| CCT | `DEMO — CCT Supermercados de Passos 2026` · ano-base 2026 · limite **2026-11-30 (em aberto)** · piso R$ 1.750,00 |
| Empresas | `99100001` KABUM · `99100002` BOM PREÇO |
| Estabelecimentos | Kabum Passos (50) · Kabum Alpinópolis (50) · Bom Preço Capitólio (25) — 3 municípios, para o mapa coroplético |
| Trabalhadores | **125** aprovados, com vínculo ativo e CPF de DV válido (faixa `881…`) |
| Cartas | **31** — 26 no ano-base 2026 e 5 no ano-base 2025 |

### Distribuição na CCT do Kabum (os 100 do exemplo de Maxwell)

Medida por simulação **read-only** do universo de `fn_reclassificar_convencao`
— nenhuma reclassificação foi executada:

| Balde | Pessoas | Mudam de nível | Regra |
|---|--:|--:|---|
| 1 · Entregou carta → Bronze | **17** | 17 | 5.1 |
| 2 · Sem carta → Prata | **68** | 5 | 5.3 |
| 3 · Ouro sem carta → segue Ouro | **12** | 0 | 5.2 |
| 4 · **Ouro COM carta → NÃO regride** | **3** | 0 | 5.2 + FAQ 15 |

Leitura: dos **20 que entregaram carta**, só **17** viram Bronze — os outros 3
são Ouro e ficam onde estão até cancelarem a adesão ao convênio. E dos 80 sem
carta, **5 mudam de nível para cima** (estavam Bronze por carta de 2025 e voltam
a Prata). É esse descolamento entre "entregou" e "mudou" que a tela `/cartas`
existe para tornar visível.

A CCT do Bom Preço (25 trabalhadores, 6 cartas, prazo aberto até 2026-11-30)
cobre o caso complementar: contagem parcial com prazo em aberto e botão de
organização interna bloqueado.

### Impacto na base

A base sai de 23 para **148 trabalhadores** — os números do dashboard mudam
proporcionalmente. Isso é deliberado (Maxwell pediu dado para testar o dashboard
geral) e reversível: todos os registros são identificáveis por
`nome like 'DEMO — Kabum%' or nome like 'DEMO — BomPreco%'`, CPFs na faixa
`881…` e CNPJs `991000%`.

---

## 8. Ordem de execução recomendada

1. ~~Decisões D1 e D2~~ ✅ fechadas em 2026-07-22. **Resta a D3** (§3.4) — o que
   fazer quando um Ouro entrega carta. Não bloqueia o início da 04.1.
2. **Subetapa 04.1 — `/juridico`** — destrava um papel inteiro; maior valor por
   esforço.
3. **Subetapa 04.2 — `/cartas`** — respeita a decisão de 2026-07-13 de deixá-la
   para o fim do roteiro, que é agora.
4. **Correções de documentação (§3.0) + inventário de rotas (C18)** — fecha a
   classe de defeito, não só as duas instâncias.

---

## 9. Execução — o que foi entregue (2026-07-22)

Plano executado por inteiro. Resumo do que existe hoje em produção.

### Subetapa 04.1 — `/juridico`

| Arquivo | Papel |
|---|---|
| `sql/16_juridico.sql` | CHECK `chk_status_atendimento` + 2 índices de apoio |
| `src/features/juridico/api.ts` | Hooks TanStack; UPDATE/DELETE com `.select()` obrigatório |
| `src/features/juridico/schemas.ts` | zod; o gate de nível **não** é duplicado aqui (é do trigger) |
| `src/features/juridico/ListaAtendimentosPage.tsx` | Lista + 5 filtros + exportação CSV |
| `src/features/juridico/NovoAtendimentoDialog.tsx` | Registro + aviso preventivo de nível |
| `src/features/juridico/DetalheAtendimentoDialog.tsx` | Edição / leitura / exclusão |
| `src/features/juridico/SeletorTrabalhador.tsx` | Busca no servidor (nome ou CPF) |
| `src/features/trabalhadores/abas/AtendimentosTab.tsx` | Acordeão real na ficha |
| `tests/rls/juridico.spec.ts` | **11 testes** |

### Subetapa 04.2 — `/cartas`

| Arquivo | Papel |
|---|---|
| `sql/17_cartas.sql` | View `v_cartas_ano_base` sobre `v_relatorio_convencao` |
| `src/features/cartas/api.ts` | Dedup por trabalhador · paginação · classificação nos 4 baldes |
| `src/features/cartas/ListaCartasPage.tsx` | 4 KPIs + lista nominal + CSV + aviso de prazo aberto |
| `tests/rls/cartas.spec.ts` | **5 testes** |

### Subetapa 04.3 — regra 5.2 no frontend (D3)

`useRegistrarCarta` e `executarLoteCartas` ganharam `.neq("nivel","ouro")` no
UPDATE das flags. Quem decide é a coluna gerada no banco, não o cliente. Textos
de confirmação e do lote reescritos para dizer a verdade nos dois casos.

### Correções que apareceram no caminho

1. **Dois testes com bug de fuso** (`cobrancas`, `dashboard`): comparavam data
   local com `current_date` de um banco em UTC e falhavam todas as noites entre
   21h e meia-noite. Registrado em `orientacoes.md` §7.6.
2. **`StatusBadge`** não conhecia os 4 status de atendimento — cairia no
   fallback neutro com o texto cru (`em_andamento`).
3. **Documentação desatualizada** corrigida em `CLAUDE.md` (4 itens de backlog
   que davam telas já entregues como `Placeholder`) e `specs/plano_fases.md`
   (status parcial da 01.2; Etapa 04 nova, backlog renumerado para 05).

### Situação dos critérios

| Critério | Situação |
|---|---|
| C1, C9 (telas renderizando) | ✅ confirmado em produção com login de Admin (2026-07-23) |
| C3 (atendimento aparece nos 3 lugares) | ✅ registrado PELA INTERFACE para `DEMO — Kabum 097`; aparece na lista e no acordeão da ficha, com responsável = usuário logado |
| C4 (`atendimentos_juridicos` sai de 0) | ✅ 5 registros DEMO, gravados |
| C5 (botão oculto p/ secretaria/presidente) | Parcial: visível para Admin (confirmado na tela) e negado por RLS nos testes; **falta conferir visualmente com login de Jurídico** |
| C6–C7 (trigger + suíte) | ✅ 11/11, as 4 células cobertas |
| C8 (frase da Etapa 02 removida) | ✅ |
| C10, C10b, C11, C11b, C13 (números) | ✅ 17 · 68 · 12 · 3 conferidos contra a simulação do motor e contra `v_relatorio_convencao` |
| C12 (CSV = tela) | ✅ arquivo aberto e conferido: 100 linhas, distribuição 17/68/12/3 idêntica à tela, BOM UTF-8, acentos íntegros. **Um defeito encontrado e corrigido:** a coluna "Nível atual" exportava o enum cru (`prata`) em vez do rótulo da tela (`Prata`) |
| C14 (suíte de cartas) | ✅ 5/5 |
| C15 (suíte + typecheck) | ✅ 111/111 e `tsc --noEmit` limpo |
| C16 (deploy verificado) | ✅ 21/21 arquivos, 0 divergências, hash do bundle conferido |
| C17 (documentação) | ✅ |
| C18 (inventário de rotas) | ✅ 19/19 rotas com tela real |

## 10. O que falta para o aceite integral

Três itens dependem de sessão logada no navegador e **não foram verificados**:

1. **Confirmação visual** de `/juridico` e `/cartas` renderizando as telas reais
   (C1, C2, C9). O login por autofill do gerenciador de senhas não completa: o
   campo é preenchido no DOM mas o React não registra a mudança, e digitar senha
   está fora do que este agente faz.
2. **Registro de um atendimento pela interface** (C3) e conferência do botão
   "Novo atendimento" com login de cada papel (C5).
3. **Abrir o CSV exportado** e conferir linha a linha contra a tela (C12).
