# RELATÓRIO — Análise do CRM Vitrine e o que se aplica ao CRM Sindcom

**Data:** 2026-08-21 · **Repositório analisado:** `github.com/AuroraIAOS/CRM_Vitrine` (público, `main`)
**Motivo:** o CRM Sindcom foi construído, testado e implantado sem nunca passar por um teste
adversarial. O Vitrine — mesma stack, mesmo autor — institucionalizou esse teste como portão
obrigatório e já o executou uma vez. Este relatório extrai o método, mede o que dele se aplica
aqui, e serve de base para a ETAPA 07.

---

## 1. Por que copiar este método, em uma medida

A Etapa 01 do Vitrine chegou ao portão adversarial com **65 testes de RLS 100% verdes**,
varredura de segredos zerada e advisor de segurança limpo — o mesmo estado de "tudo verde" em
que o Sindcom se encontra hoje, com 67 testes.

**O ataque deliberado achou 6 falhas reais**, uma delas permitindo tomada completa de conta
alheia por um usuário sem nenhum privilégio prévio.

> A suíte funcional prova que o comportamento *pretendido* funciona; ela não tem como provar
> que não existe um caminho *não pretendido*.
> — `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`, §1

**Onde as falhas se concentraram vale mais que a contagem.** A RLS de tabela — onde quase todo
o esforço de teste tinha sido investido — passou em tudo. As 6 falhas estavam nas **costuras
entre camadas**:

| # | Costura | Por que a suíte funcional não pega |
|---|---|---|
| 1 | Coluna de privilégio dentro de uma linha legitimamente autorizada | RLS restringe *quais linhas*, nunca *quais colunas* |
| 2 | Credencial legível pela API | O padrão de proteção existia — só não havia sido reaplicado em todo lugar |
| 3 | Código de servidor rodando com `service_role` | Ali a RLS simplesmente não participa |

---

## 2. O método — 7 passos

Definição normativa em `docs/00_PLANO_E_CRITERIOS.md` → "Pendências vigiadas".

1. **Bench isolado** — branch ou worktree dedicado, nunca commitado direto em `main`.
2. **Ataque deliberado**, cobrindo no mínimo os 7 vetores da §3.
3. **Registro de todo achado** — explorável ou **não** — no arquivo de armadilhas do projeto.
4. **Plano de correção** — cada falha real vira item `[Goal]` com Conclusão, Qualidade e
   Esforço máximo (teto de tentativas) declarados.
5. **Execução** até 100% verde ou até esgotar o teto; o que não fechar vira relatório curto,
   **não fica escondido**.
6. **Relatório final** com parecer explícito: recomenda ou não recomenda o merge.
7. **O CODE nunca executa o merge por conta própria** — mesmo com tudo verde e parecer
   favorável. Ordenar o merge é atribuição exclusiva do dono do projeto.

Duas regras de método que acompanham o portão e valem além dele:

- **Alvo contido.** Ataque destrutivo sempre mira registro/usuário descartável criado na hora.
  Se o ataque tiver sucesso, o dano fica contido.
- **Medir, nunca supor.** "Ler documentação e ler um aviso na tela do fornecedor é levantar
  hipótese, não é prová-la" (`CLAUDE.md` §11 do Vitrine). Enquanto não confrontada com uma
  medição, a hipótese é registrada como suspeita — nunca como diagnóstico.

---

## 3. Os 7 vetores

| | Vetor | Rendeu no Vitrine? |
|---|---|---|
| **V1** | CRUD fora do que o papel permite | **2 achados** (A01 crítico, A02 alto) |
| **V2** | Acesso direto ao banco fora da camada de RLS | 1 não-explorável (A08) |
| **V3** | Injeção: SQL, XSS armazenado, `jsonb` hostil | nenhum |
| **V4** | Burlar ou reescrever política de RLS | nenhum |
| **V5** | Alteração de parâmetro/valor padrão protegido | nenhum |
| **V6** | Sequestro de credencial | **4 achados** (A03, A04, A05, A07) |
| **V7** | Exposição indevida de dado pessoal (LGPD) | nenhum |
| **+** | Fragilidade específica do produto | **1 achado** (A06, no webhook público) |

---

## 4. Os 6 achados do Vitrine, traduzidos para o Sindcom

### A01 — Tomada de conta por `INSERT` (CRÍTICO)

A policy de `INSERT` checava só a identidade, não o papel nem a conta. A trava de escalação de
privilégio existia, mas era `BEFORE UPDATE` — **não cobria `INSERT`**.

> **Regra que fica:** ao escrever trigger de trava de coluna, conferir se o `TG_OP` que ele
> cobre é o mesmo conjunto de caminhos que as policies abrem. Uma trava de `UPDATE` ao lado de
> uma policy de `INSERT` permissiva é uma porta, não uma trava.

**No Sindcom:** `perfis` tem `pol_perfis_admin_all` (`for all`, só Admin) e `pol_perfis_select`
(própria linha ou Admin). Não há policy de `INSERT` para não-Admin — a estrutura é mais
fechada que a do Vitrine. **Mas não há trigger de trava de coluna em `perfis.role`**, e o
estado "usuário autenticado sem linha em `perfis`" precisa ser medido: `fn_role()` devolve
`NULL` nesse caso, e `fn_eh()` devolve `NULL`, não `false` — a mesma armadilha que
`fn_definir_pin_recepcionista` já trata explicitamente com `is not true`. **A testar.**

### A02 — Coluna de titularidade dentro de linha autorizada (ALTO)

`admin` podia editar a linha da própria conta (legítimo: o nome é configuração), mas a coluna
de titularidade morava na mesma linha e RLS não distingue coluna.

**No Sindcom:** o análogo direto são as colunas que o `CLAUDE.md` declara **invioláveis** —
`trabalhadores.recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio`,
`forma_pagamento_preferida` e `nivel`. A Secretaria tem `UPDATE` pleno em `trabalhadores`
(`pol_trab_update`) e nenhuma trava de coluna existe. A regra do projeto diz que mudança de
nível é ato deliberado; **falta medir se o banco impõe isso ou se é só convenção documental.**

### A03/A04/A05/A07 — Credencial legível pela API (ALTO/MÉDIO)

Um `viewer` — o papel mais fraco do produto — leu o segredo de assinatura de webhook em texto
puro, o hash de API key, o hash de token de convite e a chave de IA.

> **Como o quarto apareceu:** os três primeiros saíram de leitura de código. O quarto só
> apareceu numa **varredura de catálogo por nome de coluna**
> (`column_name ~* 'secret|senha|token|hash|chave|...'` cruzada com `has_column_privilege`).
> Rodar essa varredura é mais confiável que reler migration por migration.

**No Sindcom** — a varredura já foi rodada nesta análise e devolveu:

| coluna | `authenticated` lê | risco |
|---|---|---|
| `recepcionistas.pin_hash` | **sim** | PIN de 4–6 dígitos = 10⁴–10⁶ candidatos, quebra offline |
| `solicitacoes_servico.token_publico` | **sim** | credencial da guia pública |
| `trabalhadores.cpf` · `beneficiados.cpf` | sim | dado pessoal (LGPD) — legítimo para papéis internos, a confirmar papel a papel |

*(o grant a `anon` existe em todas elas, mas é neutralizado pela RLS das tabelas; o que importa
medir é o que cada papel autenticado alcança.)*

### A06 — `service_role` cruzando a fronteira (MÉDIO/ALTO)

No único endpoint público e não autenticado, a função de servidor filtrava só pelo id externo,
rodando com `service_role` — que ignora RLS — e sequer recebia o identificador de conta que o
próprio chamador havia resolvido duas linhas acima. Correção: uma linha (`.eq("account_id", …)`).

> **Regra que fica:** onde `service_role` (Edge Function, job de servidor, `pg_cron`) escreve ou
> lê, a RLS **não está** ajudando — o filtro no `WHERE` é a única fronteira.

**No Sindcom:** três superfícies com esse perfil — a Edge Function `formulario-filiacao`
(pública, `verify_jwt = false`, roda com `service_role`), os workflows n8n e os jobs `pg_cron`
(`fn_evoluir_solicitacoes`, `fn_marcar_guias_em_atraso`, `fn_marcar_boletos_inadimplentes`,
`fn_snapshot_dashboard`). **A testar, uma a uma.**

### A08 — o não-achado que também vale registrar

O advisor acusava uma função de plataforma como executável por `anon`. Em vez de "corrigir por
via das dúvidas", foi **medida**: o tipo de retorno não é representável pelo PostgREST e o corpo
nunca executa. Decisão registrada de não mexer em objeto gerenciado pela plataforma, **com
gatilho declarado de reavaliação**.

**No Sindcom:** o mesmo objeto (`rls_auto_enable`) aparece, e `sql/05_hardening.sql` já o
revoga. Mais relevante que o objeto é o padrão: **achado não explorável se aceita com medição e
gatilho, nunca com suposição.**

---

## 5. O que do Vitrine **não** se aplica aqui

| Vitrine | Sindcom |
|---|---|
| **Multi-inquilino** — a fronteira mais cara é `account_id`; o achado A06 é uma travessia entre contas | **Mono-organização** — a fronteira é o **papel** (5 deles) e, para o parceiro, `parceiro_id`. Não existe "conta alheia" a invadir |
| 13 schemas (`public` + `access`/`licensing` + 9 `aba_*`) | Um schema `public` só — superfície menor, mas toda ela exposta ao PostgREST |
| `aba_health` com regime de RLS próprio: leitura clínica só por função, com log imutável | Não há equivalente. O dado sensível (CPF, vínculo empregatício, atendimento jurídico) é lido **direto na tabela, sem log de acesso** — não é falha em si, mas é uma **camada a menos** |
| Convite/aceite de usuário final | Não existe: os 5 perfis nasceram direto no Supabase. `/configuracoes` só edita perfis (backlog do `CLAUDE.md`) |
| Segredos de provedor cifrados no banco | Só `pin_hash` (bcrypt) e `token_publico`. Superfície de credencial bem menor |

E uma diferença que **aumenta** o risco aqui, não diminui:

> O Vitrine estava em bench, **antes do primeiro deploy real**. O Sindcom já está **em
> produção**, com dados pessoais reais (CPF de trabalhadores), 16.687 empresas e 17.319
> estabelecimentos, servido por um PWA público. Aqui, achado é incidente — não hipótese.

---

## 6. Técnicas de teste a portar

| Técnica | Estado no Sindcom |
|---|---|
| `adminClient()` com `service_role` para semear/limpar fixture | **Ausente.** `tests/rls/helpers.ts` só tem `loginComo()` e `clienteAnon()`. A key existe em `.env.n8n` |
| Usuário descartável criado na hora (`createThrowawayUser`) | **Ausente** — e é o que torna o ataque destrutivo seguro |
| `globalSetup` autenticando os papéis **uma vez por execução**, com cache em disco | **Ausente.** Hoje é um `signInWithPassword` por arquivo; com 13 arquivos × 5 papéis o rate limit de auth derruba a suíte **com sintoma idêntico ao de RLS quebrada** (conjunto vazio, sem erro). O portão reexecuta a suíte muitas vezes — sem isso ele trava |
| **Controle negativo**: provar que a correção não é "negar tudo" | Adotar em toda correção |
| **Controle positivo**: provar que a técnica funciona onde já foi aplicada | Adotar |
| Cada achado vira teste que **falhava antes** e passa depois | Adotar — é o que transforma o achado em regressão permanente |
| Varredura de catálogo em vez de leitura de código | **Já produziu resultado nesta análise** (§4) |

`ehErroRls()` e `ehErroConstraintOuTrigger()` já existem em `tests/rls/helpers.ts`, idênticos aos
do Vitrine — a base comum já está lá.

---

## 7. Conclusão da análise

O método do Vitrine é aplicável quase por inteiro. O que muda é o **mapa da fronteira** (papel,
não conta) e o **peso do achado** (produção com dado real, não bench pré-deploy).

A validação mais forte disto não é argumentativa: **ao rodar apenas as varreduras de catálogo
descritas na §4 — antes de escrever um único ataque — apareceu um vazamento crítico e ativo em
produção**, com a base empresarial legível por qualquer anônimo. Está registrado em
`orientacoes.md` §2.15 e foi corrigido no mesmo dia.

O plano de execução está em `specs/plano_fases.md` → ETAPA 07.
