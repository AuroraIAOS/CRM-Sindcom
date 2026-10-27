# Fotografias do dashboard apagadas em 2026-09-11 (Subetapa 9.2)

**O que são:** 18 linhas de `snapshots_dashboard`, com `data_ref` entre 2026-08-26 e
2026-09-09, que contavam os **trabalhadores DEMO** removidos na limpeza da base de
2026-09-09.

**Por que foram apagadas:** a limpeza daquele dia removeu as 55 pessoas fictícias, mas não
removeu as fotografias que as haviam contado. O gráfico "Evolução por nível" do dashboard
seguiu desenhando uma população de 53 pessoas que nunca foi real — e foi exatamente isso
que o Maxwell viu em produção: linhas subindo até 40 e 13 num CRM cujo cartão de KPI diz
"Trabalhadores: 1".

**Dado derivado de dado DEMO também é dado DEMO.** A regra do `CLAUDE.md` (2026-09-09) vale
para o agregado tanto quanto para a linha de origem.

**O que NÃO foi apagado:** as fotografias anteriores a 2026-08-26 (2026-07-23 a 2026-08-25).
Elas registram "0 aprovados", o que era verdade então e continua sendo — história honesta.

`auditoria` registra que a linha sumiu, não o conteúdo dela (§2.30). Por isso o dump abaixo.

## Conteúdo integral das 18 linhas

| id | data_ref | nível | qtd | mrr_mensalidades | mrr_contribuicoes |
|---:|---|---|---:|---:|---:|
| 82 | 2026-08-26 | bronze | 1 | — | — |
| 83 | 2026-08-26 | prata | 3 | — | — |
| 84 | 2026-08-26 | (global) | 4 | 0,00 | 16,67 |
| 100 | 2026-08-27 | bronze | 1 | — | — |
| 101 | 2026-08-27 | prata | 3 | — | — |
| 102 | 2026-08-27 | (global) | 4 | 0,00 | 16,67 |
| 133 | 2026-09-01 | bronze | 1 | — | — |
| 134 | 2026-09-01 | prata | 3 | — | — |
| 135 | 2026-09-01 | (global) | 4 | 0,00 | 16,67 |
| 139 | 2026-09-02 | bronze | 1 | — | — |
| 140 | 2026-09-02 | prata | 3 | — | — |
| 141 | 2026-09-02 | (global) | 4 | 0,00 | 16,67 |
| 181 | 2026-09-08 | bronze | 12 | — | — |
| 182 | 2026-09-08 | prata | 27 | — | — |
| 183 | 2026-09-08 | (global) | 39 | 0,00 | 199,33 |
| 193 | 2026-09-09 | bronze | 13 | — | — |
| 194 | 2026-09-09 | prata | 40 | — | — |
| 195 | 2026-09-09 | (global) | 53 | 0,00 | 307,66 |

Nenhuma delas tinha `municipio_id` — todas eram linhas globais.

## Estado da série depois da limpeza

| data_ref | bronze | prata | ouro |
|---|---:|---:|---:|
| 2026-07-23 a 2026-08-25 (7 datas) | 0 | 0 | 0 |
| 2026-09-10 | 0 | 0 | 0 |
| 2026-09-11 | 0 | 1 | 0 |

O `1` de 2026-09-11 é o **Isac Henrique Machado Rufino**, aprovado pelo Maxwell naquele dia
às 15:40 UTC. É o primeiro trabalhador real da base.

## O que foi corrigido junto

Ver `sql/29_snapshots_niveis_09_02.sql`: a função passou a gravar os três níveis **sempre**
(inclusive com zero) e a view passou a zerar o que falta, porque ausência numa série
temporal desenha continuidade falsa em vez de queda (`orientacoes.md` §4.5).
