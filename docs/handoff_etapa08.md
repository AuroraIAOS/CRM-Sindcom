# Handoff — abertura da sessão que planeja a ETAPA 08

Prompt para colar numa **sessão nova** do Claude Code, na raiz do projeto.
A sessão nova não terá o histórico desta — o prompt abaixo é autossuficiente.

---

```
CODE, esta sessão tem um objetivo único: transformar uma spec já aprovada num
plano de ações executável. Você NÃO vai implementar nada nesta sessão.

# LEITURA OBRIGATÓRIA, NESTA ORDEM

1. CLAUDE.md — regras invioláveis do projeto
2. orientacoes.md — armadilhas já vencidas (§2.15 a §2.21 são recentes e
   relevantes para o que você vai planejar: view sem security_invoker, grants de
   fábrica, trigger que substitui DEFAULT, rate limit em endpoint público,
   injeção de fórmula em planilha, e as duas armadilhas de ambiente de teste)
3. docs/superpowers/specs/2026-08-24-comunicacao-externa-design.md — A SPEC.
   É o insumo principal. Está aprovada por Maxwell; não a redesenhe.
4. specs/plano_fases.md — o formato do plano e o histórico das ETAPAS 00 a 07
5. specs/importacao.md §3.3 e §5 — o template de trabalhadores e a política de
   duplicata, que a spec reaproveita

# O QUE ENTREGAR

A ETAPA 08 escrita em specs/plano_fases.md, no MESMO formato das etapas
anteriores, inserida depois da ETAPA 07 e antes da "ETAPA 05 — BACKLOG".

Cabeçalho da etapa, com objetivo geral, modo predominante e portão de saída.
Depois, uma subetapa por unidade entregável, cada uma com ESTES campos:

### Subetapa 08.X — <nome> [Manual|Goal|Plan] [LLM: Sonnet|Opus] · Status: ⬜
Objetivo: o que existe ao final, em uma frase.
Conclusão: o critério binário que decide se acabou. Verificável, não opinativo.
Qualidade: o que precisa ser verdade ALÉM de funcionar — invariantes, padrões do
  projeto, o que NÃO pode quebrar.
Evidência: o artefato que prova (saída de teste, medição, print, log).
Esforço máximo: teto de tentativas do /goal.
Escalonamento de LLM: qual modelo na 1ª tentativa, qual na 2ª.
Se esgotar: o que fazer — sempre parar e relatar, nunca seguir no vermelho.

# COMO CALIBRAR OS CAMPOS

- [Goal] para o que tem critério de aceite mecânico (código com teste).
  [Manual] para o que depende de terceiro ou de decisão humana. [Plan] para
  desenho.
- Sonnet na 1ª tentativa do que é padrão conhecido; Opus direto no que toca
  SEGURANÇA, dado pessoal ou superfície pública — a ETAPA 07 mostrou o custo de
  errar aí.
- Esforço máximo baixo (1-2) no que é bem definido; 3 no que tem incerteza real.
- "Conclusão" precisa ser falsificável. "Tela funcionando" não serve;
  "o contador envia .xlsx pelo token e a remessa aparece em remessas_dados com
  status validada" serve.

# RESTRIÇÕES QUE O PLANO PRECISA RESPEITAR

- Ordem de construção e caminho crítico: a spec já os define (§11). Respeite.
- O que a spec põe fora de escopo (§12) fica fora. Não expanda.
- Toda tabela nova nasce com RLS E policy explícita — o grant de fábrica deste
  projeto vem aberto demais (medido na ETAPA 07, achado A-07).
- A página de upload é endpoint público que recebe dado pessoal: mesma classe de
  risco do check-in por QR. Token com validade, rate limit, bucket privado,
  nenhuma escrita na base cadastral sem revisão humana.
- Nada de n8n e nada de pg_cron no envio (decisão D2 da spec, com motivo).
- A nota técnica jurídica (§10) é bloqueante do eixo Requisição e depende do
  Adenilson — modele como dependência externa, não como tarefa do CODE.
- O registro DMARC não existe hoje e é pré-requisito de qualquer disparo.

# ANTES DE ESCREVER

Meça o estado atual em vez de supor: quantos trabalhadores e vínculos existem
hoje, quais tabelas da spec já existem, e se o site e o subdomínio de envio
estão de pé. A spec traz números de 2026-08-24 — confirme se ainda valem.

Se algo na spec estiver ambíguo ou tiver ficado desatualizado, PERGUNTE antes de
decidir por conta própria.

Ao final: mostre a ETAPA 08 para aprovação do Maxwell ANTES de commitar.
```

---

## Contexto de apoio (não precisa colar, mas ajuda se a sessão perguntar)

**Estado em 2026-08-24, medido em produção:**

| | |
|---|---|
| `trabalhadores` | 1 registro |
| `vinculos_empregaticios` | 0 |
| Estabelecimentos | 17.300 (todos ativos), 60 em ACT |
| Caixas de e-mail únicas | 9.191 |
| Concentração | 89 caixas cobrem 24% da base; 337 cobrem 38% |
| SPF | `v=spf1 include:spf.titan.email ~all` |
| DMARC | **não existe** |
| Site | no ar (HTTP 200) |
| `pg_cron` | instalada, 4 jobs ativos |
| `pg_net` | disponível, **não** instalada |

**Branch:** `feature/comunicacao-externa` (a spec está lá, commits `4ae8fc6` e `bb66ec2`).

**Etapas já concluídas:** 00 a 04, 06 e 07. A ETAPA 05 é backlog e fica por último no
documento — a 08 entra ANTES dela.
