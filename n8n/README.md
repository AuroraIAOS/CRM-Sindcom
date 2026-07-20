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
2. Recrie as duas credenciais no cofre com os valores de `.env.n8n`.
3. Substitua os `<<SUBSTITUIR: ...>>` dos headers `apikey` pela `service_role`.
4. Confira o IP do Gotenberg nos nós.
5. Teste: `curl -X POST http://localhost:5678/webhook/guia-email-teste` e confira
   em `GET /api/v1/executions` e no banco (`repasses.status`, `email_enviado_em`).
