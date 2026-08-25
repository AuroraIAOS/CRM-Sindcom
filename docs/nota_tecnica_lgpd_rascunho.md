# Rascunho estruturado — Nota técnica sobre a base legal da coleta de dados de trabalhadores

**Status: RASCUNHO. Não publicar.** · Preparado pelo Claude Code na Subetapa 08.3(a)
**Destinatário: Adenilson (jurídico do Sindcom)** · Data: 2026-08-24

---

## Aviso que governa este documento

Este texto **não é parecer jurídico** e não foi escrito por advogado. É um insumo: reúne os
fatos medidos, organiza os dispositivos aplicáveis e apresenta as hipóteses legais
candidatas com o argumento de cada uma — para **encurtar o tempo do jurídico**, não para
substituí-lo.

**Quem decide a base legal é o Adenilson.** Todo ponto que exige decisão dele está marcado
com **[DECISÃO JURÍDICA]**. Todo dispositivo citado precisa ser conferido na fonte antes de
ir para uma página pública assinada — as citações abaixo foram escritas de memória e
**podem conter imprecisão de número, redação ou vigência**. Onde há dúvida, o texto diz que
há.

O produto final é uma **página fixa no site**, de uma lauda, assinada pelo jurídico, para a
qual todo e-mail do eixo Requisição vai apontar (spec §10).

---

## 1. O problema, em uma frase

O Sindcom vai pedir a 9.191 caixas de e-mail — contabilidades e empresas — os dados dos
trabalhadores do comércio da base territorial, e um dos seis campos pedidos é
**"sindicalizado ou oposição"**.

Esse campo é o problema: **filiação a sindicato é dado pessoal *sensível*** na LGPD.

## 2. Por que isso não é preciosismo

Dado sensível não se apoia nas bases comuns do art. 7º. Exige base do **art. 11**, que é
uma lista mais estreita e fechada.

O risco prático não é multa da ANPD no curto prazo — é **credibilidade**. Um contador bem
informado que responder *"isso é dado sensível, qual a base legal do art. 11?"* precisa
receber resposta precisa, citada e assinada. Resposta genérica nesse ponto desmonta o
pedido inteiro, e não só com aquele contador: **contadores conversam entre si**, e 89
caixas concentram 24% da base. Uma resposta ruim circula rápido.

Por isso a nota é pública e assinada, e não uma resposta improvisada por e-mail caso a caso.

## 3. Os fatos, medidos

| | |
|---|---|
| Estabelecimentos ativos na base territorial | 17.300 |
| Empresas | 16.671 |
| Caixas de e-mail únicas a contatar | 9.191 |
| Trabalhadores hoje cadastrados | **1** |
| Vínculos empregatícios hoje | **0** |
| Convenções cadastradas | 27 (5 CCTs + 22 ACTs) |

**Os seis campos pedidos** e para que cada um serve:

| Campo | Finalidade declarada |
|---|---|
| CNPJ do estabelecimento | vincular o trabalhador à empresa e, por ela, à CCT/ACT aplicável |
| Nome | identificação |
| CPF | identificação unívoca; evita duplicidade de cadastro |
| Telefone de contato | comunicação com o representado |
| Piso salarial pago | base de cálculo das contribuições e verificação do piso da CCT |
| **Sindicalizado / oposição** | **define se há e qual contribuição é devida, e resguarda quem se opôs** |

Cinco dos seis campos são dados comuns (art. 7º). **Só o sexto é sensível**, e a nota
precisa tratá-lo separadamente — misturar tudo num argumento só enfraquece os dois.

---

## 4. Linha de argumentação sugerida

### 4.1 O sindicato não é um terceiro curioso: é o representante legal da categoria

- **CF, art. 8º, III** — cabe ao sindicato "a defesa dos direitos e interesses coletivos ou
  individuais da categoria, inclusive em questões judiciais ou administrativas".
  A representação alcança **toda a categoria**, não apenas os filiados. É esse ponto que
  justifica o sindicato conhecer o universo que representa, e não só sua lista de sócios.
- **CLT, art. 513** — prerrogativas dos sindicatos, entre elas representar os interesses
  gerais da categoria. *[conferir a alínea exata]*
- **CF, art. 8º, VI** — obrigatoriedade da participação dos sindicatos nas negociações
  coletivas. Negociar piso e cláusulas para uma categoria cujo tamanho e composição
  salarial se desconhece é negociar às cegas. *[conferir]*

**O argumento é de necessidade, não de conveniência:** sem saber quem são os
representados e quanto recebem, a representação constitucional não se exerce de fato.

### 4.2 O campo sensível existe para PROTEGER quem se opõe

Este é o ponto que eu sugiro colocar em destaque, porque inverte a intuição do leitor.

O regime atual é: a contribuição não é automática, e o trabalhador tem **direito de
oposição**. Para que esse direito seja respeitado, alguém precisa **saber quem se opôs**.
Um sindicato que não registra as oposições não tem como deixar de cobrar de quem se opôs —
e é exatamente aí que nasce o dano ao trabalhador.

Ou seja: **o tratamento do dado sensível é a condição de possibilidade do direito de
oposição**, não uma ameaça a ele. O dado é coletado para produzir uma abstenção do
sindicato, não uma ação contra o trabalhador.

*[DECISÃO JURÍDICA]* Vale sustentar a nota também sobre o entendimento do **STF quanto à
contribuição assistencial** — se não me falha a memória, o Tribunal firmou em 2023, em
repercussão geral, que é constitucional instituí-la por norma coletiva para toda a
categoria, **inclusive não filiados, desde que assegurado o direito de oposição**. Acredito
tratar-se do **Tema 935 (ARE 1018459)**, mas **não confie neste número sem conferir** — se
a tese for essa, ela é o alicerce mais forte da nota, porque transforma o registro da
oposição em *dever operacional imposto pelo próprio regime*, e não em escolha do sindicato.

Convém registrar também o marco da **Lei 13.467/2017 (Reforma Trabalhista)**, que tornou a
contribuição sindical condicionada a autorização prévia e expressa, e a **ADI 5794**, em
que o STF a validou. *[conferir ambos]*

### 4.3 A base do art. 11 — as candidatas

**[DECISÃO JURÍDICA — este é o núcleo da nota. As opções abaixo são insumo, não escolha.]**

| Hipótese | Texto (conferir) | A favor | Contra |
|---|---|---|---|
| **art. 11, II, "a"** | cumprimento de **obrigação legal ou regulatória** pelo controlador | Se a CCT/ACT ou a lei impõem ao sindicato apurar e respeitar a oposição, o tratamento é indispensável ao cumprimento dessa obrigação | Exige apontar a obrigação concreta. "Ser sindicato" não é obrigação legal por si |
| **art. 11, II, "d"** | **exercício regular de direitos**, inclusive em contrato e em processo | Casa diretamente com a representação da CF art. 8º, III e com a negociação coletiva; é a mais citada para entidades sindicais | "Exercício regular de direitos" é cláusula ampla — precisa ser amarrada ao direito específico, sob pena de virar carta em branco |
| **art. 11, I** | consentimento **específico e destacado** do titular | Base mais sólida quando obtida | **Inviável nesta operação**: quem envia o dado é o contador, não o titular. Consentimento colhido pelo empregador sobre filiação sindical é frágil, por desequilíbrio na relação de emprego |

**Minha leitura como não-jurista**, e é só isso: **"d" como base principal, ancorada em CF
art. 8º, III + CLT art. 513**, com **"a"** como reforço **se e somente se** houver
obrigação concreta a apontar. Deixar o consentimento (inciso I) explicitamente de fora,
dizendo **por que** — isso demonstra que a escolha foi deliberada, e é o tipo de detalhe
que convence um leitor técnico.

### 4.4 O outro lado do balcão: a base de quem ENVIA

Ponto que costuma passar batido e que o contador diligente vai levantar: **a contabilidade
e a empresa também são controladoras**, e precisam de base própria para **compartilhar** o
dado — não basta o Sindcom ter base para recebê-lo.

Se a nota não resolver isso, o contador cauteloso trava mesmo concordando com o resto.

*[DECISÃO JURÍDICA]* A saída mais limpa é a **obrigação legal ou regulatória do
empregador** (art. 11, II, "a" para o campo sensível; art. 7º, II para os demais),
sustentada por: (i) cláusula de CCT/ACT que obrigue a empresa a informar o quadro de
empregados ao sindicato — **ver §6, é a pergunta mais importante deste documento**; (ii) o
dever de operar o desconto em folha e repassar, que pressupõe informar a quem repassa.

**Sugestão de redação:** a nota deve trazer um parágrafo curto, destacado, dirigido ao
contador — *"por que você pode nos enviar"* —, e não só *"por que podemos pedir"*. É esse
parágrafo que desbloqueia o envio na prática.

### 4.5 O que a nota deve prometer sobre o tratamento

Amarra os princípios do art. 6º e dá ao contador algo verificável:

- **Finalidade** — os dados servem à representação sindical, ao cálculo das contribuições
  devidas e ao respeito às oposições. Nada além.
- **Necessidade / minimização** — pedimos seis campos. Deliberadamente **não** pedimos data
  de nascimento, endereço, e-mail pessoal, nem a data de entrega da carta de oposição
  (decisão D7 da spec). Vale dizer isso na nota: mostrar o que **não** se pede é a prova
  mais barata de minimização.
- **Segurança (art. 46)** — o canal é página com token de validade limitada, arquivo em
  bucket privado, sem leitura por quem envia, e **nenhuma gravação na base cadastral sem
  revisão humana**. Isso não é promessa: é como o sistema foi construído (spec §6).
- **Direitos do titular (art. 18)** — dizer para onde o trabalhador escreve se quiser
  acessar, corrigir ou se opor. **Indicar a caixa** — `contato@sindcompassos.org` é a de
  atendimento ao público. *[Maxwell confirma qual caixa entra aqui]*
- **Compartilhamento** — declarar se há ou não compartilhamento com terceiros. Hoje os
  dados ficam no CRM do sindicato. *[conferir se os parceiros do convênio acessam algo —
  pelo que vi no sistema, o parceiro só enxerga as próprias guias, não a base cadastral]*

---

## 5. Estrutura sugerida da página pública (uma lauda)

1. **Título** — algo como "Base legal para a solicitação de dados cadastrais dos
   trabalhadores do comércio"
2. **Quem somos e o que pedimos** — 3 linhas, com os seis campos listados
3. **Por que podemos pedir** — CF art. 8º, III; CLT art. 513; LGPD art. 7º
4. **O campo sensível: filiação sindical** — LGPD art. 5º, II e a base do art. 11 escolhida,
   com o argumento do direito de oposição em destaque
5. **Por que a empresa e a contabilidade podem nos enviar** — o parágrafo do §4.4
6. **O que fazemos e o que não fazemos com os dados** — finalidade, minimização, segurança
7. **Direitos do trabalhador e como exercê-los** — canal nomeado
8. **Assinatura** — nome, OAB, data. **A assinatura é o que dá valor à página**; sem ela,
   é só um texto no site.

**Tom:** técnico e curto. O leitor é contador, não advogado — ele quer saber se pode
enviar sem risco. Cada parágrafo deve responder a uma objeção real, não exibir erudição.

---

## 6. Perguntas abertas — respostas necessárias antes de escrever a versão final

1. **A mais importante: alguma CCT ou ACT vigente já obriga a empresa a fornecer ao
   sindicato a relação de empregados?** Se sim, **cite a cláusula pelo número na nota** — o
   argumento deixa de ser interpretativo e passa a ser contratual, o que é muito mais forte
   e muito mais curto. Não consegui verificar sozinho: as 27 convenções estão cadastradas
   no CRM, mas **nenhuma tem o documento anexado** (`documento_url` vazio em 27 de 27).
2. **Qual base do art. 11 será adotada** para o campo de filiação — e o inciso I
   (consentimento) será expressamente afastado, com motivo?
3. **A tese do STF sobre contribuição assistencial** confirma-se, e é Tema 935 / ARE
   1018459? Se sim, entra na nota como fundamento central.
4. **Há Relatório de Impacto (RIPD) ou encarregado (DPO) designado** no Sindcom? A nota
   deve mencionar? *[LGPD art. 41 — conferir a exigência para entidade deste porte]*
5. **Qual caixa recebe os pedidos do art. 18?** Sugiro `contato@sindcompassos.org`, que é a
   de atendimento ao público.
6. **Prazo de guarda** dos dados e critério de eliminação — a nota promete algo aqui?

---

## 7. O que já está construído e sustenta a nota

Não é promessa; é o sistema como está implementado (spec §6, ETAPA 08):

- Token de acesso com **validade** e **revogável**, sem leitura de dado alheio
- Arquivo em **bucket privado**, servido só por URL assinada
- **Rate limit** no endpoint público
- Validação de CPF no navegador do próprio contador, antes do envio
- **Nenhuma remessa vira cadastro sem revisão humana** da secretaria
- Registro de IP e user-agent de cada remessa, para rastreabilidade
- RLS e políticas explícitas em todas as tabelas novas

Isso permite que a nota afirme medidas de segurança **verificáveis**, e não genéricas — o
que a distingue de um texto de LGPD padrão.

---

## 8. Impacto no cronograma

O eixo **Requisição** da campanha (Subetapas 08.14 e 08.15) **está bloqueado** até esta
nota estar publicada e assinada. Os eixos **Estrutural** e **Informativo** da trilha B
seguem sem ela.

Ou seja: enquanto a nota não sai, a campanha pode se apresentar e informar — mas **não pode
pedir**. E é o pedido que resolve o gargalo de 0 trabalhadores vinculados.
