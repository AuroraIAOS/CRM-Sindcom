# Handoff — abertura da sessão que executa a ETAPA 09

Prompt para colar numa **sessão nova** do Claude Code, na raiz do projeto.

**Modelo: Opus na 9.00 e na 9.1; Sonnet dá conta da 9.0 e das ondas 02/03.** A 9.00 mexe no
cabeçalho `List-Unsubscribe`, onde o erro não aparece em teste — aparece em reputação de domínio,
semanas depois. A 9.1 é a única chance de perceber um defeito sutil de copy antes de ele alcançar
9.186 caixas.

---

```
CODE, esta sessão executa a ETAPA 09 — EXECUÇÃO DAS CAMPANHAS.

A ETAPA 08 está CONCLUÍDA e fundida em `main` (merge --no-ff 89c4c24, por ordem de
Maxwell em 2026-09-01). A estrutura de coleta inteira está no ar e provada por
teste. O que esta etapa faz é USAR essa estrutura: pôr e-mail na caixa de gente real.

# LEITURA OBRIGATÓRIA, NESTA ORDEM

1. CLAUDE.md — em especial o "Portão de segurança adversarial" (a 9.00 cria
   superfície pública nova: tela sem login + tabela nova + Edge Function) e a
   regra de deploy automático
2. orientacoes.md — §1.5 e §1.6 (o .htaccess do site institucional: onde entra
   o redirecionamento e o que derrubou o site em 2026-09-01), §2.18 (recusa é
   RESULTADO, nunca exceção — vale para a tela de descadastro), §2.20
   (exigirBench), §2.6c (GRANT concede, policy recorta), §3.8 (DMARC de
   subdomínio), §7.2 ("passou" ≠ "funcionou") e §7.9 (falha "conhecida" tem
   prazo de validade)
3. specs/plano_fases.md — a ETAPA 09 inteira: 9.00, 9.0, 9.1, 9.2 a 9.5, 9.6,
   mais "Aceite da Etapa 09" e "Riscos"
4. docs/copies_campanha_08_14.md — as 4 copies FECHADAS, os prazos por onda, e
   §10, que é o registro da decisão sobre o descadastro (leia antes de mexer
   em qualquer coisa relacionada a ele)
5. docs/RELATORIO_08_ADVERSARIAL.md — o que já foi atacado e o que resistiu;
   a 9.00 não precisa reatacar o que está lá, só o que ela criar
6. sql/20_comunicacao_externa.sql §11 — o padrão de GRANT/policy que a tabela
   nova da 9.00 deve seguir; e supabase/functions/receber-remessa/index.ts,
   que é o modelo de Edge Function pública deste projeto

# O QUE EXECUTAR, NESTA ORDEM

9.00 → 9.0 → 9.1 → [PARA E PEDE ORDEM] → 9.2 → 9.3 → 9.4 → 9.5 → 9.6

A 9.00 é a ÚNICA subetapa de construção. Da 9.0 em diante é operação, e cada
onda só sai depois que a anterior fechou no verde.

- 9.00  tela pública /descadastrar/:token + tabela `descadastros_campanha` +
        coluna `descadastrado_em` em `envios_campanha` + marcação em /cobertura.
        As três decisões de construção estão escritas no plano — a primeira é
        BLOQUEANTE (veja abaixo).
- 9.0   pré-voo: 4 itens ainda abertos (veja "ESTADO MEDIDO").
- 9.1   Onda 00 — as 4 copies disparadas DE VERDADE para contabilidades
        fictícias e caixas do próprio Maxwell, com 8 pontos de verificação.
        É a subetapa que existe para que a onda 1 não seja um experimento.
- 9.2   Onda 01: as 89 contabilidades grandes. **Só sob ordem explícita de
        Maxwell**, nunca por iniciativa sua, e nunca com a 9.1 no vermelho.

# O QUE JÁ ESTÁ PRONTO E VOCÊ NÃO PRECISA CONSTRUIR

- **9.189 tokens em produção**, em 4 campanhas + 3 DEMO. `enviado_em` NULO em
  todos. Nenhum e-mail foi disparado nunca.
- **As 4 copies estão FECHADAS e revisadas por Maxwell.** Não as reescreva.
  O único campo a preencher é `[[PRAZO]]`, e o valor por onda está em §5:
  20 dias (onda 01) · 15 (02) · 10 (03) · 10 (04), arredondado para sexta.
- **Os 4 CSVs para o ESP** estão em `dados/campanha_08_13/` nesta máquina
  (gitignored — 9.186 e-mails reais).
- **A superfície do contador inteira** — `/enviar-dados/:token`, `/remessas`,
  `/cobertura` — está em produção, testada e já atacada na 08.12.
- **A página jurídica está no ar:** https://sindcompassos.org/dados/ responde
  200 com o texto assinado (Adenilson Antônio Silva, OAB/MG 96.522).
- **O portão adversarial da 08 está verde e aplicado em produção** (sql/23).

# ESTADO MEDIDO — reconfira, não confie nesta lista

Ela foi medida em 2026-09-01 e vai envelhecer. Reconferir é uma requisição.

  https://sindcompassos.org/         → 200      (voltou de um Erro 500 no .htaccess)
  https://sindcompassos.org/dados/   → 200      página jurídica publicada
  http://sindcompassos.org/          → 200      ⚠️ SEM redirecionar para HTTPS
  envios.sindcompassos.org  MX       → nenhum   ⚠️ Reply-To de lá VOLTA com erro
  _dmarc.sindcompassos.org           → v=DMARC1; p=none; aspf=r; adkim=r
  suíte                              → 272 testes, 0 falhas
  envios_campanha                    → 9.189 linhas, 0 com enviado_em

**Os 4 itens abertos da 9.0**, todos fora do repositório e nenhum resolvível
por código:
  (c) redirecionamento HTTP→HTTPS, ACIMA do bloco de cache (orientacoes §1.5)
  (d) Reply-To da Brevo → secretaria@sindcompassos.org
  (e) os 4 CSVs importados na Brevo (89 / 248 / 613 / 8.236)
  (f) campanhas.eixo e campanhas.assunto preenchidos no CRM

# TRÊS COISAS QUE A ETAPA 09 PRECISA SABER ANTES DE COMEÇAR

1. **O descadastro tem DOIS caminhos, e só um passa pelo formulário.** Google
   e Microsoft (79,9% da lista, medido) exigem descadastro em UM CLIQUE pelo
   cabeçalho `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) — é o
   botão que o Gmail desenha ACIMA do e-mail, e ele tem de funcionar sem
   formulário, sem confirmação e sem página intermediária. **Formulário
   obrigatório nesse caminho é descumprimento**, e o dano não aparece em teste
   nenhum: aparece semanas depois, como queda de entrega, e já terá custado a
   base. O formulário da 9.00 vive APENAS no link do CORPO do e-mail. Quem sai
   pelo botão do provedor entra na tabela com `via = 'um_clique'`, sem motivo —
   e isso é cobertura parcial DE PROPÓSITO.

2. **A decisão sobre o descadastro já foi tomada, com medição.** Maxwell
   propôs retirá-lo (comunicação a pessoa jurídica com dever legal); o núcleo
   do argumento está certo e foi incorporado ao texto do rodapé — sair da lista
   muda o CANAL, não o DEVER. Mas o link fica, por três motivos medidos que
   estão em `docs/copies_campanha_08_14.md` §10. **Não reabra essa discussão
   sem ler a §10.**

3. **A 08.15 não existe mais.** Ela virou a Subetapa 9.2. Se encontrar
   referência a "08.15" em documento antigo, é endereço velho.

# RESTRIÇÕES QUE NÃO SE NEGOCIAM

- **Nenhum disparo sem ordem explícita de Maxwell** — nem a Onda 00. Ordenar
  disparo é atribuição exclusiva dele.
- **Nenhuma onda sai com a anterior no vermelho.** Rejeição acima de 2% ou
  queda em spam INTERROMPE — insistir com volume maior só queima a base, e a
  base é finita e não se recompra.
- **Cada item se prova por requisição ou por resposta que chega**, nunca por
  tela de configuração. Ler "Reply-To: secretaria@" no painel da Brevo não
  prova que a resposta chega; responder ao e-mail e ver a mensagem chegar prova.
- **Ataque destrutivo só no bench** (`ikculjjvvyajhfxifuga`), com `exigirBench()`.
- **A 9.00 cria superfície pública nova** — tela sem login, tabela nova, Edge
  Function. Isso dispara o portão adversarial do CLAUDE.md. Não é preciso
  refazer o portão inteiro; é preciso atacar **o que a 9.00 criar**, e o
  arquivo natural é um caso novo em `tests/adversarial/`.
- **O merge para `main` nunca é decisão do Claude Code.**

# ARMADILHAS ESPECÍFICAS DESTA ETAPA

- **O formulário nunca pode bloquear a saída.** Se a gravação do motivo falhar,
  o descadastro acontece assim mesmo e o erro vai para o log. O dado é
  subproduto; o direito de sair é o ato principal.
- **Mexer no `.htaccess` do site derrubou tudo em 2026-09-01** — inclusive
  arquivos estáticos. O item (c) da 9.0 é exatamente esse arquivo. Faça UMA
  mudança, prove que voltou, só então a próxima. O teste que diagnostica em uma
  requisição está em `orientacoes.md` §1.6.
- **`{{ contact.NOME }}` é inutilizável nas 4 copies** — em A/B/C o campo É o
  e-mail; em D contém CPF. O único campo de mesclagem é `{{ contact.LINK }}`.
- **Espace as requisições de verificação.** Logo depois de o site voltar, uma
  rajada devolveu 503 nas subpáginas — proteção de excesso, não defeito.

Comece pela 9.00. Se algo no plano estiver ambíguo, PERGUNTE.
```

---

## Contexto de apoio (não precisa colar)

**Branch:** `main` (a ETAPA 08 já foi fundida) · **último commit de `main`:** o desfecho da 08
**Supabase produção:** `vcswvscjqifelslsdjth` · **bench descartável:** `ikculjjvvyajhfxifuga`

### O que a ETAPA 08 deixou pronto e vale conhecer

| Peça | Onde |
|---|---|
| Edge Function pública de recepção | `supabase/functions/receber-remessa/index.ts` |
| Modelo `.xlsx` gerado no navegador | `src/features/coleta/gerarModelo.ts` |
| Formulário direto (empresa isolada) | `src/features/coleta/FormularioDireto.tsx` |
| Tela de cobertura + revogação | `src/features/cobertura/` |
| Revisão e importação da remessa | `src/features/remessas/` |
| Padrão de GRANT/policy para tabela nova | `sql/20_comunicacao_externa.sql` §11 |
| Gerador dos tokens da campanha | `scripts/gerar_campanha_08_13.mjs` |
| Os 4 CSVs para o ESP | `dados/campanha_08_13/` (local, gitignored) |
| Neutralização de fórmula no CSV | `src/lib/csv.ts` |

### Composição da lista, medida — importa para qualquer decisão sobre a campanha

| Segmento | Caixas | Provedor gratuito | Nome contém CPF |
|---|---|---|---|
| A (20+ estabs) | 89 | 59 — 66,3% | 0 |
| B (5–19) | 248 | 154 — 62,1% | 0 |
| C (2–4) | 613 | 413 — 67,4% | 0 |
| D (1) | 8.236 | 7.388 — 89,7% | 1.325 |
| **Total** | **9.186** | **8.014 — 87,2%** | **1.325 — 14,4%** |

**Google 55,4% · Microsoft 24,5% · juntos 79,9%.** É essa concentração que torna as regras de
remetente em massa dos dois um portão, e não uma recomendação.

### Cinco caixas que ficaram de fora

5 empresas isoladas foram descartadas da campanha D por e-mail malformado na RFB (ponto final
sobrando, TLD truncado). Estão listadas no output de `scripts/gerar_campanha_08_13.mjs`. Não é
bloqueante; vale um aviso à Denise se quiser alcançá-las.

### Pendências herdadas, para não confundir com defeito novo

- **`TRUNCATE` de fábrica em `storage.*`** para `anon`/`authenticated` não pôde ser revogado (o
  `postgres` do projeto não é superuser). Aceito com motivo — `storage` não é exposto pelo
  PostgREST. Registrado no relatório da 08.12.
- **43 relações de `public` ainda concedem DML a `anon`** — herança da mesma fábrica corrigida na
  08.12. A RLS nega corretamente em todas; é camada única onde poderia haver duas. Recomendação
  aberta (§8 do relatório), não defeito.
- **`auth_leaked_password_protection` desativado** — plano Free do Supabase.
- **`data_limite_oposicao` está nulo em 26 das 27 CCTs.** Não atrapalha a campanha, mas a tela
  `/cartas` mostra essa coluna em branco. É lacuna de dado, não de código.
