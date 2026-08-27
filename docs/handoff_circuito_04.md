# Handoff — abertura da sessão que executa o CIRCUITO 4 da ETAPA 08

Prompt para colar numa **sessão nova** do Claude Code, na raiz do projeto.

**Modelo: Opus.** Portão de segurança adversarial, copy que carrega argumento jurídico e o
primeiro disparo real para produção — as três coisas que a etapa reserva para Opus do início ao
fim, sem escalonamento.

---

```
CODE, esta sessão executa o CIRCUITO 4 da ETAPA 08 — portão adversarial e disparo.
Os Circuitos 1, 2 e 3 estão CONCLUÍDOS e em produção. Este é o ÚLTIMO circuito da etapa.

# LEITURA OBRIGATÓRIA, NESTA ORDEM

1. CLAUDE.md — em especial o "Portão de segurança adversarial", que é obrigatório
   aqui por regra, não por escolha
2. orientacoes.md — §2.15/§2.16 (view sem security_invoker, grants de fábrica —
   a varredura de catálogo que pegou 2 dos 5 achados da ETAPA 07), §2.24 (mascarar
   COLUNA não exige desligar RLS — relevante para a decisão pendente abaixo),
   §2.20 (exigirBench — ataque destrutivo só no bench), §2.6d (UPDATE barrado não
   dá erro), §7.1d e §4.9 (testes/guards que se autocontaminam — cuidado ao
   escrever os novos testes adversariais)
3. specs/plano_fases.md — ETAPA 08: o bloco "CIRCUITOS 1, 2 E 3 CONCLUÍDOS" e as
   Subetapas 08.12, 08.14, 08.15, mais "Aceite da Etapa 08" e "Riscos" no final
4. docs/RELATORIO_ANALISE_VITRINE.md e docs/RELATORIO_07_PORTAO_ADVERSARIAL.md —
   método do portão adversarial: os 7 passos, os 7 vetores, o formato do relatório
5. tests/adversarial/ — os 4 arquivos já existentes, para seguir o mesmo padrão
   no novo `05_comunicacao.spec.ts`
6. sql/22_cobertura_08_11.sql — Parte 2 (comentada): a decisão de segurança que a
   08.11 deixou pendente para você, ver "DUAS COISAS" abaixo

# O QUE EXECUTAR, NESTA ORDEM

08.12 → 08.14 → 08.15. A 08.3(b) (nota técnica jurídica assinada) **já fechou** no
Circuito 1 — não a redeclare pendente. Os critérios de conclusão de cada uma estão
no plano e são o contrato.

- 08.12  ataque de propósito ao que os Circuitos 2 e 3 criaram: token de outra
         contabilidade, expirado, revogado, força bruta; leitura das 6 tabelas
         novas + do bucket por `anon`; CSV disfarçado de `.xlsx`; fórmula do
         Excel sobrevivendo até a exportação da 08.11; varredura de catálogo de
         views/grants. Relatório em `docs/RELATORIO_08_ADVERSARIAL.md`.
- 08.14  as 4 copies (trilha A: 1 e-mail para contabilidades; trilha B: 3 e-mails
         para empresas isoladas — estrutural/informativo/requisição), aprovadas
         por Maxwell. A copy de Requisição só fecha depois de conferir que a
         página da nota técnica responde 200 (é aqui, não numa 08.3(b) à parte).
- 08.15  onda 1: dispara para as 89 contabilidades grandes (3.758 estabelecimentos,
         24% da base). **Só sob ordem explícita de Maxwell**, nunca por iniciativa
         sua — mesmo com o relatório da 08.12 100% verde.

# O QUE JÁ ESTÁ PRONTO E VOCÊ NÃO PRECISA CONSTRUIR

- **9.186 tokens reais já existem em produção**, em 4 campanhas
  (`Coleta 2026 · Contabilidades grandes/médias/pequenas` e
  `· Empresas isoladas`), gerados na 08.13. Nenhum e-mail foi disparado ainda.
  `campanhas.eixo`/`assunto` estão em branco — é a 08.14 que preenche.
- **Os 4 CSVs para o ESP** estão em `dados/campanha_08_13/` nesta máquina
  (gitignored — 9.186 e-mails reais). Confirme com Maxwell se ele já os subiu
  na Brevo antes de tratar a 08.15 como pronta para disparar.
- **A superfície inteira do contador** (`/enviar-dados/:token`, `/remessas`,
  `/cobertura`) está em produção, testada (222 testes) e é o alvo do ataque —
  não precisa ser reconstruída, só atacada.
- **Os 3 textos jurídicos estão assinados** — Adenilson Antonio Silva, OAB/MG
  96.522 — em `docs/juridico/*.md`. A conversão `.docx`/`.pdf` e a publicação da
  página no site são com Maxwell; confirme que a URL pública responde 200 antes
  de fechar a copy de Requisição.
- **`interpretarSituacaoSindical`** (`src/features/importacao/parsers.ts`) e
  **`descartarLinhasSemPessoa`** (`src/features/importacao/validarTrabalhadores.ts`)
  são os pontos únicos de tradução de vocabulário do contador — não escreva um
  segundo.

# DUAS COISAS QUE O CIRCUITO 4 PRECISA SABER ANTES DE COMEÇAR

1. **Decisão de segurança pendente de você:** a 08.11 escreveu — mas não aplicou —
   a view que mascara `envios_campanha.token` para quem não é Admin
   (`sql/22_cobertura_08_11.sql`, Parte 2, comentada). O motivo de não aplicar foi
   justamente "isso é decisão de RLS, escreva mas peça revisão" — que agora é sua.
   Ela usa `security_invoker = on` + `case when fn_eh('admin')...` em vez do padrão
   `SECURITY DEFINER` de `v_fila_parceiro` (raciocínio em orientacoes.md §2.24).
   Revise, decida (aplicar, ajustar, ou aceitar o risco com motivo registrado — a
   tela `/cobertura` funciona igual nos três casos, porque nunca leu o token) e
   inclua a decisão no relatório da 08.12: é exatamente o tipo de achado que o
   portão deveria fechar.
2. **5 caixas isoladas ficaram de fora da campanha D**, por e-mail malformado na
   RFB (ponto final sobrando, TLD truncado). Estão listadas no commit da 08.13 e
   no output do script (`scripts/gerar_campanha_08_13.mjs`). Não é bloqueante,
   mas vale um aviso à Denise para corrigir manualmente se quiser alcançá-las.

# RESTRIÇÕES QUE NÃO SE NEGOCIAM

- Ataque destrutivo só no bench (`ikculjjvvyajhfxifuga`), nunca em produção —
  `exigirBench()` em todo teste que grava ou apaga de propósito.
- Rodar a varredura de catálogo (views sem `security_invoker`, grants de fábrica),
  não só reler migrations — é onde a ETAPA 07 encontrou o que a leitura de código
  não encontraria.
- Todo vermelho é hipótese até ser medido de novo — não declare achado sem provar
  com requisição real.
- Nenhum disparo sem relatório 100% verde da 08.12, e nenhum disparo sem ordem
  explícita de Maxwell — mesmo com tudo verde.
- Merge para `main` continua sendo atribuição exclusiva de Maxwell.

# PENDÊNCIAS HERDADAS, PARA NÃO CONFUNDIR COM DEFEITO NOVO

- **TRUNCATE de fábrica em `storage.*` para `anon`/`authenticated`** não pôde ser
  revogado (o `postgres` do projeto não é superuser). Aceito com motivo — schema
  `storage` não é exposto pelo PostgREST. Só precisa entrar no relatório da 08.12.
- **`Reply-To` das campanhas** sai num subdomínio sem MX. Correção agendada para a
  própria 08.14 — confirme se já foi feita.
- **`auth_leaked_password_protection`** desativado (plano Free do Supabase) —
  lembrar Maxwell se a sessão tocar em Auth/segurança.
- **`scripts/gerar_docx_juridico.ps1` trava** na metade que dirige o Word. A
  conversão dos textos jurídicos ficou manual, com Maxwell.

Comece pela 08.12. Se algo no plano estiver ambíguo, PERGUNTE.
```

---

## Contexto de apoio (não precisa colar)

**Branch:** `feature/comunicacao-externa` · **tag do marco anterior:** nenhuma ainda — este é o
handoff aberto ao fim do Circuito 3, commit `67d9018`.
**Supabase produção:** `vcswvscjqifelslsdjth` · **bench descartável:** `ikculjjvvyajhfxifuga`

### O que o Circuito 3 deixou pronto e vale conhecer

| Peça | Onde |
|---|---|
| Modelo `.xlsx` gerado no navegador | `src/features/coleta/gerarModelo.ts` |
| Formulário direto (empresa isolada) | `src/features/coleta/FormularioDireto.tsx` |
| Tela de cobertura + revogação | `src/features/cobertura/` |
| View de cobertura (aplicada) | `sql/22_cobertura_08_11.sql`, Parte 1 |
| View de mascaramento do token (NÃO aplicada) | `sql/22_cobertura_08_11.sql`, Parte 2 |
| Gerador dos tokens reais da campanha | `scripts/gerar_campanha_08_13.mjs` |
| Os 4 CSVs para o ESP | `dados/campanha_08_13/` (local, gitignored) |

### Estado medido em 2026-08-26, fim do Circuito 3

- `envios_campanha`: 9.186 novos (campanhas reais) + os 3 tokens DEMO de sempre
- `campanhas`: 4 novas (`Coleta 2026 · ...`) + 1 DEMO
- Suíte: **222 testes, 3 falhas** — todas em `cartas`, PRÉ-EXISTENTES (§7.1b)
- `typecheck` e `build` limpos; bundle principal ~1.240 kB, `exceljs` isolado em chunk próprio

### Tokens DEMO em produção, se precisar de um link já conhecido

válido `73e4234e-46a0-42ef-8af9-aa3a14ab9325` · revogado
`cdaf52fb-9203-4d67-aec5-8dae955b9194` · expirado
`1237ad75-1ea7-4a37-8ee9-9418f5b3b0c1`
