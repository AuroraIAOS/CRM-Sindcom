> ## ⚠️ LEIA PRIMEIRO — os dados do n8n NÃO estão persistidos fora do contêiner
>
> Descoberto na vistoria de fecho do MVP (2026-07-21). O `n8n_container` foi
> criado com o bind mount em **`/home/node/n8n`**, mas o n8n guarda tudo em
> **`/home/node/.n8n`** (com ponto). O mount está vazio; o
> `database.sqlite` — **os dois workflows e as três credenciais** — vive na
> camada de escrita do contêiner. **Um `docker rm` (ou atualizar a imagem)
> apaga workflows e credenciais.**
>
> **Backup feito em 2026-07-21** (não-destrutivo, já executado):
> `C:\Users\maxwe\GitHub\_Docker_n8n\BACKUP_n8n_2026-07-21\` — contém
> `database.sqlite` **e o arquivo `config`**, que guarda a `encryptionKey`.
> Sem o `config`, o banco até abre, mas as credenciais **não descriptografam**.
> Backup validado: 2 workflows ativos + 3 credenciais legíveis.
>
> **Correção definitiva (pendente — precisa recriar o contêiner, decisão do
> Maxwell):** subir o n8n com o mount no caminho certo, restaurando o backup:
> ```bash
> docker stop n8n_container && docker rename n8n_container n8n_container_old
> docker run -d --name n8n_container --network sindcom-net -p 5678:5678 \
>   -v C:/Users/maxwe/GitHub/_Docker_n8n/dados:/home/node/.n8n \
>   -e EXECUTIONS_DATA_PRUNE=true \
>   -e EXECUTIONS_DATA_MAX_AGE=168 \
>   -e EXECUTIONS_DATA_PRUNE_MAX_COUNT=5000 \
>   --restart unless-stopped n8nio/n8n:latest
> # antes de subir, copie o BACKUP (database.sqlite + config) para .../dados
> ```
> Só remova o `n8n_container_old` depois de confirmar, no n8n novo, que os 2
> workflows e as 3 credenciais estão lá **e funcionando** (§7.2).
>
> As 3 variáveis `EXECUTIONS_DATA_*` acima resolvem, de quebra, o **inchaço do
> histórico**: o agente Telegram faz polling a cada 10s (~3.500 execuções/dia,
> quase todas ciclos vazios) — foram 264 execuções em 1h47 na primeira medição.
> Alternativa (ou complemento) pela UI: *workflow → Settings → "Save successful
> production executions" → **Do not save***, mantendo "Save failed" ligado para
> não perder o rastro de erro. **Tentado em 2026-07-21 e NÃO persistiu** (o
> diálogo fecha, mas `workflow_entity.settings` continua sem
> `saveDataSuccessExecution`, e a contagem seguiu subindo 264 → 308) — se for
> por esse caminho, **confira no banco**, não no diálogo:
> ```sql
> -- dentro do database.sqlite do n8n
> SELECT name, settings FROM workflow_entity WHERE name LIKE '%Agente Telegram%';
> ```
>
> **O `.env.n8n` NÃO serve para restaurar.** Verificado: `SMTP_USER`,
> `SMTP_PASS` e `SUPABASE_SERVICE_ROLE_KEY` são todos **placeholders**
> (`eyJFICTICIO...`), não valores reais. Os valores reais existem apenas
> dentro do cofre do n8n — por isso o backup acima é hoje a única cópia.

# n8n — e-mail das guias de pagamento (Subetapa 02.6)

Workflow que envia a guia de pagamento por e-mail ao RH das empresas, com o PDF
anexado, e marca a guia como `enviado` no banco.

**Nenhuma credencial aqui.** O JSON exportado tem os segredos substituídos por
`<<SUBSTITUIR: ...>>`; os valores reais vivem em `.env.n8n` (gitignored) e no
cofre do próprio n8n.

## Arquitetura: o n8n PUXA, o banco não empurra

O gatilho é um agendamento dentro do n8n (a cada 15 min) que consulta a view
`v_repasses_para_email` (`sql/12_email_guias.sql`). **Não** existe webhook do
Postgres para o n8n — e isso é deliberado: o n8n roda self-host no computador do
Maxwell, em `localhost`, e o Supabase (nuvem) não conseguiria alcançá-lo sem
túnel ou port-forwarding. No modelo de puxar, o n8n só faz conexões de saída e
funciona onde quer que esteja hospedado.

A view só devolve guias `previsto` com `email_enviado_em is null`, então uma guia
já enviada nunca é reenviada — a idempotência é da consulta, não de controle no
n8n.

## Cadeia de nós

1. **A cada 15 min** (agendamento) · **Teste manual (webhook)** — `POST http://localhost:5678/webhook/guia-email-teste`, para disparar sob demanda.
2. **Buscar guias pendentes** — `GET /rest/v1/v_repasses_para_email` como `service_role`.
3. **Montar HTML da guia** — monta o HTML **sem CPF** (o dado cru só sai pelo export logado, `specs/importacao.md` §8) e resolve o destinatário.
4. **Converter para arquivo** → **Gerar PDF (Gotenberg)** — HTML vira PDF.
5. **Enviar e-mail** — SMTP com o PDF anexado.
6. **Marcar como enviado** — `PATCH /rest/v1/repasses`: `status = 'enviado'` + `email_enviado_para` / `email_enviado_em`.

Se qualquer passo falhar, o PATCH final não roda e a guia continua `previsto` —
o job tenta de novo no ciclo seguinte, sem corromper estado.

## Infraestrutura (Docker)

Dois contêineres na rede `sindcom-net`:

```bash
docker network create sindcom-net
docker network connect sindcom-net n8n_container
docker run -d --name gotenberg_container --network sindcom-net \
  --ip 172.18.0.10 --restart unless-stopped gotenberg/gotenberg:8
```

**Por que IP fixo em vez de nome:** neste setup a resolução DNS por nome de
contêiner não funcionou (`docker network connect` depois do contêiner já
existir não propagou o DNS, nem após `docker restart`). Os nós do n8n apontam
para `http://172.18.0.10:3000`. Se recriar o Gotenberg, mantenha o `--ip` ou
atualize os nós.

## Credenciais (cofre do n8n, nunca no JSON)

| Nome | Tipo | Observação |
|---|---|---|
| `Supabase service_role (Sindcom)` | `httpHeaderAuth` | Header **`Authorization: Bearer <service_role>`** |
| `Gmail SMTP (Sindcom)` | `smtp` | `smtp.gmail.com:587`, `secure: false` (STARTTLS), **senha de app** |

**Armadilha do Supabase:** mandar só o header `apikey` **não** basta. O PostgREST
executa a query como `anon`, a RLS filtra tudo e a resposta é um array vazio —
**sem erro**, o que faz o workflow "passar" processando zero itens. Só o
`Authorization: Bearer` estabelece o papel `service_role`. Os nós enviam os dois
headers (o `apikey` fica como parâmetro do nó, por isso é sanitizado no export).

## E-mail: por que Gmail e não o Titan

As caixas `@sindcompassos.org` são Titan (plano **grátis**), e nesse plano o
acesso SMTP externo é **recurso pago** — aparece na lista de upgrade como
"Habilite o Titan em outros aplicativos". Qualquer senha correta ainda assim
falha com `535 authentication failed`. Não perca tempo redefinindo senha do
Titan: o bloqueio é de plano.

O envio usa `sindcompassos@gmail.com` com **senha de app** (exige verificação em
2 etapas na conta Google). Além de funcionar, é o endereço institucional com
reputação consolidada na região há décadas — entrega melhor que um remetente
novo. `Reply-To` aponta para `secretaria@sindcompassos.org`.

> Se um dia quiser enviar **como** `@sindcompassos.org` pelo Gmail, será preciso
> configurar "Enviar como" no Gmail **e** incluir o Google no SPF do domínio,
> hoje `v=spf1 include:spf.titan.email ~all` — sem isso o e-mail sai com falha de
> SPF e tende ao spam.

## Destinatário e fallback

`v_repasses_para_email.email_destino` prioriza o estabelecimento **matriz**
(`matriz_filial = 1`) e cai em qualquer estabelecimento da empresa que tenha
e-mail. Se nenhum tiver, fica `null` e o nó de código usa o fallback
(`EMAIL_FALLBACK_RH`). Isso é esperado: os e-mails de RH vêm dos CSVs da Receita
e podem estar desatualizados (`specs/plano_fases.md` 02.6) — a guia chega na
secretaria para tratamento manual em vez de se perder.

## Como restaurar em outra máquina

1. Suba os contêineres (acima) e importe `guia-email.workflow.json` no n8n.
2. Recrie as duas credenciais no cofre. **Atenção:** o `.env.n8n` do repo tem
   só **placeholders** — os valores reais estão no backup do cofre do n8n
   (ver aviso no topo deste arquivo) ou precisam ser regerados na origem
   (senha de app no Google; `service_role` no painel do Supabase).
3. Substitua os `<<SUBSTITUIR: ...>>` dos headers `apikey` pela `service_role`.
4. Confira o IP do Gotenberg nos nós.
5. Teste: `curl -X POST http://localhost:5678/webhook/guia-email-teste` e confira
   em `GET /api/v1/executions` e no banco (`repasses.status`, `email_enviado_em`).

---

# n8n — Agente Telegram "Arthur" (Subetapa 03.4)

Bot Telegram (`@Sindcom_Arthur_bot`, criado via BotFather) que recebe o CPF do
filiado em texto livre e responde nível de proteção, situação do cadastro e
bloqueios (contribuição sindical / mensalidade do convênio), consultando
`fn_consulta_nivel_bloqueio` (`sql/14_agente_whatsapp.sql`). Workflow:
`Sindcom — Agente Telegram (consulta nível/bloqueio)` (`n8n/agente-telegram.workflow.json`).

**Decisão de escopo (2026-07-21):** canal de teste é **Telegram**, não WhatsApp
— mais rápido de provisionar (BotFather, sem aprovação de BSP). A troca para
WhatsApp fica para quando o n8n for para a VPS (Railway/Oracle Free Tier);
troca-se só o par getUpdates/sendMessage pelo equivalente da API do WhatsApp,
a RPC e a lógica de formatação continuam as mesmas.

## Arquitetura: polling (getUpdates), não webhook — mesma razão do §3.3

O `Telegram Trigger` nativo do n8n registra um **webhook** com a Telegram, o
que exige URL pública HTTPS. Este n8n roda em `localhost` sem túnel — mesmo
problema documentado acima para o Postgres. Solução: **inverter para
polling**, igual ao padrão já estabelecido para o e-mail das guias.

Cadeia de nós:

1. **A cada 10 segundos** (Schedule Trigger).
2. **Montar offset** (Code) — lê `lastUpdateId` do *workflow static data* e
   calcula `offset = lastUpdateId + 1`.
3. **Buscar mensagens (getUpdates)** — `GET api.telegram.org/bot<token>/getUpdates?offset=...&timeout=0`.
4. **Extrair mensagens de texto** (Code, `runOnceForAllItems`, devolve array —
   ver armadilha §3.4) — para cada update: extrai `chat_id`, guarda o maior
   `update_id` visto de volta no static data, e tenta achar 11 dígitos
   consecutivos no texto (regex sobre a string sem não-dígitos) → `cpf`.
5. **CPF no texto?** (IF) — `true`: CPF extraído → RPC. `false`: sem CPF no
   texto → mensagem de ajuda/onboarding.
6. **Consultar fn_consulta_nivel_bloqueio** — `POST /rest/v1/rpc/...` com os
   dois headers `apikey` + `Authorization: Bearer <service_role>` (§3.2 —
   só `apikey` roda como `anon` e devolveria vazio sem erro).
7. **Formatar resposta da consulta** / **Formatar mensagem de ajuda** (Code,
   `runOnceForEachItem`) — monta o texto em PT-BR a partir de
   `encontrado/primeiro_nome/nivel/status_cadastro/bloqueado_*`.
8. **Enviar resposta (sendMessage)** — `POST api.telegram.org/bot<token>/sendMessage`.

A idempotência é do **offset**: `getUpdates` só devolve mensagens com
`update_id` maior que o confirmado, e o static data persiste esse valor entre
execuções do Schedule Trigger. **Publicar (`Publish`) o workflow é o que
ativa o Schedule Trigger de verdade** — testar com "Execute workflow" no
editor roda uma vez só e não confirma o offset da mesma forma; só depois de
publicado o polling ficou estável (sem reenviar mensagem antiga).

## Credencial

| Nome | Tipo | Observação |
|---|---|---|
| `Arthur (Telegram bot token)` | usado como parâmetro cru na URL (`bot<token>`) dos nós `getUpdates`/`sendMessage`, igual ao padrão do `apikey` acima | token vem de `TELEGRAM_HTTP_API` no `.env` |

## Armadilhas específicas deste workflow

- **Testar por automação de navegador (Telegram Web) pode concatenar
  mensagens.** Ao digitar duas mensagens de teste em sequência rápida sem
  confirmar que a caixa de texto esvaziou entre uma e outra, a segunda
  mensagem saiu colada na primeira (`"...qual meu nível?E o CPF 999..."`),
  fazendo o teste do "CPF não encontrado" na real testar o mesmo CPF de novo.
  **Sempre tire um screenshot do balão enviado antes de considerar a mensagem
  de teste válida** — mesma família do "passou não é o mesmo que funcionou"
  (`orientacoes.md` §7.2).
- **Campos de credencial mascarados no n8n não são copiáveis via automação.**
  Tentar `Ctrl+C` num campo de senha/token mascarado (mesmo que a UI pareça
  permitir selecionar) e colar em outro campo devolveu texto completamente
  não relacionado (decoy) duas vezes seguidas — não o segredo real. **Nunca
  confie em copiar/colar de campo mascarado por automação de navegador**:
  extraia o valor de uma fonte confiável (arquivo de configuração, ou —
  quando só existe em outro nó já funcionando — leitura direta do
  `workflow_entity` no SQLite do n8n) e **digite** o valor diretamente no
  campo (não `paste`).

## Como restaurar em outra máquina

1. Confirme que o bot não tem webhook ativo: `GET api.telegram.org/bot<token>/getWebhookInfo`
   deve devolver `"url": ""`. Se tiver, rode `deleteWebhook` antes — senão
   `getUpdates` falha com `409 Conflict`.
2. Importe `n8n/agente-telegram.workflow.json` (Import from file).
3. Substitua os `<<SUBSTITUIR: TELEGRAM_HTTP_API>>` (2 nós: getUpdates e
   sendMessage) e `<<SUBSTITUIR: SUPABASE_SERVICE_ROLE_KEY>>` (2 headers do
   nó Consultar) pelos valores reais.
4. **Publique o workflow** (botão "Publish", não só salvar) — é isso que liga
   o Schedule Trigger de verdade.
5. Teste: mande `/start` e um CPF real pelo Telegram, confira a resposta e o
   `GET .../executions` no n8n.
