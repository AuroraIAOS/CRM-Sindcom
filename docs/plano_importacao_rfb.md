# Plano — Repovoamento de `empresas` e `estabelecimentos` a partir dos Dados Abertos do CNPJ (RFB)

> Documento de planejamento da carga inicial da base real e do ciclo mensal de
> atualização. Escrito em 2026-07-23, após o reset da base de demonstração.
> **Nada foi executado** — este arquivo é o plano aprovado/aprovável, não um registro de execução.

---

## 1. Estado verificado (medido, não estimado)

### 1.1 Os arquivos de origem (`D:\BD\`)

| Conjunto | Arquivos | Tamanho total |
|---|---|---|
| `empresas0-9.csv` | 10 | **5,36 GB** |
| `estabelecimentos0-9.csv` | 10 | **16,74 GB** |
| **Total** | 20 | **22,1 GB** |

Medição real em `estabelecimentos1.csv` (1,077 GB): **4.753.435 linhas**. Extrapolando pela
razão de tamanho (15,54×), o conjunto de estabelecimentos tem **≈ 74 milhões de linhas** —
todo o Brasil. É exatamente o volume que não pode subir para o Supabase.

### 1.2 Estrutura confirmada dos CSVs

Sem cabeçalho, delimitador `;`, todos os campos entre aspas duplas, encoding **Latin-1
(ISO-8859-1)** — não UTF-8. Datas em `AAAAMMDD`. Decimal com vírgula.

**`estabelecimentos` — 30 colunas**, batendo 1:1 com a lista de Maxwell. Posições que importam:

```
 1 cnpj_basico   2 cnpj_ordem   3 cnpj_dv   4 matriz_filial   5 nome_fantasia
 6 situacao_cadastral   7 data_situacao_cadastral   8 motivo_situacao
 9 cidade_exterior[✂]  10 pais[✂]  11 data_inicio_atividades  12 CNAE_PRINCIPAL ★
13 cnae_secundaria[✂]  14 tipo_logradouro … 20 uf   21 MUNICÍPIO (código TOM) ★
22 ddd_1 … 25 telefone_2   26 ddd_fax[✂]  27 fax[✂]  28 email
29 situacao_especial  30 data_situacao_especial
```

Amostra real: `"07396865";"0001";"68";"1";"";"08";"20170210";"01";…;"1412602";…;"SC";"8297";…`

**`empresas` — 7 colunas:** `cnpj_basico; razao_social; natureza_juridica;
qualificacao_responsavel; capital_social; porte; ente_federativo[✂]`.
Amostra: `"00000000";"BANCO DO BRASIL SA";"2038";"10";"120000000000,00";"05";""`

### 1.3 O alvo no Supabase

- `municipios`: **29/29** com `base_territorial = true` e **todas com `codigo_rfb` preenchido**
  (0 pendências) — o de-para TOM→`municipios.id` está pronto e é confiável.
- `empresas` e `estabelecimentos`: **vazias** (reset de 2026-07-23).
- RLS: `pol_empresas_insert` e `pol_estab_insert` exigem `fn_eh('admin')` —
  **o Admin insere pela sessão normal; não é preciso `service_role`** (ver §4.1).

---

## 2. Os 29 municípios e o filtro

**Filtro 1 — território.** `estabelecimentos[21]` (código TOM) ∈ os 29 códigos abaixo:

```
 724 São José da Barra      4037 Alpinópolis        4039 Alterosa
4081 Arceburgo              4151 Bom Jesus da Penha 4247 Capetinga
4255 Capitólio              4287 Carmo do Rio Claro 4301 Cássia
4341 Conceição da Aparecida 4423 Delfinópolis       4525 Fortaleza de Minas
4561 Guapé                  4593 Ibiraci            4609 Ilicínea
4657 Itamogi                4695 Jacuí              4863 Monte Santo de Minas
4901 Nova Resende           4957 PASSOS (sede)      5029 Piumhi
5057 Pratápolis             5243 São João B. do Glória  5277 São Pedro da União
5285 São Roque de Minas     5293 São Sebastião do Paraíso  5301 São Tomás de Aquino
5411 Vargem Bonita          5731 Itaú de Minas
```

**Filtro 2 — atividade comercial.** `estabelecimentos[12]` (CNAE principal, 7 dígitos)
começa com `45`, `46` ou `47`. Conferido no banco: **231 dos 1.359 CNAEs** cadastrados
caem nessas três divisões. Como todo CNAE 45/46/47 tem 7 dígitos começando em `4`,
**este filtro não sofre o problema de zeros à esquerda** descrito em §3.1.

**Filtro 3 — situação cadastral (decisão D1).** `estabelecimentos[6] = '02'` (ativa).
Descarta baixadas (`08`), inaptas (`04`), suspensas (`03`) e nulas (`01`).

**Cascata.** O filtro nasce em `estabelecimentos` (é quem tem município, CNAE e situação, e é
a unidade de alocação do trabalhador); as `empresas` entram por consequência — só as que
tiverem ao menos um estabelecimento aprovado nos **três** filtros.

### 2.1 Volume esperado (medido por amostra)

Rodando os dois filtros com **8 dos 29 municípios** (os maiores: Passos, S. S. do Paraíso,
Monte Santo, Piumhi, Cássia, Carmo do Rio Claro, Capitólio, Alpinópolis) sobre
`estabelecimentos1.csv`: **2.853 linhas** em 4,75 milhões (0,06%).

Extrapolando: ≈ **44 mil** estabelecimentos só para esses 8 municípios. Com os 21
restantes (todos bem menores), a estimativa bruta é **55 mil a 70 mil**.

⚠️ **Essa medição é ANTERIOR à decisão D1** (só ativas) — a amostra contava também
baixadas e inaptas, que eram maioria visível na inspeção. Com o filtro de situação `02`,
a expectativa realista cai para a faixa de **20 mil a 35 mil estabelecimentos** e número
semelhante de empresas. **Nenhum desses números autoriza a carga** — quem autoriza é a
contagem real da Subetapa 06.2.

> **Consequência de capacidade a checar antes da carga:** o Supabase Free tem 500 MB.
> Estimativa de ~50 MB para as duas tabelas com seus 8 índices — folgado. O risco real
> não são os dados, é a **auditoria** (§3.3).

---

## 3. Achados críticos (descobertos na investigação — mudam o plano)

### 3.1 🔴 As tabelas de referência estão SEM zero-padding — a spec está errada

`specs/importacao.md` §3.1 manda "zero-pad 4" para natureza jurídica e "zero-pad 2" para
qualificação. **O banco real faz o oposto.** Consulta às tabelas carregadas na Fase 0:

| Tabela | Códigos reais no banco | O que vem no CSV da RFB |
|---|---|---|
| `motivos_situacao_cadastral` | `0, 1, 2, 10, 11, …` | `00, 01, 02, 10, 11` |
| `qualificacoes_responsavel` | `0, 10, 11, 12, …` | `00, 05, 10, 16, 49` |
| `naturezas_juridicas` | `0, 1015, 1023, …` | `0000, 1015, 2038` |
| `cnaes` | `111301` (6 díg.) | `0111301` (7 díg.) |

Se a carga seguir a spec e enviar `"05"` como qualificação, ou `"01"` como motivo, **toda
linha viola a FK e é rejeitada** — um desastre silencioso de 100% de rejeição em colunas
que aparecem em todas as linhas. A normalização correta é **remover zeros à esquerda**
(ou corrigir as tabelas de referência — decisão D2 em §5).

### 3.2 🟡 `cnpj_completo` é coluna gerada — não pode ser enviada

O schema define `cnpj_completo text generated always as (cnpj_basico || cnpj_ordem ||
cnpj_dv) stored`. A matriz de decisão diz "seus valores deverão ser a concatenação" — isso
está certo conceitualmente, mas **o Postgres faz sozinho**; qualquer tentativa de
`INSERT` nessa coluna gera `ERROR 428C9`. Mesma regra para `id`, `created_at`, `updated_at`
(têm default) e `convencao_id` (fica **NULL** — o vínculo com a CCT é ato deliberado,
feito depois pela tela `/convencoes`, exatamente como `specs/importacao.md` §3.2 prevê).

**Colunas a enviar em `estabelecimentos`: 24.** Nunca as 30 da tabela.

### 3.3 🟡 Os triggers de auditoria podem triplicar o custo da carga

`sql/01_schema.sql` §14 põe `trg_*_auditoria` em `empresas` e `estabelecimentos`. Cada
INSERT grava uma cópia JSONB inteira da linha em `auditoria`. Para ~120 mil linhas isso
significa ~120 mil registros de auditoria e provavelmente **mais espaço que os próprios
dados** (estimativa: 60–90 MB), além de deixar a carga bem mais lenta.

Uma carga inicial em massa não é um ato humano auditável linha a linha — é um seed. A
auditoria dela é o log em `importacoes_csv` + este documento. Decisão D3 em §5.

### 3.4 🟢 O filtro NÃO quebra o e-mail de cobrança (verificado)

Preocupação legítima: uma empresa cuja **matriz** fica fora dos 29 municípios terá só a
filial importada — e `sql/12_email_guias.sql` prioriza o e-mail da matriz. Fui conferir:
a view já resolve com `order by (e.matriz_filial = 1) desc nulls last, e.created_at limit 1`,
ou seja, **cai para qualquer estabelecimento da empresa que tenha e-mail**, e se nenhum
tiver, o n8n usa `EMAIL_FALLBACK_RH`. Degradação graciosa, sem alteração necessária.

### 3.5 🟢 Não precisamos de `service_role` (verificado)

`pol_empresas_insert` / `pol_estab_insert` liberam INSERT para `fn_eh('admin')`. A carga
roda **logada como `admin@crm.local` com a anon key** — dentro da regra do `CLAUDE.md`
("service_role apenas em Edge Functions/n8n"), sem exceção de governança a pedir. Bônus: a
carga exercita as mesmas políticas que a Denise enfrentaria, então um erro de RLS aparece
aqui e não em produção.

---

## 4. Arquitetura da solução

### 4.1 Por que não usar a tela `/importacao`

A tela existente (Subetapa 01.5) faz parse no navegador com papaparse e grava por Edge
Function. Ela é ótima para os 3.000 registros que a Denise trata — e **imprestável para
22 GB**: nenhum navegador carrega o arquivo, e o filtro precisa acontecer *antes* do
upload, não depois. A carga inicial é uma operação de ETL local, não de tela.

### 4.2 O pipeline

Saída em `D:\BD\filtrados\` (decisão D4).

```
[22 GB em D:\BD\]
      │
      ├─ PASSE 1 (estabelecimentos0-9)  ── streaming, nunca carrega o arquivo em RAM
      │    filtra município ∈ 29  E  CNAE ∈ 45|46|47  E  situacao = '02'
      │    → estabelecimentos_filtrados.ndjson   (~60k linhas)
      │    → conjunto de cnpj_basico aprovados   (~50k chaves, cabe em memória)
      │
      ├─ PASSE 2 (empresas0-9) ── mantém só cnpj_basico ∈ conjunto do passe 1
      │    → empresas_filtradas.ndjson           (~50k linhas)
      │
      ├─ NORMALIZAÇÃO  (Latin-1→UTF-8 · datas AAAAMMDD→date · vírgula→ponto
      │                 · vazio→NULL · códigos das FKs mantidos COMO A RFB ENTREGA,
      │                   porque a Subetapa 06.0 alinhou as tabelas de referência)
      │
      ├─ RECONCILIAÇÃO DE FKs contra o banco (cnaes, naturezas, qualificações,
      │    motivos, municípios) — relatório de códigos órfãos ANTES de subir
      │
      └─ CARGA  empresas → estabelecimentos (ordem obrigatória: FK)
           lotes de 500, upsert idempotente, log em importacoes_csv
```

**Ferramenta:** Node 24 (já instalado) + **papaparse**, que já é dependência do projeto e
lida corretamente com campos entre aspas contendo `;` — exatamente a armadilha que Maxwell
apontou. Nada de `awk`/split manual no pipeline final: a amostra de reconhecimento usou
`awk`, mas ele quebraria num campo com `";"` embutido. `python`, `duckdb` e `psql` **não
estão instalados** neste ambiente (verificado) — não fazem parte do plano.

**Saída intermediária em NDJSON**, não CSV: elimina de vez a ambiguidade de aspas/delimitador
entre uma etapa e outra, e permite retomar a carga do ponto onde parou.

---

## 5. Decisões — TOMADAS por Maxwell em 2026-07-23

| # | Decisão | Consequência no plano |
|---|---|---|
| **D1** | ✅ **Só estabelecimentos ATIVOS** (`situacao_cadastral = '02'`). | Vira o **terceiro filtro obrigatório** (§2). Reduz o volume esperado de forma expressiva — a estimativa de 55-70k cai para uma faixa a medir na 06.2. Baixadas que reativarem entram no ciclo mensal da 06.6. |
| **D2** | ✅ **Corrigir as tabelas de referência** para o formato canônico da RFB (zero-padded). | Cria a **Subetapa 06.0**, pré-requisito de tudo. Feito agora, com 0 dependentes, é barato; depois da carga custaria ~120 mil FKs. Alinha o banco à `specs/importacao.md`, que já estava escrita nesse formato. |
| **D3** | ✅ **Desligar `trg_*_auditoria`** durante a carga e **religar ao final**. | Economiza 60-90 MB dos 500 MB do Free. A 06.4 passa a ter uma condição de aceite explícita: conferir `pg_trigger.tgenabled` no fim — trigger que fica desligado em produção é buraco silencioso. |
| **D4** | ✅ **`D:\BD\filtrados\`** para os NDJSON intermediários. | Fora do repositório (LGPD), no drive que já hospeda os 22 GB, e persistente entre meses — o ciclo mensal compara com a rodada anterior. |

---

# ETAPA 06 — REPOVOAMENTO DA BASE REAL (RFB) · Complexidade: ALTA

Objetivo geral: sair de duas tabelas vazias para a base real dos 29 municípios, filtrada,
normalizada, auditada — e com o ciclo mensal automatizado numa skill.
Modo predominante: **[Manual]** nas subetapas que tocam o banco de produção;
**[Goal]** nas de ferramenta local, onde o erro é barato e reversível.

### Subetapa 06.0 — Corrigir o zero-padding das tabelas de referência (decisão D2) [Manual] [LLM: Opus] · Status: ✅ CONCLUÍDA (2026-07-23)

> **Executada e verificada.** `sql/18_padding_referencias.sql` aplicado em produção.
> Larguras canônicas atingidas com **contagens intactas**: `cnaes` 1359 (todos 7 díg.),
> `naturezas_juridicas` 91 (4), `qualificacoes_responsavel` 68 (2),
> `motivos_situacao_cadastral` 63 (2) — 0 linhas fora do padrão nas quatro.
> Códigos agora no formato da RFB: `0111301`, `0000`, `05`, `01`.
> **Idempotência provada por hash md5** (2ª execução → 4/4 `IDENTICO`).
> **Guarda provada não-decorativa:** com um dependente forjado, abortou com
> "ABORTADO: empresas (1) nao esta vazia" e o rollback não deixou rastro
> (0 linhas em `empresas`, 0 em `auditoria`). Suíte RLS 93/98 — as mesmas 5 falhas
> de conteúdo pré-existentes, nenhuma regressão.
> **Efeito colateral bom:** `specs/importacao.md` §3.1 ("zero-pad 4"/"zero-pad 2"),
> que estava divergente do banco, passou a descrever a realidade — sem precisar de edição.

**Objetivo:** deixar `cnaes`, `naturezas_juridicas`, `qualificacoes_responsavel` e
`motivos_situacao_cadastral` no formato canônico da RFB, **antes** de qualquer carga.
**Conclusão:** códigos zero-padded no comprimento oficial do layout CNPJ — CNAE 7,
natureza 4, qualificação 2, motivo 2 (`111301`→`0111301`, `5`→`05`, `1`→`01`, `0`→`0000`).
`sql/18_padding_referencias.sql` versionado e aplicado.
**Qualidade:** a contagem de linhas de cada tabela é **idêntica** antes e depois — o padding
não pode fundir dois códigos num só (se `1` e `01` coexistissem, viraria colisão de PK: a
migração precisa falhar alto, não sobrescrever); nenhuma tabela dependente é afetada
(conferir que `empresas`/`estabelecimentos` seguem vazias antes de rodar); idempotente
(rodar duas vezes não altera nada).
**Evidência:** contagens antes/depois iguais nas 4 tabelas + amostra dos códigos no novo
formato + `select` provando 0 linhas em `empresas`/`estabelecimentos` no momento da migração.
Esforço: n/a (Manual estrito — é DDL/DML em tabela de referência de produção).

### Subetapa 06.1 — Ferramenta de filtragem + validação em 1 arquivo [Goal] [LLM: Sonnet]

**Objetivo:** escrever `scripts/rfb/filtrar.mjs` (streaming + papaparse) e provar que ele
lê corretamente **um** arquivo, sem carregar nada em RAM.
**Conclusão:** rodando só em `estabelecimentos1.csv`, o script reproduz **2.853 linhas** com
os mesmos 8 municípios e **sem** o filtro de situação (número de controle já medido nesta
sessão), e reporta à parte quantas sobram **com** o filtro `02` — a diferença entre os dois
números é a primeira medição real do impacto da decisão D1.
**Qualidade:** parser real (campos com `;` entre aspas passam intactos); Latin-1 decodificado
com acentuação correta (conferir um nome com `Ç`/`Ã` a olho); consumo de RAM estável
(< 300 MB) — se subir com o tamanho do arquivo, o streaming está quebrado.
**Evidência:** contagem 2.853 reproduzida + `process.memoryUsage()` logado a cada 1M linhas
+ 5 linhas de amostra impressas com acentuação legível.
Esforço máximo do /goal: 3 tentativas · Sonnet nas 2 primeiras, Opus na 3ª.
Se esgotar: parar e relatar (problema + causas + alternativas).

### Subetapa 06.2 — Passe completo sobre os 22 GB [Manual] [LLM: Sonnet]

**Objetivo:** rodar os dois passes sobre os 20 arquivos e produzir os NDJSON filtrados.
**Conclusão:** `estabelecimentos_filtrados.ndjson` e `empresas_filtradas.ndjson` gerados,
com **o número real** de linhas (substitui a estimativa de 55–70k) e relatório por município
e por divisão CNAE.
**Qualidade:** o total de linhas lidas bate com a soma esperada (~74M) — se ler menos, um
arquivo foi truncado e a carga estaria incompleta **sem avisar**; todo `cnpj_basico` do
arquivo de estabelecimentos existe no de empresas (integridade da cascata antes de tocar o
banco); no resultado, **nenhum** município fora dos 29, **nenhum** CNAE fora de 45/46/47 e
**nenhuma** situação diferente de `02` (as três asserções de filtro, verificadas na saída e
não na intenção do código).
**Evidência:** relatório `filtragem.md` com contagens por arquivo, por município e por CNAE,
+ as 3 asserções de integridade acima explicitamente verdes.
Esforço: n/a (Manual — é execução longa, ~45-60 min, não tentativa-e-erro).

### Subetapa 06.3 — Normalização + reconciliação de FKs (sem tocar no banco) [Manual] [LLM: Opus]

**Objetivo:** aplicar as regras de §4.2 e **provar que toda FK casa** antes de qualquer INSERT.
**Conclusão:** relatório de reconciliação mostrando, para cada uma das 5 referências
(`cnaes`, `naturezas_juridicas`, `qualificacoes_responsavel`, `motivos_situacao_cadastral`,
`municipios`), quantos códigos distintos aparecem nos dados e quantos **não existem** no banco
— agora contra as tabelas já corrigidas pela 06.0, e portanto **sem** remover zeros à esquerda:
os códigos vão para o banco no formato exato em que a RFB os entrega.
**Qualidade:** zero órfãos nas 5 referências — ou, havendo, cada caso nominalmente listado e
decidido (nunca "importa e vê no que dá"); `cnpj_basico`/`ordem`/`dv` conferidos contra os
CHECKs `^\d{8}$`, `^\d{4}$`, `^\d{2}$`; datas `00000000` viram NULL, não ano zero; capital
social com vírgula convertido sem perder centavos.
**Evidência:** relatório de reconciliação + um `dry-run` de 100 linhas contra o banco numa
transação com `ROLLBACK` — passa pelos CHECKs e FKs reais e não deixa rastro.
Esforço: n/a (Manual estrito — é a subetapa que decide se a carga é segura).

### Subetapa 06.4 — Carga em produção [Manual] [LLM: Opus]

**Objetivo:** subir `empresas` e depois `estabelecimentos`, logado como Admin.
**Conclusão:** as duas tabelas populadas, contagem final = contagem do NDJSON, `importacoes_csv`
com uma linha por conjunto.
**Qualidade:** ordem `empresas` → `estabelecimentos` respeitada (FK); lotes de 500 com upsert
idempotente — **rodar duas vezes não duplica nem altera nada** (provar de fato, não supor);
decisão D3 aplicada e, se os triggers foram desligados, **religados e conferidos** ao final
(`pg_trigger.tgenabled`) — um trigger de auditoria que fica desligado em produção é um
buraco silencioso; nenhuma escrita em `trabalhadores`/`convencoes`/financeiro.
**Evidência:** contagens antes/depois; 2ª execução com delta zero; estado dos triggers
conferido; 5 registros conferidos a olho contra a linha original do CSV (acentuação, CNPJ,
município, CNAE).
Esforço: n/a (Manual estrito).

### Subetapa 06.5 — Auditoria pós-carga [Manual] [LLM: Sonnet]

**Objetivo:** provar que a base é confiável, não só que "subiu".
**Conclusão:** relatório de conformidade com: contagem por município (bate com §06.2);
`cnpj_completo` gerado corretamente pelo banco em 100% das linhas; nenhum estabelecimento
órfão de empresa; `convencao_id` 100% NULL (nada foi vinculado a CCT por acidente);
distribuição por situação cadastral coerente com a decisão D1.
**Qualidade:** cada número do relatório sai de uma query mostrada — nenhum número narrado
sem query que o produza; a suíte `npm run test:rls` roda e continua verde (a carga não pode
ter quebrado política nenhuma).
**Evidência:** relatório + suíte verde + app em `crm.sindcompassos.org` listando as empresas
reais nas telas `/empresas` e `/estabelecimentos`.

### Subetapa 06.6 — Skill `atualizar-sindcom` (ciclo mensal) [Goal] [LLM: Opus]

**Objetivo:** transformar as 06.1–06.5 num procedimento repetível que **dá sequência à skill
`atualizar-cnpj`** (que hoje só baixa e extrai os arquivos da RFB).
**Conclusão:** skill em `~/.claude/skills/atualizar-sindcom/` que: (1) assume os arquivos já
baixados pela `atualizar-cnpj`; (2) refaz filtro e normalização; (3) **compara com o banco**;
(4) sobe só o delta; (5) **sinaliza** o que sumiu ou foi baixado.
**Qualidade — a regra que define esta skill:** ela **nunca apaga** empresa ou estabelecimento.
Um CNPJ que desapareceu do arquivo da RFB, ou virou situação `08`, vira **relatório para a
Denise decidir**, jamais um DELETE automático — pode haver trabalhador com vínculo e histórico
financeiro ali. Deleção é ato humano. Além disso, herda a proteção do `CLAUDE.md`: a
atualização **nunca** toca `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio`,
`forma_pagamento_preferida` nem `convencao_id` — este último porque o vínculo com a CCT é
trabalho manual da Denise e um "update" mensal o destruiria silenciosamente todo mês.
**Evidência:** execução completa num mês real, com relatório de delta (novas · alteradas ·
sumidas) e prova de que rodar a skill sem dados novos produz **delta zero** (idempotência).
Esforço máximo do /goal: 3 tentativas · Opus (regra de negócio sensível).

**Aceite da Etapa 06:** (1) `empresas` e `estabelecimentos` populadas só com os 29 municípios,
CNAEs 45/46/47 e situação `02`, número conferido por município; (2) zero órfãos de FK e
`cnpj_completo` íntegro; (3) triggers de auditoria religados e conferidos; (4) suíte RLS verde
e telas listando dados reais; (5) skill `atualizar-sindcom` rodada com sucesso ao menos uma
vez, com delta zero na segunda execução.

**Riscos:** (a) estimativa de volume errada para mais — mitigada por medir na 06.2 antes de
subir; (b) FKs sem zero-padding (§3.1) — mitigada pela reconciliação obrigatória na 06.3;
(c) limite de 500 MB do Free — mitigada pela decisão D3 e pela medição de espaço na 06.5;
(d) interrupção no meio da carga — mitigada pelo upsert idempotente, que permite reexecutar.

---

## 6. O que este plano NÃO faz

- **Não vincula CCT.** `convencao_id` fica NULL em 100% das linhas; o vínculo é ato
  deliberado da Denise na tela `/convencoes` (e a dica `SEM_CCT` do dashboard monitora o que falta).
- **Não importa trabalhadores.** Só empresas e estabelecimentos. Trabalhadores têm template
  próprio (`specs/importacao.md` §3.3) e regras de nível que não podem nascer de planilha.
- **Não mexe em `municipios`** nem nas demais tabelas de referência — exceto se a decisão D2
  for pela correção do zero-padding, que então vira pré-requisito da 06.3.
