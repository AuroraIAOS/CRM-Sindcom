# RELATÓRIO — ETAPA 08 · Subetapa 08.12, Portão de Segurança Adversarial

**Data:** 2026-08-27 · **Branch:** `feature/comunicacao-externa` · **Base:** `main`
**Produção:** `vcswvscjqifelslsdjth` · **Bench descartável:** `ikculjjvvyajhfxifuga`
**Escopo atacado:** a superfície que a ETAPA 08 acrescentou — 6 tabelas novas, 1 view (08.11),
1 tabela de freio, 1 bucket privado de Storage, 1 endpoint público sem login que recebe arquivo
com dado pessoal, e os 9.186 tokens reais já gravados em produção.
**Método:** o mesmo da ETAPA 07 (`docs/RELATORIO_ANALISE_VITRINE.md`) · **LLM:** Opus, do início ao fim.

---

## 1. Resumo executivo

A ETAPA 08 chegou a este portão com 222 testes verdes (3 falhas conhecidas em `cartas`), o advisor
sem achado novo e as seis tabelas com RLS e policy explícita desde a 08.4. **O ataque deliberado
encontrou 3 falhas reais e resolveu 1 decisão de segurança que estava em aberto.**

| | |
|---|---|
| Ataques escritos | **50**, em `tests/adversarial/05_comunicacao.spec.ts` |
| Falhas reais encontradas | **3** |
| Corrigidas e provadas no bench | **3 de 3** |
| Aplicadas em produção | **0** — aplicar é ordem do Maxwell |
| Decisão de segurança pendente, agora fechada | **1** (a máscara do token — decidida: **não aplicar**, §4) |
| Achados medidos e **aceitos** com motivo | **4** |
| Falsos achados descartados por medição | **3** |
| Suíte em produção | **272 testes, 4 falhas** = 3 pré-existentes (`cartas`) + **1 que é o achado aberto** |
| Suíte adversarial no bench | **45/45** (5 casos são exclusivos de produção) |

**As três falhas apareceram na varredura de catálogo, antes de eu escrever um único ataque** — e
nenhuma delas sairia de leitura de código, porque **duas não estão escritas em lugar nenhum**: são
privilégios que o objeto ganha ao nascer.

**Onde as falhas se concentraram.** A superfície que a etapa construiu de propósito — token,
bucket, endpoint público, RLS das seis tabelas — **resistiu inteira**. As três falhas estão fora
dela, em heranças que a etapa nova apenas revelou:

1. **Função exposta como RPC** (A-08.01) — a RLS não olha `EXECUTE`, e o advisor só olha função
   `SECURITY DEFINER`. Esta é `INVOKER`, e passou por baixo dos dois.
2. **Privilégio de fábrica que se regenera** (A-08.02) — o hardening da ETAPA 07 corrigiu os
   objetos existentes, não a regra que os cria. Todo objeto novo nasce aberto de novo.
3. **Objeto não versionado** (A-08.04) — a view do achado A-01 da ETAPA 07 continua existindo só
   no banco, onde nenhuma revisão de código a alcança.

---

## 2. Achados, um a um

### 🟠 A-08.01 — Anônimo consome a numeração da guia de pagamento · **MÉDIO/ALTO · CORRIGIDO NO BENCH · ABERTO EM PRODUÇÃO**

**Vetor:** V2 · **Medido ao vivo no bench, sem login nenhum, só com a anon key:**

```
POST /rest/v1/rpc/fn_gera_guia_pagamento     (apikey + Bearer da ANON KEY, sem sessão)
→ 200  "GP-2026-000017"
→ 200  "GP-2026-000018"
→ 200  "GP-2026-000019"
→ 200  "GP-2026-000020"
→ 200  "GP-2026-000021"
```

`fn_gera_guia_pagamento()` faz `nextval('seq_guia_pagamento')`. **Cada chamada consome a numeração
do documento de cobrança que vai para a empresa.** Em laço, a próxima guia real nasce como
`GP-2026-847392`: não corrompe dado nenhum, mas destrói a sequência que dá rastreabilidade ao
documento, e revela ao chamador quantas guias já foram emitidas.

**A anon key não é segredo** — ela vai no bundle JS publicado em `crm.sindcompassos.org`, e
qualquer visitante a lê no DevTools. Não é preciso ter conta, nem ter tido.

**É o gêmeo não corrigido do achado A-02 da ETAPA 07.** Lá, `fn_gera_numero_guia` (numeração da
guia de SERVIÇO) saiu do alcance da API virando trigger. A da guia de PAGAMENTO ficou de pé —
e por três motivos que se somam:

- ela **não é `DEFAULT` de coluna nenhuma** (conferido em `information_schema.columns`), então a
  correção da ETAPA 07 não passou por ela;
- o **advisor de segurança não a acusa**, porque o lint `anon_security_definer_function_executable`
  só olha funções `SECURITY DEFINER`, e esta é `INVOKER`;
- **não há nada de errado escrito no código** — o `EXECUTE` para `anon` é privilégio de fábrica
  (§A-08.02), não uma linha que alguém tenha digitado.

**Correção** (`sql/23_hardening_08_12.sql`):

```sql
revoke execute on function public.fn_gera_guia_pagamento() from public, anon, authenticated;
revoke usage, select, update on sequence public.seq_guia_pagamento from anon, authenticated;
revoke usage, select, update on sequence public.seq_numero_guia   from anon, authenticated;
```

**Por que revogar não quebra o motor de cobrança, e a prova disso.** A única chamadora legítima é
`fn_gerar_guias` (`sql/10_cobrancas.sql`), que é `SECURITY DEFINER` com dono `postgres` — o
privilégio conferido lá dentro é o do dono, não o de quem chamou. **Controle negativo medido no
bench depois da revogação:** o caso "o motor de cobrança continua gerando guia" chama
`fn_gerar_guias` como Admin e passa. Esse controle é exatamente o que faltou na ETAPA 07, quando
uma correção de segurança impediu a Secretaria de criar guia e só 12 testes vermelhos disseram.

**Medido depois, nos dois alvos:**

| alvo | `POST /rpc/fn_gera_guia_pagamento` | `GET` no mesmo caminho |
|---|---|---|
| bench (corrigido) | nenhum número devolvido | **401** — o papel não executa |
| produção (aberto) | *não medido de propósito* | **405** — o endpoint existe, falta o verbo |

> **Como o achado foi provado em produção sem queimar um número real.** A função é `VOLATILE`, e o
> PostgREST recusa `VOLATILE` por `GET`. O código de status separa "existe como endpoint e só falta
> o verbo certo" (**405**) de "este papel não a executa" (**401/404**) — sem executar nada. É esse
> o caso que roda contra produção e está **vermelho hoje**; ele fica verde no minuto em que o
> `sql/23` for aplicado.

---

### 🟡 A-08.02 — O privilégio de fábrica não é hereditário: ele volta em todo objeto novo · **MÉDIO · CORRIGIDO NO BENCH**

**Vetor:** V2 · **Medido em produção, na varredura de grants:**

```
grantee        table_name                    privilege_type
anon           v_cobertura_contabilidades    TRUNCATE / REFERENCES / TRIGGER
authenticated  v_cobertura_contabilidades    TRUNCATE / REFERENCES / TRIGGER
```

`v_cobertura_contabilidades` é a **única relação de `public` criada depois da varredura da ETAPA 07**
(ela nasceu na 08.11) — e é a única com os três privilégios de volta. Ninguém escreveu esse GRANT.
`sql/22_cobertura_08_11.sql` faz `grant select ... to authenticated` e `revoke select ... from anon`,
e mais nada; os três apareceram sozinhos.

**A causa, medida em `pg_default_acl` e não suposta:**

```
dono=postgres · schema=public · tipo=relação
{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
 authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
```

`arwdDxtm` = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. Ou seja:
**toda tabela ou view nova criada por `postgres` em `public` concede tudo — inclusive SELECT — a
`anon`.** O `sql/19_hardening_adversarial.sql` da ETAPA 07 varreu os objetos que existiam naquele
dia; ele não podia alcançar os que ainda não existiam.

**É a mesma raiz do achado A-01 da ETAPA 07** — a view `empresas_estabelecimentos`, que entregava
16.687 empresas e 17.319 estabelecimentos a qualquer anônimo. Aquela view **não recebeu** o
`GRANT SELECT` de ninguém: ela nasceu com ele. O relatório de então registrou o fato como
"privilégio de fábrica do projeto Supabase"; esta subetapa achou o mecanismo exato e o desligou.

**Explorável hoje? Não, e vale dizer com todas as letras.** `v_cobertura_contabilidades` é view, e
não se trunca view; o SELECT dela para `anon` já estava revogado no `sql/22`; e `anon` /
`authenticated` têm `rolcanlogin = false` e não têm `CREATE` em `public` (mesma análise da §2.16).
**O que este achado descreve não é uma porta aberta — é a fábrica que reabre a porta a cada objeto
novo.** A ETAPA 07 mediu quanto custa quando um objeto novo escapa.

**Correção, em duas partes** (`sql/23_hardening_08_12.sql`):

```sql
-- (a) os objetos que já existem, varridos por pg_class (não por pg_tables: as VIEWS
--     também carregam esses privilégios — foi por isso que a 1ª tentativa da ETAPA 07
--     deixou 78 grants de pé)
revoke truncate, references, trigger on <cada relação de public> from anon, authenticated;

-- (b) a raiz, para que a varredura acima não precise ser lembrada nunca mais
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
```

**Por que `anon` perde tudo e `authenticated` perde só os três.** Tirar `authenticated` do default
faria toda tabela nova responder `42501` ao app até alguém lembrar do GRANT explícito — e `42501`
se disfarça de RLS quebrada, que é a investigação mais cara deste projeto (§2.6b, §2.6c). O ganho
de segurança estava no anônimo, e é o anônimo que ficou fechado.

**Prova de que a raiz fechou, com o controle negativo na mesma medição** — uma tabela criada no
bench DEPOIS da correção (e apagada em seguida):

| | `anon` | `authenticated` |
|---|---|---|
| SELECT | **false** ✅ | true ✅ (o app continua funcionando) |
| INSERT | false ✅ | true ✅ |
| TRUNCATE | **false** ✅ | **false** ✅ |

**Nenhuma tela perde nada.** O CRM inteiro consulta autenticado, e as quatro superfícies públicas
não leem tabela como `anon`: as 2 RPCs do QR são `SECURITY DEFINER`, e as 2 Edge Functions usam
`service_role`.

---

### 🔵 A-08.04 — A view do achado crítico da ETAPA 07 continua sem definição no repositório · **BAIXO · CORRIGIDO NO BENCH**

**Vetor:** método · Comparando `pg_class` com os arquivos `sql/`, das 52 relações de `public`
**uma única** não tem definição versionada: `empresas_estabelecimentos` — precisamente a do achado
A-01. O vazamento foi fechado em 2026-08-21 com um `alter view`, mas o **corpo** da view nunca
entrou no repositório: ela foi criada direto no banco durante a carga da RFB.

**Por que isso ainda importa depois de corrigida:** `create or replace view` **não preserva
`reloptions`**. Um `create or replace` futuro, escrito por quem conhece o banco e não a história,
reabre o vazamento inteiro — e nenhuma revisão de código o pegaria, porque não há código a revisar.

**Correção:** a view foi versionada no `sql/23` com o corpo exatamente como está em produção
(extraído por `pg_get_viewdef`), com a opção presente, mais a segunda camada que faltava:

```sql
revoke all on empresas_estabelecimentos from anon;
grant select on empresas_estabelecimentos to authenticated;
```

Nenhuma consulta do app usa a view — conferido por busca em `src/`, `tests/`, `scripts/` e `n8n/`:
ela só aparece nos tipos gerados. Medido no bench: `invoker = on`, `anon` sem SELECT,
`authenticated` com SELECT.

---

## 3. O que **resistiu** ao ataque

Vale tanto quanto a lista de falhas — e o que resistiu foi, quase inteiro, o que esta etapa
construiu de propósito.

**O token, que é a credencial do canal público**
- **Isolamento entre contadores, nos dois sentidos.** O token de A devolve a carteira de A e nunca
  a de B; o de B devolve a de B e nunca a de A. (Simetria testada de propósito: isolamento que só
  funciona num sentido não é isolamento, é coincidência de ordenação.)
- **Parâmetro pendurado na URL não amplia nada.** `?token=…&contabilidade_id=…&estabelecimento_id=…`
  devolve exatamente o mesmo que o token sozinho — a classe do achado A06 do CRM Vitrine.
- **Expirado e revogado não devolvem carteira nem nome**, e recusam com HTTP 200 + `ok:false`,
  nunca com exceção — o desenho que faz o freio contar de verdade (§2.18).
- **Sem oráculo de existência:** token inexistente e token sem forma de UUID devolvem a **mesma**
  mensagem. Uma varredura não consegue separar acerto de erro.
- **Os tokens são UUID v4 de verdade**, conferidos por formato em 50 amostras reais de produção,
  todos distintos. É a entropia que segura a varredura (§5).

**O freio do endpoint público** — medido, não suposto:

```
[freio · mesmo token]      12 tentativas em 3574ms — 5 recusas, 7 bloqueios
```

O ataque fecha na 6ª tentativa, e as 5 primeiras passam — que é o que impede o freio de trancar um
contador legítimo para fora do próprio link.

**O bucket privado `remessas`** — com objeto real dentro (3 em produção), o que torna o `[]` do
anônimo uma medição e não um vazio:

| ator | listar | assinar o caminho REAL | baixar por URL pública |
|---|---|---|---|
| `anon` | `[]` | recusado | não-200 |
| `juridico` | — | recusado | — |
| `parceiro` | — | recusado | — |
| **`admin`** (controle negativo) | **1 pasta** ✅ | **assina** ✅ | — |

O anônimo foi testado **com o caminho exato em mãos**, não adivinhando — é a diferença entre provar
proteção e provar que não se sabe o caminho.

**A garantia central da etapa** — a que a etapa inteira foi desenhada para dar:
- **Nem o envio ACEITO escreve em `trabalhadores` ou em `vinculos_empregaticios`.** Contagem antes
  e depois de um upload bem-sucedido: idêntica. Remessa vira cadastro só pelo clique da Denise.
- **A remessa é imutável**: reescrever a coluna de evidência é recusada pelo trigger, **inclusive
  para a `service_role`**.

**O arquivo hostil** — a validação é por CONTEÚDO, e cada uma destas foi recusada sem virar remessa:
CSV renomeado para `.xlsx` · ZIP legítimo que não é pacote OOXML · arquivo vazio · HTML com
`<script>` disfarçado de planilha · planilha legítima com extensão `.csv`. **Controle negativo:** a
planilha legítima **é aceita** — a recusa não é "recusar tudo".

**As seis tabelas, a view e o freio, contra o anônimo** — e aqui a asserção forte não é o conjunto
vazio, é o **`42501`**: `anon` é barrado no GRANT, antes de a RLS ser avaliada. As duas camadas, não
uma. `tentativas_remessa` é negada **até para o Admin**. **Controle negativo:** o Admin lê as seis e
a view.

**A injeção de fórmula, pelo caminho completo** (`§2.19`): os 8 payloads (`=1+1`,
`=cmd|'/c calc'!A1`, `=HYPERLINK(…)`, `+`, `-`, `@`, TAB, CR) entram por uma planilha do contador,
atravessam `lerPlanilhaXlsx` → `validarTrabalhadores` → `gerarCsv` — os módulos REAIS, não uma
imitação — e **saem todos neutralizados**. O banco guarda o payload literal, e isso está certo: é
dado, não código; quem defende é a fronteira de saída. **Controle negativo:** nome legítimo intacto
e valor negativo ainda legível.

**Uma camada que eu não sabia que existia**, encontrada ao medir: a borda da Supabase (Cloudflare)
devolve **403 com página HTML** para um token com forma de comando SQL — a requisição nem chega à
Edge Function. Não é defesa nossa e não substitui nenhuma; foi transformada num caso de teste para
que o dia em que ela sumir seja visível.

---

## 4. A decisão de segurança que estava em aberto — e a resposta

**A pergunta** (`sql/22_cobertura_08_11.sql`, Parte 2, e handoff do Circuito 4): aplicar ou não a
view `v_envios_campanha_mascarada`, que apaga `envios_campanha.token` para quem não é Admin?

**Medido primeiro.** Quem lê o token em claro hoje, por login real:

| papel | lê o token |
|---|---|
| admin | **sim** |
| presidente | **sim** |
| secretaria | **sim** |
| juridico | não alcança linha nenhuma |
| parceiro | não alcança linha nenhuma |

### ❌ Decisão: **NÃO aplicar a Parte 2.** E o motivo não é preferência — é que ela não fecha nada.

`pol_envios_select` autoriza Presidente e Secretaria a ler `envios_campanha`, e o `GRANT SELECT` na
**tabela** continua de pé. Quem quisesse o token consultaria a tabela, não a view. **Uma view só
restringe quem não tem caminho até a base** — e aqui os dois papéis têm. Aplicá-la produziria a
aparência de um controle sem o controle: o pior desfecho possível para um portão de segurança.

**O mecanismo que fecharia de fato** é o narrowing de COLUNA da ETAPA 07 (achado A-03,
`recepcionistas.pin_hash`): `revoke select (token)` da tabela. Mas ele é **tudo-ou-nada para o papel
`authenticated` do Postgres**, e Admin e Secretaria são o **mesmo papel do Postgres** — fechar para
ela fecha para ele, e o Admin precisa do token: é dele que saem os CSVs das 4 listas da 08.13. É o
mesmo beco de `solicitacoes_servico.token_publico`, que a ETAPA 07 mediu e aceitou pelo mesmo motivo.

**Severidade real do que fica exposto, medida em vez de suposta.** O token permite **enviar** uma
remessa — e remessa não vira cadastro sem revisão humana, o que este portão provou por teste (§3).
A Secretaria **é** a Denise, que revisa as remessas e já tem escrita direta em `trabalhadores`: para
ela o token não concede nada que ela não tenha. Para o Presidente, concede submeter uma remessa que
a Denise revisaria. Não é escalada de privilégio; é exposição de credencial de baixo poder a quem já
tem poder maior.

**O caminho que fecharia, se um dia valer o custo:** `revoke select (token)` da tabela + uma função
`SECURITY DEFINER` guardada por `fn_eh('admin')` devolvendo o token ao Admin. Custa reescrever
`scripts/gerar_campanha_08_13.mjs` e qualquer gerador futuro de lista.

**Gatilho de reavaliação declarado:** no dia em que o token deixar de ser credencial de baixo poder
— se um envio passar a virar cadastro sem revisão humana, ou se o papel Secretaria for dado a alguém
de fora da secretaria.

O caso de teste correspondente afirma o estado atual e traz a instrução no próprio texto da falha:
se alguém aplicar a máscara, o teste fica vermelho e obriga a atualizar esta decisão.

---

## 5. Achados medidos e **aceitos**, com o motivo registrado

### ⚪ O freio é por token, então não freia uma varredura — e não precisa freiar

**Medido no bench:**

```
[varredura · tokens novos]  10 tentativas em 3431ms (343ms cada) — 0 bloqueios
```

`estaFreado()` conta falhas por `token_alvo`. Quem varre o espaço nunca repete alvo, então **nunca
trava**. Isso é deliberado e correto: travar por origem deixaria um atacante silenciar contadores
legítimos, e o freio existe para encarecer a adivinhação de **um token específico** (o caso do link
que vazou por encaminhamento de e-mail), não para conter varredura.

**Quem contém a varredura é a entropia:** UUID v4 são 122 bits. A 343ms por tentativa, o espaço não
é percorrível em nenhum horizonte útil. **Isso só continua verdadeiro enquanto o token for v4** — e
é por isso que o formato virou caso de teste sobre 50 amostras reais (§3), em vez de ficar como
suposição.

**Reavaliar se** o token passar a ser gerado por outro caminho que não o `DEFAULT` da coluna.

### ⚪ `tentativas_remessa` cresce sem retenção, e quem escreve nela é anônimo

Cada requisição recusada ao endpoint público insere uma linha, sem limite por origem e sem rotina
de expurgo: `cron.job` tem 4 tarefas e nenhuma delas limpa `tentativas_remessa` nem
`tentativas_checkin` (que tem o mesmo desenho desde a ETAPA 07 e o mesmo passivo).

Não é vazamento e não dá acesso a nada — é crescimento de tabela dirigido de fora, num projeto no
plano Free. Fica **aceito com recomendação**: um `pg_cron` diário apagando o que passou da janela de
15 minutos resolve, e cabe em 3 linhas. Não entra neste portão porque criar rotina agendada nova é
mudança de operação, não correção de falha.

### ⚪ `TRUNCATE` de fábrica em `storage.*` — herdado, não revogável, e não explorável

Pendência declarada no handoff, reconferida aqui: `anon` e `authenticated` têm os três privilégios
em `storage.objects` / `storage.buckets`. O `postgres` do projeto **não é superuser** e não é membro
de `supabase_storage_admin`, e `REVOKE` de privilégio que não é seu é **no-op silencioso** (§2.16b).
Aceito pelos mesmos motivos já medidos na 08.5: o schema `storage` não é exposto pelo PostgREST
(`PGRST106`), não há verbo TRUNCATE em REST, e a API de Storage passa pela RLS. **Revisão:** pedir à
Supabase, ou refazer com um papel privilegiado, se o projeto migrar de plano.

### ⚪ 43 das 51 relações de `public` ainda concedem DML amplo a `anon` — a RLS é camada única nelas

**Medido, e o contraste é o que importa:**

```
GET /rest/v1/trabalhadores?select=id     (anon)  →  200  []       ← só a RLS negou
GET /rest/v1/envios_campanha?select=id   (anon)  →  401  42501    ← o GRANT negou antes
```

As seis tabelas da ETAPA 08 revogam `anon` explicitamente (`sql/20` §11) e têm as **duas** camadas.
As 43 anteriores herdaram o GRANT de fábrica e têm **uma**. Hoje a RLS nega corretamente em todas —
não há vazamento. Mas o achado A-01 da ETAPA 07 é a prova de quanto vale a segunda camada: com o
GRANT fechado, aquela view não teria vazado nada, porque `anon` nem chegaria à consulta.

**Não executado neste portão, e o motivo é honesto:** revogar muda o que o PWA recebe numa consulta
disparada antes de a sessão ser restaurada — de lista vazia para erro na tela. É decisão de produto
com risco de regressão visível, e fica como **recomendação** (§8), não como linha aplicada.
A correção da raiz (A-08.02) garante que a lista de 43 **não cresce mais**.

---

## 6. Três falsos achados, descartados por medição

Registro isto porque o rigor do portão depende disso: **um teste adversarial mal escrito produz
falso achado com a mesma facilidade com que produz falso verde.** Todos os três vermelhos abaixo
apareceram na minha própria suíte, e nenhum era falha do sistema.

| "Achado" | O que a medição mostrou |
|---|---|
| **"O endpoint público quebra com payload de SQL no token"** — a resposta não era JSON (`Unexpected token '<'`) | O HTML é a página de bloqueio do **Cloudflare** (`Attention Required!`, HTTP 403): a requisição nem chega à Edge Function. Não é defeito, é uma camada a mais. O caso foi reescrito para afirmar o que importa — que o desfecho nunca é `ok:true` — e o payload do teste de oráculo trocado por um que não é interceptado. |
| **"`fn_set_updated_at` avança sequência e está exposta"** | Bug do meu guarda: ele recortava o corpo da função por número fixo de caracteres e **derramava na função seguinte** do arquivo. `fn_set_updated_at` só tinha o azar de vir logo depois da culpada. Corrigido para recortar pelo rótulo de dollar-quote; o guarda passou a acusar exatamente uma função — a certa. |
| **"O GRANT aberto deixa o anônimo enumerar o schema"** | Verdadeiro que `anon` distingue coluna existente de inexistente em `trabalhadores` — mas **fechar o GRANT não elimina isso, apenas inverte o oráculo** (`42501` para coluna existente, `42703` para inexistente). A enumeração é propriedade do PostgREST, não do GRANT. Retirado da lista: sustentar A-08.02 com esse argumento seria sustentá-lo com um argumento falso. |

---

## 7. Verificação final

| Verificação | Resultado |
|---|---|
| Suíte adversarial nova, no **bench** (com as correções) | **45/45** — 5 casos são exclusivos de produção |
| Suíte adversarial nova, em **produção** (sem as correções) | **34 verdes, 1 vermelho** — o vermelho **é** o A-08.01, aberto |
| Suíte **completa** em produção | **272 testes, 4 falhas** = 3 pré-existentes (`cartas`, §7.1b) + o A-08.01 |
| Regressão introduzida por esta subetapa | **nenhuma** — eram 222/3 antes, são 272/(3+1) agora |
| Controle negativo em cada correção | sim (§2) — motor de cobrança, tabela nova pós-correção, Admin no bucket, planilha legítima aceita |
| `npm run typecheck` | limpo |
| Ataque destrutivo contra produção | **nenhum** — `exigirBench()` recusa por construção; em produção só houve leitura e recusas que escrevem no registro do freio |
| Escrita em produção nesta subetapa | **nenhuma** além das linhas de `tentativas_remessa` que toda recusa gera por desenho |
| Integridade dos 9.186 tokens reais | intacta — nenhum revogado, nenhum reemitido, nenhum disparo feito |
| `get_advisors` (security) | nenhum achado novo: os 2 INFO (`tentativas_*` com RLS e sem policy) são deliberados, e o ERROR de `v_fila_parceiro` é a exceção documentada da ETAPA 07 |
| Fixture do bench | criada na hora e removida no `afterAll` (alvo contido) |

**Sobre a suíte completa no bench: 10 falhas, e nenhuma é regressão.** Todas dizem "expected 0 to be
greater than 0" ou leem `undefined` de uma lista vazia — o bench tem 1 empresa, 1 estabelecimento,
zero remessas e zero cartas, e essas suítes foram escritas contra os dados DEMO de produção. Provado
por controle: `financeiro.spec.ts` + `cobrancas.spec.ts` + **os 5 arquivos adversariais** rodados
juntos no bench dão **103 verdes, 0 vermelhos** — e é justamente o domínio de guias e cobrança que a
correção do A-08.01 poderia ter quebrado.

**Uma peça de infraestrutura foi acrescentada ao bench:** a Edge Function `receber-remessa` não
estava implantada lá, e sem ela a força bruta teria de rodar contra produção — o que travaria um
token DEMO real por 15 minutos e derrubaria `coleta.spec.ts` na execução seguinte. Foi implantada
como cópia da de produção, com `verify_jwt = false` igual, mais a Parte 1 do `sql/22`, que também
faltava.

---

## 8. Recomendações que **não** entraram no `sql/23`

Nenhuma bloqueia o merge; todas ficam registradas para não virarem esquecimento.

1. **Revogar o GRANT de `anon` nas 43 relações herdadas** (§5). Fecha a segunda camada onde hoje só
   há a RLS. Risco: consulta disparada antes da sessão restaurar passa a devolver erro em vez de
   lista vazia — verificar `src/` antes.
2. **Rotina de expurgo para `tentativas_remessa` e `tentativas_checkin`** (§5). Um `pg_cron` diário
   apagando o que passou da janela de 15 minutos.
3. **`auth_leaked_password_protection` continua desativado** — recurso do plano pago; conferido
   nesta sessão, a migração ainda não ocorreu. Mitigação atual mantida (política de senha forte).
4. **`Reply-To` das campanhas em subdomínio sem MX** — pendência herdada, endereçada na 08.14, não
   nesta subetapa.

---

## 9. Parecer

### ✅ RECOMENDO que a superfície da ETAPA 08 seja considerada aprovada no portão, e que `sql/23_hardening_08_12.sql` seja aplicado em produção junto do merge.

**Fundamento:**

1. **A superfície que a etapa construiu resistiu inteira** — token, isolamento entre contadores,
   freio, bucket privado, validação de arquivo por conteúdo, RLS e GRANT das seis tabelas, e a
   garantia central de que o canal público não escreve na base cadastral. As três falhas encontradas
   são **heranças anteriores à etapa**, que a etapa apenas expôs.
2. **As 3 falhas estão corrigidas e provadas no bench**, cada uma com um teste que falhava antes e
   passa depois — e esses testes ficam na suíte como regressão permanente.
3. **Cada correção tem controle negativo medido**: o motor de cobrança continua gerando guia, o app
   continua lendo tabela nova, o Admin continua abrindo a planilha no bucket, a planilha legítima
   continua sendo aceita. Nenhuma é "negar tudo".
4. **A decisão de segurança que estava aberta desde a 08.11 está fechada**, com medição, com o motivo
   pelo qual a solução proposta não resolveria, e com gatilho de reavaliação declarado.
5. **Zero regressão**: a suíte de produção saiu de 222/3 para 272/(3+1), e o único vermelho novo é o
   próprio achado aberto, que fica verde quando o `sql/23` subir.
6. **Nada foi escrito em produção** além do que o desenho do freio já grava a cada recusa.

**Ressalvas que acompanham, e não bloqueiam:**

- **A-08.01 está ABERTO em produção neste momento.** É uma linha de `revoke`, e o dano é operacional
  (numeração de documento), não vazamento de dado. Se preferir fechá-lo antes do merge, é a única
  correção deste relatório que se aplica isolada e sem efeito colateral.
- **A suíte de produção não fica 100% verde** enquanto isso: 3 falhas pré-existentes de `cartas` (que
  são de dados, não de segurança, e já estavam lá antes desta etapa) e o vermelho do A-08.01.
- **O bench recebeu a Edge Function e o `sql/22` Parte 1** — se ele for reciclado, isso se perde.

---

## 10. Parada obrigatória

**Nenhum merge foi executado. Nenhum e-mail foi disparado.** Os 9.186 tokens de produção continuam
com `enviado_em` nulo, e as 4 campanhas continuam sem `eixo` e sem `assunto` — que é a 08.14.

O passo 7 do método e a regra do `CLAUDE.md` são explícitos: mesmo com parecer favorável, **ordenar
o merge, aplicar o `sql/23` em produção e autorizar o disparo da onda 1 são atribuições exclusivas
do Maxwell**. O portão atacou, corrigiu, mediu, decidiu o que lhe foi pedido decidir — e parou.
