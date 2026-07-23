# Orientações — armadilhas já vencidas neste projeto

Compilado dos problemas que **realmente aconteceram** no CRM Sindcom, com a
solução que funcionou e como aplicá-la. O objetivo é não pagar duas vezes pelo
mesmo aprendizado — nem aqui, nem em projetos futuros.

**Regra de manutenção:** sempre que um problema real for resolvido, acrescente
uma entrada aqui no formato **(a) problema · (b) solução · (c) como implantar**.
Só entra o que foi diagnosticado e corrigido de fato — este arquivo é registro de
solução verificada, não de suspeita.

**Índice**
1. [Infraestrutura e deploy](#1-infraestrutura-e-deploy)
2. [Banco de dados (Postgres/Supabase)](#2-banco-de-dados-postgressupabase)
3. [Integrações (n8n, e-mail, Docker)](#3-integrações-n8n-e-mail-docker)
4. [Frontend e React](#4-frontend-e-react)
5. [Ambiente de desenvolvimento (Windows)](#5-ambiente-de-desenvolvimento-windows)
6. [Segurança e credenciais](#6-segurança-e-credenciais)
7. [Método de trabalho](#7-método-de-trabalho)

---

## 1. Infraestrutura e deploy

### 1.1 FTP não passa pela Cloudflare

**(a) Problema.** Conexões FTP para `ftp.isepem.org` / `ftp.sindcompassos.org`
expiravam sem erro claro. Esses nomes resolvem para a Cloudflare, que faz proxy
apenas de HTTP/HTTPS e **não repassa a porta 21**.

**(b) Solução.** Usar o servidor real da hospedagem, não o nome do domínio.

**(c) Como implantar.** Em `.env.deploy`, `FTP_HOST=br998.hostgator.com.br` — o
host aparece na URL do cPanel (`br998.hostgator.com.br:2083`). Regra geral: para
qualquer serviço que não seja HTTP(S), aponte para o host de origem, nunca para
um domínio atrás de CDN.

### 1.2 Erro 451 em uploads FTP sob TLS

**(a) Problema.** Alguns arquivos subiam truncados ou com 0 bytes, com erro
`451` — o pure-ftpd da Hostgator às vezes aborta o **canal de dados** sob TLS.

**(b) Solução.** Manter TLS no canal de **controle** (protege a senha) e deixar o
canal de **dados** em claro. Os assets são públicos (JS/CSS/imagens), então não
há segredo trafegando ali.

**(c) Como implantar.** `curl --ftp-ssl-control -T arquivo --user "$U:$P" ftp://...`
Depois **sempre verifique integridade**: compare o tamanho local com o
`Content-Length` do `curl -I` remoto, arquivo por arquivo. Esperado: 0
divergências.

### 1.3 Servidor fora do ar parecendo erro de deploy

**(a) Problema.** Após um deploy bem-sucedido (FTP OK, 0 divergências), o site
não respondia em 80/443. A tentação é refazer o build e reenviar tudo — o que
não resolve nada e ainda consome tempo.

**(b) Solução.** Distinguir "meu deploy quebrou" de "a hospedagem caiu" com um
teste objetivo antes de agir.

**(c) Como implantar.** Rode este diagnóstico:
- `curl -o /dev/null -w '%{http_code}' https://isepem.org` → **521** significa
  "Cloudflare no ar, servidor de **origem** recusando conexão". É prova de que o
  problema é da hospedagem.
- FTP continua respondendo? Serviços em portas diferentes caem de forma
  independente — FTP no ar com HTTP fora reforça o diagnóstico.
- Os outros domínios da mesma conta também caem? Então é a conta inteira.

Se confirmar: **não refaça build nem deploy** — os arquivos já estão lá. Espere
o restabelecimento e refaça só a verificação HTTP.

### 1.4 Deploy é manual

**(a) Problema.** `git push` para a `main` **não** publica nada. Supor o
contrário faz alguém acreditar que uma correção está no ar quando não está.

**(b) Solução.** Tratar publicação como passo explícito e verificado.

**(c) Como implantar.** Siga `docs/deploy.md` (build → FTP → verificação). A
verificação pós-deploy não é opcional: compare o hash do bundle servido em
produção com o do `dist/` local.
```bash
curl -s https://crm.sindcompassos.org/ | grep -oE '/assets/index-[A-Za-z0-9]+\.js'
ls dist/assets/index-*.js
```
Hashes diferentes = o que está no ar não é o que você acabou de construir.

---

## 2. Banco de dados (Postgres/Supabase)

### 2.1 `least()` ignora NULLs — e cobrou o teto de quem não tinha base

**(a) Problema.** O cálculo da contribuição era
`least(coalesce(salario, piso) * 0.05, 100.00)`. Como `NULL * 0.05` é NULL e
**`least()` ignora NULLs**, `least(NULL, 100.00)` devolve `100.00`. Resultado:
exatamente quem **não tinha base de cálculo** (sem piso na CCT e sem salário
informado) era cobrado no **teto máximo**. Atingiria 14 dos 18 trabalhadores da
base — silenciosamente, sem erro nenhum.

**(b) Solução.** Tornar a ausência de base explícita com `case`, para que NULL se
propague e o motor de cobrança possa pular e reportar.

**(c) Como implantar.**
```sql
case
  when coalesce(v.salario_informado, piso.valor) is null then null
  else least(coalesce(v.salario_informado, piso.valor) * 0.05, 100.00)
end as valor_contribuicao_anual
```
**Regra geral:** `least()`/`greatest()` ignoram NULL; `round()`, `+`, `*` o
propagam. Em qualquer fórmula de **dinheiro**, teste explicitamente o caminho do
dado ausente — e prefira falhar visível a produzir um número plausível.

### 2.2 View com JOIN devolve uma linha por vínculo, não por pessoa

**(a) Problema.** `v_relatorio_convencao` faz join com vínculos, então quem tem
dois vínculos ativos na mesma CCT **aparece duas vezes**. Contar linhas dava
total inflado e divergente dos números da RPC (que usa `select distinct`).

**(b) Solução.** Deduplicar por identidade da entidade antes de qualquer
contagem ou exportação, agregando os campos que variam.

**(c) Como implantar.** No hook/componente, reduza por `trabalhador_id` e
concatene os campos multivalorados:
```ts
const porTrabalhador = new Map<string, Linha & { estabelecimentos: string[] }>();
for (const l of linhas) { /* agrupa, acumulando estabelecimentos */ }
```
E use **a lista deduplicada também na exportação** — ver §4.4. Ao criar uma view
com join, deixe explícito no comentário SQL qual é a granularidade da linha.

### 2.3 `anon` é barrado pelo `revoke`, não pela guarda da função

**(a) Problema.** Testes assertavam a mensagem `"Rotina restrita ao Admin"` para
o usuário anônimo e falhavam. `fn_guarda_job()` só levanta quando
`auth.uid() is not null` — o anônimo nunca chega lá.

**(b) Solução.** Entender que são **duas camadas**: o `revoke ... from public,
anon` (erro `42501`, permissão) barra o anônimo antes de a função rodar; a guarda
interna barra papéis autenticados sem permissão.

**(c) Como implantar.** Em testes, asserte por **classe de erro**, não por texto:
```ts
expect(ehErroRls(erroAnon)).toBe(true);              // anon → 42501
expect(erro.message).toContain('Rotina restrita');   // papel autenticado
```

### 2.4 PostgREST trunca em 1000 linhas sem avisar

**(a) Problema.** Consultas grandes voltam cortadas em 1000 linhas, **sem erro**.
Relatórios e exportações ficam silenciosamente incompletos.

**(b) Solução.** Paginar sempre, com ordenação determinística até o desempate —
sem isso, a fronteira entre páginas repete ou pula registros.

**(c) Como implantar.**
```ts
const TAMANHO = 1000;
for (;;) {
  const { data } = await supabase.from(x).select('*')
    .order('nome').order('id')          // desempate estável
    .range(pagina * TAMANHO, pagina * TAMANHO + TAMANHO - 1);
  todas = todas.concat(data ?? []);
  if ((data?.length ?? 0) < TAMANHO) break;
  pagina++;
}
```

### 2.5 `search_path` mutável em funções

**(a) Problema.** O advisor do Supabase acusava `search_path` mutável em todas as
funções — vetor de sequestro de resolução de nomes.

**(b) Solução.** Fixar o `search_path` em toda função, inclusive nas
`security invoker`.

**(c) Como implantar.** Para cada função nova:
```sql
alter function public.minha_funcao(tipos) set search_path = public, extensions, pg_temp;
```
Confira depois com `get_advisors`. Faz parte do "pronto" de qualquer SQL novo.

### 2.6 Índice único com `coalesce` sobre enum

**(a) Problema.** `create unique index ... (data_ref, coalesce(municipio_id, 0),
coalesce(nivel::text, '__todos__'))` não funcionou como esperado.

**(b) Solução.** Usar **índices parciais** em vez de sentinelas dentro do
`coalesce`.

**(c) Como implantar.**
```sql
create unique index ux_com_nivel on t (data_ref, coalesce(municipio_id,0), nivel)
  where nivel is not null;
-- + um índice complementar para o caso nivel is null
```

### 2.6b View `security_invoker` não nega: ela **zera**

**(a) Problema.** A `v_dash_kpis` é `security_invoker = on`, e a spec do dashboard
afirmava que o Jurídico receberia **erro** ao consultá-la, porque a RLS negaria as
subqueries financeiras. Medido com login real: ele recebe **200 com uma linha**,
onde `guias_em_atraso` e `boletos_inadimplentes` são `0` — não porque não haja
inadimplência, mas porque a RLS filtra `faturas`/`repasses` para ele. Um painel
construído sobre essa premissa exibiria "nenhuma inadimplência" como fato.

**(b) Solução.** Entender que `security_invoker` protege contra **vazamento**, não
contra **leitura enganosa**. Ela some com a linha alheia; ela não levanta exceção.
Widget que depende de tabela fora do acesso do papel não pode ser renderizado —
não adianta esperar a view "dar erro".

**(c) Como implantar.** Antes de montar qualquer tela por papel, meça em vez de
supor — um teste com login real de cada ator, comparando com o Admin:

```ts
const { data: comoAdmin }    = await admin.from('v_dash_kpis').select('*').single();
const { data: comoRestrito, error } = await outro.from('v_dash_kpis').select('*').single();
expect(error).toBeNull();                        // NÃO falha — esse é o ponto
expect(comoRestrito.guias_em_atraso).toBe(0);    // zerado por RLS, não por realidade
```

Cuidado extra com view de **subqueries escalares** (`select (select count…), (select sum…)`):
ela devolve **sempre uma linha**, mesmo para `anon`. Esperar `[]` nesse caso é
esperar a coisa errada — asserte que os **campos** vieram zerados.

### 2.6c Guarda interna não concede permissão — só o `GRANT` concede

**(a) Problema.** `fn_snapshot_dashboard()` tem `fn_guarda_job()` dentro, que
levanta "Rotina restrita ao Admin" para papel autenticado sem permissão. Parecia
suficiente. Mas o `05_hardening.sql` revogou `EXECUTE` de PUBLIC e reconcedeu
**cirurgicamente** — e essa função ficou de fora. O cron continuou funcionando
(roda como `postgres`), então nada acusou o problema; só o botão do frontend
quebrava, com `permission denied for function` (42501).

**(b) Solução.** Tratar as duas camadas como independentes: o `GRANT` **concede**,
a guarda **nega**. Uma nunca substitui a outra. Toda função nova que ganhe botão
no frontend precisa do grant explícito.

**(c) Como implantar.**
```sql
grant execute on function public.fn_x() to authenticated;  -- concede
revoke execute on function public.fn_x() from anon;        -- anon fora
-- a guarda interna (fn_eh/fn_guarda_job) faz o recorte por papel
```
Confira quem realmente pode executar — a lista vazia de `authenticated` é o sinal:
```sql
select proname, array_to_string(proacl, E'\n') from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and proname like 'fn_%';
```
**Regra transferível:** função chamada por cron **e** por botão tem dois caminhos
de permissão distintos. Testar só o cron esconde a metade que o usuário usa.

### 2.6d UPDATE/DELETE barrado por RLS não dá erro — só afeta zero linhas

**(a) Problema.** `configuracoes` e `perfis` têm uma única policy `FOR ALL` com
`USING (fn_eh('admin'))` para escrita (sem policy dedicada de UPDATE para os
demais papéis). A expectativa era que a Secretária tentando editar
`configuracoes` recebesse `42501` como em outras tabelas. Medido: `error: null`,
`data: []`, HTTP 200. A policy `USING` filtra quais linhas o comando **enxerga**
antes de agir — para quem não passa no `USING`, a linha simplesmente não existe
para aquele UPDATE, e "atualizar zero linhas que não existem" não é uma
violação, é um no-op válido.

**(b) Solução.** Nunca inferir sucesso de `error === null` num UPDATE/DELETE
protegido só por `USING` (sem `FOR UPDATE`/`FOR DELETE` dedicada). Sempre
encadear `.select()` e conferir se **alguma linha voltou** — no cliente E na
suíte de teste.

**(c) Como implantar.**
```ts
const { data, error } = await supabase.from('tabela').update({ x: 1 }).eq('id', id).select();
if (error) throw error;
if (!data || data.length === 0) throw new Error('Sem permissão para esta operação.');
```
Em teste: `expect(error).toBeNull(); expect(data).toEqual([])` — não
`expect(ehErroRls(error)).toBe(true)`, que falharia aqui porque não há erro
nenhum. **Regra geral:** é a MESMA família do "200 + zero itens" da leitura
(§3.2/§7.2), agora do lado da escrita — e mais perigosa, porque uma tela sem
essa checagem mostraria "salvo com sucesso" para uma operação que não mudou
nada.

### 2.7 Documentação divergindo do banco

**(a) Problema.** `docs/handoff_02.md` afirmava que as funções `fn_gerar_*` já
existiam. Não existiam — nem no repo, nem no banco. O próprio documento se
contradizia no parágrafo seguinte. Planejar em cima disso teria gerado uma
subetapa inteira com premissa errada.

**(b) Solução.** **O banco é a fonte de verdade**, não a documentação.

**(c) Como implantar.** Antes de planejar qualquer subetapa, confirme o que
existe de fato:
```sql
select routine_name from information_schema.routines
 where routine_schema='public' and routine_name like 'fn_%';
select table_name from information_schema.views where table_schema='public';
```
E confira `src/lib/database.types.ts` — se um objeto não está nos tipos gerados,
provavelmente não está no banco. Outro caso real: `docs/07_filiacao_valores_carta_oposicao.md`
é citado em `sql/01_schema.sql:819` como fonte das regras 5.1–5.3 e **não existe
no repositório**. Mais um caso: `.env.n8n` tinha `SUPABASE_SERVICE_ROLE_KEY`
com valor **placeholder** (`eyJFICTICIO.troque.pela.serviceRoleKey...`, texto
literal dizendo "fictício") em vez do valor real — usá-lo direto quebrou a
autenticação de um nó novo com "Invalid API key" sem aviso nenhum de que a
causa era o arquivo, não o código. **Antes de confiar num `.env*` para uma
credencial que já funciona em produção**, confira contra onde ela realmente
está sendo usada (aqui, outro nó do próprio n8n) — arquivo de exemplo/local
pode ter ficado com valor de rascunho.

---

### 2.6e Tráfego automatizado pesado pode fazer o Cloudflare do Supabase "sumir" — sem 429, sem 503, timeout puro

**(a) Problema.** No meio de uma sessão que já tinha estourado o limite de
`signInWithPassword` (§7.4) e ainda rodou várias suítes de teste + chamadas
MCP em sequência, o app parou de carregar por completo: `RoleGate` ficou
preso em "Carregando…" (ele mesmo depende de `supabase.auth.getSession()` +
leitura de `perfis`). `curl` direto para
`https://<projeto>.supabase.co/rest/v1/` também não voltava — nem erro HTTP,
**timeout puro** (`curl` exit 28, `%{http_code}` = `000`), e até `ping` no IP
resolvido (Cloudflare) não respondia. Outros domínios (google.com,
crm.sindcompassos.org, outro IP da Cloudflare) respondiam normalmente — não
era a internet do computador, era especificamente aquele host.

**(b) Solução.** Reconhecer o padrão como proteção de borda escalando
(rate-limit HTTP primeiro → blackhole de pacotes depois, não é a hospedagem
"caindo"), **não mexer em código** achando que é bug, e esperar. Recuperou
sozinho depois de alguns minutos sem nenhuma ação — confirmado com um
monitor em loop até o endpoint voltar a responder com código HTTP real.

**(c) Como implantar.** Mesmo diagnóstico de "servidor fora do ar" da §1.3,
aplicado a uma API em vez de um site: teste objetivo antes de agir.
```bash
# timeout puro (código 000) num host específico, outros hosts respondendo
# normalmente = proteção de borda daquele projeto, não sua internet nem seu código
curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://<projeto>.supabase.co/rest/v1/" -H "apikey: test"
```
Se confirmar: pare de bater na API (mais tentativas alimentam o mesmo
bloqueio) e espere — um loop de verificação a cada 15–20s até o código HTTP
voltar a ser um número real (200/401/404, não timeout) é suficiente para
saber quando retomar. **Causa raiz provável:** volume de chamadas
automatizadas na mesma sessão (múltiplas rodadas de suíte RLS completa +
chamadas MCP diretas ao banco + reloads de navegador em sequência rápida) —
em sessões de teste intensas, espace as rodadas da suíte completa em vez de
repeti-la várias vezes seguidas "só para conferir".

## 3. Integrações (n8n, e-mail, Docker)

### 3.1 Titan grátis não faz SMTP externo

**(a) Problema.** Envio pelo `smtp.titan.email` falhava com
`535 authentication failed` com **quatro** senhas diferentes. Horas foram gastas
redefinindo senha, procurando o painel certo e testando contas — assumindo
credencial errada.

**(b) Solução.** Não era senha: era **plano**. As caixas `@sindcompassos.org`
estão no Titan **grátis**, onde "Habilite o Titan em outros aplicativos" é
**recurso pago** — aparece na própria lista de upgrade da conta. Nenhuma senha
correta funcionaria. Migramos o envio para `sindcompassos@gmail.com` com **senha
de app**.

**(c) Como implantar.** Antes de caçar senha de SMTP, faça **dois testes baratos**:
1. Sonde o servidor (sem senha) para confirmar host/porta e que ele anuncia
   `AUTH` e `STARTTLS` — se isso falhar, o problema é host/porta, não senha.
2. Verifique se o **plano** da conta libera acesso externo. Em provedores de
   e-mail incluídos em hospedagem (Titan, Zoho grátis etc.), IMAP/SMTP costuma
   ser recurso pago.

Para o Gmail: exige **verificação em 2 etapas** e uma **senha de app**
(`myaccount.google.com/apppasswords`), nunca a senha normal da conta.

> **Bônus de entregabilidade:** enviar *como* `@sindcompassos.org` pelo Gmail
> exigiria incluir o Google no SPF (`v=spf1 include:spf.titan.email ~all` hoje só
> autoriza o Titan). Sem isso, sai com falha de SPF e tende ao spam. Um endereço
> com reputação antiga e consolidada entrega melhor que um domínio novo mal
> configurado.

### 3.2 Header `apikey` sozinho no Supabase executa como `anon`

**(a) Problema.** O workflow buscava dados com `service_role`, retornava
**array vazio** e era marcado como **sucesso**. Nenhum erro em lugar nenhum. Com
o header `apikey` apenas, o PostgREST executa como `anon`, a RLS filtra tudo e a
resposta legítima é `[]`.

**(b) Solução.** Só o header `Authorization: Bearer <chave>` estabelece o papel.

**(c) Como implantar.** Envie **os dois** headers:
```
apikey:        <service_role>
Authorization: Bearer <service_role>
```
Teste comparando as duas formas — a diferença aparece no **corpo**, não no
código HTTP (ambos devolvem 200):
```bash
curl "$URL/rest/v1/minha_view?select=id" -H "apikey: $KEY"                        # []
curl "$URL/rest/v1/minha_view?select=id" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
**Lição transferível:** "status 200 + zero itens" é um modo de falha silencioso.
Em automação, valide a **contagem esperada**, não só a ausência de erro.

### 3.3 Nuvem não alcança `localhost` — inverta o fluxo

**(a) Problema.** O desenho original era o Postgres chamar um webhook do n8n. O
n8n roda self-host em `localhost`, e o Supabase (nuvem) nunca conseguiria
alcançá-lo sem túnel (ngrok) ou port-forwarding — infraestrutura frágil e mais
uma peça para manter.

**(b) Solução.** Inverter: em vez de o banco **empurrar**, o n8n **puxa** por
agendamento, consultando uma view. Só conexões de saída, funciona em qualquer
lugar, e dispensa webhook e token de webhook.

**(c) Como implantar.** Crie a view com o filtro do que falta processar
(ex.: `status = 'previsto' and email_enviado_em is null`) e um Schedule Trigger
no n8n. A idempotência passa a ser da própria consulta: item já processado sai
da fila sozinho. Ver `n8n/README.md`.

### 3.4 Nó Code do n8n processando só o primeiro item

**(a) Problema.** O workflow de e-mail rodava com status **success** mas enviava
**uma única guia por execução**, deixando as demais na fila. O nó Code estava no
modo padrão `runOnceForAllItems`, onde `$input.item` devolve apenas o primeiro
item e o `return` de um objeto único descarta o resto. Passou despercebido por
três sessões porque **todos os testes tinham só uma guia na fila** — com 50
empresas, seria uma guia a cada 15 min, mais de 12 horas para completar o envio.

**(b) Solução.** Usar `runOnceForEachItem` quando o código trata um item por vez.

**(c) Como implantar.** No JSON do nó:
```json
"parameters": { "mode": "runOnceForEachItem", "language": "javaScript", "jsCode": "..." }
```
(Ou manter `runOnceForAllItems` e iterar `$input.all()` devolvendo um array.)
**Teste sempre com pelo menos 2 itens na fila** — com um só, os dois modos se
comportam igual e o defeito fica invisível. Confirme pela contagem: itens de
entrada devem bater com itens processados.

### 3.6 Telegram Trigger nativo exige webhook público — mesmo problema do §3.3

**(a) Problema.** O nó `Telegram Trigger` do n8n registra um webhook
(`setWebhook`) junto à Telegram, o que exige uma URL pública HTTPS. Este n8n
roda self-host em `localhost`, sem túnel — a Telegram nunca conseguiria
alcançá-lo, exatamente o mesmo obstáculo já resolvido para o Postgres (§3.3).

**(b) Solução.** Inverter para *polling*: `Schedule Trigger` + `HTTP Request`
chamando `getUpdates` com `offset` guardado no *workflow static data*, igual
ao padrão já usado para o e-mail das guias — só conexões de saída, funciona
em qualquer host.

**(c) Como implantar.**
```js
// nó Code antes do getUpdates
const staticData = $getWorkflowStaticData('global');
const offset = staticData.lastUpdateId ? staticData.lastUpdateId + 1 : 0;
return [{ json: { offset } }];

// nó Code depois do getUpdates — atualiza o maior update_id visto
staticData.lastUpdateId = maxId;
```
Antes de ativar, confirme que não existe webhook registrado no bot (senão
`getUpdates` falha com `409 Conflict`):
```bash
curl "https://api.telegram.org/bot<token>/getWebhookInfo"   # "url" deve vir ""
curl "https://api.telegram.org/bot<token>/deleteWebhook"    # se tiver, remova
```
**Importante:** só **publicar** o workflow (botão "Publish") ativa o Schedule
Trigger de verdade — testar com "Execute workflow" no editor roda uma vez e
não fixa o offset da mesma forma (uma execução manual repetiu o
processamento das mesmas mensagens antes de o workflow ser publicado; depois
de publicado, o polling ficou estável). Ver `n8n/README.md`.

### 3.7 Bind mount num caminho parecido = dado NÃO persistido (o ponto do `.n8n`)

**(a) Problema.** O `n8n_container` foi criado com
`-v C:\...\_Docker_n8n:/home/node/n8n`, mas o n8n grava tudo em
**`/home/node/.n8n`** — com ponto. O mount existia, o `docker inspect` mostrava
tudo certinho, a pasta no host existia, e **nada dava erro**: o n8n
simplesmente escrevia na camada de escrita do contêiner. Resultado: os 2
workflows de produção e as 3 credenciais (service_role e senha de app do
Gmail) estavam a um `docker rm` de sumir — durante ~4 dias, sem ninguém saber.
Pior: o `n8n/README.md` mandava restaurar as credenciais "com os valores de
`.env.n8n`", mas esse arquivo só tinha **placeholders** (`eyJFICTICIO...`), ou
seja, o runbook de recuperação também não funcionaria.

**(b) Solução.** Nunca confiar que "existe um mount" — **verificar que o dado
que importa está do lado de fora**, comparando o caminho real do arquivo com o
destino do mount.

**(c) Como implantar.** Auditoria de 3 comandos, para qualquer contêiner com
estado:
```bash
docker inspect <ctr> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
docker exec <ctr> ls -la /caminho/do/mount     # esperado: NÃO vazio
docker exec <ctr> ls -la /caminho/real/do/banco # tem que estar DENTRO do mount
```
Mount vazio + banco gordo em outro caminho = dado não persistido. Backup
imediato (não-destrutivo) antes de qualquer coisa:
```bash
docker cp <ctr>:/home/node/.n8n/. C:/caminho/BACKUP/
```
**Para n8n especificamente:** copie a pasta inteira, não só o
`database.sqlite` — o arquivo **`config`** guarda a `encryptionKey` (32
chars), e **sem ela as credenciais do banco não descriptografam**. Valide o
backup abrindo o `.sqlite` e conferindo que `workflow_entity` e
`credentials_entity` têm as linhas esperadas. **Regra transferível:** nomes de
diretório que diferem por um ponto, um plural ou um hífen (`.n8n` × `n8n`,
`data` × `.data`) são a classe de erro mais silenciosa de Docker — o sintoma
só aparece no dia em que você recria o contêiner, quando já é tarde.

### 3.5 Contêineres Docker não se resolvem por nome

**(a) Problema.** Após `docker network connect` numa rede criada depois dos
contêineres, o n8n não resolvia `http://gotenberg:3000` (`bad address`), nem
depois de `docker restart`.

**(b) Solução.** Usar **IP fixo** na rede dedicada.

**(c) Como implantar.**
```bash
docker network create sindcom-net
docker network connect sindcom-net n8n_container
docker run -d --name gotenberg_container --network sindcom-net \
  --ip 172.18.0.10 --restart unless-stopped gotenberg/gotenberg:8
```
Aponte os nós para `http://172.18.0.10:3000` e **documente o IP**, porque recriar
o contêiner sem `--ip` quebra a integração. Teste de dentro do outro contêiner:
`docker exec n8n_container wget -qO- http://172.18.0.10:3000/health`.

---

## 4. Frontend e React

### 4.1 Falta de `key` faz o estado grudar entre entidades

**(a) Problema.** `<DetalheConvencao id={selecionada} />` sem `key`: ao trocar de
CCT, o React reconciliava o **mesmo** componente e o resumo da execução anterior
continuava na tela, agora sob o nome da CCT nova. Num painel que mostra
resultado de reclassificação em massa, isso é informação perigosamente errada.

**(b) Solução.** Dar identidade ao componente para forçar remontagem.

**(c) Como implantar.** `<DetalheConvencao key={selecionada} id={selecionada} />`.
Regra: **todo componente mestre-detalhe que guarda estado interno precisa de
`key` com o id do item selecionado.**

### 4.2 `date` do Postgres é string — `new Date()` erra o dia

**(a) Problema.** `new Date("2026-05-31")` é interpretado como **UTC**; em UTC-3
vira 30/05 às 21h. Comparações de prazo erravam por um dia.

**(b) Solução.** Comparar **string com string**, no formato ISO, sem converter
para `Date`.

**(c) Como implantar.**
```ts
const hoje = new Date().toLocaleDateString('sv-SE'); // "AAAA-MM-DD" local
const prazoEncerrado = dataLimite !== null && dataLimite < hoje;
```
(`sv-SE` é o truque: o locale sueco usa exatamente o formato ISO.) Para exibir,
use um formatador que fatie a string (`formatarDataBR`), não `new Date`.

### 4.3 Delta não é total — e `0` pode ser sucesso

**(a) Problema.** As funções de reclassificação e geração devolvem **quantos
mudaram**, não totais. Uma segunda execução devolve `0, 0` — que é exatamente a
**prova de idempotência**, e não uma falha. Uma UI ingênua mostraria isso como
erro e levaria o operador a "tentar de novo".

**(b) Solução.** Texto explícito para o caso zero, no tom de confirmação.

**(c) Como implantar.**
```tsx
{geradas === 0 && puladas === 0
  ? "Nenhuma alteração — a competência já estava gerada."
  : `${geradas} fatura(s) gerada(s).`}
```
E o inverso também vale: **quem foi pulado precisa aparecer nominalmente**, com o
que fazer para corrigir. Silêncio sobre exclusões é pior que erro — significa
gente deixando de ser cobrada sem ninguém perceber.

### 4.4 Exportação usando dado bruto em vez do dado da tela

**(a) Problema.** A tela mostrava o trabalhador com os dois estabelecimentos
concatenados, mas o CSV exportava só o primeiro — porque usava o campo cru da
view em vez da lista deduplicada. Perda silenciosa, num arquivo que vai para o
RH das empresas.

**(b) Solução.** Exportação e tela consomem **a mesma estrutura já agregada**.

**(c) Como implantar.** Tipe o dado deduplicado uma vez no `api.ts`
(ex.: `TrabalhadorRelatorio = Linha & { estabelecimentos: string[] }`) e faça o
diálogo de exportação receber **essa** lista, não refazer a consulta. Sempre
confira o arquivo gerado, não só a tela.

---

### 4.5 Gráfico de série temporal com meses ausentes

**(a) Problema.** O gráfico de receita mensal montava a série apenas com os meses
que **tinham** competência no banco. Como só havia jan/25, jan/26, jul/26 e
ago/26, o eixo categórico encostou jan/25 em jan/26 como se fossem meses
consecutivos — e a interpolação `type="monotone"` do Recharts desenhou uma rampa
suave de R$ 0 a R$ 2.955 entre eles. O resultado parecia crescimento gradual de
receita ao longo do período. Nada disso aconteceu: foi um salto seco num mês.

**(b) Solução.** Duas correções que andam juntas — preencher os meses ausentes
com zero (eixo temporal regular) e usar reta em vez de spline entre os pontos.

**(c) Como implantar.** Gere a janela de meses por aritmética inteira, sem `Date`
(que traria o deslocamento de fuso da §4.2):

```ts
const [anoFim, mesFim] = ultimaCompetencia.slice(0, 7).split('-').map(Number);
for (let i = 11; i >= 0; i--) {
  const total = anoFim * 12 + (mesFim - 1) - i;            // meses desde o ano 0
  const iso = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
  linha.push({ mes: iso, valor: porMes.get(iso)?.valor ?? 0 });
}
```
E `<Area type="linear">`, nunca `monotone`, para dado financeiro: a spline
**arqueia acima dos pontos reais**, inventando valores que o banco não tem.
Confira a virada de ano imprimindo a janela gerada — dez→jan é onde esse tipo de
cálculo costuma errar.

## 5. Ambiente de desenvolvimento (Windows)

### 5.1 Backticks e crases quebram scripts no shell

**(a) Problema.** Um `node -e "..."` com texto Markdown contendo crases teve
**todo o conteúdo entre crases executado como comando** pelo bash. O arquivo foi
gravado com dezenas de trechos apagados — e o script ainda imprimiu "atualizado".

**(b) Solução.** Não passar texto com formatação por linha de comando.

**(c) Como implantar.** Para editar arquivos com Markdown/código, use as
ferramentas de edição (Edit/Write), que não passam por shell. Se precisar mesmo
de script, escreva-o em **arquivo** (`node script.js`) em vez de `-e`, e
**sempre verifique o resultado** relendo o trecho alterado — a ausência de erro
não prova que o conteúdo está certo.

### 5.1b Markdown volta escapado (`\*\*`) ao passar por editor/ferramenta externa

**(a) Problema.** O `caminho_feliz.md` apareceu na árvore de trabalho com todo o
Markdown **escapado**: `\*\*quando\*\*` no lugar de `**quando**`, `\---` no lugar
de `---`, `## 0\.` no lugar de `## 0.`, e em alguns pontos escape triplo
(`\\\*\\\*Estado\\\*\\\*`). O arquivo cresceu de 337 para 431 linhas só de linhas
em branco duplicadas, e ainda perdeu 2 travessões (`antes de confiar —
orientacoes.md` virou `antes de confiar orientacoes.md`). Renderizado, o
documento mostra as barras invertidas na cara do leitor — o negrito e as regras
horizontais somem. Nada disso dá erro: o arquivo continua sendo Markdown válido,
só ilegível.

**(b) Solução.** Antes de aceitar (ou commitar) um arquivo `.md` que passou por
ferramenta externa, **medir o escape** em vez de olhar por cima — e comparar
conteúdo normalizado contra a versão commitada para decidir entre corrigir e
reverter.

**(c) Como implantar.** Detecção barata, direto no repo:
```bash
grep -oF '\*' arquivo.md | wc -l          # esperado: 0
git show HEAD:arquivo.md | grep -oF '\*' | wc -l
```
Se a working copy tem escapes e o HEAD não, **provar que não há conteúdo novo
antes de descartar** — normalizar os dois (tirar `\`, marcações e espaços) e
diferenciar por palavra:
```js
const norm = s => s.split('\\').join('').replace(/[*`|#>_-]/g,' ')
                   .replace(/\s+/g,' ').trim().toLowerCase();
// nenhuma palavra só na working copy → reverter é seguro
```
Escreva esse script em **arquivo** (`node script.js`), nunca `node -e` — a barra
invertida do próprio padrão é comida pelo shell antes de chegar ao Node (isso
aconteceu ao diagnosticar este caso, é o §5.1 se repetindo um nível acima).
Guarde um `.bak` no scratchpad antes de `git checkout --`, mesmo com a prova na
mão.

### 5.2 Python não está disponível

**(a) Problema.** `python3` / `python` não existem neste ambiente (o alias do
Windows abre a Microsoft Store), quebrando scripts auxiliares.

**(b) Solução.** Usar **Node.js**, que está instalado e é dependência do projeto.

**(c) Como implantar.** Para manipular JSON, prefira `node -e` (texto simples) ou
um `.js` no scratchpad. Confirme antes com `which node`/`which jq` em vez de
supor o que existe.

### 5.3 Caminhos `/tmp` não existem para programas Windows

**(a) Problema.** O bash (Git Bash) enxerga `/tmp`, mas o Node interpretou o
caminho como `C:\tmp` e falhou com `ENOENT`.

**(b) Solução.** Usar caminhos Windows completos para qualquer programa nativo.

**(c) Como implantar.** Use o diretório de scratchpad da sessão com caminho
absoluto (`C:/Users/.../scratchpad/arquivo.json`). Barras normais funcionam.

### 5.4b Acento/travessão vira `�` quando vai como argumento de linha de comando

**(a) Problema.** Testando a Edge Function `formulario-filiacao` com
`curl -d '{"nome_completo":"DEMO — Teste..."}'` (travessão embutido no
argumento), o registro gravou no banco como `"DEMO � Teste..."` — confirmado
tanto por query direta quanto na ficha renderizada no navegador, então não era
artefato de exibição, era corrupção real do dado persistido. `echo "—" | xxd`
isolado devolve os bytes UTF-8 corretos (`e2 80 94`), então o bash em si não é
o culpado — o problema é especificamente quando esse texto vira **argumento de
linha de comando** para um processo nativo (`curl.exe`) no Windows: a
conversão para a codepage do console pelo caminho `CreateProcess` acontece
antes do UTF-8 sobreviver.

**(b) Solução.** Nunca embutir texto com acento/travessão/aspas curvas
diretamente num argumento `-d '...'` de linha de comando. Escrever o payload
num arquivo (com uma ferramenta que preserva UTF-8 de verdade — `Write`, não
heredoc de shell) e mandar o curl ler o arquivo.

**(c) Como implantar.**
```bash
# ERRADO — acento cru no argumento sobrevive ao bash, não ao curl.exe no Windows
curl -d '{"nome":"São José — Filiação"}' https://...

# CERTO — grava em arquivo primeiro (via Write, não aqui), depois --data-binary @arquivo
curl --data-binary "@C:/caminho/absoluto/payload.json" https://...
```
Mesma família do §5.1 (backticks quebrando por irem crus pro shell), aplicada
a um problema de encoding em vez de sintaxe: **qualquer texto não-ASCII ou com
caracteres especiais que precise sobreviver intacto até um processo nativo no
Windows vai por arquivo, nunca por argumento de linha de comando.** Ao
suspeitar de corrupção, confirme em DUAS fontes independentes antes de
investigar (aqui: query SQL direta + tela renderizada) — se só uma mostrasse o
`�`, seria pista de artefato de exibição, não de dado.

### 5.4 Senhas com caracteres especiais em arquivos `.env`

**(a) Problema.** `*`, `!`, `$` e `#` têm significado no shell e podem quebrar
scripts que leem `.env` (globbing, expansão de variável, comentário).

**(b) Solução.** Preferir senhas longas com letras, números, `-` e `_`; e ler o
valor **dentro** do script (Node lendo o arquivo), sem passá-lo pela linha de
comando.

**(c) Como implantar.** Ao gerar senha de máquina, use 16+ caracteres
alfanuméricos. Extraia assim, preservando o valor literal:
```js
const linha = texto.split('\n').find(l => l.trim().startsWith('SMTP_PASS'));
const valor = linha.slice(linha.indexOf('SMTP_PASS') + 'SMTP_PASS'.length).trim();
```

---

## 6. Segurança e credenciais

### 6.1 Prefixo `VITE_` vaza segredo para o navegador

**(a) Problema.** Um arquivo de integração tinha `VITE_SUPABASE_SERVICE_ROLE_KEY`.
O Vite **embute automaticamente** toda variável `VITE_*` no bundle do cliente.
Se esse nome fosse copiado para o `.env` do frontend, a `service_role` iria para
todo visitante do site.

**(b) Solução.** Nunca prefixar segredo com `VITE_`. O prefixo é declaração de
"isto é público".

**(c) Como implantar.** Em arquivos de backend/integração use
`SUPABASE_SERVICE_ROLE_KEY` (sem prefixo). No `.env` do frontend só entram
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Auditoria rápida:
```bash
grep -i "service_role" .env && echo "PERIGO: service_role no .env do frontend"
```

### 6.2 Credenciais em arquivo, nunca no chat

**(a) Problema.** Senhas coladas em conversa ficam no histórico, em logs e em
qualquer backup do transcript — e não há como "despublicar".

**(b) Solução.** Segredos vivem só em arquivos `.env.*` (gitignored). Quem
precisa deles lê do arquivo.

**(c) Como implantar.** O `.gitignore` já cobre `.env.*` com exceção de
`.env.example`. **Confirme antes de commitar**, sempre:
```bash
git check-ignore -v .env.n8n.test     # tem que casar com a regra
git diff --cached | grep -iE "eyJ[A-Za-z0-9_-]{20,}|senha|password"
```
E ao escrever um `.env.example`, use **placeholders óbvios** — nunca um valor
real "só para ilustrar".

### 6.3 Exportar automação sem sanitizar

**(a) Problema.** O JSON do workflow do n8n continha a `service_role` embutida
nos headers dos nós. Commitar isso publicaria a chave no GitHub.

**(b) Solução.** Sanitizar antes de versionar: segredos viram marcadores, e as
credenciais ficam só pelo nome (o valor mora no cofre da ferramenta).

**(c) Como implantar.** Substitua por `<<SUBSTITUIR: NOME_DA_VAR>>` e **verifique
o resultado** antes do commit:
```bash
grep -oE "eyJ[A-Za-z0-9_-]{20,}" n8n/*.json && echo "VAZOU" || echo "limpo"
```
Documente no README como recompor os valores ao restaurar.

### 6.5 Campo de credencial mascarado no n8n devolve texto-isca ao copiar por automação

**(a) Problema.** Ao testar o workflow do agente Telegram, tentou-se reaproveitar
a `service_role` já salva numa credencial do n8n (campo mascarado, exibido como
bolinhas) copiando com `Ctrl+C`/`Ctrl+V` via automação de navegador para outro
nó. O campo de destino recebeu, duas vezes seguidas, um texto completamente
**não relacionado** ao segredo (um trecho do próprio `CLAUDE.md` da sessão, e
depois uma frase genérica) — nunca o valor real. Não era instrução para seguir
(não pedia nenhuma ação), só um resultado de copiar/colar que não é o que
parece.

**(b) Solução.** Interpretar isso como proteção **intencional** contra
exfiltração de segredo por automação: campo mascarado não copia o valor real
por `Ctrl+C`. Nunca tentar de novo supondo que foi falha pontual.

**(c) Como implantar.** Para reaproveitar um segredo já existente em outro
nó/credencial, obtenha o valor de uma fonte que você controla diretamente —
arquivo de config (`.env.n8n`, mas **confira que não é placeholder**, ver
§2.7) ou, na falta de outra fonte, leitura direta do `workflow_entity` no
SQLite do próprio n8n (parâmetro cru de outro nó, nunca de uma credencial) —
e **digite** o valor no campo (`type`), nunca `paste`. Depois de digitar,
confirme o resultado executando o nó (efeito observável — §7.2), não
inspecionando o campo visualmente (evite reprint do segredo em screenshot).

### 6.4 Proteção de senha vazada desativada

**(a) Problema.** `auth_leaked_password_protection` (checagem contra o
HaveIBeenPwned) está **desativado** — é recurso do plano pago do Supabase, e o
projeto roda no Free.

**(b) Solução.** Mitigar com política de senha forte enquanto o plano não muda.

**(c) Como implantar.** Hoje: mínimo de 8 caracteres com maiúsculas, minúsculas,
dígitos e símbolos. **Ao migrar para o plano pago**, ativar em
Authentication → Sign In / Providers → Password e conferir com `get_advisors`.

---

## 7. Método de trabalho

### 7.1 Investigar a causa antes de tratar o sintoma

**(a) Problema.** No caso do SMTP, a hipótese "senha errada" parecia óbvia e
custou horas: redefinição de senha, procura pelo painel certo, tentativas com
várias contas. A causa real (recurso pago) estava visível na lista de upgrade da
própria conta.

**(b) Solução.** Quando a mesma hipótese falha **três vezes seguidas**, ela
provavelmente está errada. Pare e busque evidência que a **refute**, em vez de
tentar a quarta variação.

**(c) Como implantar.** Prefira testes que isolem uma variável:
- mesma senha em **outra conta** (isola conta × senha);
- sonda de protocolo **sem** credencial (isola host/porta × autenticação);
- documentação oficial sobre **limites de plano** (isola configuração × produto).

### 7.1b Teste que fixa contagem quebra quando o dado de demonstração cresce

**(a) Problema.** `rls.spec.ts` assertava `count(parceiros) === 1`. Quando o
parceiro "Caminho Feliz" entrou na base pelo roteiro do `caminho_feliz.md`, a
suíte ficou vermelha — sem que nada tivesse piorado. E a regra do projeto é
justamente que **dado de demonstração fica gravado** (§7.3), então esse tipo de
teste está programado para quebrar de novo.

**(b) Solução.** Assertar o **recorte** que a RLS promete, não a quantidade.

**(c) Como implantar.**
```ts
const total = await count(clientes.admin, 'parceiros');
expect(total).toBeGreaterThan(0);
expect(await count(clientes.presidente, 'parceiros')).toBe(total);  // vê tudo
expect(await count(clientes.parceiro,   'parceiros')).toBe(1);      // vê só o seu
expect(await count(clientes.juridico,   'parceiros')).toBe(0);      // não vê
```
Número absoluto só cabe onde a quantidade é **fixa por definição** (ex.: 5 perfis,
29 municípios de base territorial, 5.570 municípios). Em tabela que cresce com o
uso, número mágico é dívida.

### 7.4 `signInWithPassword` tem cota — logar por teste, não por suíte, estoura ela

**(a) Problema.** `npm run test` (suíte RLS completa) começou a falhar com
`"Request rate limit reached"` em vários arquivos, com nada de errado no
código — era o Supabase Auth barrando novos logins. Causa: dois arquivos de
teste novos (`dashboard.spec.ts`, `configuracoes.spec.ts`) chamavam
`loginComo(papel)` **dentro de cada `it()`**, às vezes duas vezes no mesmo
teste, contra o padrão já estabelecido em `rls.spec.ts` (login uma vez por
papel, no `beforeAll`, cliente reaproveitado). Rodar os arquivos novos sozinhos
algumas vezes durante a sessão (para depurar) mais a suíte inteira depois somou
dezenas de chamadas a `signInWithPassword` na mesma hora e estourou a cota.

**(b) Solução.** Um login por papel por ARQUIVO de teste, não por teste
individual. `signInWithPassword` é a operação cara; reaproveitar o
`SupabaseClient` autenticado entre `it()`s do mesmo arquivo é seguro (a suíte já
roda com `fileParallelism: false`, então não há corrida entre arquivos).

**(c) Como implantar.** Padrão de `rls.spec.ts`, agora também em
`dashboard.spec.ts` e `configuracoes.spec.ts`:
```ts
const PAPEIS: Role[] = ["admin", "presidente", "secretaria", "juridico", "parceiro"];
const clientes: Record<Role, SupabaseClient> = {} as never;

beforeAll(async () => {
  for (const papel of PAPEIS) clientes[papel] = (await loginComo(papel)).client;
}, 60_000);

afterAll(async () => {
  for (const papel of PAPEIS) await clientes[papel]?.auth.signOut();
});
```
Só logar papéis que o arquivo realmente usa — não os 5 por padrão. Se a suíte
voltar a esbarrar na cota mesmo assim, esperar alguns minutos (janela
deslizante) antes de rodar de novo — não adianta re-tentar em loop, o Supabase
Free não expõe um jeito de resetar a cota manualmente.

### 7.1c Testar bot de chat por automação de navegador: confirme o balão, não só o envio

**(a) Problema.** Ao testar o agente Telegram digitando duas mensagens de teste
em sequência rápida via automação de navegador, a segunda mensagem saiu **colada
na primeira** (`"Meu CPF é ...qual meu nível?E o CPF 999.999.999-99?"`), porque
a caixa de texto ainda tinha o rascunho da mensagem anterior quando o novo texto
foi digitado. O teste do "CPF não encontrado" acabou testando o mesmo CPF de
novo (a extração de dígitos pega o primeiro CPF de 11 dígitos do texto) — um
falso positivo que só apareceu ao conferir a resposta do bot.

**(b) Solução.** Nunca considerar uma mensagem de teste "enviada" só porque o
`Enter` foi pressionado. Tirar um screenshot do balão na conversa **antes** de
prosseguir para o próximo passo (rodar o workflow, assumir o resultado etc.).

**(c) Como implantar.** Padrão ao testar qualquer bot de chat:
1. Clique no campo, `Ctrl+A` + `Delete` para garantir que está vazio antes de
   digitar (não confie que o envio anterior limpou o campo).
2. Digite e **screenshot antes do Enter** para conferir o texto exato do rascunho.
3. Envie, e **screenshot depois** para confirmar o balão próprio na conversa.
Mesma família do §7.2 ("passou" ≠ "funcionou"), aplicada ao próprio ato de
gerar o dado de teste, não só de ler o resultado.

### 7.5 Fallback silencioso de rota transforma "tela não construída" em "tela vazia"

**(a) Problema.** As abas "Cartas de oposição" e "Jurídico" apareciam no menu,
respondiam HTTP 200 e abriam sem erro — mostrando "Tela em construção". O
router monta as rotas a partir do `NAV` e usa
`PAGINAS[item.path] ?? <Placeholder titulo={item.label} />`. Como `Placeholder`
é um componente perfeitamente válido, **nada acusava a ausência**: `npm run
build` passava, o `typecheck` passava, a suíte (que testa banco, não tela)
passava, e a navegação renderizava normal. `/juridico` chegou a atravessar as
Etapas 01, 02 e 03 inteiras sem dono — estava especificada em
`specs/frontend.md` §2.2, mas **nenhuma subetapa do `plano_fases.md` a
assumia**. Pior: `homeDoRole()` manda o papel `juridico` direto para lá, então o
único usuário cuja porta de entrada é essa rota via a página de construção como
primeira tela do sistema.

**(b) Solução.** Tratar "rota declarada × página implementada" como um
**inventário conferível**, não como algo que alguém nota clicando. E, ao fechar
etapa, conferir a spec de telas contra o mapa de rotas — não só os itens
listados na subetapa.

**(c) Como implantar.** Roda em segundos e cabe no fecho de qualquer etapa:
```js
const rotasNav  = [...nav.matchAll(/path:\s*"([^"]+)"/g)].map(m => m[1]);
const bloco     = router.slice(router.indexOf('const PAGINAS'), router.indexOf('const PAGINAS_DETALHE'));
const comPagina = [...bloco.matchAll(/"([^"]+)":/g)].map(m => m[1]);
console.log(rotasNav.filter(r => !comPagina.includes(r)));  // esperado: []
```
**Regra transferível:** todo `?? <Fallback/>` que substitui funcionalidade
ausente por algo que renderiza precisa de um teste ou inventário que conte
quantos fallbacks estão ativos. Um default que "nunca quebra" também nunca
avisa. E quando uma spec lista telas, a lista dela é o checklist — a soma das
subetapas pode não cobri-la.

### 7.6 Teste que compara data local com `current_date` do banco quebra à noite

**(a) Problema.** Dois testes verdes há semanas falharam juntos às 23h:
`cobrancas.spec.ts` esperava vencimento `2026-08-21` e recebeu `2026-08-22`, e
`dashboard.spec.ts` não achava o snapshot recém-criado. Nada tinha piorado — o
**banco roda em UTC** (`current_setting('TimeZone')` = `UTC`) e já havia virado
o dia (`current_date` = 2026-07-23), enquanto os testes calculavam "hoje" pelo
relógio local com `toLocaleDateString('sv-SE')` (2026-07-22). Entre 21h e
meia-noite no horário de Brasília (UTC-3), a divergência é de exatamente 1 dia,
todas as noites.

**(b) Solução.** A referência de data precisa ser a **mesma do lado que gerou o
valor**. Se quem calcula é o Postgres (`current_date`, `now()`), o teste usa
UTC; se quem lê é o usuário na tela, aí sim vale o horário local.

**(c) Como implantar.**
```ts
// TESTE comparando contra data calculada pelo BANCO → UTC
const hoje = new Date().toISOString().slice(0, 10);

// FRONTEND comparando contra o que o usuário enxerga → local (§4.2)
const hoje = new Date().toLocaleDateString('sv-SE');
```
Cuidado: isto **não contradiz a §4.2** — são lados opostos da mesma fronteira.
`sv-SE` continua certo no frontend. **Regra transferível:** um teste sensível a
fuso só falha em algumas horas do dia; se algo ficou vermelho "sem motivo" no
fim da noite, compare `current_date` do banco com a data local antes de
investigar o código.

### 7.2 "Passou" não é o mesmo que "funcionou"

**(a) Problema.** Duas vezes um resultado verde escondia falha: o workflow com
status *success* processando **zero itens**, e a fatura gerada "com sucesso" pelo
valor **errado** (o teto).

**(b) Solução.** Verificar **efeito observável**, não ausência de erro.

**(c) Como implantar.** Depois de qualquer operação, confirme no destino:
contagem de itens processados, valor gravado no banco, tamanho do arquivo,
carimbo de data. Nos testes, asserte **números esperados**, não só
`expect(error).toBeNull()`.

### 7.3 Dados de demonstração ficam gravados

**(a) Problema.** Apagar os registros de teste ao fim da sessão faz Maxwell
perder a visão incremental do sistema funcionando.

**(b) Solução.** Manter os dados de demonstração, claramente nomeados.

**(c) Como implantar.** Prefixe com `DEMO —` e um nome que descreva o caso
coberto (ex.: `DEMO — Ouro com carta (não regride, regra 5.2)`). Fixtures de
suíte automatizada são outra coisa: use prefixo da subetapa (`02.6 teste —`) e
remova no `afterAll`. Só apague dado DEMO por reparo técnico ou segurança — e
avise o que foi removido e por quê.
