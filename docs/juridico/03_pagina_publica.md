# Base legal para a solicitação de dados dos trabalhadores

*Por que o SINDCOM solicita os dados dos trabalhadores do comércio, por que sua empresa pode
enviá-los, e o que fazemos para proteger essas informações.*

---

## Quem somos e o que solicitamos

O **Sindicato dos Empregados no Comércio de Passos e Região** representa os trabalhadores do
comércio em 29 municípios do sudoeste de Minas Gerais.

Estamos solicitando às empresas e aos escritórios de contabilidade da região **seis
informações** sobre cada trabalhador:

- CNPJ do estabelecimento
- Nome
- CPF
- Telefone de contato
- Piso salarial pago
- Se é sindicalizado ou se manifestou oposição à contribuição

**Não solicitamos** data de nascimento, endereço residencial, e-mail pessoal, estado civil,
dados de dependentes nem a data de entrega da carta de oposição. A lista é curta de
propósito: coletamos o mínimo necessário.

## Por que podemos solicitar

A Constituição Federal atribui ao sindicato **a defesa dos direitos e interesses coletivos ou
individuais da categoria** (art. 8º, III). Essa representação alcança **toda a categoria** —
não apenas quem é filiado.

A CLT confere ao sindicato as prerrogativas de **representar** os interesses da categoria
(art. 513, "a") e de **impor contribuições** a todos os que dela participam (art. 513, "e").

Um sindicato que não sabe quem compõe a categoria não consegue negociar pisos com base na
realidade salarial, identificar descumprimento de cláusula convencional, nem prestar serviço
a quem tem direito a ele.

## O dado sensível: filiação sindical

A informação sobre ser sindicalizado ou ter se oposto à contribuição é **dado pessoal
sensível** (Lei Geral de Proteção de Dados, art. 5º, II). Dados sensíveis têm regime mais
estrito, e é correto que tenham.

Tratamos essa informação com base no **art. 11, II, "d"** da LGPD — exercício regular de
direitos. **Não solicitamos consentimento do trabalhador por meio do empregador**, e isso é
uma decisão deliberada: consentimento sobre filiação sindical colhido por quem paga o salário
é frágil e pode expor o trabalhador. Afastar essa via **protege quem trabalha**.

### Por que precisamos saber quem se opôs

**Para deixar de cobrar dessa pessoa.**

O Supremo Tribunal Federal decidiu que a contribuição pode alcançar toda a categoria **desde
que assegurado o direito de oposição**. E a Convenção Coletiva permite que o trabalhador
manifeste essa oposição **por escrito, perante a própria empresa**.

Quando isso acontece, **somente a empresa sabe**. Se ela não nos informa, cobramos de quem se
opôs — e a mesma cláusula nos obriga a devolver o valor.

> A informação sobre oposição não serve para agir contra o trabalhador. Serve para que o
> sindicato **se abstenha**. Sem ela, o direito de oposição não se realiza na prática.

## Por que a empresa e a contabilidade podem enviar

**Porque a Convenção Coletiva já as obriga a isso.**

A cláusula que trata da contribuição dos empregados determina que, dentro de 15 dias do
desconto, as empresas encaminhem ao sindicato os comprovantes de recolhimento **acompanhados
das relações de empregados**, com os respectivos salários.

Havendo obrigação pactuada em norma coletiva, o envio tem base legal própria — **art. 11, II,
"a"** da LGPD para o dado sensível, e **art. 7º, II** para os demais.

**O contador que atende à nossa solicitação não está compartilhando dado indevidamente: está
cumprindo obrigação convencional do seu cliente.** E estamos solicitando **menos** do que a
convenção nos faculta exigir.

## O que fazemos — e o que não fazemos — com os dados

**Finalidade.** Representação sindical, cálculo da contribuição devida e respeito às
oposições. Nada além.

**Como recebemos.** Por link individual, com prazo de validade e revogável, que **permite
apenas enviar** — nunca consultar ou listar dados de terceiros. O arquivo fica em repositório
privado, jamais em endereço público.

**Antes de virar cadastro.** **Nenhuma informação entra na nossa base sem revisão humana.**
Não há gravação automática a partir de origem externa.

**Rastreabilidade.** Cada envio fica registrado, de forma imutável, com data e origem.

**Verificação.** O sistema é submetido a teste de invasão deliberado antes de entrar em
operação — não confiamos apenas em que funcione como esperado.

## Por quanto tempo guardamos

Enquanto durar o vínculo empregatício e a relação de representação, mantendo os dados
atualizados.

**Se o trabalhador pedir exclusão**, o pedido é atendido mediante **Carta de Exclusão**
entregue por ele. Para quem é filiado, informamos antes que a exclusão implica a perda dos
serviços e benefícios da filiação.

Após a exclusão ou o fim do vínculo, o registro é **reduzido ao mínimo** — iniciais do nome e
CPF mascarado —, preservando apenas o rastro necessário a auditorias e requisições judiciais.
A eliminação definitiva ocorre após **20 anos** sem qualquer movimentação.

## Direitos do trabalhador

Confirmação da existência de tratamento, acesso, correção, eliminação e informação sobre
compartilhamento — nos termos do **art. 18 da LGPD**.

Para exercer qualquer desses direitos:

- **E-mail:** juridico@sindcompassos.org
- **WhatsApp da Assessoria Jurídica:** (35) 98827-0406
- **Presencialmente:** Av. dos Expedicionários, 137, Centro, Passos/MG — de segunda a
  sexta-feira, das 08h às 11h e das 13h às 17h

## Documento completo

*A fundamentação integral, com todos os dispositivos legais e a jurisprudência citada, está
na Nota Técnica completa: **[link para o PDF]**.*

---

**[Nome completo]**
Assessoria Jurídica — OAB/MG [número]
Sindicato dos Empregados no Comércio de Passos e Região
[data]

---
---

# Notas de implementação

*Esta seção é interna e não integra a página publicada. Remover na versão final.*

- **URL sugerida:** `sindcompassos.org/base-legal-dados/`
- **A assinatura com OAB é o que dá valor à página.** Sem ela é texto no site; com ela é
  posição institucional verificável. Não publicar sem.
- Tom conforme `docs/design-tokens.md` §6: institucional, próximo, combativo quando
  necessário — **e aqui não é necessário**. Esta página convence, não confronta. O
  enquadramento como conduta antissindical fica **apenas na Nota Técnica completa**, nunca
  nesta página nem no corpo dos e-mails.
- **Corrigir o acesso por HTTP antes de publicar:** hoje `http://sindcompassos.org` responde
  200 sem redirecionar para HTTPS, e não há HSTS. Uma página que trata de base legal para
  tratamento de dados pessoais não deve ser acessível em texto claro.
- Manter a página **estável na mesma URL** — será citada em milhares de e-mails, e link
  quebrado no meio da campanha custa a credibilidade que a página existe para construir.
