# Caminho feliz — geração e envio das cobranças

Roteiro de checagem manual dos fluxos de cobrança do CRM Sindcom: o que
acontece, **quando** acontece e **quem** dispara. Escrito para ser seguido com o
cenário de teste "Caminho Feliz", que existe no banco com dados reais e e-mails
que chegam de verdade.

> **Estado em 2026-07-20.** Confira sempre contra o banco antes de confiar —
> `orientacoes.md` §2.7: a fonte de verdade é o banco, não a documentação.

---

## 0. O cenário de teste

| Papel | Registro | Dados que importam |
|---|---|---|
| Titular | **Caminho Feliz - Titular** | Ouro · aprovado · **holerite** · CPF 089.706.866-14 · e-mail `maxwell.mr@hotmail.com` |
| Beneficiado | **Caminho Feliz – Beneficiado** | 1 direto (incluso na mensalidade, não soma valor) |
| Empresa | **Caminho Feliz – Empresa** | CNPJ básico `01234567` |
| Estabelecimento | **Caminho Feliz - Estabelecimento** | **matriz** · e-mail `maxwellbiologo@gmail.com` ← **as guias chegam aqui** |
| CCT | DEMO — CCT Comércio Varejista 2026/2027 | ano-base 2026 · piso R$ 1.518,00 · limite de oposição **31/08/2026** |
| Parceiro | **Caminho Feliz – Parceiro** | 1 benefício · recepcionista **Ricardo** (PIN em `.env.n8n.test`, gitignored) |

**Valores que o sistema deve calcular** (confira sempre que aparecerem):

| Cobrança | Cálculo | Valor esperado |
|---|---|---|
| Contribuição sindical (anual) | 5% do piso, teto R$ 100 | **R$ 75,90** |
| Mensalidade do convênio (mensal) | 1% do salário-base | **R$ 15,18** |

Vencimento de tudo: **data da geração + 30 dias** (`configuracoes.dias_vencimento_boleto`).

---

## 1. Visão geral — quem dispara o quê

| Fluxo | Quando | Quem dispara | Automático? |
|---|---|---|---|
| A · Faturas de contribuição | 1×/ano por CCT, após a organização interna | **Admin** (botão) | Não |
| B · Faturas de mensalidade | 1×/mês | **Admin** (botão) | **Não — ver §7** |
| C · Fatura excepcional | Esporádico (multa, acordo, taxa) | **Admin ou Secretária** (botão) | Não |
| D · Agregação em guias | Após gerar faturas | **Admin** (botão) | Não |
| E · Envio da guia por e-mail | A cada 15 min, se houver guia pendente | **n8n** | **Sim** |
| F · Baixa (recebimento) | Quando a empresa paga | **Admin ou Secretária** (tela) | Não |
| G · Marcação de atraso/inadimplência | Diariamente, madrugada | **pg_cron** | **Sim** |

**Só dois processos rodam sozinhos hoje:** o envio de e-mail (E) e as marcações de
status (G). **Nenhuma cobrança nasce sozinha** — sempre há um humano clicando.
Isso é deliberado: gerar cobrança muda a vida financeira de centenas de pessoas.

---

## 2. Fluxo A — Contribuição sindical (anual, por CCT)

**Quando.** Uma vez por ano, **depois** que o prazo de oposição da CCT encerra e a
organização interna foi executada. É a cobrança de quem **não** entregou carta.

**Quem.** Admin.

### Passo a passo

1. **Convenções** → selecione a CCT → aba **Relatório**.
2. **(Pré-requisito)** No card *Organização interna*, execute a reclassificação.
   O botão só libera com o prazo de oposição **encerrado**.
   - ⚠️ **No cenário atual isso está bloqueado**: o limite da CCT é **31/08/2026**
     e ainda não chegou. A tela explica o motivo. Para testar hoje, pule para o
     passo 3 — o aviso *"Esta CCT ainda não passou pela organização interna"*
     vai aparecer, e é o comportamento correto.
3. No card *Faturas de contribuição sindical*, clique **Gerar faturas**.
4. Confirme no diálogo (ele repete quem será cobrado e o que acontece).

### O que conferir

- **Resumo na tela:** `1 fatura(s) gerada(s)` — o titular é Ouro, e Ouro paga
  contribuição normalmente.
- **Se aparecer alguém em "sem base de cálculo":** é quem não tem piso na CCT para
  a função **nem** salário informado. Não foi cobrado por um valor inventado —
  corrija o cadastro e gere de novo, sem medo de duplicar.
- **Faturas** → filtre por contribuição: valor **R$ 75,90**, competência
  **01/01/2026** (1º de janeiro do ano-base), vencimento **hoje + 30**,
  forma **holerite**.
- **Clique de novo:** deve dizer *"Nenhuma fatura nova — a competência já estava
  gerada."* Isso é **sucesso**, não erro: a idempotência é do banco.

---

## 3. Fluxo B — Mensalidade do convênio (mensal, só Ouro)

**Quando.** Uma vez por mês, idealmente no **dia 1**. É o custeio do convênio.

**Quem.** Admin. **Hoje é manual** — não há cron (§7).

### Passo a passo

1. **Financeiro → Faturas** → botão **Gerar mensalidades**.
2. Escolha a **competência** (o mês corrente vem preenchido).
3. Confirme.

### O que conferir

- **Resumo:** `1 fatura(s) gerada(s)` — só trabalhadores **Ouro** são alvo.
  Prata e Bronze não têm convênio e não aparecem.
- **Valor R$ 15,18** (1% de R$ 1.518). O beneficiado **direto** está incluso e não
  soma; indiretos somariam 0,5% cada e adicionais 1% cada.
- **Competência** sempre no dia 1 do mês, mesmo que você rode no dia 15 — é o que
  garante que rodar duas vezes no mesmo mês não duplique cobrança.
- Reexecutar → `0 geradas`.

---

## 4. Fluxo C — Fatura excepcional (esporádica)

**Quando.** Caso a caso: multa, acordo ou taxa adicional prevista na CCT.

**Quem.** Admin **ou Secretária**.

### Passo a passo

1. **Financeiro → Faturas** → **Nova fatura excepcional**.
2. Escolha trabalhador, tipo, valor, competência, vencimento e forma de cobrança.

### O que conferir

- A fatura aparece na lista e também na ficha do trabalhador.
- **Atenção à forma de cobrança** — ela decide o destino:
  - **holerite** → entra na guia da empresa (Fluxo D) e é cobrada do RH;
  - **boleto_direto** → **nunca** entra em guia; é cobrança pessoal do trabalhador.
- No cenário existe uma fatura de **acordo, R$ 1,00, boleto_direto**, vencimento
  22/07/2026. Ela **não** aparecerá em nenhuma guia — e isso está certo.

---

## 5. Fluxo D — Agregação em guias de pagamento

**Quando.** Depois de gerar faturas, para cobrar as empresas.

**Quem.** Admin.

**O que faz.** Agrupa por empresa todas as faturas **holerite** daquela
competência que ainda não estão em guia, cria a guia (`GP-AAAA-NNNNNN`) e vincula
as faturas.

### Passo a passo

1. **Financeiro → Guias de pagamento** → botão **Gerar guias**.
2. Escolha o **tipo** (mensalidade ou contribuição) e a **competência**.
   - Contribuição sindical é anual: use **janeiro do ano-base** (01/2026).
3. Confirme.

### O que conferir

- **Resumo:** `1 guia(s) criada(s) · 1 fatura(s) vinculada(s)` e o total.
- **Conciliação exata:** abra a guia e confira que o `valor_total` é **igual à
  soma** das faturas listadas. Esse é o critério de aceite da Etapa 02.
- **Vencimento** = geração + 30. **Status** = `previsto`.
- Se aparecer *"fatura(s) fora de guia"*: a guia daquela empresa/competência já
  está **recebida**. Somar faturas novas a um documento já quitado seria errado,
  então elas ficam de fora e são reportadas — cobre à parte ou lance na
  competência seguinte.
- Reexecutar → `0 guias criadas`, e o total permanece o mesmo.

---

## 6. Fluxo E — Envio da guia por e-mail ⚙️ AUTOMÁTICO

**Quando.** A cada **15 minutos**, se houver guia `previsto` ainda não enviada.

**Quem.** **n8n** (workflow *"Sindcom — Guia de pagamento por e-mail"*), rodando
no computador do Maxwell via Docker. Detalhes e runbook: `n8n/README.md`.

### O que acontece, em ordem

1. O n8n consulta `v_repasses_para_email` (guias `previsto` com
   `email_enviado_em` nulo).
2. Monta o HTML da guia — **sem CPF**, de propósito: o dado cru só sai pelo
   export logado.
3. Converte para **PDF** (Gotenberg).
4. Envia por e-mail com o PDF anexado, de `sindcompassos@gmail.com`, com
   **Reply-To** `secretaria@sindcompassos.org`.
5. Marca a guia como **`enviado`** e carimba destinatário e horário.

### Para onde o e-mail vai

Prioriza o e-mail do estabelecimento **matriz**; se não houver, usa qualquer
estabelecimento da empresa com e-mail; se nenhum tiver, cai no **fallback**
`secretaria@sindcompassos.org` para tratamento manual.

> No cenário, a matriz tem `maxwellbiologo@gmail.com` — **a guia chega nesse
> endereço**, com o PDF anexado. É o teste de ponta a ponta com e-mail real.

### O que conferir

- **Caixa de entrada** de `maxwellbiologo@gmail.com`: assunto
  *"Guia de pagamento GP-2026-NNNNNN — Sindcom Passos"*, com PDF anexado.
- **Financeiro → Guias:** o status virou **`enviado`**.
- **Não quer esperar 15 min?** Force o disparo:
  ```bash
  curl -X POST http://localhost:5678/webhook/guia-email-teste
  ```
- **Nada chegou?** Verifique nesta ordem:
  1. Docker está rodando? `docker ps` deve listar `n8n_container` e `gotenberg_container`.
  2. A execução falhou? `GET http://localhost:5678/api/v1/executions`.
  3. A guia continua `previsto`? Então o envio falhou **antes** do carimbo — e
     isso é proposital: o job tenta de novo no próximo ciclo, sem corromper nada.

---

## 7. O que NÃO é automático (e por quê)

**Não existe cron de geração de cobrança.** Os únicos jobs agendados são:

| Job | Horário | O que faz |
|---|---|---|
| `evoluir-solicitacoes` | 03:00 diário | Solicitação vencida → `pendente_confirmacao` |
| `guias-em-atraso` | 03:10 diário | Guia vencida → `em_atraso` |
| `boletos-inadimplentes` | 03:20 diário | Boleto direto vencido → `inadimplente` |
| `snapshot-dashboard` | 04:00 do dia 1 | Fotografia mensal para os gráficos |

Todos apenas **mudam status do que já existe**. Nenhum cria cobrança.

**Decisão (2026-07-20):** manter a geração manual. Cobrar é ato deliberado, e o
clique mensal é o ponto onde um humano confere antes de mexer no bolso de
centenas de pessoas. Se um dia quiser automatizar, os comandos prontos estão
comentados no fim de `sql/10_cobrancas.sql`.

### Ritual mensal sugerido (dia 1)

1. Gerar mensalidades da competência (§3).
2. Gerar guias de mensalidade da mesma competência (§4).
3. Conferir a conciliação de cada guia.
4. Aguardar até 15 min e confirmar que as guias viraram `enviado` (§6).

---

## 8. Fluxo F — Recebimento e baixa

**Quando.** Quando a empresa paga a guia, ou o trabalhador paga o boleto.

**Quem.** Admin ou Secretária.

- **Guia da empresa:** Financeiro → Guias → selecione → avance o status.
  O ciclo é linear: `previsto` → `enviado` → `recebido`, com `em_atraso` como
  desvio possível a partir de `enviado`. Ao marcar `recebido`, a data é carimbada.
- **Fatura individual:** Financeiro → Faturas → marque como paga. Isso grava
  `data_pagamento` e `origem_baixa = manual`. Baixa automática por integração
  bancária é Etapa 04.

### Efeito colateral importante

Fatura `inadimplente` **bloqueia** o trabalhador — contribuição bloqueia os
Direitos Individuais (Prata), mensalidade bloqueia o Convênio (Ouro). Mas
**empresa que atrasa guia nunca bloqueia o trabalhador**: vira alerta estratégico
e cobrança institucional, porque o desconto já saiu do holerite dele.

---

## 9. Ciclo do convênio (contexto — não gera cobrança)

Vale registrar para evitar confusão: **usar um benefício não gera fatura.** Não há
gatilho que transforme atendimento em cobrança — o convênio é custeado pela
mensalidade mensal (§3), independentemente de quanto se usa.

O ciclo é: Secretária cria a solicitação → gera guia A4 com QR → o trabalhador vai
ao parceiro → o recepcionista escaneia e confirma com PIN → status vira
`executada`.

No cenário: parceiro **Caminho Feliz – Parceiro**, recepcionista **Ricardo**. O
**PIN está em `.env.n8n.test`** (gitignored) — regra do projeto: PIN nunca em
texto puro no repositório. No banco ele fica com hash bcrypt, então nem
consultando a tabela se descobre o valor; se perder, redefina pela tela em vez
de tentar recuperar.

---

## 10. Roteiro rápido de verificação ponta a ponta

Para validar tudo de uma vez, com e-mail real chegando:

| # | Ação | Resultado esperado |
|---|---|---|
| 1 | Faturas → **Gerar mensalidades** (mês corrente) | `1 gerada` · R$ 15,18 |
| 2 | Repetir o passo 1 | `0 geradas` — prova de idempotência |
| 3 | Guias → **Gerar guias** (mensalidade, mês corrente) | `1 guia · 1 fatura` · total R$ 15,18 |
| 4 | Abrir a guia | `valor_total` = soma das faturas · venc. +30 · `previsto` |
| 5 | `curl -X POST http://localhost:5678/webhook/guia-email-teste` | execução `success` |
| 6 | Caixa de `maxwellbiologo@gmail.com` | e-mail com PDF anexado |
| 7 | Voltar a Guias | status = **`enviado`** |
| 8 | Marcar a guia como **recebido** | `recebido_em` carimbado |

Se os 8 passos passarem, o motor financeiro está íntegro: cálculo, idempotência,
conciliação, entrega e baixa.

### Validação já executada (2026-07-20)

Os passos 1 a 7 foram rodados de verdade neste cenário, com estes resultados:

| Passo | Resultado |
|---|---|
| Gerar mensalidades (07/2026) | **5 geradas · 1 pulada** — o pulado foi `DEMO — Solicitado pela Denise`, sem base de cálculo, e apareceu nominalmente |
| Repetir | **0 geradas** — idempotência confirmada |
| Gerar guias | **4 guias · 4 faturas · R$ 70,36** — a 5ª fatura ficou de fora por ser `boleto_direto`, como esperado |
| Conciliação | as 4 guias com `valor_total` = soma das faturas · venc. +30 |
| Envio | **4 de 4 enviadas**, fila zerada |
| Guia do cenário | **GP-2026-000012** · R$ 15,18 · entregue em `maxwellbiologo@gmail.com` |

> **Consequência para quem for repetir o roteiro:** a competência 07/2026 **já
> está gerada e enviada**. Refazer os passos agora devolve `0 geradas` e `0 guias`
> — que é o resultado correto, não falha. Para exercitar o caminho completo do
> zero, use uma competência seguinte (08/2026).

**Dois ajustes feitos durante a validação, para você saber:**

1. **Um bug foi encontrado e corrigido.** O nó de código do n8n processava apenas
   a **primeira** guia por execução, apesar de o status ser *success*. Com uma só
   guia na fila — caso de todos os testes anteriores — o defeito era invisível.
   Corrigido para `runOnceForEachItem` e revalidado com 4 guias simultâneas.
   Registrado em `orientacoes.md` §3.4.
2. **E-mails `.demo` foram zerados.** Dois estabelecimentos DEMO tinham endereços
   como `contato@boacompra.demo`; o TLD `.demo` não existe, e o job de 15 min
   tentaria entregar neles, gerando *bounces* que sujam a reputação do remetente
   Gmail. Agora esses estabelecimentos ficam sem e-mail e caem no fallback —
   comportamento correto para "empresa sem e-mail cadastrado". Nenhum dado DEMO
   foi apagado; só o campo de e-mail inválido foi limpo.

---

## 11. Erros comuns e o que significam

| Sintoma | Causa | O que fazer |
|---|---|---|
| `0 geradas` | A competência já foi gerada | **Não é erro.** É a idempotência funcionando. |
| Alguém em "sem base de cálculo" | Sem piso da função na CCT e sem salário no vínculo | Corrija o cadastro e gere de novo. Ninguém é cobrado por estimativa. |
| Botão de organização interna bloqueado | Prazo de oposição não encerrou, ou data não definida | Aguarde o prazo. Rodar antes classificaria como Prata quem ainda pode entregar carta. |
| Fatura não entrou na guia | Ela é `boleto_direto` | Correto: boleto direto é cobrança pessoal, não vai ao RH. |
| "fatura(s) fora de guia" | A guia daquela competência já está `recebida` | Cobre à parte ou lance na competência seguinte. |
| E-mail não chegou | Docker parado, ou falha no envio | `docker ps` · `GET /api/v1/executions`. Guia em `previsto` = ainda não enviada, o job repete. |
| Guia com valor diferente da soma | Não deve acontecer | O total é recalculado a cada execução. Se ocorrer, **pare e investigue** — é falha de conciliação. |
