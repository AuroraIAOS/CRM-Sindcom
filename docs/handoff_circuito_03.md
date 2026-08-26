# Handoff — abertura da sessão que executa o CIRCUITO 3 da ETAPA 08

Prompt para colar numa **sessão nova** do Claude Code, na raiz do projeto.

**Modelo: Sonnet.** O circuito inteiro é frontend de critério mecânico, consumindo o que os
Circuitos 1 e 2 já construíram. Se algo aqui virar decisão sobre RLS, endpoint público ou
escrita em massa, **pare e devolva a Maxwell** — isso é escopo de Opus, por regra da etapa.

---

```
CODE, esta sessão executa o CIRCUITO 3 da ETAPA 08 — a superfície do contador.
Os Circuitos 1 e 2 estão CONCLUÍDOS e em produção. Você constrói em cima deles.

# LEITURA OBRIGATÓRIA, NESTA ORDEM

1. CLAUDE.md
2. orientacoes.md — §2.4 (PostgREST trunca em 1000), §2.10 (Excel come zero à
   esquerda), §2.19 (fórmula no CSV), §4.8 (biblioteca pesada no bundle),
   §7.1b (teste que fixa contagem)
3. specs/plano_fases.md — ETAPA 08: o bloco "CIRCUITOS 1 E 2 CONCLUÍDOS" e as
   Subetapas 08.7, 08.8, 08.11 e 08.13
4. src/features/coleta/ — a página pública que a 08.7 e a 08.8 estendem
5. src/features/remessas/ — a tela da Denise, padrão para a 08.11

# O QUE EXECUTAR, NESTA ORDEM

08.7 → 08.8 → 08.11 → 08.13. Os critérios de conclusão estão no plano e são o
contrato.

- 08.7  modelo .xlsx gerado sob demanda, pré-preenchido com os estabelecimentos
        daquele token, marcando os já cobertos
- 08.8  formulário direto na página, para a empresa isolada (8.241 casos, 53%)
- 08.11 tela de cobertura por contabilidade + revogação de token
- 08.13 as 4 listas segmentadas (89/248/613/8.241 = 9.191) e os envios_campanha

# O QUE JÁ ESTÁ PRONTO E VOCÊ NÃO PRECISA CONSTRUIR

- **`exceljs` instalado.** Carregue por `await import("exceljs")` dentro da
  função, NUNCA no topo do módulo: no topo ele leva o bundle principal de
  1.204 kB para 2.144 kB (medido, orientacoes §4.8).
- **A Edge Function já devolve o que a 08.7 precisa.** `GET
  /functions/v1/receber-remessa?token=<uuid>` responde
  `{ok:true, nome, estabelecimentos:[{cnpj, razao_social, nome_fantasia,
  ja_coberto}]}`. **Não altere a Edge Function** — ela é superfície pública,
  escopo de Opus.
- **`scripts/gerar_modelo_coleta.mjs`** gera hoje o modelo ESTÁTICO servido em
  `/modelos/quadro-de-empregados.xlsx`. Ele é o degrau anterior da 08.7: mesmos
  cabeçalhos (`cnpj_estabelecimento | nome | cpf | telefone | piso | status`),
  mesmo `numFmt: '@'` nas colunas de CPF/CNPJ, aba "Instruções". Reaproveite a
  estrutura; ao fim, remova o estático e os hooks `predev`/`prebuild`.
- **O mapeamento situação→booleano tem UM lugar só:**
  `interpretarSituacaoSindical` em `src/features/importacao/parsers.ts`. A 08.7 e
  a 08.8 usam ele. Não escreva um segundo.
- **Tokens DEMO em produção**, para testar sem esperar a 08.13:
  válido `73e4234e-46a0-42ef-8af9-aa3a14ab9325` · revogado
  `cdaf52fb-9203-4d67-aec5-8dae955b9194` · expirado
  `1237ad75-1ea7-4a37-8ee9-9418f5b3b0c1`

# ESTADO MEDIDO (2026-08-26, produção)

- contabilidades **951** · contabilidade_estabelecimentos **7.440**
- trabalhadores **6** · vínculos **3** · estabelecimentos com trabalhador **2**
- remessas_dados **2** (ambas importadas) · estabelecimentos 17.302 · empresas 16.672
- suíte: **202 testes, 3 falhas** — todas em `cartas`, PRÉ-EXISTENTES, por fixarem
  contagens do cenário DEMO Kabum (§7.1b). Não são sua regressão; se subirem
  para 4, são.

# DUAS COISAS QUE A 08.11 PRECISA SABER ANTES DE COMEÇAR

1. **A Secretaria hoje lê `envios_campanha` inteira, e a coluna `token` está
   nela.** RLS restringe quais LINHAS, nunca quais COLUNAS. O critério "o token
   não aparece em claro para quem não é Admin" é da 08.11, e a solução é uma view
   `SECURITY DEFINER` com filtro interno — padrão de `v_fila_parceiro`. Isso é
   decisão de RLS: **escreva o SQL, mas peça revisão de Maxwell antes de aplicar.**
2. **Cobertura é query, nunca campo materializado.** Um `respondido_em` booleano
   esconderia as 89 empresas que faltam, e é justamente esse número que dirige o
   follow-up.

# RESTRIÇÕES QUE NÃO SE NEGOCIAM

- Não altere Edge Function, RLS aplicada, nem escreva em massa em produção sem
  ordem explícita — é escopo de Opus (Circuito 4).
- Toda query em `features/<domínio>/api.ts` como hook TanStack nomeado.
- Exportação CSV sempre por `lib/csv.ts`, que neutraliza fórmula do Excel (§2.19).
- O CSV que sobe para o ESP (08.13) **não leva CPF nem dado de trabalhador**:
  nome da caixa, e-mail e o link com token, e nada mais.
- A lista da 08.13 é montada **por CAIXA de e-mail**, nunca por estabelecimento —
  um contador com 129 estabelecimentos receberia 129 e-mails idênticos.
- Nenhum teste fixa contagem que o dado de demonstração vá quebrar (§7.1b).
- Dados de demonstração ficam gravados, com prefixo `DEMO —`.
- Deploy ao fim de cada subetapa: `bash scripts/deploy.sh` (build + FTP +
  conferência de tamanho). Nunca com `npm run test` ou `typecheck` quebrados.
- Ao fim de cada subetapa: marcar status em `specs/plano_fases.md`, acrescentar
  ao `orientacoes.md` o que foi diagnosticado E resolvido, e commit + push.

# O QUE NÃO FAZER

- Não implemente 08.12, 08.14 nem 08.15 — são o Circuito 4, em Opus.
- Não dispare e-mail nenhum. O disparo é a 08.15 e é ordenado por Maxwell.
- Não faça merge para main. Atribuição exclusiva de Maxwell.

Comece pela 08.7. Se algo no plano estiver ambíguo, PERGUNTE.
```

---

## Contexto de apoio (não precisa colar)

**Branch:** `feature/comunicacao-externa` · **tag do marco anterior:** `etapa-08-circuito-2`
**Supabase produção:** `vcswvscjqifelslsdjth` · **bench descartável:** `ikculjjvvyajhfxifuga`

### O que o Circuito 2 deixou pronto e vale conhecer

| Peça | Onde |
|---|---|
| 6 tabelas + RLS | `sql/20_comunicacao_externa.sql` |
| Bucket privado, freio por token | `sql/21_remessas_recepcao.sql` |
| Edge Function pública | `supabase/functions/receber-remessa/index.ts` |
| Página do contador | `src/features/coleta/` |
| Revisão da Denise | `src/features/remessas/` |
| Semeadura (950 contabilidades) | `scripts/semear_contabilidades_08_9.mjs` |
| Gerador de `.xlsx` sem dependência | `scripts/gerar_xlsx_demo.mjs` |

### Pendências herdadas, para não confundir com defeito novo

- **3 falhas em `cartas`**, por fixarem contagens do cenário DEMO Kabum. Corrigi-las é assertar
  o recorte em vez do número (§7.1b) — vale fazer, mas não é do Circuito 3.
- **TRUNCATE de fábrica em `storage.*` para `anon`/`authenticated`** não pôde ser revogado: o
  `postgres` do projeto não é superuser nem membro de `supabase_storage_admin`. **Aceito com
  motivo** — o schema `storage` não é exposto pelo PostgREST (medido). Item do relatório da 08.12.
- **`Reply-To` das campanhas** sai num subdomínio sem MX. Correção agendada para a 08.14.
- **`auth_leaked_password_protection`** desativado (plano Free do Supabase).
- **`scripts/gerar_docx_juridico.ps1` trava** na metade que dirige o Word. Commitado com aviso e
  quatro hipóteses já refutadas. A conversão dos textos jurídicos ficou com Maxwell.
