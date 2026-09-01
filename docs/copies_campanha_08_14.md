# Copies da campanha de coleta — Subetapa 08.14

**Redigido em:** 2026-08-27 · **Revisado por Maxwell em:** 2026-09-01
**Etapa 08, Subetapa 08.14** · Spec §9 · Tom conforme `docs/design-tokens.md` §6

> **Este é o arquivo único das copies.** Ele nasceu como `copies_campanha_08_14.md` (redação), foi
> corrigido por Maxwell em `copies_campanha_corrigida.md`, e os dois foram **unificados aqui em
> 2026-09-01** — a versão corrigida é a base, com os ajustes de conferência anotados em §9. O arquivo
> `copies_campanha_corrigida.md` **não existe mais**: uma copy com duas versões vivas é uma copy que
> vai ser disparada errada.

**Status:** as 4 copies têm o texto fechado **e a página jurídica está no ar** (§7). O que falta para
o disparo é operação de ESP e de servidor, não redação: `Reply-To` (§6), redirecionamento HTTPS, e a
importação dos CSVs — tudo na Subetapa 9.0.

As 4 campanhas já existem em `campanhas`, com `eixo` e `assunto` em branco — é este documento que os preenche. Os 9.186 `envios_campanha` e os 4 CSVs já existem (08.13); nenhum e-mail foi disparado.

---

## 1. Duas restrições que a medição impôs, e mudaram a copy

Antes de escrever, medi os 4 CSVs que vão para a Brevo. Duas coisas apareceram, e as duas mudam o texto — não são detalhe de produção.

### (a) Em A, B e C o campo `nome` **é o próprio e-mail**, em 100% das linhas

```
segmento A: 0 de 89 linhas com nome ≠ e-mail
segmento B: 0 de 248
segmento C: 0 de 613
```

Isso é esperado e está documentado na 08.13 (o `contabilidades.nome` ainda é a caixa, até a Denise renomear escritório por escritório). A consequência para a copy é direta: **`{{ contact.NOME }}` não pode ser usado em saudação nenhuma da trilha A.** "Olá contabilidadevrmonteiro@gmail.com" é a assinatura visual de um disparo em massa mal feito — e este é o primeiro e-mail de um remetente
desconhecido, na semana em que a reputação do subdomínio está se formando. 

### (b) Em D o campo `nome` é a razão social crua da Receita — e em milhares de linhas ela **contém o CPF**

```
"DULCE TERRA DA SILVA 04181495698"
"GILVANE DONIZETE MACHADO 85844950615"
```

É o formato de razão social do empresário individual na RFB: nome + CPF colados. Usar `{{ contact.NOME }}` na saudação da trilha B imprimiria **um CPF no corpo de milhares de e-mails**, em caixa alta, com cara de erro de sistema.

### Decisão: **nenhuma das 4 copies usa `{{ contact.NOME }}`.**

O único campo de mesclagem usado é **`{{ contact.LINK }}`**. Saudação neutra nas quatro. Isso custa personalização e compra três coisas que valem mais: nenhum e-mail sai com aparência de merge
quebrado, nenhum CPF vai no corpo, e a copy fica idêntica ao que o destinatário esperaria de uma comunicação institucional.

> **Quando a Denise renomear as contabilidades** (`contabilidades.nome` com o nome real do > escritório), a trilha A pode ganhar saudação personalizada — e aí vale reemitir os CSVs. Não antes: hoje o campo não tem nome nenhum para usar.

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
| **Prazo** | prazo variável conforme ONDA | **único campo em branco deste documento** — ver §5 |

---

## 3. TRILHA A — contabilidades (ondas 1, 2 e 3)

**Campanhas:** `Coleta 2026 · Contabilidades grandes (20+)` (89) · `médias (5-19)` (248) · `pequenas (2-4)` (613) · **eixo:** `requisicao` · **1 e-mail, não sequência.**

Contador não lê newsletter institucional. Lê pedido objetivo, com prazo e link. Esta copy tem uma única coisa a pedir e um único lugar para clicar.

### Assunto

> **Solicitação de dados — Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)**

*Alternativa, se a onda 1 medir abertura baixa:* `Solicitação de dados essenciais das Convenções Coletivas de Trabalho - CCT 2026`

### Pré-cabeçalho (preheader)

> Seis campos por trabalhador. O modelo já vem com o CNPJ das suas empresas preenchido.

### Corpo

---

**Bom dia.**

O **Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)** representa os trabalhadores do comércio em 29 municípios do sudoeste de Minas. Estamos organizando o cadastro da categoria e precisamos da sua ajuda como contador das empresas da região. 

**O que pedimos: seis informações por trabalhador do comércio.**

- CNPJ do estabelecimento
- Nome
- CPF
- Telefone de contato
- Piso salarial pago
- Se é sindicalizado ou se manifestou oposição à contribuição

Nada além disso. Não pedimos endereço, data de nascimento, dados de dependentes nem cópia de documento.

**Preparamos a planilha para você.**

No link abaixo há um modelo em Excel **já preenchido com o CNPJ e a razão social de cada empresa sua** que consta na nossa base. Você baixa, completa os funcionários e envia pela mesma página.

👉 **{{ contact.LINK }}**

**Três coisas que facilitam a sua vida:**

1. **Envie quantas vezes quiser.** O link não expira depois do primeiro uso. Se você tem 40 empresas e hoje consegue fechar 5, mande as 5 — na semana que vem manda o resto. **Envio parcial
   vale muito mais do que envio nenhum**, e a página mostra quais empresas ainda faltam.
2. **Trabalhe em equipe.** Se desejar, você pode compartilhar o link de preenchimento com a sua equipe. Todos poderão utilizar o mesmo link ao mesmo tempo para preencher e enviar os dados dos seus clientes.
3. **Não precisa criar conta nem senha.** O link abre uma página diretamente dentro do repositório do Sindcom, protegendo a transferência dos dados.

**Prazo.**
Pedimos o retorno em até **[[PRAZO]]**. Se precisar de mais tempo, responda este e-mail dizendo até quando consegue — e daí, combinamos.

**Por que o Sindicato pode pedir isso.**
A Constituição atribui ao Sindicato a defesa dos direitos da categoria inteira (art. 8º, III), e a CLT lhe dá as prerrogativas de representá-la (art. 513). Um sindicato que não sabe quem compõe a categoria não consegue negociar piso com base na realidade salarial nem entregar a quem contribuiu aquilo que a contribuição lhe assegura. Vale ressaltar que, devido a informação sobre filiação sindical ser um dado sensível pela LGPD, nós a tratamos com base no **art. 11, II, "d"** — exercício regular de direitos.

**Dúvida? Fale conosco.**
Visite o nosso site [sindcompassos.org](https://sindcompassos.org), responda este e-mail, ou ligue para **(35) 3526-3847** — segunda a sexta, das 08h às 11h e das 13h às 17h. 
A Secretaria e o Departamento Jurídico do Sindcom estarão à sua disposição.

Obrigado pela atenção.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato de empresas do comércio na base pública da Receita Federal. [Descadastrar]*

---

### Nota sobre esta copy

**O que ela deliberadamente NÃO faz:** não menciona conduta antissindical, não fala em multa, não usa prazo com tom de intimação. O enquadramento como infração fica **apenas na Nota Técnica completa**, e essa é uma orientação do próprio jurídico (orientação registrada pelo jurídico ao entregar a página; hoje o material vive em `docs/juridico/01_nota_tecnica.pdf` e `docs/juridico/03_pagina_dados.json`). Esta copy convence; não confronta. O contador que se sentir ameaçado no primeiro contato não responde — e contadores conversam entre si.

**Por que a base legal vem no fim e curta:** quem vai perguntar sobre LGPD é minoria, mas é a minoria que decide se o pedido é sério. Dois parágrafos citados no rodapé atendem essa pessoa sem transformar o e-mail num documento jurídico para todas as outras.

---

## 4. TRILHA B — empresas isoladas (onda 4): três e-mails

**Campanha:** `Coleta 2026 · Empresas isoladas` (8.236 caixas) · uma linha por empresa.

O contador é intermediário profissional e entende o pedido de cara. **A empresa isolada, não.** Para ela, o Sindicato dos Empregados é, na melhor das hipóteses, um desconhecido — e na pior, o outro lado da mesa. Por isso a trilha B é sequência: o primeiro e-mail apresenta, o segundo entrega valor antes de pedir qualquer coisa, e só o terceiro pede.

**Intervalo sugerido:** 5 a 7 dias entre um e outro.
**Intervalo escolhido:** no mínimo, 5 dias.

---

### B1 — Estrutural · eixo `estrutural`

#### Assunto

> **Sindicato dos Empregados no Comércio de Passos: novos canais de atendimento**

#### Pré-cabeçalho

> Site, e-mails por setor e telefone — para quem precisa falar com o sindicato da categoria.

#### Corpo

---

**Bom dia.**

Escrevemos para nos apresentar. O **Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)** representa os trabalhadores do comércio em 29 municípios do sudoeste de Minas — e a sua empresa está em uma das categorias que representamos.

Reorganizamos nossos canais de atendimento, e é isso que este e-mail comunica:

**Site [sindcompassos.org](https://sindcompassos.org)**: lá estão as convenções coletivas vigentes, os canais de contato e as informações sobre a nossa atuação.

**E-mails por setor:** para que a sua mensagem chegue direto a quem resolve:

| Assunto | Escreva para |
|---|---|
| Empresas, contribuições, guias e cadastro | **secretaria@sindcompassos.org** |
| Questões jurídicas e trabalhistas | **juridico@sindcompassos.org** |
| Parcerias e convênios | **comercial@sindcompassos.org** |
| Assuntos gerais | **contato@sindcompassos.org** |

**Telefone:** (35) 3526-3847 — segunda a sexta, das 08h às 11h e das 13h às 17h.

**Sede:** Av. dos Expedicionários, 137 · Centro · Passos/MG.

**Qual convenção coletiva rege a sua empresa?**
A resposta depende da atividade principal e do município, e nós temos essa informação. Você pode buscar essa informação direto nas CCTs disponíveis no site **[sindcompassos.org](https://sindcompassos.org)** ou, escrever para **secretaria@sindcompassos.org** com o CNPJ e respondemos com a convenção aplicável.

Nos próximos dias enviaremos mais duas mensagens: uma sobre direitos e deveres na relação com a categoria, e outra com uma solicitação objetiva de cadastro.
 
**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da Receita Federal. [Descadastrar]*

---

> **Por que o B1 anuncia os dois próximos:** sequência de três e-mails de um remetente desconhecido é marcada como spam com muito mais frequência quando o segundo chega sem aviso. Dizer o que vem troca alguns descadastros por muitas não-marcações — e na semana de aquecimento essa troca é boa, porque descadastro não machuca reputação e marcação como spam machuca.
>
> A revisão de Maxwell tirou do corpo a frase que oferecia o descadastro em seguida ("se preferir não recebê-las…"). O link de descadastro continua no rodapé, que é onde ele é obrigatório; a frase no corpo era reforço, não requisito. **Se quiser o reforço de volta, é uma linha** — ver §9.

---

### B2 — Informativo · eixo `informativo`

#### Assunto

> **O que a Convenção Coletiva garante aos seus funcionários — e o que ela exige da empresa**

#### Pré-cabeçalho

> Piso, contribuições e as condutas que a lei veda ao empregador na relação sindical.

#### Corpo

---

**Bom dia.**

Este é o segundo dos três e-mails que anunciamos. Ele não pede nada, apenas informa.

**O que a Convenção Coletiva do comércio garante ao trabalhador?**
A Convenção Coletiva é uma norma: ela vale para toda a categoria, filiado ou não. Ela fixa o **piso salarial** da função, o **reajuste** do período, e cláusulas sobre jornada, adicionais e benefícios. Pagar abaixo do piso convencional é irregularidade trabalhista, ainda que o salário esteja acima do mínimo nacional.

**O que o trabalhador que contribui recebe do Sindicato?**
A contribuição não custeia só a negociação coletiva. Ela assegura a cada trabalhador que a recolheu um conjunto de direitos individuais:

- **assistência jurídica** em demanda própria
- **homologação de rescisão** e orientação em conflito concreto
- acesso à **rede de convênios e descontos** com estabelecimentos parceiros da região — farmácias, clínicas, óticas, escolas e comércio local

**O que a empresa ganha quando seu trabalhador é sindicalizado?**
- ela garante que seus funcionários tenham benefícios adicionais, sem sair da sua própria folha
- tem acesso a uma instância adicional de **negociações e conciliações trabalhistas,** evitando processos privados ou demandas diretas aos órgão máximos de direito

**O que a lei veda ao empregador na relação sindical?**
Vale registrar, sem rodeio, que a maioria das empresas nunca fez nada disso e, é justamente por isso que é importante informar quais são os principais atos antissindicais:

- **Induzir ou pressionar o trabalhador a se opor à contribuição.** A oposição é ato individual e voluntário do trabalhador. Partindo do empregador, é conduta antissindical.
- **Reter ou não repassar** ao Sindcom a contribuição descontada em folha.
- **Impedir ou dificultar o acesso** do Sindicato aos trabalhadores para comunicação da categoria.
- **Tratar de forma desfavorável** o trabalhador por ser filiado.

**Onde consultar a convenção da sua empresa?**
Você pode encontrar e consultar sua CCT diretamente no site **[sindcompassos.org](https://sindcompassos.org)**, escrever para **secretaria@sindcompassos.org**, ou ligar para **(35) 3526-3847** informando o seu CNPJ. A convenção aplicável depende da sua atividade e do município, e respondemos com o documento vigente.

No próximo e-mail faremos uma solicitação objetiva — seis informações sobre os trabalhadores da sua empresa, com uma página pronta para o envio.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da Receita Federal. [Descadastrar]*

---

> **A lista de condutas vedadas é o ponto de tensão desta copy.** Ela existe porque a spec pede ("ações antissindicais vedadas"), e está escrita com a frase que a desarma no meio dela — *"a maioria das empresas nunca fez nada disso"*. Sem essa frase, o parágrafo lê como acusação e o e-mail seguinte não é aberto. Com ela, lê como informação — que é o que o eixo se chama.

---

### B3 — Requisição · eixo `requisicao` · ⚠️ **BLOQUEADA, ver §7**

#### Assunto

> **Solicitação de dados dos trabalhadores — seis informações, página pronta para o envio**

#### Pré-cabeçalho

> Formulário direto na página. Sem planilha, sem conta, sem senha.

#### Corpo

---

**Bom dia.**

Este é o terceiro e último e-mail dessa sequência de apresentação do Sindcom e é o que traz o pedido.

**Solicitamos seis informações sobre cada trabalhador do comércio da sua empresa:**

- Nome
- CPF
- Telefone de contato
- Piso salarial pago
- Se é sindicalizado ou se manifestou oposição à contribuição
- (o CNPJ do estabelecimento já vem preenchido)

**A página já está pronta para a sua empresa.**
Você não precisa construir nenhuma planilha: você já recebe o formulário direto na sua tela e deve preencher informando um funcionário por linha.

👉 **{{ contact.LINK }}**

Não é preciso criar conta nem senha, e **o link pode ser usado quantas vezes você quiser**. Por exemplo: se você possui 10 funcionários e hoje der para cadastrar apenas três, tudo bem; amanhã você pode seguir cadastrando os demais.

**Prazo:** pedimos o retorno até **[[PRAZO]]**. Precisando de mais tempo, responda este e-mail.

**Por que o Sindicato pode solicitar esses dados?**
A Constituição atribui ao Sindicato a defesa dos direitos da categoria inteira (art. 8º, III), e a CLT lhe dá as prerrogativas de representá-la (art. 513). Um sindicato que não sabe quem compõe a categoria não consegue negociar piso com base na realidade salarial nem entregar a quem contribuiu aquilo que a contribuição lhe assegura. Vale ressaltar que, devido a informação sobre filiação sindical ser um dado sensível pela LGPD, nós a tratamos com base no **art. 11, II, "d"** — exercício regular de direitos.

**Por que pedimos essa informação à empresa, e não ao trabalhador?**
Ao solicitar à empresa a identificação daqueles trabalhadores que se opuseram, o Sindcom pode emitir o boleto de contribuição sindical sem incluir os respectivos trabalhadores, protegendo-os contra cobranças e descontos indevidos. O dado sensível é tratado, portanto, para assegurar o exercício da oposição e impedir que o trabalhador opositor seja incluído na cobrança do Sindicato.

A fundamentação completa, assinada pela nossa Assessoria Jurídica, está publicada aqui:
**[Nota Técnica Sindcom nº 01/2026](https://sindcompassos.org/dados/)**

**Como protegemos essas informações?**
Os dados vão para o nosso sistema interno, com acesso restrito à secretaria e à assessoria jurídica. Os dados não são vendidos e não são compartilhados com terceiros. Para exercer qualquer direito quanto ao art. 18 da LGPD, os seus funcionários poderão escrever para **juridico@sindcompassos.org**.

**Dúvida?**
Caso ainda haja dúvidas, você também pode entrar em contato pelo telefone **(35) 3526-3847**, segunda a sexta, das 08h às 11h e das 13h às 17h.

Obrigado.

**Secretaria**
Sindicato dos Empregados no Comércio de Passos e Região (Sindcom)
Av. dos Expedicionários, 137 · Centro · Passos/MG
(35) 3526-3847 · secretaria@sindcompassos.org

---

*Você recebeu este e-mail porque este endereço consta como contato desta empresa na base pública da Receita Federal. [Descadastrar]*

---

## 5. O prazo, por onda — decidido

O `[[PRAZO]]` aparece na trilha A e na B3. Ele **não é um campo em aberto**: é uma data que só pode
ser escrita quando a onda for agendada, porque data escrita com antecedência fica velha se o disparo
escorregar — e data vencida no primeiro contato é pior do que não ter prazo.

**Decisão de Maxwell, por onda:**

| Onda | Alvo | Prazo |
|---|---|---|
| **00** | teste ponta a ponta, caixas do próprio Maxwell (Subetapa 9.1) | irrelevante — usar a mesma da onda 01, para ler o texto como o contador vai ler |
| **01** | 89 contabilidades grandes (20+) | **20 dias** |
| **02** | 248 contabilidades médias (5–19) | **15 dias** |
| **03** | 613 contabilidades pequenas (2–4) | **10 dias** |
| **04** | 8.236 empresas isoladas | **10 dias** |

**Como escrever no dia do agendamento:** conte os dias corridos a partir da data de disparo e
**arredonde para a sexta-feira seguinte**. Prazo que cai em fim de semana convida o destinatário a
deixar para segunda, e segunda já é depois.

**A mesma data vale para todas as copies de uma mesma onda** — se a B1/B2/B3 da onda 04 saírem em
semanas diferentes, o prazo é contado a partir do disparo da **B3**, que é a que pede.

**Racional dos números** (registrado para quando alguém perguntar por que não são todos iguais): o
contador grande tem 20+ empresas para consolidar e precisa de mais tempo; a empresa isolada tem um
punhado de funcionários e um formulário na tela, então 10 dias é folgado. Prazo longo demais some da
caixa de entrada e vira "depois eu vejo".

---

## 6. Correção pendente antes do disparo: o `Reply-To`

**Medido em 2026-08-27, por consulta DNS, e reconferido em 2026-09-01:**

```
envios.sindcompassos.org  MX   → (sem registro)
envios.sindcompassos.org  TXT  → brevo-code:6d1f4a345846d8b67350ce3651aa574f
sindcompassos.org         MX   → mx1.titan.email (10), mx2.titan.email (20)
_dmarc.sindcompassos.org  TXT  → v=DMARC1; p=none; rua=mailto:deploycrm@…; adkim=r; aspf=r
```

O subdomínio está verificado na Brevo (o `brevo-code` está lá) mas **não recebe e-mail** — não tem
MX. Toda resposta enviada para um `Reply-To` em `@envios.sindcompassos.org` volta para o contador
com erro de entrega. Numa campanha cuja copy diz "responda este e-mail", isso é grave: quem responde
é justamente o contador engajado, que é quem se quer alcançar.

**Correção — na Brevo, não no DNS:** configurar `Reply-To: secretaria@sindcompassos.org` na campanha.
O domínio organizacional tem MX do Titan e a caixa existe. O DMARC está com `aspf=r`/`adkim=r`
(alinhamento relaxado), então `From` no subdomínio com `Reply-To` no domínio organizacional
**continua alinhando** — não há perda de autenticação.

Acrescentar MX ao subdomínio seria a alternativa, e é pior: criaria uma caixa que ninguém lê.

**Conferência obrigatória, e ela é da Onda 00 (Subetapa 9.1):** responder a um dos e-mails de teste e
confirmar que a resposta chega em `secretaria@`. Ler a configuração na tela da Brevo não prova
entrega — só a resposta que chega prova.

---

## 7. O link jurídico da copy de Requisição

A B3 aponta para **`https://sindcompassos.org/dados/`**, com o rótulo *"Nota Técnica Sindcom
nº 01/2026"*. Esse é o único CTA de credibilidade do e-mail que carrega o argumento jurídico, e o
critério do plano é explícito: **a copy de Requisição só fecha quando essa URL responder 200.**

### O material jurídico está pronto

| Peça | Arquivo | Estado |
|---|---|---|
| Nota Técnica completa | `docs/juridico/01_nota_tecnica.pdf` (+ `.docx`) | ✅ final |
| Nota resumida | `docs/juridico/02_nota_resumida.pdf` (+ `.docx`) | ✅ final |
| Página pública | `docs/juridico/03_pagina_dados.json` | ✅ montada — *template Elementor*, pronto para importar no WordPress |

Os três estão assinados por **Adenilson Antônio Silva, OAB/MG 96.522**, com data de **28/08/2026** no
rodapé da página. O JSON é o export de um template do Elementor com `title: "11_dados"` — ele se
importa no WordPress, não se publica por FTP.

> **Mudou a URL.** A versão anterior deste documento apontava para `/base-legal-dados/`, que era a
> sugestão do rascunho jurídico. A URL final é **`/dados/`**. Ela precisa ficar **estável para
> sempre**: vai em milhares de e-mails, e link quebrado no meio da campanha custa exatamente a
> credibilidade que a página existe para construir.

### ✅ A página está no ar — medido em 2026-09-01, depois de o site voltar

```
https://sindcompassos.org/dados/     → 200
<title>Tratamento de Dados - Sindcom Passos</title>
conteúdo confere: "art. 11, II" · "NOTA TÉCNICA" · "Adenilson Antônio Silva — Assessoria Jurídica" · "96.522"
```

**A copy B3 está destravada.** O link do único CTA de credibilidade dela responde 200 e serve o
texto assinado — conferido pelo conteúdo, não só pelo código de status: 200 em WordPress também é o
que uma página vazia devolve.

> **O que aconteceu no caminho.** Entre a redação desta copy e esta conferência, o site institucional
> inteiro caiu com **Erro 500** — todas as páginas, o `/wp-admin/` e até um `.js` estático. A causa
> foi o `.htaccess`, que perdeu as ~7 primeiras linhas e começava no meio de um `RewriteCond`
> (`commerce_session_) [NC]`), fazendo o Apache recusar o diretório inteiro. Restaurado a partir de
> `docs/htaccess_site_institucional_backup_2026-08-25.txt`; o método de diagnóstico está em
> `orientacoes.md` §1.6. **Vale como aviso de operação:** a URL `/dados/` vai em milhares de
> e-mails, e um `.htaccess` mal salvo a derruba junto com o site — durante a campanha, isso é o
> pior momento possível.

### Duas observações que acompanham a publicação

- **A assinatura com OAB é o que dá valor à página.** Sem ela é texto no site; com ela é posição
  institucional verificável. Conferir que ela sobreviveu à importação do template.
- **`http://sindcompassos.org` respondia 200 sem redirecionar para HTTPS** (medido antes da queda).
  Uma página que trata de base legal para tratamento de dados pessoais não deveria ser servível em
  texto claro. O redirecionamento entra **acima** do bloco de cache no `.htaccess`, nunca dentro dos
  blocos gerenciados — é a armadilha do `orientacoes.md` §1.5, e foi mexer nesse arquivo que
  derrubou o site.

---

## 8. Checklist de fechamento da Etapa 08

**Texto das copies — fechado.**

- [x] **Trilha A** redigida e revisada por Maxwell
- [x] **B1 — Estrutural** redigida e revisada
- [x] **B2 — Informativo** redigida e revisada (com o bloco de condutas vedadas e a frase que o desarma)
- [x] **B3 — Requisição** redigida e revisada, com o link para `/dados/`
- [x] `[[PRAZO]]` decidido por onda (§5) — 20 / 15 / 10 / 10
- [x] Descadastro presente no rodapé das 4
- [x] Nenhum anexo em nenhuma
- [x] Mesclagem só por `{{ contact.LINK }}`, nunca por `NOME` (§1)
- [x] Material jurídico final e assinado (Nota Técnica, resumida e página)

**Infraestrutura — pendente, e é o que separa a Etapa 08 do disparo.**

- [x] **Site institucional de volta** — Erro 500 do `.htaccess` corrigido em 2026-09-01 (§7)
- [x] Página importada e `https://sindcompassos.org/dados/` respondendo **200**, com conteúdo conferido
- [ ] Redirecionamento HTTP → HTTPS restabelecido, acima do bloco de cache — **ainda aberto**: `http://sindcompassos.org/` responde 200 sem redirecionar
- [ ] `Reply-To` corrigido na Brevo
- [ ] Os 4 CSVs importados na Brevo, com contagem conferida (89 / 248 / 613 / 8.236)
- [ ] `campanhas.eixo` e `campanhas.assunto` preenchidos no CRM com os valores deste documento

**Prova de ponta a ponta — é a Subetapa 9.1 (Onda 00), não a Etapa 08.**

- [ ] Reply-To provado por resposta real que chega em `secretaria@`
- [ ] As 4 copies lidas em caixa real (Gmail e Outlook), sem imagem quebrada e sem merge à mostra
- [ ] Token do link de teste abrindo, aceitando planilha e aparecendo em `/cobertura`

---

## 9. O que a unificação de 2026-09-01 mexeu

Este arquivo é a fusão de `copies_campanha_08_14.md` (redação) com
`copies_campanha_corrigida.md` (revisão de Maxwell). **A revisão é a base**; abaixo está só o que a
conferência acrescentou depois, para que nada mude em silêncio.

| # | O quê | Por quê |
|---|---|---|
| 1 | `[Descadastrar]` **restaurado** no rodapé da trilha A, do B1 e do B2 | a revisão o manteve só no B3. Descadastro em disparo em massa não é estilo: a Brevo o exige e o injeta de qualquer jeito, e sem ele no texto o rodapé fica com duas frases concorrendo. A frase do B1 que **oferecia** o descadastro no corpo continua removida, como a revisão decidiu — o link no rodapé basta. Se quiser a frase de volta, é uma linha. |
| 2 | `Por que solicitação a informação à empresa?` → **`Por que pedimos essa informação à empresa, e não ao trabalhador?`** | erro de digitação num subtítulo do e-mail que carrega o argumento jurídico. A pergunta reescrita também é melhor: ela antecipa a objeção real do contador, que é "por que não perguntam a ele?" |
| 3 | §5 reescrita: o prazo deixou de ser "campo em branco" e virou **tabela por onda** | a decisão já tinha sido tomada por Maxwell; o texto ainda a tratava como pendência |
| 4 | §7 reescrita: a URL passou de `/base-legal-dados/` para **`/dados/`**, e o bloqueio deixou de ser "página não publicada" e virou **"site fora do ar com Erro 500"** | o material jurídico ficou pronto; o obstáculo mudou de lugar |
| 5 | Referência a `docs/juridico/03_pagina_publica.md` trocada | aquele arquivo não existe mais; o material agora é `01_nota_tecnica.pdf`, `02_nota_resumida.pdf` e `03_pagina_dados.json` |
| 6 | §8 reescrita como **checklist de fechamento da Etapa 08**, separando o que é texto (fechado) do que é infraestrutura (pendente) e do que é prova de ponta a ponta (Subetapa 9.1) | o disparo saiu da Etapa 08 e virou a Etapa 09 |
