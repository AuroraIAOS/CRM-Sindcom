# Handoff — abertura da sessão que executa o CIRCUITO 2 da ETAPA 08

Prompt para colar numa **sessão nova** do Claude Code, na raiz do projeto.
A sessão nova não terá o histórico desta — o prompt abaixo é autossuficiente.

**Modelo: Opus, do início ao fim.** O circuito inteiro toca RLS, endpoint público e dado
pessoal. Não rebaixar no meio.

---

```
CODE, esta sessão executa o CIRCUITO 2 da ETAPA 08 — o núcleo seguro da coleta de
dados. É o caminho crítico da etapa e é indivisível por desenho.

# LEITURA OBRIGATÓRIA, NESTA ORDEM

1. CLAUDE.md — regras invioláveis, e o "Portão de segurança adversarial"
2. orientacoes.md — leia §2.6b a §2.6e, §2.15 a §2.21 e §7.1b. São exatamente as
   armadilhas que este circuito pode repetir: view sem security_invoker, grants de
   fábrica abertos demais, trigger que substitui DEFAULT, rate limit que se
   autodestrói, e teste que fixa contagem
3. specs/plano_fases.md — ETAPA 08 (linha ~550): o cabeçalho, o "Circuito de
   execução" e as Subetapas 08.4, 08.9, 08.5, 08.6 e 08.10
4. docs/superpowers/specs/2026-08-24-comunicacao-externa-design.md — a spec
   aprovada. §5 (modelo de dados), §6 (segurança do canal) e §7 (modelo de coleta)
5. specs/importacao.md §3.3 e §5 — template de trabalhadores e política de duplicata
6. supabase/functions/formulario-filiacao/index.ts — o padrão de Edge Function
   pública que já existe no projeto; siga-o
7. src/features/importacao/api.ts — a gravação em lote de 500 linhas que a 08.10
   REAPROVEITA (roda no navegador pela anon key como Admin, não é Edge Function)

# O QUE EXECUTAR, NESTA ORDEM

Circuito 2 = 08.4 → 08.9 → 08.5 → 08.6 → 08.10. A ordem não é a numérica: a 08.9
(semeadura) sobe cedo porque a 08.6 e a 08.13 dependem de haver contabilidade
cadastrada.

- 08.4  seis tabelas novas, com RLS e policy explícita  → sql/20_comunicacao_externa.sql
- 08.9  semear contabilidades (950) e vínculos (7.438) a partir do agrupamento por e-mail
- 08.5  bucket privado + Edge Function de recepção da remessa
- 08.6  página pública /enviar-dados/:token, com validação no navegador
- 08.10 revisão e importação da remessa pela Denise

Os critérios de conclusão, qualidade e evidência de cada uma estão no plano. Eles
são o contrato — não os afrouxe.

# ESTADO MEDIDO (2026-08-25, produção)

- trabalhadores: 3 (1 filiação real pendente + 2 registros DEMO da suíte); vínculos: 0
- ESTABELECIMENTOS COM TRABALHADOR VINCULADO: 0  ← é esta a métrica da etapa
- estabelecimentos 17.300 · empresas 16.671 · caixas de e-mail únicas 9.191
- concentração: 89 / 248 / 613 / 8.241 caixas (faixas 20+, 5-19, 2-4, 1)
- convenções 27 (5 CCTs + 22 ACTs) · buckets de Storage: 0 (o Storage nunca foi usado)
- suíte: 155/160. As 5 falhas são PRÉ-EXISTENTES, em cartas e dashboard, por a base
  não ter trabalhador aprovado nem vínculo. Não são sua regressão — mas se subirem
  para 6, são.

# CIRCUITO 1 JÁ ESTÁ FEITO — não refaça

- 08.0 links ✅ · 08.1 autenticação de e-mail ✅ · 08.2 assinaturas ✅
- DMARC organizacional e envios.sindcompassos.org no ar, autenticados na Brevo,
  com dkim/spf/dmarc=pass medidos em Gmail e Outlook
- 08.3 (jurídico): quatro .docx em docs/juridico/ com o Dr. Adenilson. BLOQUEIA
  apenas o eixo Requisição (08.14/08.15). Não bloqueia este circuito.
- CRM e site institucional agora forçam HTTPS (orientacoes.md §1.5)

# RESTRIÇÕES QUE NÃO SE NEGOCIAM

- Toda tabela nova nasce com RLS E policy explícita. O grant de fábrica deste
  projeto vem aberto demais — medido na ETAPA 07, achado A-07.
- envios_campanha.token_expira_em NOT NULL, default 90 dias, e token_revogado_em
  desde a criação. O token da guia pública não expira e isso ficou como pendência
  aberta da ETAPA 07; não repita numa tabela nova.
- A Edge Function NÃO escreve em trabalhadores. Recusa é RESULTADO ({ok:false}),
  nunca `raise exception` — a exceção desfaz o próprio registro do rate limit
  (orientacoes §2.18, e foi assim que a 1ª correção do check-in falhou em silêncio).
- Rate limit POR TOKEN, nunca por contabilidade.
- service_role só dentro da Edge Function. Nunca no frontend.
- Nenhuma remessa vira cadastro sem clique humano. É a garantia central da etapa.
- A 08.6 reaproveita validarTrabalhadores.ts e PreviewTable.tsx SEM FORK.
- Dados de demonstração ficam gravados, nomeados com prefixo "DEMO —".
- Deploy ao fim de cada subetapa que altere o frontend (docs/deploy.md), mas nunca
  com typecheck/build quebrados.

# MÉTODO

- Meça, não suponha — e quando uma medição contrariar sua hipótese, diga isso em vez
  de reinterpretar. Nesta etapa eu errei duas vezes e as duas correções estão
  registradas no plano; é o padrão esperado, não motivo de constrangimento.
- Verifique COMPORTAMENTO, não configuração. Painel dizendo "ativo" e arquivo
  contendo a regra não são prova; requisição real é.
- Varredura de catálogo, não releitura de migration: é assim que se pega view sem
  security_invoker e grant sobrando.
- Ao terminar cada subetapa: marque o status em specs/plano_fases.md, acrescente ao
  orientacoes.md o que foi diagnosticado E resolvido (só solução comprovada), e
  commit + push.

# O QUE NÃO FAZER

- Não implemente 08.7, 08.8, 08.11 ou 08.13 — são o Circuito 3, em Sonnet.
- Não crie login de contador, editor de campanhas nem espelhamento de métricas:
  §12 da spec põe fora de escopo.
- Nada de n8n e nada de pg_cron no envio (decisão D2).
- Não dispare e-mail nenhum. O disparo é a 08.15 e é ordenado por Maxwell.
- Não faça merge para main. Isso é atribuição exclusiva do Maxwell.

Comece pela 08.4. Se algo na spec estiver ambíguo, PERGUNTE.
```

---

## Contexto de apoio (não precisa colar; ajuda se a sessão perguntar)

**Branch:** `feature/comunicacao-externa` · último commit `020995a`
**Supabase produção:** `vcswvscjqifelslsdjth` · **bench descartável:** `ikculjjvvyajhfxifuga`

### Por que este circuito é indivisível

As cinco subetapas são a mesma cadeia de raciocínio sobre a mesma superfície — RLS, token,
bucket, dado pessoal e escrita cadastral. Partir no meio é exatamente onde a ETAPA 07 mostrou
que se perde contexto de segurança. Todas são Opus por decisão da etapa.

### Duas dependências internas que o plano explicita

1. **08.9 antes de 08.6** — a página do token precisa saber de qual contabilidade é o token.
2. **A 08.6 se prova com um token de bench criado à mão**; ela não espera a 08.13, que é a
   geração dos tokens reais da campanha.

### O que já se sabe que vai dar trabalho

- **Storage é território novo.** Zero buckets existem. Policies de `storage.objects` são
  mecanismo distinto da RLS de tabela, e entram no escopo do portão adversarial da 08.12.
- **`exceljs` está decidido** (Maxwell, 2026-08-24) e ainda **não foi instalado** — quem
  precisa dele é a 08.7, no Circuito 3. Não instale agora.
- **A 08.10 reaproveita `importarTrabalhadores`** de `src/features/importacao/api.ts`. A spec
  §4 diz que a gravação em lote é uma Edge Function: **está errado**, foi medido. Ela roda no
  navegador, pela anon key, como o Admin logado — o que é melhor, porque mantém a regra de
  não usar `service_role` no frontend.

### Pendências herdadas, para não serem confundidas com defeito novo

- 5 falhas na suíte, em `cartas` e `dashboard`, por falta de trabalhador aprovado e vínculo.
  Devem **desaparecer sozinhas** conforme a 08.10 começar a criar vínculos — se isso
  acontecer, é sinal de progresso, não de regressão.
- `Reply-To` das campanhas sai hoje no subdomínio de envio, que não tem MX. Correção agendada
  para a 08.14, fora deste circuito.
- `auth_leaked_password_protection` continua desativado (plano Free do Supabase).
- Duas CCTs (`Sincovaga`, `SinPas`) só existem como PDF digitalizado; não afeta este circuito.
