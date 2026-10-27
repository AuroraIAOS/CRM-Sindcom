# Controle de boletos (ETAPA 10) — plano de implementação

> **Para quem executa:** usar superpowers:executing-plans (execução inline, na ordem). Passos com `- [ ]`.

**Objetivo:** controlar o fluxo manual dos boletos TAF/CA/CN/PAMED: coletar CNPJ + nº de trabalhadores por link permanente por caixa de e-mail, calcular o valor do boleto no CRM e acompanhar cada boleto até o pagamento.

**Arquitetura:** tabelas e regras no Postgres (RLS + triggers são a segurança real); recepção pública por Edge Function (`service_role` só lá); frontend em `src/features/boletos/` com hooks TanStack em `api.ts`. Tudo construído e provado **somente no bench** (`ikculjjvvyajhfxifuga`) + preview isolado.

**Stack:** Postgres/Supabase (RLS, plpgsql), Deno Edge Function, React 18 + TS + Vite, TanStack Query/Table, react-hook-form + zod, shadcn/ui, vitest (unidade), suíte RLS/adversarial em `tests/`.

**Spec:** `docs/superpowers/specs/2026-10-26-controle-boletos-design.md` (ler antes; este plano a executa).

## Restrições globais (valem para toda tarefa)

- **Nada vai para a produção** (SQL, Edge Function, deploy FTP de produção, merge) sem ordem explícita do Maxwell. Escrita em Supabase só no bench `ikculjjvvyajhfxifuga`. Leitura de produção `vcswvscjqifelslsdjth` só com `select`.
- Conversa e textos de UI em **português brasileiro**. Tokens de design em `docs/design-tokens.md`.
- Toda query Supabase vive em `src/features/boletos/api.ts` como hook nomeado; componentes não chamam `supabase-js`. A página pública **não usa `supabase-js`**.
- Views com `security_invoker = on`; `revoke all ... from anon`; sem `TRUNCATE/REFERENCES/TRIGGER` para `authenticated`; funções de trigger `SECURITY DEFINER`, `set search_path = public, pg_temp`, sem chamar outras funções, `EXECUTE` revogado de `public, anon, authenticated`.
- **TAF e PAMED:** valor = valor-base × quantidade, calculado pelo banco; sem base é **NULL e reportado**, nunca padrão/teto. **CA e CN: o CRM não calcula** (dependem do piso salarial de cada trabalhador); o valor é digitado pelo operador.
- Token permanente: encerrar ciclo **não** o revoga; trocar exige alerta de atualização manual na Brevo.
- Dado de verificação tem prefixo `DEMO —` e é **removido ao fim da subetapa**; não tocar no trabalhador `Isac Henrique Machado Rufino`.
- Não commitar sem pedido do Maxwell; merge nunca é decisão do Claude Code.
- `typecheck` e `build` verdes antes de qualquer preview.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `sql/33_boletos_10_00.sql` (novo) | tabelas, RLS, grants, triggers, funções, views, etiquetagem das taxas |
| `supabase/functions/receber-dados-boleto/index.ts` (novo) | recepção pública (GET contexto / POST respostas) |
| `src/features/boletos/rotulos.ts` (novo) | rótulos por tipo, tags, textos de estado (puro, testável) |
| `src/features/boletos/csvEmails.ts` (novo) | gerador do CSV para Brevo (puro, testável) |
| `src/features/boletos/api.ts` (novo) | todos os hooks TanStack |
| `src/features/boletos/*.tsx` (novos) | `VisaoGeralPage`, `CiclosPage`, `DadosRecebidosPage`, `StatusBoletosPage`, `CaixasPage`, diálogos |
| `src/features/boletos/publico/api.ts` + `ResponderPage.tsx` (novos) | página pública por token (sem supabase-js) |
| `src/features/convencoes/abas/TaxasTab.tsx`, `api.ts`, `schemas.ts` (editar) | campo "Usada para boleto de" + painel dos 4 valores-base |
| `src/app/nav.ts`, `AppShell.tsx`, `router.tsx` (editar) | grupo BOLETOS, rotas, rota pública `/responder/:token` |
| `src/lib/database.types.ts` (regenerar) | tipos das tabelas/views novas |
| `tests/rls/boletos.spec.ts`, `tests/adversarial/07_boletos.spec.ts` (novos) | matriz de papéis, estado, cálculo, token, ataques |
| `specs/plano_fases.md`, `orientacoes.md` (editar) | ETAPA 10 + obstáculos vencidos |

---

### Tarefa 1 — Banco: modelo, regras e views (`sql/33_boletos_10_00.sql`)

**Entrega:** SQL idempotente aplicado no bench, com conferências de catálogo verdes.

**Contrato (nomes que as tarefas seguintes usam):**
- Tabelas: `ciclos_boleto`, `ciclo_convencoes`, `caixas_boleto`, `tokens_boleto`, `ciclo_caixas`, `boletos`, `respostas_boleto`, `tentativas_boleto`; colunas novas `taxas_convencao.tipo_boleto`.
- Funções chamáveis por `authenticated` (checam `fn_eh('admin','secretaria')` por dentro): `fn_semear_ciclo_boleto(p_ciclo uuid) returns jsonb` (`{criados, ja_existiam, sem_email, email_invalido}`), `fn_recalcular_valores_ciclo_boleto(p_ciclo uuid) returns integer`, `fn_reemitir_token_boleto(p_caixa uuid) returns void`, `fn_renovar_token_boleto(p_caixa uuid) returns void`.
- Triggers (definer, sem EXECUTE para ninguém): normaliza e-mail da caixa; valor do boleto; transição de estado; validação, aplicação e imutabilidade de resposta.
- Views: `v_boletos_status`, `v_boletos_caixas`, `v_boletos_links`, `v_ciclos_funil`.
- UPDATE direto de `authenticated` em `boletos` só nas colunas `estado, numero_boleto, vencimento, motivo_cancelamento`; em `ciclo_caixas` só `aviso_enviado_em, cobranca_enviada_em`; em `caixas_boleto` só `brevo_atualizada_em`.

- [ ] Escrever o SQL conforme spec §5–§9 (estados em `text` + CHECK; `estado` inicial `aguardando_dados`).
- [ ] Aplicar no bench com `apply_migration` e rodar as conferências do rodapé do arquivo (catálogo: `reloptions`, grants de anon, `has_table_privilege`, EXECUTE das funções de trigger).
- [ ] Teste de comportamento por SQL no bench (dados `DEMO —`): semear idempotente; resposta move `aguardando_dados→fazer`; valor = base × qtd; sem base → NULL; congela em `enviar`; salto inválido recusado; resposta em estado `enviar` recusada; token sobrevive a encerrar ciclo; troca invalida o antigo.
- [ ] Rodar `get_advisors` (security) no bench e tratar qualquer alerta novo.

### Tarefa 2 — Edge Function `receber-dados-boleto`

**Entrega:** função publicada no bench com `verify_jwt: false`.
**Consome:** tabelas/funções da Tarefa 1. **Produz:** `GET ?token=` → `{ok, ciclos:[{ciclo_id, nome, tipo, referencia, prazo_resposta, itens:[{boleto_id, cnpj, razao_social, nome_fantasia, editavel, quantidade, cnpj_confirmado, cnpj_incorreto_obs}]}]}`; `POST {token, respostas:[{boleto_id, quantidade, cnpj_confirmado, cnpj_incorreto_obs?}]}` → `{ok, gravadas, recusadas:[{boleto_id, motivo}]}`; recusa sempre `{ok:false, erro}` com HTTP 200.

- [ ] Copiar a estrutura de `receber-remessa` (CORS, freio por token em `tentativas_boleto`, `ipDaRequisicao`), validando UUID antes de consultar.
- [ ] Resolver token por `tokens_boleto` (expirado/trocado → mesmo "Link inválido"); só ciclos com `encerrado_em is null`; limite de 200 respostas por POST e 300 caracteres na observação; atualizar `caixas_boleto.ultimo_acesso_em` no GET válido.
- [ ] Inserir em `respostas_boleto` (origem `link`, IP, user agent); a validação de estado/ciclo é do trigger, a função só traduz o erro em `recusadas`.
- [ ] Publicar no bench e provar com `curl`: token inexistente, malformado, 6ª falha (freio), GET válido, POST válido, POST em boleto de outra caixa (recusado).

### Tarefa 3 — Convenções: tipo de boleto na aba Taxas

**Entrega:** `TaxasTab` com campo "Usada para boleto de" e painel dos 4 valores-base.
**Arquivos:** `features/convencoes/{api.ts,schemas.ts,abas/TaxasTab.tsx}`, `database.types.ts`.

- [ ] Regenerar `database.types.ts` do bench (`generate_typescript_types`) e conferir o diff (só acréscimos).
- [ ] `taxaSchema` ganha `tipo_boleto` (`""|taf|pamed`); `useCriarTaxa`/`useAtualizarTaxa` o gravam (vazio vira `null`); erro 23505 do índice único vira mensagem amigável em `lib/mensagens.ts`.
- [ ] Rótulo "Valor por trabalhador" quando há tipo; painel acima da tabela: 2 chips (TAF/PAMED) mostrando o valor ou "não cadastrada"; CA/CN com a nota "valor digitado por boleto".
- [ ] `npm run typecheck`.

### Tarefa 4 — Núcleo puro do frontend (rótulos e CSV) com testes

**Entrega:** `rotulos.ts` e `csvEmails.ts` com testes de unidade verdes.
**Produz:** `ROTULO_TIPO: Record<TipoBoleto,{sigla,nome,campo}>`, `TAG: Record<string,{rotulo,tom}>`, `gerarCsvEmails(linhas: LinhaEmail[]): string` onde `LinhaEmail = {nome:string,email:string,link:string,convencoes:string,nCnpj:number}`.

- [ ] Teste: rótulos por tipo (TAF "trabalhadores que irão trabalhar no feriado" etc.); CSV neutraliza `=`/`+`/`-`/`@` iniciais (reusar `lib/csv.ts`) e escapa vírgula/aspas.
- [ ] Rodar vitest e ver falhar; implementar; ver passar.

### Tarefa 5 — `api.ts` da feature (todos os hooks)

**Entrega:** `src/features/boletos/api.ts`.
**Produz (nomes fixos):** `useCiclos`, `useCriarCiclo` (insere ciclo + convenções e chama `fn_semear_ciclo_boleto`), `useSemearCiclo`, `useEncerrarCiclo`, `useRecalcularValores`, `useFunilCiclos`, `useBoletosStatus(filtros,pagina)` (paginado no servidor com `count`), `useCaixasCiclo(cicloId)`, `useLinksBoleto`, `useAvancarBoletos` (UPDATE em lotes de 100 ids), `useRegistrarRespostaManual`, `useMarcarEnviadas(cicloId, caixaIds, modo)`, `useReemitirToken`, `useRenovarToken`, `useMarcarBrevoAtualizada`, `useExportarEmails(cicloId, modo, convencaoId?)` (pagina até acabar — PostgREST trunca em 1000, §2.4), `useConvencoesSemValorBase(cicloId)`.

- [ ] Implementar com `queryKey` por domínio e invalidação cruzada (status ↔ caixas ↔ funil).
- [ ] Mensagens de erro do Postgres (transição inválida, ciclo encerrado, estado não editável) traduzidas em `lib/mensagens.ts`.
- [ ] `npm run typecheck`.

### Tarefa 6 — Telas internas e navegação

**Entrega:** grupo BOLETOS funcionando no preview.
**Arquivos:** `nav.ts` (grupo `"boletos"`, 5 itens; Admin/Secretaria/Presidente), `AppShell.tsx` (título do grupo), `router.tsx`, páginas em `features/boletos/`.

- [ ] Registrar rotas e grupo; Jurídico e Parceiro não veem nem acessam (RoleGate).
- [ ] `VisaoGeralPage` (funil + 7 perguntas + alertas Brevo e valor-base), `CiclosPage` (criar/semear/encerrar/recalcular/exportar/marcar enviadas/sem e-mail), `DadosRecebidosPage` (caixas X/Y, filtro 100%, registro manual), `StatusBoletosPage` (tags, valor, lote, CSV), `CaixasPage` (link, validade, trocar, Brevo atualizada, renovar).
- [ ] Botões de escrita só para Admin/Secretaria (a RLS é a segurança; a UI só esconde).
- [ ] `npm run typecheck` e `npm run build`.

### Tarefa 7 — Página pública `/responder/:token`

**Entrega:** `publico/api.ts` (fetch puro) + `ResponderPage.tsx` fora do AppShell/RoleGate.

- [ ] Uma seção por ciclo aberto; por CNPJ: CNPJ **somente leitura**, campo numérico 0..99999, "este CNPJ está incorreto" abre observação.
- [ ] Estados: carregando, link inválido, sem solicitação aberta, enviado com sucesso, itens recusados listados.
- [ ] Mobile-first (o público abre pelo celular).

### Tarefa 8 — Testes RLS e adversariais

**Entrega:** `tests/rls/boletos.spec.ts` e `tests/adversarial/07_boletos.spec.ts` verdes contra o bench.

- [ ] Matriz de 5 papéis + anon (spec §13), incluindo "Presidente não lê `tokens_boleto` nem `v_boletos_links`".
- [ ] Máquina de estados, cálculo e token permanente, por login real.
- [ ] Adversarial: catálogo (views sem `security_invoker`, coluna de credencial, função exposta como RPC), token forjado/expirado/trocado, freio, enumeração, XSS na observação, CSV com fórmula. Destrutivo só com `SINDCOM_ALVO=bench`.
- [ ] Cada vermelho é hipótese até ser medido de novo.

### Tarefa 9 — Preview isolado apontando para o bench

**Entrega:** `https://crm.sindcompassos.org/preview-boletos/` com o front falando com o bench.

- [ ] Build com `.env.bench` e `--base=/preview-boletos/`; conferir que o bundle **não** contém a URL de produção.
- [ ] Enviar por FTP **só para a subpasta de preview** (`docs/deploy.md`); verificação pós-deploy do runbook.
- [ ] Teste de ponta a ponta no navegador: criar ciclo → semear → exportar CSV → responder pelo link → boleto vira "fazer" com valor calculado → avançar até "pago".

### Tarefa 10 — Fechamento da subetapa

- [ ] Remover todo dado `DEMO —` do bench e relatar o que foi criado e removido.
- [ ] `specs/plano_fases.md`: ETAPA 10 com subetapas; marcar `Status: ✅ CONCLUÍDA` só no que estiver provado no bench.
- [ ] `orientacoes.md`: entradas (problema · solução · como implantar) para cada obstáculo real vencido.
- [ ] Relatório ao Maxwell em português e **PARAR**: aplicar SQL em produção, deploy de produção e merge só por ordem dele. Lembrar das taxas cadastradas por nome (`TAF/PAMED`) e da conferência de duplicatas.

---

## Autorrevisão contra o spec

- §2/§5.3 token permanente, troca com alerta, renovação → Tarefas 1, 5, 6 (`CaixasPage`), 8.
- §6 valor calculado, NULL sem base, congelamento, recálculo → Tarefas 1, 3, 6, 8.
- §7 estados/triggers e notificação de caixa completa → Tarefas 1, 8.
- §8 semeadura com relatório → Tarefas 1, 5, 6.
- §9 views → Tarefa 1; §10 telas → Tarefas 3, 6; §11 pública → Tarefas 2, 7.
- §12/§13 ambiente e testes → Tarefas 8, 9, 10.
