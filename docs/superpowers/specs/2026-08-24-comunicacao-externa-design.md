# Design — Comunicação externa do Sindcom (campanhas, coleta de dados e Área do Contador v0)

**Data:** 2026-08-24 · **Status:** aprovado por Maxwell · **Origem:** sessão de brainstorming
**Próximo passo:** plano de implementação (skill `writing-plans`)

---

## 1. Contexto e objetivo

O CRM está em produção com a base empresarial completa — 17.300 estabelecimentos e 16.671
empresas, todos vinculados às suas CCTs e ACTs. **O que falta é a outra metade do cadastro: as
pessoas.** Medido em 2026-08-24: `trabalhadores` tem **1 registro** e `vinculos_empregaticios`
tem **zero**.

Sem trabalhadores cadastrados nada do produto opera — não há a quem prestar serviço Prata
(consulta sindical, jurídica), não há a quem oferecer o convênio Ouro, e não há base de cálculo
para o motor de cobrança que já foi construído na Etapa 02.

Este design cobre a campanha de comunicação externa que resolve esse gargalo, com duas
prioridades declaradas:

- **P0 — obter os dados dos trabalhadores** (converte a base de empresas em base de pessoas)
- **P1 — converter Prata em Ouro** (é o que gera faturamento recorrente)

Escopo: e-mail marketing para empresas e contabilidades, o canal de retorno dos dados, e o
rastreio dentro do CRM. Fora de escopo nesta rodada: WhatsApp, agentes automáticos, login de
contador (ver §12).

---

## 2. Público: o que a base revela

Medição de 2026-08-24 sobre `estabelecimentos`:

| | |
|---|---|
| Estabelecimentos | 17.300 (todos com situação cadastral ativa) |
| Com e-mail | 15.679 |
| **Caixas de e-mail únicas** | **9.191** |

O alvo real é **9.191 caixas**, não 17.300 envios. A diferença importa: e-mail compartilhado por
vários estabelecimentos é, quase sempre, o e-mail do **escritório de contabilidade**.

### Concentração — o dado que define a estratégia

| Faixa | Caixas | Estabelecimentos alcançados | % da base |
|---|---|---|---|
| A. 20+ estabelecimentos (contabilidade quase certa) | **89** | 3.758 | **24,0%** |
| B. 5 a 19 | 248 | 2.189 | 14,0% |
| C. 2 a 4 | 613 | 1.491 | 9,5% |
| D. 1 estabelecimento (empresa isolada) | 8.241 | 8.241 | 52,6% |

**89 caixas cobrem um quarto da base. 337 caixas (A+B) cobrem 38%.** Isso cabe na primeira semana
de aquecimento de domínio, e é o que permite fazer o pedido do P0 na semana 1 em vez do mês 2.

### Dois públicos, não um

Decisão de design: **contabilidade e empresa recebem trilhas diferentes.**

- A **contabilidade** quase não tem comerciários próprios. Ela é a **detentora dos dados** de
  dezenas de empresas — um canal, não um destinatário final. Falar de benefícios ao trabalhador
  com ela desperdiça o contato.
- A **empresa isolada** é o destinatário clássico: precisa saber quem é o Sindcom, qual CCT a
  rege, e o que seus funcionários ganham.

Consequência operacional obrigatória: **a lista é montada por CAIXA, nunca por estabelecimento.**
Um contador com 26 estabelecimentos receberia 26 e-mails idênticos se a lista fosse montada por
linha da tabela — marcação como spam garantida logo no aquecimento.

---

## 3. Decisões tomadas (e o motivo de cada uma)

| # | Decisão | Motivo |
|---|---|---|
| D1 | **ESP em subdomínio próprio** (`envios.sindcompassos.org`) | Se a campanha queimar reputação, queima o subdomínio — o e-mail institucional do Titan (contato, presidência, jurídico) continua intacto. Traz descadastro, bounce e métricas prontos |
| D2 | **Zero n8n e zero `pg_cron` para envio** | O n8n ainda não é self-hosted 24/7; depender dele cria falha invisível ("achar que enviou"). O ESP já é serviço 24/7 com agendamento nativo — o envio não precisa de automação nossa |
| D3 | **Canal de retorno: upload por link com token** | O e-mail do eixo Requisição argumenta LGPD; pedir CPF por e-mail comum contradiz o próprio discurso e entrega um contra-argumento pronto ao contador. O token também identifica quem enviou, sem exigir login |
| D4 | **Rastreio dentro do CRM** | "Quais contabilidades ainda não responderam?" precisa ser uma tela, não um cruzamento manual repetido a cada rodada de cobrança |
| D5 | **Modelo de coleta configurável por SQL**, sem tela de edição | Extensível para as próximas coletas (atualização mensal das mensalidades) sem virar um construtor de formulários — que ninguém pediu |
| D6 | **Somente `.xls`/`.xlsx`; CSV bloqueado** | O xlsx preserva tipo e encoding, eliminando as duas fontes de poluição do CSV: separador (`;` vs `,`) e Latin-1 (dor já registrada em `orientacoes.md` §2.11) |
| D7 | **Não pedir a data da carta de oposição** | Exigir de 17.300 estabelecimentos a data de entrega de cada carta derrubaria a taxa de resposta a quase zero. É menos trabalhoso buscar 1 carta quando 1 trabalhador questionar |
| D8 | **Ondas por concentração**, com trilhas distintas | Faz o pedido do P0 na semana 1, com 89 envios — se a copy estiver ruim, descobre-se com 89 e não com 9.000 |

### Consequência aceita da D7

Os trabalhadores marcados como "oposição" entram **sem lastro documental individual**. A tela
`/cartas` — que hoje classifica em 4 situações (entregou→Bronze; sem carta→Prata; Ouro sem carta;
Ouro com carta) — passa a ter um grupo que ela não previa: **Bronze sem carta registrada**.

Decisão consciente de Maxwell: o custo é pequeno perto de matar a taxa de resposta, e a
verificação individual só acontece se houver contestação.

---

## 4. Arquitetura

```
CRM ── exporta CSV segmentado (botão já existe) ──►  ESP (Brevo)
                                                       │
                                              dispara agendado
                                                       │
                                                       ▼
                                            caixa do contador
                                                       │
                                          clica no link com token
                                                       ▼
                                       ┌───────────────────────────┐
                                       │  Página de upload (nova)  │
                                       │  valida no navegador      │
                                       └───────────┬───────────────┘
                                                   │
                                    Edge Function (serverless 24/7)
                                                   │
                                                   ▼
                        CRM: remessas_dados → revisão da Denise → trabalhadores + vínculos
                             cobertura do contador recalculada (§5.5)
```

**Reaproveitado sem alteração:** exportação CSV de qualquer `DataTable`, `parsers.ts`,
`PreviewTable.tsx`, `validarTrabalhadores.ts`, a Edge Function de gravação em lote (500 linhas),
e os triggers de auditoria e `eventos_nivel`.

**Por que Edge Function e não n8n:** Edge Functions são hospedadas pela Supabase e respondem
sempre — não têm o problema de disponibilidade que motivou a decisão D2. O padrão já existe no
projeto (`supabase/functions/formulario-filiacao`).

**`pg_cron` entra depois**, e só para vigilância interna (ex.: marcar "contabilidade sem resposta
há 10 dias" e notificar a Denise). Regra de negócio sobre dados nossos, sem enviar nada para fora.

---

## 5. Modelo de dados

Cinco tabelas novas. As três primeiras são o **primeiro degrau da Área do Contador** — mesma
modelagem, sem login ainda.

### 5.1 `contabilidades`

A entidade que hoje não existe. O vínculo contador↔empresa é implícito no e-mail compartilhado, e
se perde quando a empresa troca de escritório.

```
id uuid pk · nome text not null · email text not null · cnpj text · telefone text
ativa boolean default true · observacoes text · created_at · updated_at
```

### 5.2 `contabilidade_estabelecimentos`

O vínculo, persistido e editável.

```
id uuid pk · contabilidade_id uuid fk not null · estabelecimento_id uuid fk not null
origem text        -- 'agrupamento_email' na carga inicial, 'informado' depois
confirmado boolean default false
unique (contabilidade_id, estabelecimento_id)
```

Semeado a partir do agrupamento por e-mail já medido. A partir daí, quando o contador informar
"essa empresa não é mais minha", o CRM registra em vez de esquecer.

### 5.3 `modelos_coleta`

O que torna a ferramenta reconfigurável (D5) sem virar form builder.

```
id uuid pk · nome text not null      -- "Cadastro sindical 2026"
colunas jsonb not null               -- [{nome, rotulo, obrigatoria, tipo, validacao}]
destino text not null                -- 'trabalhadores'
ativo boolean default true · created_at
```

Criado por `INSERT` em migration, nunca por tela. A próxima coleta custa um insert e uma revisão
de copy — não uma subetapa de frontend.

### 5.4 `campanhas`

```
id uuid pk · nome text not null · eixo text        -- estrutural | informativo | requisicao
onda smallint · assunto text · modelo_coleta_id uuid fk null
agendada_para timestamptz · created_at
```

### 5.5 `envios_campanha`

A linha por destinatário — é o que responde "quem ainda não mandou os dados".

```
id uuid pk · campanha_id uuid fk not null
contabilidade_id uuid fk null · estabelecimento_id uuid fk null
email text not null · token uuid not null default gen_random_uuid()
token_expira_em timestamptz not null default now() + interval '90 days'
token_revogado_em timestamptz null
enviado_em timestamptz · primeira_remessa_em timestamptz · ultima_remessa_em timestamptz
check (contabilidade_id is not null or estabelecimento_id is not null)
```

#### O token é REUTILIZÁVEL — decisão explícita

**O token é identidade da contabilidade, não senha descartável.** O mesmo link serve para quantos
envios o contador precisar fazer. Isso não é conveniência: é o que torna o P0 viável.

O caso que decide: `juridico@contss.com.br` responde por **129 estabelecimentos** e
`rm2091adm@gmail.com` por **114**. Com envio único, o contador teria de preencher as 129 empresas
antes de mandar qualquer coisa — e se parasse no meio, nada chegaria. Quatro razões, então:

1. 129 estabelecimentos não cabem numa sessão de trabalho
2. **Envio parcial vale muito mais que envio nenhum** — 40 de 129 já são 40
3. Correção de erro exige reenvio
4. É a semente da Área do Contador, que por definição é identidade persistente

**O reenvio é seguro por construção:** a política de duplicata de `trabalhadores` casa por CPF,
**ignora existentes e só atualiza dados de contato** (`specs/importacao.md` §5). Reenviar o mesmo
arquivo progressivamente mais completo não duplica ninguém.

Consequência para a orientação ao contador — que vai na copy: **"envie quantas vezes quiser, com
quantas empresas conseguir por vez"**, e não "trabalhe offline até terminar tudo". Ele pode até
repassar o link internamente para a equipe do escritório dividir os clientes.

**Revogação:** `token_revogado_em` permite invalidar e regerar o link de uma contabilidade sem
perder o histórico dela — necessário no dia em que um contador avisar que o link vazou, ou quando
sair da empresa o funcionário que o recebeu.

#### "Respondeu" não é binário — mede-se COBERTURA

Como o envio é parcial por natureza, um campo `respondido_em` esconderia o que importa. O
acompanhamento mede:

```
cobertura = estabelecimentos do contador COM trabalhador vinculado
            ────────────────────────────────────────────────────────
                    total de estabelecimentos do contador
```

A tela da Denise mostra `juridico@contss.com.br — 40 de 129 (31%)`, que é acionável, em vez de um
"respondeu" que esconderia 89 empresas faltando. O follow-up passa a ser **"faltam estas 89"**,
com a lista nominal. `primeira_remessa_em` e `ultima_remessa_em` registram o ritmo.

### 5.6 `remessas_dados`

```
id uuid pk · envio_id uuid fk not null · modelo_coleta_id uuid fk not null
arquivo_path text not null           -- bucket PRIVADO
status text not null default 'recebida'   -- recebida|validada|importada|rejeitada
linhas_recebidas int · linhas_com_erro int · relatorio jsonb
ip_origem inet · user_agent text     -- rastro, ver §6
recebida_em timestamptz default now() · processada_em timestamptz · processada_por uuid fk
```

**Uma linha por upload, e a remessa é imutável.** Correção não altera remessa antiga: cria uma
nova. Isso dá o histórico completo de quem enviou o quê e quando — e é o que permite reconstruir
a origem de qualquer dado da base cadastral.

---

## 6. O canal de retorno e sua segurança

A página de upload é **um endpoint público que recebe dado pessoal** — mesma classe de risco do
check-in por QR. As decisões abaixo aplicam diretamente o que a ETAPA 07 (portão adversarial)
ensinou:

| Decisão | Origem da lição |
|---|---|
| Link por token (`/enviar-dados/:token`), com merge do ESP | Identifica quem enviou sem exigir login, e liga cada remessa à contabilidade certa sozinho |
| **Token com validade (90 dias, renovável)** | O token da guia pública **não expira** — pendência aberta na ETAPA 07. Não repetir o erro numa tabela nova |
| **Rate limit por token** no upload | Mesmo padrão do `fn_registrar_checkin` corrigido: freio no recurso atacado, nunca no dono legítimo |
| Arquivo em **bucket privado**, servido por URL assinada | Planilha com CPF jamais em link público |
| **RLS com policy explícita** nas 5 tabelas, desde a criação | O grant de fábrica do projeto vem aberto demais — medido e corrigido na ETAPA 07 (A-07) |
| Validação no navegador antes do envio | `validarTrabalhadores.ts` valida dígito de CPF e mostra preview: o contador corrige antes de enviar |
| Upload **não grava** direto em `trabalhadores` | Cai em `remessas_dados` para revisão da Denise. **Ninguém de fora escreve na base cadastral sem revisão humana** |
| **IP e user-agent gravados** em cada remessa | O token é reutilizável e de vida longa (§5.5): se houver contestação sobre quem enviou o quê, existe rastro |
| **Token revogável e regerável** (`token_revogado_em`) | Contrapartida obrigatória da reutilização: link vazado ou funcionário que saiu do escritório precisam de desligamento imediato, sem perder o histórico |

Quem abre o link só consegue **enviar**; nunca listar nem ler.

### O risco assumido pela reutilização do token

Token reutilizável e de vida longa é **credencial permanente circulando por e-mail** — e-mail é
encaminhado, funcionário sai do escritório. É uma troca consciente: sem reutilização, o P0 não
acontece (§5.5).

O que fecha o risco a um nível aceitável: o token **não lê nada**, tem validade de 90 dias, é
revogável, deixa rastro de IP, e **nenhuma remessa toca a base cadastral sem aprovação humana**.
O pior caso de um token vazado é alguém submeter uma planilha que a Denise vai revisar e rejeitar
— não é leitura de dado alheio nem escrita direta.

---

## 7. Modelo de coleta v1 — "Cadastro sindical 2026"

Os seis campos pedidos por Maxwell, mapeados contra o template de importação **que já existe**
(`specs/importacao.md` §3.3). Nenhuma alteração em `trabalhadores` é necessária.

| Campo pedido ao contador | Coluna do template | Efeito no CRM |
|---|---|---|
| Estabelecimento (CNPJ) | `cnpj_estabelecimento` | cria o vínculo empregatício e, por ele, a CCT/ACT |
| Nome do trabalhador | `nome` | — |
| CPF | `cpf` | validação de dígito verificador |
| Contato telefônico | `telefone_whatsapp` | — |
| Piso salarial pago | `salario_informado` | base de cálculo dos boletos |
| Status: sindicalizado / oposição | `recolhe_contribuicao` | **define Prata vs. Bronze** |

Mapeamento do status (`nivel` é coluna gerada e não aceita escrita direta):

- **sindicalizado** → `recolhe_contribuicao = true`, `recolhe_mensalidade = false` → **Prata**
- **oposição** → `recolhe_contribuicao = false` → **Bronze**

### O modelo entregue ao contador

O arquivo **não é estático**: é **gerado sob demanda** no navegador, no momento em que o contador
clica em "baixar modelo" dentro da página do token. A página já sabe quem ele é, então monta a
planilha com os dados dele — sem passo de servidor e sem arquivo pré-produzido para manter.

Duas características reduzem erro e atrito:

1. **Pré-preenchido com os estabelecimentos daquele contador.** O token identifica quem é, então
   o download já traz as empresas dele com CNPJ e razão social nas linhas. Ele só completa os
   trabalhadores sob cada CNPJ — o que elimina o erro mais provável, CNPJ digitado errado.
   **A partir da segunda visita, o modelo marca as empresas já cobertas**, para que o contador
   veja de imediato o que falta — decorrência direta do token reutilizável (§5.5).
2. **Colunas de CPF e CNPJ formatadas como texto.** O Excel converte números longos para notação
   científica e **come zeros à esquerda** (`00123456789` → `123456789`) — a mesma dor registrada
   em `orientacoes.md` §2.10. A pré-formatação da célula é a defesa, **e esta segunda só é
   possível por causa da D6**: em CSV não existe formatação de célula.

### Dois caminhos de entrada

- **Planilha** — caminho principal, para quem tem dezenas de trabalhadores e exporta do próprio
  sistema contábil (Domínio, Alterdata, Questor).
- **Formulário na própria página** — para a empresa isolada com 2 ou 3 funcionários, que não vai
  baixar planilha nenhuma. São **8.241 caixas** nessa situação (53% da base): ignorar esse caso
  perderia mais da metade do alcance.

---

## 8. Cronograma: aquecimento e ondas

Domínio novo enviando 300 e-mails no primeiro dia vai para spam e queima o subdomínio.

| Semana | Volume/dia | Público | Alcance acumulado |
|---|---|---|---|
| 1 | 20 → 40 | Onda 1: 89 contabilidades grandes | 3.758 estabs (24%) |
| 2 | 50 → 80 | Onda 2: 248 médias | 5.947 (38%) |
| 3 | 100 → 150 | Onda 3: 613 grupos pequenos | 7.438 (47%) |
| 4–8 | 200 → 300 | Onda 4: 8.241 empresas isoladas | 15.679 (100%) |
| paralelo | — | Follow-up de quem não respondeu | — |

**Duas regras que sustentam o resto:**

- Nunca subir volume com **taxa de rejeição acima de 2%**.
- **Parar e investigar** ao cair em spam, em vez de insistir. Insistir com volume maior só queima
  a base.

Ambos os números são visíveis no painel do ESP.

---

## 9. Estrutura das copies

A copy final não faz parte deste design; ela é escrita depois, e a do eixo Requisição só sai
após a nota técnica jurídica (§10).

**Trilha A — contabilidades (ondas 1–2): um e-mail único e objetivo.**
Quem é o Sindcom + site → base legal do pedido, curta, com âncora para a nota técnica → **os seis
campos** → link com o modelo já preenchido com as empresas dele → prazo → canal humano para dúvida.

Contador não lê newsletter institucional; lê pedido objetivo com prazo e link.

**Trilha B — empresas isoladas (ondas 3–4): três e-mails.**

1. **Estrutural** — site novo, e-mails institucionais, qual CCT rege esta empresa
2. **Informativo** — direitos trabalhistas e sindicais, ações antissindicais vedadas, e o que os
   funcionários ganham (semente do P1/Ouro)
3. **Requisição** — o pedido, com o mesmo link

---

## 10. O ponto jurídico — bloqueante do eixo Requisição

**"Sindicalizado ou oposição" é dado pessoal *sensível*** pela LGPD: filiação a sindicato está
nominalmente na lista do art. 5º, II. Dado sensível não se apoia nas bases comuns do art. 7º —
exige base do **art. 11**, que é mais estreito.

Isso corta para os dois lados:

1. **A favor do Sindcom:** não se está pedindo um dado qualquer, mas o dado necessário ao
   exercício da representação que a Constituição atribui ao sindicato (art. 8º, III) e às
   atribuições da CLT (art. 513). Existe caminho no art. 11 para isso.
2. **Contra a improvisação:** um contador bem informado que responder *"isso é dado sensível,
   qual sua base legal do art. 11?"* precisa receber resposta precisa, citada e assinada pelo
   jurídico. Resposta genérica nesse ponto desmonta a credibilidade do pedido inteiro — e não só
   com aquele contador, porque contadores conversam entre si.

**Encaminhamento:** o jurídico (Adenilson) produz uma **nota técnica de uma página** com a
fundamentação — CF art. 8º; CLT art. 513; LGPD art. 7º e art. 11 com a base específica que ele
entender aplicável —, publicada como **página fixa no site**. Todo e-mail do eixo Requisição
aponta para ela. Assim o argumento é público, estável e assinado por quem tem competência.

O Claude Code pode preparar o **rascunho estruturado** com dispositivos e linha de argumentação
para revisão, o que economiza tempo do jurídico — mas **a validação é dele, não do CODE**.

---

## 11. Ordem de construção

1. **Verificar o site e todos os links** — rápido, não bloqueia nada
2. **Subdomínio + ESP:** criar `envios.sindcompassos.org`, com SPF e DKIM próprios, e **criar o
   registro DMARC, que hoje não existe** — sem isso o aquecimento é desperdício
3. **Assinaturas institucionais** padronizadas — independente, corre em paralelo
4. **Nota técnica jurídica** — bloqueia o eixo Requisição, não os demais
5. **Tabelas + página de upload por token** — bloqueia o eixo Requisição
6. **Semear `contabilidades`** a partir do agrupamento por e-mail já medido
7. **Copies** das trilhas A e B
8. **Onda 1** dispara

Itens 2, 3 e 4 correm em paralelo. **Caminho crítico: 2 → 5 → 8.**

---

## 12. Fora de escopo (YAGNI declarado)

- **Login de contador / Área do Contador completa** — o modelo de dados desta spec é o primeiro
  degrau dela, mas o login exige Edge Function com `service_role` (item já aberto no backlog do
  `CLAUDE.md`). Virá quando a atualização mensal para as mensalidades exigir.
- **Editor de campanhas dentro do CRM** — campanhas nascem por SQL nesta fase.
- **Espelhamento de métricas de abertura/clique no CRM** — o ESP já tem painel; duplicar seria
  trabalho sem dono.
- **WhatsApp, Agente de Resposta Automática e Agente Inteligente 24/7** — visão futura declarada
  por Maxwell, dependem de n8n self-hosted.

---

## 13. Como saberemos que funcionou

**Métrica principal, e é uma só: estabelecimentos com ao menos um trabalhador vinculado.** Hoje
são **zero**. Abertura e clique são diagnóstico, não resultado.

**Métrica de acompanhamento: cobertura por contabilidade** (§5.5) — porque o envio é parcial por
natureza. É ela que dirige o follow-up: `40 de 129` diz o que fazer; "respondeu" não diz nada.

**Gatilho de revisão, não de comemoração:** ao fim da onda 2, ter recebido remessa de **pelo menos
15 das 337 contabilidades** (≈4,5%). Abaixo disso, o problema está na copy ou no argumento
jurídico — e insistir com volume maior só queima base.

Nota sobre o alvo: 15 remessas das contabilidades certas valem muito mais que 15 de empresas
isoladas. Se as três maiores caixas responderem por inteiro — 129 + 114 + a terceira —, isso
sozinho já são centenas de estabelecimentos cobertos. **A meta é de remessas, mas a leitura é de
cobertura.**

---

## 14. Riscos e pendências

| Risco | Mitigação |
|---|---|
| Domínio marcado como spam | Subdomínio separado (D1) + aquecimento gradual + regra de parar acima de 2% de rejeição |
| Contador recusa por LGPD | Nota técnica jurídica pública e assinada (§10) |
| Contador não responde | Follow-up com a tela de acompanhamento (D4); as 89 maiores valem contato telefônico direto |
| Planilha volta com CPF corrompido pelo Excel | Colunas pré-formatadas como texto no modelo (§7) + validação de dígito verificador antes do envio |
| Um contador recebe N e-mails iguais | Lista montada **por caixa**, nunca por estabelecimento (§2) |
| Dado pessoal exposto no canal público | Bucket privado, token com validade, rate limit, sem leitura pela página (§6) |

**Pendência herdada:** `auth_leaked_password_protection` segue desativado (plano Free do
Supabase) — sem relação com esta campanha, mas continua na vigilância do `CLAUDE.md`.
