# Controle de boletos (taxas e contribuições) — desenho

Data: 2026-10-26 · Revisado no mesmo dia após as respostas do Maxwell · Autor: Claude Code · Etapa proposta: **ETAPA 10**

## 1. O problema

Todo mês o Sindcom pede dados obrigatórios (CNPJ + número de trabalhadores) a empresas de CNAEs
específicos, para gerar boletos de TAF, CA, CN e PAMED no Sicoob. Hoje o controle vive na caixa de
entrada, e o Maxwell perde o fio de sete perguntas: já avisei? respondeu? falta responder? falta fazer
o boleto? falta devolver? falta pagar? pagou?

O CRM **não** integra com o Sicoob (ainda). O boleto continua manual. Esta ferramenta controla as **ações
manuais**, coleta a resposta da empresa por link com token e **calcula o valor** de cada boleto, deixando o
terreno pronto para a futura integração com a API do Sicoob.

## 2. Decisões fechadas (Maxwell, 2026-10-26)

| Decisão | Resultado |
|---|---|
| Granularidade do link | **Um token por caixa de e-mail, permanente entre ciclos.** A caixa tem UM link, enviado uma vez à Brevo e reaproveitado em todos os ciclos. A página lista os CNPJs da caixa que têm ciclo aberto. |
| Vida do token | **Encerrar um ciclo NÃO revoga token.** O token só muda quando uma empresa pede a troca. Nesse caso o CRM avisa, em destaque, que o contato também precisa ser atualizado **manualmente** na Brevo (a API da Brevo não edita dado de contato). |
| Monitoramento | A view de acompanhamento mostra **quantos CNPJs cada token carrega e quantos já responderam** (por ciclo), para saber quais caixas entregaram 100% — mesma ideia da cobertura das campanhas. |
| Tipos por ciclo | **Um tipo de boleto por ciclo** (TAF, CA, CN ou PAMED). |
| Valor do boleto | **TAF e PAMED (valor fixo por trabalhador): calculado pelo CRM** = `valor-base da taxa na convenção do estabelecimento × número de trabalhadores informado`; o valor-base é cadastrado na tabela "Taxas" de cada CCT/ACT. **CA e CN: NÃO calculados** — dependem do piso salarial de cada trabalhador, que o CRM não recebe na resposta da empresa; o valor é **digitado pelo operador** (vindo do cálculo feito fora) no próprio boleto. (Correção do Maxwell em 2026-10-26.) |
| Envio dos e-mails | **Mala direta pela Brevo.** O CRM exporta CSV `nome, email, link` por convenção; o envio é fora do CRM. |
| Descadastro | O aviso de boleto **não exclui** quem saiu das campanhas: é cobrança de direito fundada na CCT/ACT, que o Sindcom tem o direito/dever de efetivar por todos os meios. O CRM mostra quem está nessa situação, sem excluir. |
| Quem entra | Só estabelecimentos com situação cadastral **ativa (`02`)**. |
| Papéis | **Admin e Secretaria operam; Presidente só lê; Jurídico e Parceiro não veem.** (Cadastrar valor-base na aba Taxas continua sendo do Admin e do Jurídico, como já é.) |
| Ambiente | Construído e provado no **bench + preview isolado**. Produção só depois da aprovação do Maxwell. |

## 3. Fora de escopo (YAGNI declarado)

Geração do boleto, integração Sicoob/CNAB de retorno, envio de e-mail pelo CRM, edição de contatos na Brevo,
WhatsApp, valor por faixa salarial/percentual (o cálculo é sempre base × quantidade), e qualquer alteração em
`campanhas`, `envios_campanha`, `remessas_dados`, `faturas` e `repasses` (a Etapa 09 está no ar e a 9.2 em
andamento; `faturas`/`repasses` são nominais por trabalhador e não modelam contagem por CNPJ).

## 4. Achados que moldaram o desenho (medidos em produção, 2026-10-26, só leitura)

- 27 convenções (CCT e ACT convivem em `convencoes_coletivas`, distinguidas só pelo nome). **Todo estabelecimento tem convenção.** Filtrar por convenção não exige coluna nova.
- Mercados ativos (CNAE 4711301 hiper + 4711302 super): **226**. Cerca de 28 têm ACT própria; o resto está em SindSuper Mercados (178) e SindPass Varejista (34). Aproximadamente **30 não têm e-mail**.
- Minimercados (4712100): 1.252 — fora do escopo inicial, mas o filtro de CNAE é livre.
- `taxas_convencao` **não tem coluna de tipo** (só `nome` livre), e estava vazia em 2026-10-26. `faturas` e `repasses` também. O Maxwell passou a cadastrar os valores-base na produção a partir de 2026-10-26, **antes** de a coluna de tipo existir — por isso o SQL 33 etiqueta por nome (§5.1).

## 5. Modelo de dados — `sql/33_boletos_10_00.sql`

Todas as tabelas nascem com RLS ligada, policy explícita, `revoke all from anon` e sem
`TRUNCATE/REFERENCES/TRIGGER` para `authenticated` (orientacoes §2.15, §2.16). Toda view com
`security_invoker = on`. Toda função de trigger com `EXECUTE` revogado de `public, anon, authenticated` (§2.17b).
Toda função de trigger é `SECURITY DEFINER` e **não chama outra função** (§2.17).

### 5.1 `taxas_convencao` — duas colunas novas (alteração aditiva)
- `tipo_boleto text` com CHECK `taf|pamed` (nulo = taxa que não entra no cálculo de boleto). **CA e CN ficam de fora de propósito:** não são valor fixo × trabalhadores.
- Índice único parcial `(convencao_id, tipo_boleto) where tipo_boleto is not null`: **no máximo uma taxa de cada tipo por convenção**, o que torna a busca do valor-base inequívoca.
- Convenção: `valor` passa a significar, quando `tipo_boleto` está preenchido, o **valor-base por trabalhador**.
- **Etiquetagem do que já foi cadastrado:** ao aplicar o SQL, as taxas cujo `nome` (sem espaços, sem caixa) é `TAF` ou `PAMED` recebem o `tipo_boleto` correspondente — **só quando houver uma única taxa com aquele nome na convenção**. Duplicata não derruba a migração: fica sem etiqueta e é **listada na conferência**, para o Maxwell resolver.

### 5.2 Ciclo
- `ciclos_boleto` — `id, nome, tipo (taf|ca|cn|pamed), referencia (texto livre), prazo_resposta date, data_vencimento date, cnaes text[], observacoes, encerrado_em, created_by, created_at`.
- `ciclo_convencoes (ciclo_id, convencao_id)` — escopo.

### 5.3 Caixa de e-mail e token (a granularidade do link)
- `caixas_boleto` — **uma por e-mail, para sempre**: `id, email unique` (normalizado `lower(btrim())`, CHECK), `ultimo_acesso_em, token_reemitido_em, brevo_atualizada_em, created_at, updated_at`. Sem segredo: lida por Admin, Secretaria e Presidente.
- `tokens_boleto` — **o segredo mora em tabela à parte**, porque a RLS restringe linhas, nunca colunas: `caixa_id pk, token uuid unique default gen_random_uuid(), token_expira_em NOT NULL default now()+730 dias, created_at`. RLS: só Admin e Secretaria leem. **Ninguém escreve direto**: criação pela função de semeadura, troca e renovação por função dedicada. O Presidente lê o acompanhamento, mas nunca o token.
- `ciclo_caixas (ciclo_id, caixa_id, aviso_enviado_em, cobranca_enviada_em)` — o que muda **por ciclo** numa caixa permanente (já avisei? já cobrei?).
- **Troca de token** (`fn_reemitir_token_boleto`): gera token novo, carimba `token_reemitido_em`, grava rastro em `auditoria` **sem o valor do token**, e o link antigo deixa de funcionar na hora. A view acende `brevo_pendente = true` até alguém marcar "Brevo atualizada" (`brevo_atualizada_em >= token_reemitido_em`). A tela mostra um alerta fixo enquanto houver caixa pendente.
- **Renovar validade** (`fn_renovar_token_boleto`): estende `token_expira_em` **sem trocar o token** (não mexe na Brevo). A tela avisa quando faltarem menos de 60 dias.

### 5.4 `boletos` — uma linha por ciclo × estabelecimento
`id, ciclo_id, estabelecimento_id, convencao_id` (**cópia** da convenção no momento da semeadura), `caixa_id` (**cópia** da caixa; nulo = estabelecimento sem e-mail utilizável),
`estado`, `quantidade int` (CHECK 0..99999; 0 é válido), `quantidade_resposta_id`, `valor_base numeric(10,2)` (o valor-base usado, só TAF/PAMED, gravado como evidência do cálculo), `valor numeric(10,2)` (TAF/PAMED: calculado; CA/CN: digitado pelo operador), `vencimento date` (copiado do ciclo, editável por boleto), `numero_boleto text` (nosso número do Sicoob, digitado), `motivo_cancelamento`, e uma data por transição: `dados_recebidos_em, boleto_feito_em, boleto_enviado_em, pago_em`. `unique (ciclo_id, estabelecimento_id)`.

### 5.5 Respostas — imutáveis
- `respostas_boleto` — `id, boleto_id, quantidade, cnpj_confirmado, cnpj_incorreto_obs, origem (link|manual), registrada_por (só manual), ip_origem, user_agent, recebida_em`. Trigger de imutabilidade (como `remessas_dados`). **Reenvio cria resposta nova; vale a última.**
- `tentativas_boleto` — freio por token da Edge Function (5 falhas / 15 min), como `tentativas_remessa`.

## 6. Valor do boleto: calculado (TAF, PAMED) ou digitado (CA, CN)

**TAF e PAMED — calculado.** Trigger `BEFORE INSERT OR UPDATE` em `boletos`: busca em `taxas_convencao` a linha `(convencao_id, tipo_boleto = tipo do ciclo)`. Com valor-base **e** quantidade: `valor_base := base`, `valor := round(base × quantidade, 2)`. O trigger só recalcula quando a quantidade ou a convenção mudam (ou no recálculo em lote); qualquer tentativa de editar `valor` direto num ciclo TAF/PAMED é revertida.

- **Sem valor-base cadastrado (ou sem quantidade): `valor` e `valor_base` ficam NULL.** Nunca recebem valor-padrão nem teto — lição do `least()` de 2026-07 (orientacoes §2.1). A view acende `sem_valor_base` e a tela diz, **nominalmente**, quais convenções estão sem a taxa do tipo (ex.: "ACT X · falta cadastrar a TAF").
- `fn_recalcular_valores_ciclo_boleto(ciclo)` recalcula quem ainda está em `aguardando_dados`/`fazer`: é o botão para o caso comum de o valor-base ser cadastrado **depois** de as respostas chegarem.
- Quantidade 0 gera valor 0,00: a tela mostra "nada a cobrar" e o operador pode **cancelar** o boleto com motivo.

**CA e CN — digitado.** A contribuição depende do piso salarial de cada trabalhador, dado que a empresa não informa (só a quantidade). O CRM **não calcula**: `valor` nasce NULL e o operador digita o valor na tela de Status (coluna editável, GRANT de coluna). A view acende `sem_valor` para quem já respondeu e ainda não tem valor digitado. É o ponto de encaixe da futura integração Sicoob.

**Congelamento (todos os tipos):** em `enviar`, `enviado` e `pago` o `valor` não muda (o boleto emitido no Sicoob não muda por mudança de cadastro). Para corrigir, o operador volta um passo.

## 7. Máquina de estados

`boletos.estado`: `aguardando_dados → fazer → enviar → enviado → pago`, mais `cancelado`. **`atrasado` não é gravado**: a view o deriva (`estado = 'enviado' and vencimento < current_date`, comparado no banco — orientacoes §7.6).

| Sua pergunta | Onde aparece |
|---|---|
| 1. Já avisei? | `ciclo_caixas.aviso_enviado_em` |
| 2. Quem respondeu? | estado ≠ `aguardando_dados` |
| 3. Quem não respondeu? | `aguardando_dados` com aviso enviado (lista da cobrança) |
| 4. Enviou, falta fazer o boleto | tag **fazer** |
| 5. Boleto feito, falta devolver | tag **enviar** |
| 6. Enviado, ainda não pagou | tag **enviado** (vira **atrasado** após o vencimento) |
| 7. Pagou | tag **pago** |

- Resposta aceita só enquanto o boleto está em `aguardando_dados` ou `fazer` **e** o ciclo está aberto (validado por trigger em `respostas_boleto`, vale para link e para lançamento manual). Ao chegar, a resposta grava `quantidade`/`quantidade_resposta_id`, recalcula o valor e move `aguardando_dados → fazer`. Depois do boleto feito, mudar a quantidade exige o operador voltar um passo (fica na `auditoria`).
- As demais transições são **ato do operador**, em lote ou individual, validadas por **trigger** (`BEFORE UPDATE`): só salto de um passo; passo além de `aguardando_dados` exige `quantidade` não nula; `cancelado` exige motivo; voltar um passo limpa a data do passo desfeito. UPDATE direto só nas colunas liberadas por GRANT de coluna (`estado, numero_boleto, vencimento, motivo_cancelamento`).
- Quando uma caixa completa 100% dos CNPJs de um ciclo, o banco grava **uma** notificação (sino) para Admin e Secretaria — não uma por CNPJ.

## 8. Semeadura do ciclo

`fn_semear_ciclo_boleto(ciclo)` (Admin/Secretaria; idempotente — rodar de novo só acrescenta o que faltou): cria um boleto por estabelecimento **ativo (`02`)** nas convenções do ciclo (e nos CNAEs do filtro, se houver); cria a `caixa_boleto` + `token` na primeira vez que o e-mail aparece (**reaproveita a existente nos ciclos seguintes**) e a linha `ciclo_caixas`. Devolve relatório: criados · já existiam · **sem e-mail** · **e-mail malformado (descartado e reportado, nunca semeado em silêncio — regra da 08.13)**.

## 9. Views

- **`v_boletos_status`** — uma linha por boleto: razão social, CNPJ, convenção, estado, `tag` (`atrasado` quando for o caso), `quantidade`, `valor_base`, `valor`, `valor_manual` (CA/CN), `sem_valor_base` (TAF/PAMED), `sem_valor` (CA/CN respondido sem valor digitado), `vencimento`, `situacao_contato` (`sem_email | a_avisar | aviso_enviado | cobranca_enviada | respondeu`), e-mail da caixa.
- **`v_boletos_caixas`** — **uma linha por ciclo × caixa** (a ideia da cobertura das campanhas): `total_cnpj`, `cnpj_respondidos`, `completo`, `aviso_enviado_em`, `cobranca_enviada_em`, `ultimo_acesso_em`, `brevo_pendente`. Contagem por **join pré-agregado, nunca join direto** (orientacoes §2.2). **Sem token.**
- **`v_boletos_links`** — caixa + token em claro + validade + `brevo_pendente` + `expira_em_breve`. Como a base é `tokens_boleto`, só Admin e Secretaria recebem linhas.
- **`v_ciclos_funil`** — contagem por estado/ciclo, caixas avisadas, boletos sem e-mail, boletos sem valor-base (TAF/PAMED) e boletos CA/CN sem valor digitado.

## 10. Telas — grupo **BOLETOS** na sidebar

Rotas: `/boletos` (visão geral), `/boletos/ciclos`, `/boletos/dados`, `/boletos/status`, `/boletos/caixas`. Presidente lê; escrita só Admin e Secretaria.

1. **Visão geral** — o funil do ciclo selecionado respondendo as sete perguntas; alerta fixo se houver caixa com `brevo_pendente`; alerta de convenções sem valor-base.
2. **Ciclos** — criar (tipo, referência, prazo, vencimento, convenções, CNAE), semear, encerrar, recalcular valores. **Exportar lista de e-mails** por convenção, CSV `nome, email, link, convencoes, n_cnpj`, neutralizando fórmula (`lib/csv.ts`, §2.19); modos **aviso** (padrão: só caixas ainda não avisadas **neste ciclo**) e **cobrança** (só caixas com CNPJ em `aguardando_dados`). Depois do download, diálogo **"Marcar estas N caixas como enviadas"**. Bloco **"Sem e-mail — contato manual"**.
3. **Dados recebidos** — o que cada empresa informou, com **CNPJ respondidos / total por caixa** e filtro "só caixas 100% completas". Ação **"Registrar resposta manualmente"** (telefone/WhatsApp).
4. **Status de boleto** — por boleto, tags (**fazer, enviar, enviado, pago, atrasado**), **valor a cobrar**, filtros (ciclo, convenção, estado), **valor editável nos ciclos CA/CN**, ações em lote ("boleto feito", "boleto devolvido", "marcar pago"), exportação CSV.
5. **Caixas de e-mail** — o link de cada caixa, validade, **"Trocar link"** (com o alerta: *atualize o contato na Brevo*), **"Brevo atualizada"**, **"Renovar validade"**.
6. **Convenções → aba Taxas** — campo **"Usada para boleto de"** (só TAF e PAMED) e o rótulo "Valor por trabalhador"; painel que mostra se TAF e PAMED estão cadastrados (CA e CN aparecem como "valor digitado por boleto").
7. Notificação no sino quando uma caixa completa.

## 11. Página pública `/responder/:token` + Edge Function `receber-dados-boleto`

Mesmo padrão de `/enviar-dados/:token` + `receber-remessa`: rota fora do `AppShell`, nenhum `supabase-js` na feature. `service_role` só dentro da função, `verify_jwt: false` com freio no corpo (§2.27), recusa como `{ok:false}` HTTP 200 (§2.28), CORS por lista de origens.

- **GET `?token=`** devolve, para cada ciclo **aberto** da caixa, o nome/tipo/rótulo/prazo e os CNPJs (CNPJ, razão social, resposta atual se houver, e se ainda é editável). **Nunca** devolve e-mail, valor do boleto nem dado de trabalhador.
- **POST** grava, por CNPJ: `quantidade` inteira 0..99999 e `cnpj_confirmado` ou `cnpj_incorreto_obs` (texto limitado, sem HTML interpretado).
- **O CNPJ não é editável.** "Está errado" abre um campo de observação. Permitir trocar o CNPJ deixaria qualquer portador de link responder por empresa alheia.
- Rótulos por tipo: **TAF** trabalhadores que irão trabalhar no feriado · **CA** não-opositores (anual) · **CN** não-opositores (mensal) · **PAMED** total de trabalhadores.
- Token inexistente, expirado ou trocado: "Link inválido", sem dizer qual. Caixa sem ciclo aberto: "Nenhuma solicitação aberta no momento".

## 12. Ambiente de teste e caminho até a produção

1. Branch `etapa-10/boletos` a partir de `etapa-09/9.00-descadastro`.
2. SQL 33 aplicado **só no bench** (`ikculjjvvyajhfxifuga`), com mercados, convenções, taxas e e-mails **fictícios** (ou copiados da produção só para leitura de valores-base), prefixo `DEMO —`, removidos ao final da subetapa.
3. Edge Function publicada no bench.
4. Build do front com `.env.bench` e `--base=/preview-boletos/`, enviado por FTP para a subpasta de preview. A origem é a mesma de produção, então o CORS não muda.
5. **Portão adversarial** em `tests/adversarial/07_boletos.spec.ts` (varredura de catálogo, token forjado/expirado/trocado, rate limit, XSS na observação, CSV com fórmula, função exposta como RPC), destrutivo **só com `SINDCOM_ALVO=bench`**.
6. Relatório ao Maxwell e **parada**. SQL em produção, deploy e merge só por ordem dele.

## 13. Testes

`tests/rls/boletos.spec.ts` com login real nos 5 papéis + anon (Admin/Secretaria escrevem; Presidente só lê e **não vê token**; Jurídico e Parceiro recebem vazio; anon barrado no GRANT); máquina de estados (salto inválido recusado; resposta imutável; `atrasado` derivado); **valor** (TAF/PAMED: base × quantidade; sem base → NULL; edição direta de `valor` revertida; CA/CN: valor digitado e nunca calculado; congela após "boleto feito"; recálculo em lote); token permanente (sobrevive a encerrar ciclo; troca invalida o antigo; renovar não troca). Testes de unidade para o gerador do CSV e os rótulos por tipo. Dado criado numa suíte é removido ao fim dela (CLAUDE.md, regra de 2026-09-09).

## 14. Pontos fechados com o Maxwell

Os quatro pontos que estavam em aberto foram respondidos em 2026-10-26 e estão incorporados acima: descadastro **não** exclui (§2); só situação `02` (§2, §8); **valor calculado pelo CRM só para TAF e PAMED; CA e CN digitados** (§6); **encerrar ciclo não revoga token**, com alerta de troca manual na Brevo (§2, §5.3).

Duas escolhas minhas, dentro do que ele deixou aberto, que ele pode corrigir: (a) validade padrão do token de **730 dias**, renovável sem trocar o link; (b) **Secretaria também troca token e exporta links** (opera o ciclo), enquanto o Presidente nunca os vê.
