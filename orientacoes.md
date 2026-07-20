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
no repositório**.

---

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

### 3.4 Contêineres Docker não se resolvem por nome

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
