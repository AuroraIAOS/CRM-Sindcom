# Métricas da base — CRM Sindcom

> **Parte I** (§1–9): fotografia numérica da base.
> **Parte II** (§10–16): inteligência de campo — onde estão os trabalhadores e quem visitar primeiro.
>
> Fotografia da base real logo após a carga da Etapa 06. **Data: 2026-07-24.**
> Fonte: Dados Abertos do CNPJ (Receita Federal), filtrados por 29 municípios da base
> territorial + CNAE `45/46/47` + situação cadastral `02` (ativa).
> Todo número aqui saiu de uma query no banco de produção — nenhum é estimativa.
> **Regenerar após cada rodada da skill `atualizar-sindcom`.**

---

## 1. Números-cabeça

| Indicador | Valor |
|---|---:|
| **Empresas** | **16.687** |
| **Estabelecimentos** | **17.319** |
| Municípios cobertos | 29 / 29 |
| Matrizes | 16.309 (94,2%) |
| Filiais | 1.010 (5,8%) |
| CNAEs distintos em uso | 204 (de 231 possíveis em 45/46/47) |
| Naturezas jurídicas distintas | 11 |
| Estabelecimentos com e-mail | 15.694 (90,6%) |
| Estabelecimentos com telefone | 16.584 (95,8%) |
| **Sem nenhum contato** (nem e-mail nem telefone) | **685 (4,0%)** |
| Tamanho no banco | 35 MB (de 500 MB do plano Free) |

> **Leitura:** a base é esmagadoramente de **matriz única** — 97,9% das empresas têm um só
> estabelecimento. Isso significa que "empresa" e "estabelecimento" são quase sinônimos na
> prática, e que a cobrança por guia de empresa raramente vai agregar várias unidades.

---

## 2. Por município

Ordenado por número de estabelecimentos. `Emp.` = empresas distintas com ao menos um
estabelecimento no município.

| Município | Estab. | Emp. | Matriz | Filial | CNAEs | c/ e-mail | % do total |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Passos** (sede) | 4.312 | 4.184 | 4.037 | 275 | 177 | 3.909 | 24,90% |
| São Sebastião do Paraíso | 2.706 | 2.644 | 2.547 | 159 | 149 | 2.437 | 15,62% |
| Piumhi | 1.491 | 1.455 | 1.400 | 91 | 127 | 1.340 | 8,61% |
| Alpinópolis | 729 | 725 | 695 | 34 | 105 | 667 | 4,21% |
| Carmo do Rio Claro | 673 | 664 | 635 | 38 | 105 | 600 | 3,89% |
| Monte Santo de Minas | 637 | 630 | 598 | 39 | 91 | 585 | 3,68% |
| Nova Resende | 595 | 593 | 576 | 19 | 85 | 551 | 3,44% |
| Cássia | 590 | 586 | 572 | 18 | 94 | 525 | 3,41% |
| Itaú de Minas | 440 | 438 | 418 | 22 | 91 | 382 | 2,54% |
| Capitólio | 432 | 420 | 402 | 30 | 78 | 404 | 2,49% |
| Guapé | 426 | 408 | 390 | 36 | 78 | 373 | 2,46% |
| Alterosa | 420 | 419 | 398 | 22 | 82 | 383 | 2,43% |
| Ilicínea | 380 | 371 | 355 | 25 | 70 | 328 | 2,19% |
| Itamogi | 342 | 340 | 329 | 13 | 67 | 323 | 1,97% |
| Ibiraci | 312 | 307 | 280 | 32 | 67 | 285 | 1,80% |
| Pratápolis | 276 | 274 | 265 | 11 | 68 | 246 | 1,59% |
| São João Batista do Glória | 273 | 270 | 261 | 12 | 69 | 246 | 1,58% |
| Conceição da Aparecida | 263 | 259 | 247 | 16 | 69 | 237 | 1,52% |
| Arceburgo | 259 | 255 | 234 | 25 | 69 | 232 | 1,50% |
| São José da Barra | 254 | 251 | 243 | 11 | 59 | 245 | 1,47% |
| Jacuí | 248 | 243 | 238 | 10 | 61 | 235 | 1,43% |
| Delfinópolis | 245 | 243 | 237 | 8 | 60 | 229 | 1,41% |
| São Roque de Minas | 236 | 229 | 218 | 18 | 66 | 219 | 1,36% |
| São Tomás de Aquino | 199 | 197 | 183 | 16 | 53 | 185 | 1,15% |
| Capetinga | 172 | 168 | 158 | 14 | 56 | 151 | 0,99% |
| Bom Jesus da Penha | 131 | 128 | 125 | 6 | 41 | 115 | 0,76% |
| São Pedro da União | 129 | 127 | 122 | 7 | 44 | 121 | 0,74% |
| Fortaleza de Minas | 97 | 97 | 97 | 0 | 39 | 91 | 0,56% |
| Vargem Bonita | 52 | 52 | 49 | 3 | 21 | 50 | 0,30% |

> **Concentração:** os **3 maiores municípios concentram 8.509 estabelecimentos — 49,1% da
> base**. Passos sozinha é 1/4 do total. Qualquer ação (visita, campanha, cobrança piloto)
> desenhada para Passos + S. S. do Paraíso + Piumhi alcança metade da base territorial.
>
> **Fortaleza de Minas** é o único município sem nenhuma filial — 97 matrizes, 97 empresas.

---

## 3. Por porte da empresa

| Código | Porte | Empresas | % |
|---|---|---:|---:|
| `01` | Microempresa (ME) | 15.100 | **90,49%** |
| `03` | Empresa de Pequeno Porte (EPP) | 962 | 5,76% |
| `05` | Demais (médio/grande) | 625 | 3,75% |

> Nenhuma empresa com porte `00` (não informado) — o dado está completo.
> **9 em cada 10 empresas da base são microempresas.**

### Porte por município

| Município | ME | EPP | Demais |
|---|---:|---:|---:|
| Passos | 3.735 | 350 | 227 |
| São Sebastião do Paraíso | 2.374 | 158 | 174 |
| Piumhi | 1.302 | 109 | 80 |
| Alpinópolis | 664 | 25 | 40 |
| Carmo do Rio Claro | 615 | 27 | 31 |
| Monte Santo de Minas | 559 | 54 | 24 |
| Cássia | 537 | 25 | 28 |
| Nova Resende | 533 | 35 | 27 |
| Guapé | 391 | 11 | 24 |
| Capitólio | 385 | 26 | 21 |
| Itaú de Minas | 384 | 39 | 17 |
| Alterosa | 383 | 22 | 15 |
| Ilicínea | 347 | 16 | 17 |
| Itamogi | 303 | 16 | 23 |
| Ibiraci | 261 | 22 | 29 |
| São João Batista do Glória | 249 | 11 | 13 |
| Pratápolis | 245 | 17 | 14 |
| São José da Barra | 238 | 8 | 8 |
| Conceição da Aparecida | 237 | 5 | 21 |
| Jacuí | 237 | 4 | 7 |
| Arceburgo | 230 | 11 | 18 |
| Delfinópolis | 214 | 25 | 6 |
| São Roque de Minas | 202 | 10 | 24 |
| São Tomás de Aquino | 172 | 18 | 9 |
| Capetinga | 158 | 10 | 4 |
| São Pedro da União | 117 | 7 | 5 |
| Bom Jesus da Penha | 111 | 7 | 13 |
| Fortaleza de Minas | 93 | 1 | 3 |
| Vargem Bonita | 46 | 5 | 1 |

---

## 4. Por atividade econômica (CNAE)

### Divisões

| Divisão | Descrição | Estab. | CNAEs distintos | % |
|---|---|---:|---:|---:|
| **47** | Comércio varejista | **12.689** | 75 | **73,27%** |
| 45 | Veículos automotores e motocicletas | 3.073 | 29 | 17,74% |
| 46 | Comércio por atacado | 1.557 | 100 | 8,99% |

> Contraste interessante: o **atacado (46) tem a maior variedade de CNAEs (100) com o menor
> número de estabelecimentos (1.557)** — muitos nichos, poucas empresas em cada. O varejo (47)
> é o oposto: menos tipos, muito volume.

### Top 20 CNAEs

| # | CNAE | Descrição | Estab. | % |
|---:|---|---|---:|---:|
| 1 | 4781400 | Artigos do vestuário e acessórios | 2.652 | 15,31% |
| 2 | 4712100 | Minimercados, mercearias e armazéns | 1.252 | 7,23% |
| 3 | 4520001 | Manutenção e reparação mecânica de veículos | 813 | 4,69% |
| 4 | 4723700 | Bebidas | 681 | 3,93% |
| 5 | 4530703 | Peças e acessórios novos para veículos | 539 | 3,11% |
| 6 | 4729699 | Produtos alimentícios não especificados | 522 | 3,01% |
| 7 | 4772500 | Cosméticos, perfumaria e higiene pessoal | 476 | 2,75% |
| 8 | 4744099 | Materiais de construção em geral | 330 | 1,91% |
| 9 | 4789099 | Outros produtos não especificados | 312 | 1,80% |
| 10 | 4789004 | Animais vivos e artigos para pets | 306 | 1,77% |
| 11 | 4520005 | Lavagem, lubrificação e polimento de veículos | 304 | 1,76% |
| 12 | 4771701 | Produtos farmacêuticos (sem manipulação) | 288 | 1,66% |
| 13 | 4520002 | Lanternagem, funilaria e pintura | 267 | 1,54% |
| 14 | 4782201 | Calçados | 255 | 1,47% |
| 15 | 4752100 | Equipamentos de telefonia e comunicação | 248 | 1,43% |
| 16 | 4721102 | Padaria e confeitaria (revenda) | 247 | 1,43% |
| 17 | 4721103 | Laticínios e frios | 246 | 1,42% |
| 18 | 4754701 | Móveis | 220 | 1,27% |
| 19 | 4711302 | Supermercados | 218 | 1,26% |
| 20 | 4724500 | Hortifrutigranjeiros | 217 | 1,25% |

> **O vestuário sozinho é 15,3% da base** — mais que o dobro do segundo colocado. Se houver
> uma categoria para tratar com atenção especial (CCT, campanha, parceria), é essa.

### CNAE por município (divisões)

| Município | 45 Veículos | 46 Atacado | 47 Varejo |
|---|---:|---:|---:|
| Passos | 720 | 383 | 3.209 |
| São Sebastião do Paraíso | 525 | 309 | 1.872 |
| Piumhi | 306 | 149 | 1.036 |
| Alpinópolis | 141 | 62 | 526 |
| Nova Resende | 127 | 55 | 413 |
| Carmo do Rio Claro | 111 | 73 | 489 |
| Cássia | 104 | 43 | 443 |
| Monte Santo de Minas | 94 | 47 | 496 |
| Itaú de Minas | 94 | 27 | 319 |
| Alterosa | 94 | 42 | 284 |
| Capitólio | 69 | 25 | 338 |
| Guapé | 67 | 29 | 330 |
| Itamogi | 59 | 43 | 240 |
| Ilicínea | 58 | 21 | 301 |
| Conceição da Aparecida | 54 | 24 | 185 |
| São João Batista do Glória | 52 | 19 | 202 |
| Jacuí | 49 | 16 | 183 |
| São Roque de Minas | 49 | 26 | 161 |
| Ibiraci | 40 | 34 | 238 |
| São José da Barra | 39 | 4 | 211 |
| Pratápolis | 37 | 18 | 221 |
| Arceburgo | 37 | 28 | 194 |
| Delfinópolis | 31 | 15 | 199 |
| Bom Jesus da Penha | 29 | 16 | 86 |
| São Tomás de Aquino | 28 | 18 | 153 |
| Capetinga | 27 | 14 | 131 |
| São Pedro da União | 19 | 9 | 101 |
| Fortaleza de Minas | 10 | 5 | 82 |
| Vargem Bonita | 3 | 3 | 46 |

---

## 5. Por natureza jurídica

| Código | Descrição | Empresas | % |
|---|---|---:|---:|
| `2135` | Empresário (Individual) | 10.909 | **65,37%** |
| `2062` | Sociedade Empresária Limitada | 5.669 | **33,97%** |
| `2054` | Sociedade Anônima Fechada | 36 | 0,22% |
| `2143` | Cooperativa | 33 | 0,20% |
| `2240` | Sociedade Simples Limitada | 23 | 0,14% |
| `2046` | Sociedade Anônima Aberta | 9 | 0,05% |
| `3999` | Associação Privada | 3 | 0,02% |
| `2348` | Empresa Simples de Inovação | 2 | 0,01% |
| `2232` | Sociedade Simples Pura | 1 | 0,01% |
| `4014` | Empresa Individual Imobiliária | 1 | 0,01% |
| `2127` | Sociedade em Conta de Participação | 1 | 0,01% |

> **Duas naturezas cobrem 99,3% da base.** As outras nove somam 110 empresas.

---

## 6. Estrutura societária (estabelecimentos por empresa)

| Faixa | Empresas | Estabelecimentos |
|---|---:|---:|
| 1 estabelecimento | 16.333 (97,9%) | 16.333 |
| 2 a 3 | 306 | 660 |
| 4 a 9 | 42 | 220 |
| **10 ou mais** | **6** | **106** |

> Só **6 empresas** operam 10+ unidades na base territorial (a maior é a Telefônica, com 13).

---

## 7. Capital social

| Indicador | Valor |
|---|---:|
| Mediana | **R$ 10.000,00** |
| Percentil 90 | R$ 80.000,00 |
| Percentil 99 | R$ 1.200.000,00 |
| Máximo | R$ 56.071.415.865,09 |
| Empresas com capital ≥ R$ 1 mi | 206 (1,2%) |
| Empresas com capital zerado | 606 (3,6%) |
| Soma declarada | R$ 175.873.843.765,18 |

> ⚠️ **A média (R$ 10,5 milhões) é inútil aqui** — está distorcida por um punhado de gigantes
> nacionais com filial na região (a Telefônica sozinha declara R$ 56 bilhões). **Use sempre a
> mediana (R$ 10 mil)**, que descreve a empresa típica da base. Mesmo raciocínio vale para a
> "soma declarada": ela não representa riqueza local, e sim o capital nacional de empresas que
> têm uma loja aqui.

---

## 8. Idade e movimento

| Indicador | Valor |
|---|---:|
| Idade média do estabelecimento | 9,2 anos |
| Mais antigo em atividade | 29/04/1966 (SOVEMAR, Passos) |
| Mais recente | 13/06/2026 |
| Abertos nos últimos 12 meses | **1.920 (11,1%)** |
| Abertos nos últimos 5 anos | 7.642 (44,1%) |

> **Quase metade da base tem menos de 5 anos** e 11% abriu no último ano. É uma base com
> renovação alta — o que reforça a importância do ciclo mensal da skill `atualizar-sindcom`:
> sem ele, a base envelhece rápido.

---

## 9. Qualidade de contato (insumo da cobrança — Subetapa 02.6)

| Indicador | Valor |
|---|---:|
| Com e-mail | 15.694 (90,6%) |
| Com telefone | 16.584 (95,8%) |
| **Sem nenhum contato** | **685 (4,0%)** |
| E-mails distintos | 9.403 |
| Com nome fantasia | 5.932 (34,3%) |

> ⚠️ **15.694 estabelecimentos têm e-mail, mas só 9.403 e-mails são distintos.** A diferença
> de ~6,3 mil indica **e-mail de contador compartilhado** entre várias empresas (padrão visível
> na amostra: `CONTABILIDADE...@...`). Consequência prática para a cobrança por e-mail: um
> disparo pode enviar dezenas de guias diferentes para a mesma caixa de escritório contábil.
> Vale considerar agrupar por destinatário antes de disparar, e a Denise validar os principais.

---

---

# PARTE II — Inteligência de campo: onde estão os trabalhadores

> Esta parte responde a uma pergunta operacional: **quais estabelecimentos visitar primeiro**
> para alcançar o maior número de trabalhadores com o menor esforço, deixando o boca a boca
> (amostragem em bola de neve) fazer o resto.

## 10. O problema — e a honestidade sobre ele

⚠️ **A base da Receita Federal NÃO informa número de empregados.** Nenhum campo dos CSVs traz
headcount. Portanto **qualquer número de trabalhadores aqui seria invenção** — e este documento
não inventa.

O que existe são **proxies**: sinais que se correlacionam com tamanho de operação. O melhor
deles é o **porte**, porque não é opinião — é classificação legal por faturamento
(LC 123/2006):

| Porte | Faturamento anual | Leitura prática |
|---|---|---|
| `01` ME | até R$ 360 mil | Muitas vezes o dono e 1–2 ajudantes |
| `03` EPP | R$ 360 mil a R$ 4,8 mi | Operação com equipe formal |
| `05` Demais | **acima de R$ 4,8 mi** | Operação grande; folha relevante |

Faturamento não é headcount, mas no comércio a correlação é forte: não se fatura R$ 4,8 milhões
por ano numa loja tocada sozinha.

> **Enriquecimento futuro que resolveria de vez:** a **RAIS/CAGED** (Ministério do Trabalho)
> tem vínculo empregatício por CNPJ — é a fonte que traria headcount real. Se um dia for
> acessível, ela substitui todos os proxies desta seção. Vale registrar como possibilidade.

### Os proxies validados pelos próprios dados

Cruzando porte com as demais colunas, os sinais se confirmam sozinhos:

| Sinal | ME (`01`) | EPP (`03`) | Demais (`05`) |
|---|---:|---:|---:|
| Capital social mediano | R$ 10 mil | R$ 50 mil | **R$ 250 mil** |
| Idade média | 8,4 anos | 16,6 anos | 14,4 anos |
| % que são filiais | 2,3% | 15,1% | **53,4%** |
| Empresário Individual | 10.850 | 100 | **15** |

> Os três sinais andam juntos: quanto maior o porte, maior o capital, mais velha a empresa,
> mais provável ser filial de rede e menos provável ser firma individual. Isso dá confiança de
> que o porte não está isolado — é o centro de um conjunto coerente de indícios.

---

## 11. Estratificação de prioridade de campo

| Tier | Critério | Estab. | % da base | Em CNAE intensivo | De rede |
|---|---|---:|---:|---:|---:|
| **A — Máxima** | Porte Demais (`05`) | **923** | 5,3% | 550 | 415 |
| **B — Alta** | Porte EPP (`03`) | **1.074** | 6,2% | 305 | 194 |
| **C — Média** | ME, mas com sinal de porte: CNAE intensivo **ou** rede multi-unidade **ou** sociedade com capital ≥ R$ 50 mil | 2.460 | 14,2% | 929 | 377 |
| **D — Baixa** | ME individual sem nenhum sinal | 12.862 | 74,3% | 0 | 0 |

### 🎯 O número que orienta a estratégia

**Tier A + B = 1.997 estabelecimentos = 11,5% da base.**

Visitar ~2.000 endereços em vez de 17.319 é a diferença entre uma campanha exequível e uma
impossível. E são justamente os que concentram operação com equipe formal — ou seja, onde o
boca a boca tem mais gente para circular.

---

## 12. CNAEs de alta densidade de trabalhadores

Os dados revelam sozinhos quais atividades operam com equipe: basta ver **onde a microempresa
é minoria**.

| CNAE | Atividade | Total | % NÃO-micro | Leitura |
|---|---|---:|---:|---|
| **4731800** | **Postos de combustível** | 195 | **92,3%** | Frentistas, turnos, loja de conveniência |
| 4683400 | Atacado de defensivos/fertilizantes | 140 | 77,1% | Operação agro de porte |
| 4621400 | Atacado de café em grão | 150 | 71,3% | Cooperativas e armazéns |
| **4711302** | **Supermercados** | 218 | **61,0%** | Caixas, repositores, açougue, padaria |
| 4661300 | Atacado de máquinas agropecuárias | 79 | 51,9% | Vendas + oficina |
| 4639701 | Atacado de alimentos em geral | 56 | 51,8% | Logística com equipe |
| 4741500 | Tintas e material de pintura | 74 | 43,2% | — |
| 4744005 | Materiais de construção | 104 | 31,7% | — |
| 4771701 | Farmácias | 288 | 29,9% | Turnos, plantão |
| 4753900 | Eletrodomésticos / áudio e vídeo | 189 | 29,6% | Vendas + entrega + montagem |

> **Contraste que vale ouro para priorizar:** o CNAE mais numeroso da base — **vestuário
> (4781400), com 2.652 estabelecimentos — tem apenas 3,2% não-micro**. São muitas lojas
> pequenas. Já os **195 postos de combustível são 92,3% não-micro**. Visitar os 195 postos
> provavelmente alcança mais trabalhadores que visitar 2.000 lojas de roupa — com 10× menos
> deslocamento.

**Alvos de altíssima densidade, prontos para lista:**
- 195 postos de combustível
- 226 supermercados e hipermercados (99 deles de porte Demais)
- 38 lojas de departamento / magazines
- **325 estabelecimentos são Tier A *e* estão em CNAE intensivo** — a interseção mais valiosa da base

---

## 13. Redes: o atalho da bola de neve

Uma negociação com a matriz alcança N unidades de uma vez. Estas são as maiores redes presentes
na base territorial:

| Rede | Porte | Unidades | Municípios |
|---|---|---:|---:|
| **ELETROZEMA S/A** | Demais | **26** | **25** |
| **COOPERCITRUS (cooperativa)** | Demais | 24 | 10 |
| LONGIARGI CELULARES E INFORMATICA | ME | 20 | 7 |
| TELEFONICA BRASIL S.A. | Demais | 13 | 13 |
| COOXUPÉ (cooperativa de cafeicultores) | Demais | 13 | 13 |
| NATUS FARMA (medicamentos) | ME | 10 | 8 |
| CE-CELULARES E ACESSORIOS | Demais | 9 | 8 |
| MAGAZINE LUIZA S/A | Demais | 8 | 8 |
| LOJAS EDMIL S/A | Demais | 8 | 7 |
| AGRO.COM (agrícolas e veterinários) | Demais | 8 | 6 |
| ADIÇÃO DISTRIBUIÇÃO EXPRESS S/A | Demais | 8 | 4 |
| SINTEPROL MATERIAL DE CONSTRUÇÃO | Demais | 7 | 4 |
| MALO COMÉRCIO DE MÓVEIS | EPP | 7 | 7 |
| CERVEJARIA PASSOS | ME | 7 | 4 |
| IRMÃOS LIMA | Demais | 6 | 3 |

> **A ELETROZEMA está em 25 dos 29 municípios** — uma única negociação institucional cobre
> quase toda a base territorial. As duas cooperativas (COOPERCITRUS e COOXUPÉ) somam 37 unidades
> e têm cultura associativista, o que costuma facilitar a conversa sobre convênio.
>
> **Atenção ao caso LONGIARGI:** 20 unidades em 7 municípios, mas classificada como **ME**.
> Porte é da empresa (faturamento total), não da unidade — uma rede de 20 lojas pequenas ainda
> pode ser ME. Isso mostra por que o critério de rede entra no Tier C independentemente do porte:
> **20 lojas × 2 pessoas = 40 trabalhadores**, e o porte sozinho esconderia isso.

---

## 14. Rota de campo por município (Tier A + B)

Ordenado pelo que rende mais por viagem.

| Município | Tier A | Tier B | **A+B** | % do município |
|---|---:|---:|---:|---:|
| **Passos** | 227 | 350 | **577** | 13,4% |
| **São Sebastião do Paraíso** | 174 | 158 | **332** | 12,3% |
| **Piumhi** | 80 | 109 | **189** | 12,7% |
| Monte Santo de Minas | 24 | 54 | 78 | 12,2% |
| Alpinópolis | 40 | 25 | 65 | 8,9% |
| Nova Resende | 27 | 35 | 62 | 10,4% |
| Carmo do Rio Claro | 31 | 27 | 58 | 8,6% |
| Itaú de Minas | 17 | 39 | 56 | 12,7% |
| Cássia | 28 | 25 | 53 | 9,0% |
| Ibiraci | 29 | 22 | 51 | **16,3%** |
| Capitólio | 21 | 26 | 47 | 10,9% |
| Itamogi | 23 | 16 | 39 | 11,4% |
| Alterosa | 15 | 22 | 37 | 8,8% |
| Guapé | 24 | 11 | 35 | 8,2% |
| São Roque de Minas | 24 | 10 | 34 | **14,4%** |
| Ilicínea | 17 | 16 | 33 | 8,7% |
| Delfinópolis | 6 | 25 | 31 | 12,7% |
| Pratápolis | 14 | 17 | 31 | 11,2% |
| Arceburgo | 18 | 11 | 29 | 11,2% |
| São Tomás de Aquino | 9 | 18 | 27 | 13,6% |
| Conceição da Aparecida | 21 | 5 | 26 | 9,9% |
| São João B. do Glória | 13 | 11 | 24 | 8,8% |
| Bom Jesus da Penha | 13 | 7 | 20 | **15,3%** |
| São José da Barra | 8 | 8 | 16 | 6,3% |
| Capetinga | 4 | 10 | 14 | 8,1% |
| São Pedro da União | 5 | 7 | 12 | 9,3% |
| Jacuí | 7 | 4 | 11 | 4,4% |
| Vargem Bonita | 1 | 5 | 6 | 11,5% |
| Fortaleza de Minas | 3 | 1 | 4 | 4,1% |

> **Passos + S. S. do Paraíso + Piumhi = 1.098 alvos prioritários = 55% de todo o Tier A+B.**
> Três cidades concentram mais da metade do esforço útil.
>
> **Ibiraci (16,3%), Bom Jesus da Penha (15,3%) e São Roque de Minas (14,4%)** têm a maior
> *densidade* de alvos prioritários — cidades pequenas, mas com economia relativamente
> concentrada. São boas candidatas a piloto: dá para cobrir o município quase inteiro numa
> visita só.

---

## 15. KPIs para acompanhar a campanha

Sugestão de indicadores a medir **a partir do dia 1** da divulgação — todos calculáveis com o
que o CRM já tem:

| KPI | Como calcular | Por que importa |
|---|---|---|
| **Cobertura do Tier A** | estab. Tier A visitados ÷ 923 | O indicador-mestre da campanha |
| **Cobertura do Tier A+B** | visitados ÷ 1.997 | Meta realista de campo |
| **Filiações por estabelecimento visitado** | novos trabalhadores ÷ visitas | Mede a eficácia da abordagem |
| **Efeito bola de neve** | filiações **sem** visita ÷ filiações **com** visita, por município | Se > 1, o boca a boca está funcionando — é a métrica que valida a estratégia inteira |
| **Tempo até a 1ª filiação pós-visita** | dias entre visita e primeiro cadastro daquele CNPJ | Indica se a mensagem "pega" rápido |
| **Taxa de conversão por CNAE** | filiações ÷ trabalhadores estimados, por CNAE | Revela quais setores respondem melhor |
| **Penetração por município** | trabalhadores filiados ÷ estab. do município | Mostra onde a presença é fraca |
| **Custo por filiação** | deslocamento + horas ÷ filiações | Compara campanha de campo × digital |

> **O KPI que realmente testa a hipótese** é o **efeito bola de neve**. Se as filiações
> espontâneas superarem as diretas, a estratégia de focar nos grandes está comprovada — e aí
> vale ampliar. Se não superarem, a hipótese falhou e é melhor mudar de abordagem antes de
> gastar meses em campo. Meça isso desde a primeira cidade.

---

## 16. Pendências de dado que afetam a campanha

| Situação | Estab. | O que fazer |
|---|---:|---|
| Tier A (Demais) **com e-mail** | 833 de 923 | 90% dos alvos máximos são abordáveis por e-mail antes da visita |
| **Prioritários (A+B) sem NENHUM contato** | **154** | Precisam de visita física ou busca ativa — não há como abordá-los remotamente |
| Estabelecimentos sem nenhum contato | 685 | Lacuna geral da base |
| E-mails compartilhados (contadores) | ~6,3 mil | Ver §9 — cuidado ao disparar em massa |

> Os **154 prioritários sem contato** são a lista mais acionável de todo este documento para a
> Secretaria: são alvos de alto valor que **só podem ser alcançados indo até lá**. Vale
> transformá-los numa fila de trabalho no CRM.

---

## Como regenerar

Os números vêm de queries diretas no Supabase. Após cada rodada da skill `atualizar-sindcom`,
reexecute as consultas desta página e atualize a data do cabeçalho. Contexto e histórico da
carga: [`docs/plano_importacao_rfb.md`](./plano_importacao_rfb.md).
