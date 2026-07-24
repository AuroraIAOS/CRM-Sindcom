---
name: atualizar-sindcom
description: Atualiza a base de empresas e estabelecimentos do CRM Sindcom a partir dos Dados Abertos do CNPJ já baixados pela skill atualizar-cnpj — filtra pelos 29 municípios da base territorial + CNAE de comércio (45/46/47) + situação ativa, compara com o Supabase e sobe APENAS o delta, sinalizando (sem apagar) o que fechou ou sumiu. Use quando o usuário pedir para atualizar/sincronizar as empresas e estabelecimentos do CRM com os dados novos da Receita.
argument-hint: "[--aplicar para efetivar; sem argumento roda só o relatório]"
disable-model-invocation: true
---

# Atualizar a base do CRM Sindcom a partir dos Dados Abertos do CNPJ

Esta skill é a **segunda metade** do ciclo mensal. A primeira metade é a skill
[`atualizar-cnpj`](../atualizar-cnpj/SKILL.md), que baixa, extrai e renomeia os arquivos da
Receita. Esta aqui pega esses arquivos e leva o delta até o Supabase.

```
atualizar-cnpj          →  D:\BD\empresas0-9.csv + estabelecimentos0-9.csv  (22 GB, Brasil inteiro)
atualizar-sindcom (esta)→  filtra → normaliza → compara com o banco → sobe SÓ o delta
```

Contexto completo, decisões e histórico: `docs/plano_importacao_rfb.md` no repositório
`C:\Users\maxwe\GitHub\CRM-Sindcom`. Armadilhas já vencidas: `orientacoes.md` §2.8–2.14 e §4.6.

---

## ┌─ A REGRA QUE DEFINE ESTA SKILL ─────────────────────────────────────────┐

**Esta skill NUNCA apaga empresa ou estabelecimento.**

Um CNPJ que sumiu do arquivo da Receita, ou que passou a ter situação diferente de `02`
(baixada, inapta, suspensa), vira **relatório para a Denise decidir** — jamais um `DELETE`
automático. Pode haver trabalhador com vínculo empregatício e histórico financeiro apontando
para aquele estabelecimento; apagar em silêncio destruiria o histórico de alguém. **Deleção é
ato humano.**

## └─────────────────────────────────────────────────────────────────────────┘

### Colunas protegidas — nunca entram num UPDATE

| Coluna | Por quê |
|---|---|
| `convencao_id` | Vínculo CCT↔estabelecimento é **trabalho manual da Denise**. Um update mensal que sobrescrevesse isso destruiria, silenciosamente e todo mês, o trabalho dela. A coluna nem entra no payload. |
| `id`, `created_at` | Identidade e origem do registro. |
| `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio`, `forma_pagamento_preferida` | Regra inegociável do `CLAUDE.md`. São de `trabalhadores`, que esta skill **não toca de forma alguma** — mas a regra fica registrada aqui porque é o mesmo princípio: mudança de nível é ato deliberado, nunca efeito colateral de planilha. |

---

## Pré-requisitos

1. **Arquivos da Receita já baixados** pela `atualizar-cnpj` em `D:\BD\`
   (`empresas0-9.csv` e `estabelecimentos0-9.csv`). Se não estiverem, rode
   `/atualizar-cnpj` primeiro — esta skill **não baixa nada**.
2. `.env.test` no repositório, com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `TEST_ADMIN_EMAIL` e `TEST_USER_PASSWORD`. A carga roda **logada como Admin pela anon key**,
   passando pelo RLS — **nunca** com `service_role` (regra do `CLAUDE.md`).
3. Espaço em `D:\BD\filtrados\` para os NDJSON intermediários (~25 MB).

---

## Procedimento

Trabalhe sempre a partir de `C:\Users\maxwe\GitHub\CRM-Sindcom`.

### 1. Confirmar a data dos arquivos

Confira a data de modificação de `D:\BD\estabelecimentos0.csv` e **confirme com o usuário**
que é a extração do mês que ele quer processar. Processar um arquivo velho por engano gera um
delta enorme e enganoso (tudo que mudou desde então aparece como "sumido").

### 2. Exportar os CNPJs que o banco já conhece (rápido)

```bash
node scripts/rfb/exportar_conhecidos.mjs
```

Gera `D:\BD\filtrados\cnpj_conhecidos.txt`. **Não pule este passo:** é ele que permite ao
passe seguinte responder *por quê* um estabelecimento conhecido deixou de aparecer — fechou?
mudou de CNAE? mudou de município? Sem esse arquivo, todo sumiço vira o genérico e enganoso
"não encontrado no arquivo da RFB", e a Denise perde a informação mais acionável do relatório.

### 3. Filtrar (≈ 36 min) — passe completo sobre os 22 GB

```bash
node scripts/rfb/passe_06_2.mjs
```

Gera `D:\BD\filtrados\estabelecimentos_filtrados.ndjson` e `empresas_filtradas.ndjson`
aplicando os três filtros: município ∈ 29 da base territorial · CNAE `45|46|47` ·
situação cadastral `02`. Gera também `rejeitados_conhecidos.ndjson` — os conhecidos do banco
que não passaram mais, **com o motivo de cada um**.

**Rode em primeiro plano com timeout alto (600000 ms).** Não use background: processos longos
já foram mortos silenciosamente neste ambiente (mesma armadilha registrada na `atualizar-cnpj`).

Ao final, **confira as três asserções** que o próprio script imprime: anti-truncamento
(arquivo a arquivo), cascata íntegra (0 CNPJ órfão) e saída 100% dentro dos filtros. Se a
asserção de truncamento acusar divergência de poucas linhas, **não é truncamento** — é campo
com quebra de linha literal; o diagnóstico está em `orientacoes.md` §2.12.

### 4. Normalizar

```bash
node scripts/rfb/normalizar_06_3.mjs
```

Converte datas `AAAAMMDD`, decimal com vírgula, município TOM→`municipios.id`, vazio→NULL, e
**omite** as colunas que o banco gera sozinho (`id`, `cnpj_completo` GENERATED, `created_at`,
`updated_at`, `convencao_id`).

Confira no resumo: **0 violações de CHECK** e **0 duplicatas**. Se aparecer código de FK novo
que não existe no banco (CNAE novo criado pela Receita, por exemplo), o relatório
`reconciliacao_06_3.json` mostra — nesse caso, **pare** e trate o código órfão antes de seguir;
não force a carga.

### 5. Ver o delta (não grava nada)

```bash
node scripts/rfb/delta.mjs
```

Imprime e salva em `D:\BD\filtrados\delta_relatorio.json`:

- **novas / novos** — vão ser inseridos
- **alteradas / alterados** — vão ser atualizados, com o diff campo a campo (`de` → `para`)
- **sumidas / sumidos** — **NÃO** serão tocados; é o relatório para a Denise, agrupado por
  motivo (fechou · mudou de CNAE · mudou de município · sumiu do arquivo)

**Leia o relatório com o usuário antes de aplicar.** Um delta muito maior que o esperado
costuma significar arquivo de mês errado (passo 1) ou filtro alterado por engano.

### 6. Aplicar o delta

```bash
node scripts/rfb/delta.mjs --aplicar
```

Insere as novas (empresas antes de estabelecimentos, por causa da FK) e atualiza as alteradas.
Não apaga nada, nunca.

### 7. Conferir

```bash
node scripts/rfb/delta.mjs      # 2ª passada: tem que dar delta ZERO
npm run test:rls                # a suíte não pode regredir
```

A segunda passada dando **delta zero** é a prova de que o que foi aplicado bate exatamente com
o arquivo. Confira também as contagens no banco e reporte ao usuário:
novas · alteradas · **sumidas (com motivo)**.

---

## Sobre os "sumidos" — o que dizer à Denise

O caso mais comum **não** é sumiço real: é o estabelecimento que continua no arquivo da Receita
mas **deixou de passar no filtro**, quase sempre porque fechou (situação `02` → `08`). O
relatório distingue os dois casos e diz o motivo de cada um.

Sugestão de encaminhamento (decisão dela, não da skill):
- **Fechou e não tem trabalhador vinculado** → pode inativar/arquivar pela tela.
- **Fechou e TEM trabalhador vinculado** → não mexer no cadastro; tratar o vínculo primeiro
  (rescisão, transferência), senão o histórico do trabalhador fica órfão.
- **Sumiu do arquivo sem explicação** → conferir o CNPJ manualmente antes de qualquer ação;
  pode ser erro pontual da extração daquele mês.

---

## Notas de método

- **Nunca desligue os triggers de auditoria nesta skill.** O delta mensal é pequeno (dezenas a
  centenas de linhas) e **precisa** de trilha de auditoria — diferente da carga inicial, que
  era um seed de 34 mil linhas e foi feita com os triggers desligados de propósito
  (`orientacoes.md` §2.13).
- **`ON CONFLICT DO NOTHING` nas inserções** garante que reexecutar não duplica nem toca no que
  já existe (`orientacoes.md` §2.14).
- Toda leitura do banco é **paginada de 1000 em 1000** — PostgREST trunca em 1000 sem avisar
  (`orientacoes.md` §2.4).
- Converse com o usuário em português do Brasil.
- Ao terminar, **atualize `docs/plano_importacao_rfb.md`** com a data da rodada e os números do
  delta, para haver histórico mês a mês.
