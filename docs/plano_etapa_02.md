# Plano — Subetapa 02.1 — Parceiros + Recepcionistas + Catálogo de Benefícios

> Aprovado por Maxwell em 2026-07-15. Ordem de leitura que fundamentou este plano:
> `CLAUDE.md` → `docs/handoff_02.md` → `specs/plano_fases.md` (Etapa 02) →
> `sql/01_schema.sql` → `sql/03_rls.sql` → `specs/frontend.md` (§2.2, §4).

## Decisões tomadas com Maxwell antes de codar

1. **Criação/exclusão de parceiro, recepcionista e benefício**: RLS é idêntico ao
   de empresas (INSERT/DELETE só Admin; UPDATE Admin+Secretária). Diferente do
   padrão de Empresas (onde a Secretária não tem caminho de criação), aqui a
   fila-admin **será estendida**: Secretária abre solicitação de criação/exclusão,
   Admin aprova e o frontend executa.
2. **PIN do recepcionista**: exige `crypt()`/`gen_salt('bf')` no Postgres, que o
   frontend (anon key) não pode chamar direto sobre a tabela. Solução: nova RPC
   `security definer` (`fn_definir_pin_recepcionista`), em **Manual estrito**
   (não passa pelo `/goal`), guardada por `fn_eh('admin','secretaria')`.
3. **Escopo de tela**: as duas telas nascem juntas — `/parceiros` (mestre-detalhe
   com abas Dados/Benefícios/Recepcionistas) e `/beneficios` (catálogo
   transversal de todos os parceiros, com detalhe em `/beneficios/:id`).

## 1. SQL — Manual estrito (`sql/10_recepcionista_pin.sql`)

```sql
create or replace function fn_definir_pin_recepcionista(p_recepcionista_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_eh('admin', 'secretaria') then
    raise exception 'Sem permissão para definir PIN de recepcionista';
  end if;
  if p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN deve ter de 4 a 6 dígitos';
  end if;
  update recepcionistas set pin_hash = crypt(p_pin, gen_salt('bf')), updated_at = now()
   where id = p_recepcionista_id;
end $$;

grant execute on function fn_definir_pin_recepcionista(uuid, text) to authenticated;
```

Aplicar via Supabase MCP (`apply_migration`) ou painel Supabase, com aviso prévio
a Maxwell (ação em schema compartilhado). Rodar `NOTIFY pgrst, 'reload schema'`
depois. PIN nunca trafega em texto puro além da chamada RPC.

## 2. Extensão da fila-admin

- `src/features/fila-admin/api.ts`: `TABELAS_EXECUTAVEIS` passa a incluir
  `"parceiros"`, `"recepcionistas"`, `"beneficios"`.
- `executarOperacao`: generalizar o `switch`/mapa tabela → `supabase.from(...)`
  em vez do hardcoded `"trabalhadores"`, mantendo o comportamento atual intacto.
- Admin cria/exclui direto na tela; Secretária abre solicitação via
  `useCriarSolicitacaoAdmin` (mesmo padrão de `NovaEmpresaDialog`), cai na fila,
  Admin aprova.

## 3. `src/features/parceiros/`

- `schemas.ts`: `parceiroSchema` (nome, segmento, cnpj, contato_nome/email/whatsapp,
  datas de contrato, status, observações), `recepcionistaSchema` (nome, ativo),
  `pinSchema` (4-6 dígitos + confirmação).
- `api.ts`: `useParceiros`, `useParceiro`, `useCriarParceiro`/`useAtualizarParceiro`/
  `useExcluirParceiro`, `useRecepcionistasDoParceiro`, `useCriarRecepcionista`/
  `useAtualizarRecepcionista`/`useExcluirRecepcionista`, `useDefinirPinRecepcionista`
  (chama a RPC), `useBeneficiosDoParceiro`.
- `ListaParceirosPage.tsx`: mestre-detalhe igual `ListaEmpresasPage.tsx` (grid
  `DataTable` + painel na mesma página, sem navegação de rota). Painel de detalhe
  usa `Tabs` (`components/ui/tabs.tsx`) com 3 abas — **Dados** · **Benefícios**
  (lista + link para `/beneficios/:id` + "Novo benefício") · **Recepcionistas**
  (lista + criar/editar + "Definir PIN" via `ConfirmarEdicaoDialog`).
- Exportar CSV restrito a Admin (`lib/csv.ts`, mesmo padrão das outras telas).

## 4. `src/features/beneficios/`

- `schemas.ts`: `beneficioSchema` (nome, descrição, categoria, valor_particular,
  valor_convenio, nivel_minimo, condições, ativo), espelhando
  `chk_valores_beneficio` (valor_convenio ≤ valor_particular).
- `api.ts`: `useBeneficios` (filtros: parceiro, categoria, nível mínimo, faixa de
  desconto, ativo/inativo), `useBeneficio`, `useCriarBeneficio`/
  `useAtualizarBeneficio`/`useExcluirBeneficio`, `useHistoricoSolicitacoesBeneficio`,
  `useUtilizacaoBeneficio90d`.
- `ListaBeneficiosPage.tsx`: `DataTable` + filtros em barra superior + "Novo
  benefício" (Admin direto / Secretária via fila) + Exportar CSV (Admin). Atalho
  "Solicitar" por linha fica desabilitado/placeholder (form de solicitação é
  escopo da 02.2 — não antecipar).
- `DetalheBeneficioPage.tsx` (rota `/beneficios/:id`, já reservada em
  `router.tsx`): dados completos, economia calculada, condições, histórico de
  solicitações, indicador de utilização 90d.

## 5. Wiring

- `src/app/router.tsx`: `<ListaParceirosPage />`, `<ListaBeneficiosPage />` em
  `PAGINAS`; `<DetalheBeneficioPage />` em `PAGINAS_DETALHE`.
- `src/app/nav.ts` já tem as entradas certas — nenhuma mudança necessária.

## 6. Testes

Estender `npm run test` com: RLS de `parceiros`/`recepcionistas`/`beneficios`
por role (Secretária sem INSERT/DELETE direto), `fn_definir_pin_recepcionista`
(guarda de role, formato do PIN, hash ≠ PIN puro), catálogo filtrando
corretamente por `nivel_minimo`.

## Critérios de aceite (de `plano_fases.md`)

- PIN sempre armazenado com hash (nunca texto puro).
- Catálogo `/beneficios` lista ofertas filtráveis por nível mínimo.
- Vocabulário respeitado: `beneficios` = catálogo, nunca confundido com
  `solicitacoes_servico`.

## Ordem de execução

1. SQL da RPC de PIN (aviso antes de aplicar).
2. Extensão genérica do `executarOperacao`/`TABELAS_EXECUTAVEIS` na fila-admin.
3. `features/parceiros/` completo.
4. `features/beneficios/` completo.
5. Wiring no router.
6. Testes + `npm run test` verde.
7. Deploy (autorização permanente já concedida) + aviso do resultado da
   verificação pós-deploy.

Dados de demonstração (`DEMO —`) ficam gravados ao final, conforme regra do
`CLAUDE.md`.
