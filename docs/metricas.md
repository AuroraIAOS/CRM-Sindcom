# Métricas da base — CRM Sindcom

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

## Como regenerar

Os números vêm de queries diretas no Supabase. Após cada rodada da skill `atualizar-sindcom`,
reexecute as consultas desta página e atualize a data do cabeçalho. Contexto e histórico da
carga: [`docs/plano_importacao_rfb.md`](./plano_importacao_rfb.md).
