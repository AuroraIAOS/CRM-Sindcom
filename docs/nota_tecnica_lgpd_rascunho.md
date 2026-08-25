# Esboço — Nota técnica sobre a base legal da coleta de dados de trabalhadores

**Status: ESBOÇO EM CONSTRUÇÃO. Não publicar.**
**Destinatário: Adenilson (jurídico do Sindcom)** · Preparado pelo Claude Code · Subetapa 08.3(a)
Criado 2026-08-24 · **Atualizado 2026-08-25 com as decisões de Maxwell**

---

## Aviso que governa este documento

Este texto **não é parecer jurídico** e não foi escrito por advogado. É insumo: reúne os
fatos medidos, organiza os dispositivos e encadeia o argumento — para **encurtar o tempo do
jurídico**, não para substituí-lo. **Quem decide e assina é o Adenilson.**

Todo dispositivo citado precisa ser conferido na fonte. Onde tenho dúvida sobre número,
redação ou vigência, o texto **diz que tenho** — não há citação apresentada com confiança
que eu não tenha.

---

## ⛔ Bloqueio ativo: a literatura jurídica não chegou

Maxwell instruiu avaliar o material em **`docs/fundamentos`** antes de escrever a versão
final. **O diretório existe e está vazio** — verificado em 2026-08-25: nenhum arquivo, nenhum
PDF ou DOC em qualquer outro caminho do repositório, e a árvore do git limpa (não é arquivo
não rastreado).

**Consequência:** os três produtos finais (§7) **não serão escritos** até o material estar
lá. O que segue é o *briefing completo*, já com todas as decisões tomadas — de modo que,
assim que a literatura chegar, a redação final comece sem retrabalho.

---

## 1. O problema, em uma frase

O Sindcom vai pedir a 9.191 caixas de e-mail — contabilidades e empresas — os dados dos
trabalhadores do comércio da base territorial. Um dos seis campos é **"sindicalizado ou
oposição"**, e **filiação a sindicato é dado pessoal *sensível*** (LGPD, art. 5º, II).

Dado sensível não se apoia nas bases comuns do art. 7º: exige base do **art. 11**, lista mais
estreita e fechada. O risco imediato não é multa — é **credibilidade**. 89 caixas concentram
24% da base, e contadores conversam entre si: uma resposta ruim circula rápido.

## 2. Os fatos, medidos

| | |
|---|---|
| Estabelecimentos ativos na base territorial | 17.300 |
| Empresas | 16.671 |
| Caixas de e-mail únicas a contatar | 9.191 |
| Trabalhadores hoje cadastrados / vínculos | **1** / **0** |
| Convenções cadastradas | 27 (5 CCTs + 22 ACTs) |

**Os seis campos pedidos:**

| Campo | Natureza | Finalidade |
|---|---|---|
| CNPJ do estabelecimento | comum | vincula o trabalhador à empresa e, por ela, à CCT/ACT |
| Nome | comum | identificação |
| CPF | comum | identificação unívoca; evita duplicidade |
| Telefone | comum | comunicação com o representado |
| Piso salarial pago | comum | base de cálculo e verificação do piso da CCT |
| **Sindicalizado / oposição** | **SENSÍVEL** | define a contribuição devida e **resguarda quem se opôs** |

**Cinco dos seis são comuns.** A nota deve tratar o sexto **separadamente** — misturar tudo
num argumento só enfraquece os dois.

---

## 3. Decisões tomadas por Maxwell em 2026-08-25

### 3.1 As CCTs já obrigam — o argumento passa a ser contratual

> *"Sim, todas as CCT obrigam as contabilidades e empresas, quando solicitadas, a
> apresentarem ao Sindicato a relação de funcionários e comprovações dos recolhimentos dos
> valores no holerite para efeitos cadastrais e prestação de serviços e convênios."*

**Esta é a resposta mais importante do documento, e ela reorganiza a nota inteira.** Deixa de
ser construção interpretativa e vira **obrigação pactuada** — muito mais forte e muito mais
curta de sustentar.

Efeito prático: o dever do controlador (§4.3) sai do art. 11, II, "d" e passa a repousar
firmemente no **art. 11, II, "a" — cumprimento de obrigação legal ou regulatória**, sendo a
norma coletiva a fonte dessa obrigação.

⚠️ **Pendência operacional que precisa ser resolvida antes da redação final.** Maxwell
informa que *"cada CCT expõe essa obrigatoriedade com dizeres e em local distinto ao longo do
texto"*. Para a nota citar cláusula por número, alguém precisa **localizar e transcrever a
cláusula de cada CCT**. Não consigo fazer isso: as 27 convenções estão no CRM com
`documento_url` **vazio em 27 de 27**, e só 1 tem `data_limite_oposicao` preenchida.
**Sem isso, a nota terá de dizer "as convenções coletivas vigentes preveem" — genericamente,
que é justamente a resposta fraca que a nota existe para evitar.**

### 3.2 A base do art. 11 — decidida

| Quem | Base | Fundamento |
|---|---|---|
| **Controladores** (contabilidades e empresas) | **art. 11, II, "a"** — cumprimento de obrigação legal ou regulatória | a obrigação vem da CCT (§3.1) |
| **Sindcom** | **art. 11, II, "d"** — exercício regular de direitos | atua como instância de salvaguarda e execução |

**Reforços constitucionais e legais** (transcrições fornecidas por Maxwell; conferir na fonte
antes de publicar):

- **CF, art. 8º, III** — *"ao sindicato cabe a defesa dos direitos e interesses coletivos ou
  individuais da categoria, inclusive em questões judiciais ou administrativas"*. Avoca ao
  sindicato a função de procurador do direito trabalhista coletivo e dos indivíduos.
- **CLT (Lei 5.452/1943), art. 513, "a"** — prerrogativa de **representar** perante
  autoridades administrativas e judiciárias os interesses gerais da categoria **e os
  interesses individuais dos associados**.
- **CLT, art. 513, "e"** — prerrogativa de **impor contribuições** a todos aqueles que
  participam das categorias representadas.

**Observação minha sobre a alínea "e", e é a que mais me interessa no encadeamento:** ela é
o elo que fecha o argumento do campo sensível. Se o sindicato tem a prerrogativa legal de
impor contribuições a **todos** os participantes da categoria, e se o regime só é
constitucional **desde que assegurado o direito de oposição** (§3.3), então **saber quem se
opôs deixa de ser interesse do sindicato e passa a ser condição de legalidade da cobrança**.
O tratamento do dado sensível é o que torna a abstenção possível.

O **consentimento (art. 11, I)** fica **expressamente afastado**, e a nota deve dizer por
quê: quem envia o dado é o contador, não o titular; e consentimento colhido pelo empregador
sobre filiação sindical é frágil por desequilíbrio na relação de emprego. Afastar
explicitamente demonstra que a escolha foi deliberada — é o tipo de detalhe que convence
leitor técnico.

### 3.3 A tese do STF — confirmada

**Tema 935 / ARE 1018459:** *"é constitucional a instituição, por acordo ou convenção
coletivos, de contribuições assistenciais a serem impostas a todos os empregados da
categoria, ainda que não sindicalizados, desde que assegurado o direito de oposição."*

Confirmado por Maxwell. É o **alicerce central** da nota, pela razão exposta em §3.2.

### 3.4 Encarregado (DPO) e canal do art. 18

- **Não há encarregado designado hoje.** Proposta: atribuir a função ao **Dr. Adenilson**.
- **Canal imediato:** WhatsApp do Dr., **já público** no site
  (`sindcompassos.org/servicos-sindicais/#consultas`) — **+55 35 98827-0406** — e o e-mail
  **`juridico@sindcompassos.org`**.
- **Futuro (versionamento posterior, não agora):** ferramenta de requisição pública que
  alimente uma **fila de demandas do perfil jurídico** no CRM, no mesmo padrão do QR Code dos
  recepcionistas e do token das contabilidades. **Anotar no backlog do `CLAUDE.md`.**

⚠️ **Ponto para o Adenilson decidir, não para a nota assumir:** designar o próprio advogado
externo como encarregado tem implicações — a LGPD (art. 41) exige que a identidade e os
dados de contato do encarregado sejam **divulgados publicamente**, e o encarregado é o canal
de comunicação com titulares **e com a ANPD**. Vale ele avaliar se aceita o encargo formal e
se o WhatsApp pessoal é o canal que quer publicar como oficial. *[conferir a redação e a
extensão do art. 41 — inclusive se há dispensa para entidades de pequeno porte]*

### 3.5 Guarda e eliminação — política definida por Maxwell

**Trabalhadores sindicalizados/filiados (Prata/Ouro).** A existência, permanência e
atualização dos dados é **pré-requisito da prestação de serviços** (defesa jurídica,
convênios, descontos, benefícios) ao trabalhador e a seus beneficiados. Pedido de remoção
será atendido, **com informação prévia ao titular de que ele regride a Bronze** e perde os
direitos e benefícios correspondentes. O pedido se manifesta por **"Carta de Exclusão"**,
redigida e entregue pelo próprio solicitante.

**Trabalhadores representados (Bronze).** A permanência dos dados visa **apenas garantir que
não sejam cobrados indevidamente**. Havendo pedido de exclusão — também por Carta de
Exclusão —, o banco passa a conter somente: **(a) as iniciais do nome** e **(b) o CPF
anonimizado**, o mesmo valendo para os beneficiados.

**Regra geral.** Os dados são guardados e atualizados continuamente, a partir das informações
prestadas pelos controladores, **até** que (i) o trabalhador peça exclusão ou (ii) o vínculo
empregatício se extinga. Mesmo então o registro **não é apagado, e sim anonimizado**,
preservando rastreabilidade para auditorias, investigações e solicitações judiciais.
*(Exemplo dado por Maxwell: um ex-sindicalizado que enfrente ação sob alegação de abandono
parental pode pedir ao Sindcom a série histórica de serviços de saúde prestados aos filhos.)*
**Extinção completa** apenas se não houver movimento no ID por **20 anos** após a última
atualização — por analogia à **Lei 13.787/2018, art. 6º** (*"decorrido o prazo mínimo de 20
anos a partir do último registro, os prontuários em suporte de papel e os digitalizados
poderão ser eliminados"*).

⚠️ **Dois pontos que preciso sinalizar, e o segundo é técnico, não jurídico:**

1. **A Lei 13.787/2018 trata de prontuários de paciente.** Aplicá-la a cadastro sindical é
   **analogia**, não incidência direta. Ela pode ser um parâmetro razoável de prazo, mas a
   nota deve apresentá-la como tal — *"adota-se, por analogia, o prazo de 20 anos"* — e não
   como se a lei regesse o caso. **[DECISÃO JURÍDICA: o Adenilson confirma se a analogia se
   sustenta ou se prefere outro parâmetro.]**
2. **"CPF anonimizado" precisa ser definido com precisão técnica.** Na LGPD, dado
   verdadeiramente anonimizado (art. 12) sai do alcance da lei — mas só se a
   reversão for impossível por meios razoáveis. **Guardar CPF mascarado junto das iniciais
   do nome, do município e do histórico de vínculos provavelmente permite reidentificar a
   pessoa** — e nesse caso o dado é **pseudonimizado**, não anonimizado, e continua sob a
   LGPD. Isso não invalida a política; muda o nome do que ela faz e o que a nota pode
   prometer. **Recomendo que a nota fale em pseudonimização e retenção mínima**, que é
   defensável, em vez de prometer anonimização, que é mais difícil de sustentar. *[conferir
   art. 12 e a definição do art. 5º, XI]*

---

## 4. As quatro discussões que a nota precisa fechar

Ordem deliberada: as três primeiras constroem; a quarta cobra. Ver §6 sobre onde a quarta
pode e não pode aparecer.

### 4.1 Direito do Sindcom de solicitar os dados dos **sindicalizados**

Eixo: **CF art. 8º, III + CLT art. 513, "a"** → representação e defesa de direitos, na base
do **art. 11, II, "d"**. Para o filiado, some-se que o dado é **pré-requisito da prestação do
serviço que ele contratou ao se filiar** (§3.5) — sem cadastro não há convênio, defesa
jurídica nem benefício. Aqui o interesse do titular e o tratamento coincidem, e este é o
caso mais fácil da nota.

### 4.2 Direito do Sindcom de solicitar os dados dos **opositores**

**Este é o ponto delicado, e o argumento se inverte — é o que deve ficar em destaque.**

O sindicato não pede o dado para agir *contra* quem se opôs, mas para **deixar de cobrá-lo**.
Encadeamento: CLT art. 513, "e" dá a prerrogativa de impor contribuições a todos os
participantes da categoria → o STF (Tema 935) só a valida **se assegurado o direito de
oposição** → logo, **registrar a oposição é condição de legalidade da cobrança**, não
conveniência do sindicato.

Formulação sugerida: *um sindicato que não sabe quem se opôs não tem como deixar de cobrar
de quem se opôs.* O tratamento do dado sensível **é a condição de possibilidade do direito de
oposição** — e o resultado que ele produz é uma **abstenção** do sindicato, nunca uma ação
contra o trabalhador.

### 4.3 Dever dos **controladores** de informar

Ponto que costuma passar batido e **trava o envio na prática**: a contabilidade e a empresa
**também são controladoras** e precisam de base própria para **compartilhar** — não basta o
Sindcom ter base para receber. Sem responder *"por que **você** pode nos enviar"*, o contador
cauteloso trava mesmo concordando com todo o resto.

Eixo: **obrigação pactuada em CCT (§3.1)** → **art. 11, II, "a"** para o campo sensível e
**art. 7º, II** para os demais. Reforço: o dever de operar o desconto em folha e repassar
pressupõe informar a quem se repassa.

**A nota precisa de um parágrafo curto e destacado dirigido ao contador** — *"por que você
pode nos enviar"* —, e não apenas *"por que podemos pedir"*. É esse parágrafo que desbloqueia
o envio.

### 4.4 Enquadramento da **negativa** como ato antissindical

Dispositivos candidatos, **todos a conferir** — este é o trecho em que tenho menos confiança
e mais recomendo cautela:

- **CLT, art. 543, §6º** — penalidade à empresa que, por qualquer modo, procure impedir o
  empregado de se associar a sindicato. *[conferir redação e alcance: trata de impedir
  associação, o que não é exatamente recusar dados]*
- **Convenção 98 da OIT**, ratificada pelo Brasil — proteção contra atos de discriminação
  antissindical e de ingerência. *[conferir número do decreto de promulgação]*
- **Convenção 135 da OIT** — proteção a representantes dos trabalhadores. *[conferir]*
- **Atenção a um erro comum:** o Brasil **não ratificou a Convenção 87** (liberdade sindical).
  Citá-la como vinculante é falha que um leitor técnico identifica — e desmonta a
  credibilidade do resto. **[conferir e, se confirmado, não citar como norma interna]**

⚠️ **Recomendação de estratégia, e ela não é jurídica.** Enquadrar a recusa como ato
antissindical é **postura combativa**, e tem custo: a mesma nota que quer convencer o
contador a colaborar passa a ameaçá-lo. Ver §6 — proponho que este ponto exista **apenas na
Nota Oficial**, o documento denso, e **não** na Resumida nem no corpo do e-mail. O combate
existe e é legítimo; ele só não deve ser a primeira coisa que o contador lê.

---

## 5. Segurança dos dados — o que a nota pode afirmar como verificável

Não é promessa de intenção; é como o sistema está construído (spec §6 e ETAPA 08). É isto que
distingue a nota de um texto de LGPD genérico.

| Medida | O que garante |
|---|---|
| Canal por **token com validade** (90 dias) e **revogável** | link não vira credencial permanente; vazamento se desliga sem perder histórico |
| Token **não lê nada** | quem abre o link só consegue **enviar**; nunca listar nem consultar dado alheio |
| **Rate limit por token** | freio no recurso atacado, nunca no dono legítimo |
| Arquivo em **bucket privado**, por URL assinada que expira | planilha com CPF jamais em link público |
| **Validação no navegador do próprio contador** | dígito verificador de CPF conferido antes do envio |
| **Nenhuma remessa vira cadastro sem revisão humana** | ninguém de fora escreve na base cadastral |
| **Remessa imutável**, com IP e user-agent registrados | rastreabilidade de quem enviou o quê e quando |
| **RLS com política explícita** em todas as tabelas | isolamento verificado no banco, não só na aplicação |
| **Portão de segurança adversarial** antes de qualquer disparo | o sistema é atacado de propósito antes de entrar no ar |

Somar os princípios do **art. 6º**: finalidade, adequação, **necessidade** — e, sobre
necessidade, dizer o que **não** se pede (data de nascimento, endereço, e-mail pessoal, e a
data de entrega da carta de oposição). **Mostrar o que não se pede é a prova mais barata de
minimização.** Somar ainda o **art. 46** (segurança) e o **art. 18** (direitos do titular),
com os canais de §3.4.

---

## 6. Os três produtos — e o que muda entre eles

| | **Nota Técnica Oficial** | **Nota Resumida** | **Página pública** |
|---|---|---|---|
| Formato | PDF, denso, referenciado, com ilustrações estilo manual | 1 folha, layout comercial | HTML no site, conforme §5 do esboço original |
| Destino | download no site + link em todo e-mail (Trilhas 1 e 2) | **anexo** nos e-mails | link em todo e-mail do eixo Requisição |
| Leitor | contador cético, advogado da empresa | contador com pressa | quem clicou para conferir |
| §4.4 (ato antissindical) | **sim** | **não** | **não** |
| Assinatura + OAB | **sim** | sim | sim |

⚠️ **Um conflito operacional que precisa de decisão sua.** A Nota Resumida vai como **anexo**
nos e-mails da campanha — mas **anexo em disparo em massa derruba entregabilidade** de forma
significativa, e a Subetapa 08.14 registra "nenhum anexo" como critério de qualidade
justamente por isso. São coisas incompatíveis. Alternativas, em ordem de preferência minha:

1. **A Resumida vira link**, não anexo — um PDF hospedado no site, apontado no corpo do
   e-mail. Preserva entregabilidade e não perde nada de substância.
2. Anexo só na **Trilha A** (89 contabilidades da onda 1), onde o volume é baixo e o risco de
   reputação é menor — e link nas demais.
3. Anexo em todas, aceitando o custo de entregabilidade. **Não recomendo**, sobretudo em
   domínio novo, ainda em aquecimento.

**Ordem de construção sugerida:** Oficial primeiro (é a fonte), depois Resumida (recorte),
depois Página (adaptação para leitura em tela). Escrever a Resumida antes da Oficial produz
resumo do que ainda não existe.

---

## 7. Pendências antes da redação final

| # | Pendência | Com quem |
|---|---|---|
| 1 | **`docs/fundamentos` está vazio** — literatura jurídica não entregue | Maxwell |
| 2 | **Transcrever a cláusula de cada CCT** que obriga o fornecimento (§3.1) — hoje as 27 convenções estão sem documento anexado | Maxwell / Denise |
| 3 | Sobrenome e **inscrição OAB/MG** do Adenilson (assinatura dos 3 produtos) | Maxwell |
| 4 | Adenilson aceita o encargo de **encarregado (DPO)** e a publicação do canal? (§3.4) | Adenilson |
| 5 | Confirmar a **analogia da Lei 13.787/2018** e o tratamento **pseudonimização × anonimização** (§3.5) | Adenilson |
| 6 | Conferir os dispositivos de **ato antissindical** e a não ratificação da **Convenção 87** (§4.4) | Adenilson |
| 7 | Decidir **anexo × link** para a Nota Resumida (§6) | Maxwell |

---

## 8. Decorrências já mapeadas

**Atualizar `https://sindcompassos.org/termos/`.** Quando os três textos estiverem aprovados
e a página no ar, a página de Termos de Uso e Política de Privacidade precisa ser revista
para ficar coerente com as novas diretrizes de coleta, tratamento, guarda e exclusão —
sobretudo a política de Carta de Exclusão e o prazo de retenção de §3.5. **Registrar no
backlog.**

**Fila de demandas do jurídico no CRM** (§3.4) — ferramenta futura, no padrão do QR Code dos
recepcionistas e do token das contabilidades. **Registrar no backlog do `CLAUDE.md`**; não é
escopo da ETAPA 08.

**Impacto no cronograma.** O eixo **Requisição** (Subetapas 08.14 e 08.15) segue **bloqueado**
até a nota estar publicada e assinada. Os eixos **Estrutural** e **Informativo** da Trilha B
correm sem ela: enquanto a nota não sai, a campanha pode se apresentar e informar — **mas não
pode pedir**. E é o pedido que resolve o gargalo de zero trabalhadores vinculados.
