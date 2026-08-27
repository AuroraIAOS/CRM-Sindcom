# Copies da campanha de coleta — Subetapa 08.14

**Data:** 2026-08-27 · **Etapa 08, Circuito 4** · Spec §9 · Tom conforme `docs/design-tokens.md` §6
**Status:** 3 de 4 prontas para aprovação · **a de Requisição está BLOQUEADA** (§7)

As 4 campanhas já existem em `campanhas`, com `eixo` e `assunto` em branco — é este documento que
os preenche. Os 9.186 `envios_campanha` e os 4 CSVs já existem (08.13); nenhum e-mail foi disparado.

---

## 1. Duas restrições que a medição impôs, e mudaram a copy

Antes de escrever, medi os 4 CSVs que vão para a Brevo. Duas coisas apareceram, e as duas mudam o
texto — não são detalhe de produção.

### (a) Em A, B e C o campo `nome` **é o próprio e-mail**, em 100% das linhas

```
segmento A: 0 de 89 linhas com nome ≠ e-mail
segmento B: 0 de 248
segmento C: 0 de 613
```

Isso é esperado e está documentado na 08.13 (o `contabilidades.nome` ainda é a caixa, até a Denise
renomear escritório por escritório). A consequência para a copy é direta: **`{{ contact.NOME }}` não
pode ser usado em saudação nenhuma da trilha A.** "Olá contabilidadevrmonteiro@gmail.com" é a
assinatura visual de um disparo em massa mal feito — e este é o primeiro e-mail de um remetente
desconhecido, na semana em que a reputação do subdomínio está se formando.

### (b) Em D o campo `nome` é a razão social crua da Receita — e em milhares de linhas ela **contém o CPF**

```
"DULCE TERRA DA SILVA 04181495698"
"GILVANE DONIZETE MACHADO 85844950615"
```

É o formato de razão social do empresário individual na RFB: nome + CPF colados. Usar
`{{ contact.NOME }}` na saudação da trilha B imprimiria **um CPF no corpo de milhares de e-mails**,
em caixa alta, com cara de erro de sistema.

### Decisão: **nenhuma das 4 copies usa `{{ contact.NOME }}`.**

O único campo de mesclagem usado é **`{{ contact.LINK }}`**. Saudação neutra nas quatro. Isso custa
personalização e compra três coisas que valem mais: nenhum e-mail sai com aparência de merge
quebrado, nenhum CPF vai no corpo, e a copy fica idêntica ao que o destinatário esperaria de uma
comunicação institucional.

> **Quando a Denise renomear as contabilidades** (`contabilidades.nome` com o nome real do
> escritório), a trilha A pode ganhar saudação personalizada — e aí vale reemitir os CSVs. Não
> antes: hoje o campo não tem nome nenhum para usar.

---

## 2. Configuração comum às 4 (vale para todas as ondas)

| Item | Valor | Por quê |
|---|---|---|
| **From (nome)** | `Sindicato dos Empregados no Comércio de Passos e Região` | nome por extenso; "Sindcom" sozinho não é reconhecido por quem nunca falou com o sindicato |
| **From (e-mail)** | `secretaria@envios.sindcompassos.org` | subdomínio autenticado na Brevo (SPF+DKIM próprios) |
| **Reply-To** | **`secretaria@sindcompassos.org`** | ⚠️ **correção pendente, ver §6** — `envios.sindcompassos.org` **não tem MX** (medido hoje): resposta enviada para lá volta |
| **Anexo** | **nenhum**, em nenhuma das 4 | anexo em disparo em massa derruba entregabilidade |
| **Mesclagem** | só `{{ contact.LINK }}` | §1 |
| **Descadastro** | obrigatório nas 4, no rodapé | exigência da spec e do ESP |
| **Formato** | HTML simples + versão texto | sem imagem remota, mesma razão da 08.2: o cliente do destinatário bloqueia imagem por padrão |
| **Prazo** | `[[PRAZO]]` | **único campo em branco deste documento** — ver §5 |

---

## 3. TRILHA A — contabilidades (ondas 1, 2 e 3)

**Campanhas:** `Coleta 2026 · Contabilidades grandes (20+)` (89) · `médias (5-19)` (248) ·
`pequenas (2-4)` (613) · **eixo:** `requisicao` · **1 e-mail, não sequência.**

Contador não lê newsletter institucional. Lê pedido objetivo, com prazo e link. Esta copy tem
uma única coisa a pedir e um único lugar para clicar.

### Assunto

> **Sindicato do Comércio de Passos: dados dos trabalhadores — planilha já preenchida com suas empresas**

*Alternativa, se a onda 1 medir abertura baixa:* `Solicitação de dados — Sindicato dos Empregados no Comércio de Passos e Região`

### Pré-cabeçalho (preheader)

> Seis campos por trabalhador. O modelo já vem com o CNPJ das suas empresas preenchido.

### Corpo

---

**Bom dia.**

O **Sindicato dos Empregados no Comércio de Passos e Região** representa os trabalhadores do
comércio em 29 municípios do sudoeste de Minas. Estamos organizando o cadastro da categoria e
precisamos da sua ajuda como contador das empresas da região.

**O que pedimos: seis informações por trabalhador do comércio.**

- CNPJ do estabelecimento
- Nome
- CPF
- Telefone de contato
- Piso salarial pago
- Se é sindicalizado ou se manifestou oposição à contribuição

Nada além disso. Não pedimos endereço, data de nascimento, dados de dependentes nem cópia de
documento.

**Preparamos a planilha para você.**

No link abaixo há um modelo em Excel **já preenchido com o CNPJ e a razão social de cada empresa
sua** que consta na nossa base. Você baixa, completa os funcionários e envia pela mesma página.

👉 **{{ contact.LINK }}**

**Três coisas que facilitam a sua vida:**

1. **Envie quantas vezes quiser.** O link não expira depois do primeiro uso. Se você tem 40
   empresas e hoje consegue fechar 5, mande as 5 — na semana que vem manda o resto. **Envio parcial
   vale muito mais do que envio nenhum**, e a página mostra quais empresas ainda faltam.
2. **Pode repassar o link para a sua equipe.** Se duas pessoas do escritório vão dividir os
   clientes, as duas usam o mesmo endereço.
3. **Não precisa criar conta nem senha.** A página abre direto.

**Prazo:** pedimos o retorno até **[[PRAZO]]**. Se precisar de mais tempo, responda este e-mail
dizendo até quando consegue — combinamos.

**Por que o sindicato pode pedir isso.** A Constituição atribui ao sindicato a defesa dos direitos
da categoria inteira (art. 8º, III), e a CLT lhe dá as prerrogativas de representá-la (art. 513).
Um sindicato que não sabe quem compõe a categoria não consegue negociar piso com base na realidade
salarial nem entregar a quem contribuiu aquilo que a contribuição lhe assegura. A informação sobre
filiação sindical é dado sensível pela LGPD, e a tratamos com base no **art. 11, II, "d"** —
exercício regular de direitos.

**Dúvida? Fale com gente de verdade.**
Responda este e-mail, ou ligue para **(35) 3526-3847** — segunda a sexta, das 08h às 11h e das 13h
às 17h. Quem atende é a secretaria, e ela conhece este pedido.

Obrigado pela atenção.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato de empresas do comércio na base
pública da Receita Federal. [Descadastrar]*

---

### Nota sobre esta copy

**O que ela deliberadamente NÃO faz:** não menciona conduta antissindical, não fala em multa, não
usa prazo com tom de intimação. O enquadramento como infração fica **apenas na Nota Técnica
completa**, e essa é uma orientação do próprio jurídico (`docs/juridico/03_pagina_publica.md`, notas
de implementação). Esta copy convence; não confronta. O contador que se sentir ameaçado no primeiro
contato não responde — e contadores conversam entre si.

**Por que a base legal vem no fim e curta:** quem vai perguntar sobre LGPD é minoria, mas é a
minoria que decide se o pedido é sério. Dois parágrafos citados no rodapé atendem essa pessoa sem
transformar o e-mail num documento jurídico para todas as outras.

---

## 4. TRILHA B — empresas isoladas (onda 4): três e-mails

**Campanha:** `Coleta 2026 · Empresas isoladas` (8.236 caixas) · uma linha por empresa.

O contador é intermediário profissional e entende o pedido de cara. **A empresa isolada, não.** Para
ela, o Sindicato dos Empregados é, na melhor das hipóteses, um desconhecido — e na pior, o outro
lado da mesa. Por isso a trilha B é sequência: o primeiro e-mail apresenta, o segundo entrega valor
antes de pedir qualquer coisa, e só o terceiro pede.

**Intervalo sugerido:** 5 a 7 dias entre um e outro.

---

### B1 — Estrutural · eixo `estrutural`

#### Assunto

> **Sindicato dos Empregados no Comércio de Passos: novos canais de atendimento**

#### Pré-cabeçalho

> Site, e-mails por setor e telefone — para quem precisa falar com o sindicato da categoria.

#### Corpo

---

**Bom dia.**

Escrevemos para nos apresentar. O **Sindicato dos Empregados no Comércio de Passos e Região**
representa os trabalhadores do comércio em 29 municípios do sudoeste de Minas — e a sua empresa
está em uma das categorias que representamos.

Reorganizamos nossos canais de atendimento, e é isso que este e-mail comunica:

**Site:** [sindcompassos.org](https://sindcompassos.org)
Lá estão as convenções coletivas vigentes, os canais de contato e as informações sobre a nossa
atuação.

**E-mails por setor**, para que a sua mensagem chegue direto a quem resolve:

| Assunto | Escreva para |
|---|---|
| Empresas, contribuições, guias e cadastro | **secretaria@sindcompassos.org** |
| Questões jurídicas e trabalhistas | **juridico@sindcompassos.org** |
| Parcerias e convênios | **comercial@sindcompassos.org** |
| Assuntos gerais | **contato@sindcompassos.org** |

**Telefone:** (35) 3526-3847 — segunda a sexta, das 08h às 11h e das 13h às 17h
**Sede:** Av. dos Expedicionários, 137 · Centro · Passos/MG

**Qual convenção coletiva rege a sua empresa?** A resposta depende da atividade principal e do
município, e nós temos essa informação. Escreva para **secretaria@sindcompassos.org** com o CNPJ e
respondemos com a convenção aplicável e as cláusulas vigentes — piso, reajuste e benefícios.

Nos próximos dias enviaremos mais duas mensagens: uma sobre direitos e deveres na relação com a
categoria, e outra com uma solicitação objetiva de cadastro. Se preferir não recebê-las, o
descadastro está no rodapé e é imediato.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da
Receita Federal. [Descadastrar]*

---

> **Por que o B1 anuncia os dois próximos.** Sequência de três e-mails de um remetente desconhecido
> tem uma taxa de marcação como spam muito maior quando o segundo chega sem aviso. Dizer o que vem —
> e oferecer a saída no mesmo parágrafo — troca alguns descadastros por muitas não-marcações. Na
> semana de aquecimento, essa troca é boa: descadastro não machuca reputação, marcação como spam sim.

---

### B2 — Informativo · eixo `informativo`

#### Assunto

> **O que a convenção coletiva garante aos seus funcionários — e o que ela exige da empresa**

#### Pré-cabeçalho

> Piso, contribuições, e as condutas que a lei veda ao empregador na relação sindical.

#### Corpo

---

**Bom dia.**

Este é o segundo dos três e-mails que anunciamos. Ele não pede nada — informa.

**O que a convenção coletiva do comércio garante ao trabalhador**

A convenção coletiva é norma: vale para toda a categoria, filiado ou não. Ela fixa o **piso
salarial** da função, o **reajuste** do período, e cláusulas sobre jornada, adicionais e benefícios.
Pagar abaixo do piso convencional é irregularidade trabalhista, ainda que o salário esteja acima do
mínimo nacional.

**O que o trabalhador que contribui recebe do sindicato**

A contribuição não custeia só a negociação coletiva. Ela assegura a cada trabalhador que a recolheu
um conjunto de direitos individuais:

- **assistência jurídica** em demanda própria
- **homologação de rescisão** e orientação em conflito concreto
- acesso à **rede de convênios e descontos** com estabelecimentos parceiros da região —
  farmácias, clínicas, óticas, escolas e comércio local

Para a empresa isso não é custo: é benefício que o seu funcionário recebe sem sair da folha.

**O que a lei veda ao empregador na relação sindical**

Vale registrar, sem rodeio e sem acusação — a maioria das empresas nunca fez nada disso, e é
justamente por isso que informar é útil:

- **Induzir ou pressionar o trabalhador a se opor à contribuição.** A oposição é ato individual e
  voluntário do trabalhador; partindo do empregador, é conduta antissindical.
- **Reter ou não repassar** a contribuição descontada em folha.
- **Impedir ou dificultar o acesso** do sindicato aos trabalhadores para comunicação da categoria.
- **Tratar de forma desfavorável** o trabalhador por ser filiado.

**Onde consultar a convenção da sua empresa**

Escreva para **secretaria@sindcompassos.org** com o CNPJ, ou ligue para **(35) 3526-3847**. A
convenção aplicável depende da atividade e do município, e respondemos com o documento vigente.

No próximo e-mail faremos uma solicitação objetiva — seis informações sobre os trabalhadores da sua
empresa, com uma página pronta para o envio.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da
Receita Federal. [Descadastrar]*

---

> **A lista de condutas vedadas é o ponto de tensão desta copy.** Ela existe porque a spec pede
> ("ações antissindicais vedadas"), e está escrita com a frase que a desarma no meio dela — *"a
> maioria das empresas nunca fez nada disso"*. Sem essa frase, o parágrafo lê como acusação e o
> e-mail seguinte não é aberto. Com ela, lê como informação — que é o que o eixo se chama.

---

### B3 — Requisição · eixo `requisicao` · ⚠️ **BLOQUEADA, ver §7**

#### Assunto

> **Solicitação de dados dos trabalhadores — seis informações, página pronta para o envio**

#### Pré-cabeçalho

> Formulário direto na página. Sem planilha, sem conta, sem senha.

#### Corpo

---

**Bom dia.**

Este é o terceiro e último e-mail da sequência, e é o que traz o pedido.

**Solicitamos seis informações sobre cada trabalhador do comércio da sua empresa:**

- Nome
- CPF
- Telefone de contato
- Piso salarial pago
- Se é sindicalizado ou se manifestou oposição à contribuição
- (o CNPJ do estabelecimento já vem preenchido)

**A página já está pronta para a sua empresa.** Como você tem um único estabelecimento, não precisa
de planilha: é um formulário na tela, um funcionário por linha.

👉 **{{ contact.LINK }}**

Não é preciso criar conta nem senha, e **o link pode ser usado quantas vezes você quiser** — se hoje
der para cadastrar três funcionários e amanhã o resto, tudo bem.

**Prazo:** pedimos o retorno até **[[PRAZO]]**. Precisando de mais tempo, responda este e-mail.

**Por que o sindicato pode solicitar esses dados**

A Constituição atribui ao sindicato a defesa dos direitos e interesses da categoria inteira
(art. 8º, III), e a CLT lhe dá as prerrogativas de representá-la (art. 513). A informação sobre
filiação sindical é **dado pessoal sensível** pela LGPD (art. 5º, II), e a tratamos com base no
**art. 11, II, "d"** — exercício regular de direitos.

**Não pedimos consentimento do trabalhador por meio da empresa, e isso é deliberado:** consentimento
sobre filiação sindical colhido por quem paga o salário é frágil e pode expor quem trabalha.

A fundamentação completa, assinada pela nossa Assessoria Jurídica, está publicada aqui:
**[Base legal para a solicitação de dados](https://sindcompassos.org/base-legal-dados/)**

**Como protegemos essas informações**

Os dados vão para o nosso sistema interno, com acesso restrito à secretaria e à assessoria jurídica.
Não são vendidos, não são compartilhados com terceiros e não alimentam publicidade. Para exercer
qualquer direito do art. 18 da LGPD, escreva para **juridico@sindcompassos.org**.

**Dúvida? (35) 3526-3847**, segunda a sexta, das 08h às 11h e das 13h às 17h.

Obrigado.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da
Receita Federal. [Descadastrar]*

---

## 5. O único campo em branco: `[[PRAZO]]`

Aparece na trilha A e na B3. Não o preenchi por um motivo prático: **a data depende de quando a onda
for agendada**, e uma data escrita hoje fica velha se o disparo escorregar uma semana. Colocar data
vencida no primeiro contato é pior do que não ter prazo.

**Recomendação:** **20 dias corridos** a partir do disparo da onda, arredondado para uma
sexta-feira. Para a onda 1, se ela sair em 01/09/2026, o prazo seria **sexta, 19/09/2026**.

Por que 20 e não 10: um contador com 129 empresas não fecha em 10 dias, e um prazo que ele já sabe
que não cumpre é um prazo que ele ignora inteiro. Por que não 45: prazo longo demais some da caixa
de entrada e vira "depois eu vejo".

**A mesma data vale para todas as copies de uma mesma onda.** Ondas diferentes têm prazos diferentes.

---

## 6. Correção pendente antes do disparo: o `Reply-To`

**Medido hoje, por consulta DNS:**

```
envios.sindcompassos.org  MX   → (sem registro)
envios.sindcompassos.org  TXT  → brevo-code:6d1f4a345846d8b67350ce3651aa574f
sindcompassos.org         MX   → mx1.titan.email (10), mx2.titan.email (20)
_dmarc.sindcompassos.org  TXT  → v=DMARC1; p=none; rua=mailto:deploycrm@…; adkim=r; aspf=r
```

O subdomínio está verificado na Brevo (o `brevo-code` está lá) mas **não recebe e-mail** — não tem
MX. Toda resposta enviada para um `Reply-To` em `@envios.sindcompassos.org` volta para o contador
com erro de entrega. Numa campanha cuja copy diz "responda este e-mail", isso é grave: quem responde
é justamente o contador engajado.

**Correção — na Brevo, não no DNS:** configurar `Reply-To: secretaria@sindcompassos.org` na campanha.
O domínio organizacional tem MX do Titan e a caixa existe. O DMARC está com `aspf=r`/`adkim=r`
(alinhamento relaxado), então `From` no subdomínio com `Reply-To` no domínio organizacional
**continua alinhando** — não há perda de autenticação.

Acrescentar MX ao subdomínio seria a alternativa, e é pior: criaria uma caixa que ninguém lê.

**Conferência antes da onda 1:** mandar um e-mail de teste da própria Brevo e **responder a ele**,
confirmando que a resposta chega em `secretaria@`. Ler a configuração na tela não prova entrega.

---

## 7. Por que a copy de Requisição ainda NÃO está pronta

**Critério de conclusão da 08.14, no plano:** *"a do eixo Requisição só é dada por pronta quando o
link da nota técnica (08.3) responder 200 dentro do próprio texto."*

**Medido hoje:**

```
https://sindcompassos.org/base-legal-dados/   →  HTTP 404
https://sindcompassos.org/                    →  HTTP 200
https://sindcompassos.org/contato/            →  HTTP 200
https://sindcompassos.org/termos/             →  HTTP 200
```

**A página não está publicada.** O texto existe, revisado e assinado por **Adenilson Antonio Silva,
OAB/MG 96.522** (`docs/juridico/03_pagina_publica.md`), mas a publicação no site é tarefa de
Maxwell, fora do repositório.

**Consequência prática, e ela é dupla:**

1. A copy B3 acima está **escrita e pronta**, mas não pode ser dada por concluída nem disparada — o
   único CTA de credibilidade dela apontaria para um 404, no e-mail que carrega o argumento jurídico.
2. **A trilha A também aponta para a base legal**, embora sem link. Se um contador perguntar "qual a
   base do art. 11?", a resposta hoje não tem endereço público para onde apontar.

**O que destrava:** publicar `docs/juridico/03_pagina_publica.md` em
`https://sindcompassos.org/base-legal-dados/` — removendo antes a seção "Notas de implementação",
que é interna — e confirmar 200. A URL precisa ficar **estável**: ela vai em milhares de e-mails.

**Duas observações que o próprio texto jurídico pede** e valem conferir na publicação:

- **A assinatura com OAB é o que dá valor à página.** Sem ela é texto no site; com ela é posição
  institucional verificável.
- **`http://sindcompassos.org` responde 200 sem redirecionar para HTTPS.** Uma página que trata de
  base legal para tratamento de dados pessoais não deveria ser servível em texto claro.

---

## 8. Checklist de aprovação

- [ ] **Trilha A** aprovada por Maxwell
- [ ] **B1 — Estrutural** aprovada
- [ ] **B2 — Informativo** aprovada (atenção especial ao bloco de condutas vedadas)
- [ ] **B3 — Requisição** aprovada
- [ ] `[[PRAZO]]` definido para a onda 1
- [ ] Página `sindcompassos.org/base-legal-dados/` publicada e respondendo **200**
- [ ] `Reply-To` corrigido na Brevo e **provado por resposta real**
- [ ] `campanhas.eixo` e `campanhas.assunto` preenchidos no CRM com os valores deste documento
- [ ] Os 4 CSVs importados na Brevo, com contagem conferida (89 / 248 / 613 / 8.236)
- [ ] Descadastro ativo nas 4 campanhas
- [ ] Nenhum anexo em nenhuma
