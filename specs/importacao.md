# CRM SINDCOM — Fluxo de Importação/Exportação CSV

> Rota: `/importacao` (exclusiva do Admin — RLS já garante).
> Depende de: `sql/01_schema.sql` (coluna `codigo_rfb`, tabela `importacoes_csv`) e `sql/04_dashboard.sql` (trigger `eventos_nivel` com origem `importacao`).

---

## 1. Visão geral do pipeline

```
Upload → Parse (papaparse, no cliente) → Normalização → Validação
      → PREVIEW (erros destacados, contadores) → Opções de duplicata
      → Execução em lotes (Edge Function `importar-csv`, service_role)
      → Resultado + log em importacoes_csv + CSV de rejeitadas p/ download
```

**Decisão de arquitetura:** parse, normalização e validação rodam **no navegador** (papaparse — preview instantâneo, zero custo de servidor); a **gravação** roda numa **Edge Function** com service_role, em lotes de 500 linhas via upsert. Motivos: atomicidade por lote, sem timeout do cliente, e um único ponto que grava o log. Os triggers do banco (auditoria, eventos_nivel) disparam normalmente — a Edge Function executa `set_config('app.origem_evento', 'importacao')` antes dos lotes de trabalhadores, então cada cadastro importado fica rastreável na linha do tempo de conversões.

**Política de erros: importa as válidas, rejeita as inválidas.** Linhas com erro bloqueante não impedem a importação das demais; ao final, o sistema oferece download do CSV das rejeitadas (com coluna extra `motivo_rejeicao`) para correção e reenvio. Toggle "tudo ou nada" disponível para cargas sensíveis. Racional: num CSV de 3.000 estabelecimentos da Receita, 40 linhas com CEP quebrado não podem travar as 2.960 boas.

---

## 2. Aba "Tabelas de referência" (setup único, antes de tudo)

Ordem obrigatória de primeira carga:

| # | Tabela | Formato esperado | Fonte |
|---|---|---|---|
| 1 | `naturezas_juridicas` | `codigo;descricao` | Tabela de domínio do layout CNPJ (RFB) |
| 2 | `qualificacoes_responsavel` | `codigo;descricao` | idem |
| 3 | `cnaes` | `codigo;descricao` | idem |
| 4 | `motivos_situacao_cadastral` | `codigo;descricao` | idem |
| 5 | **Municípios TOM (de-para)** | `codigo;descricao` | Tabela de municípios do layout CNPJ (RFB) |

O item 5 **não cria municípios** — preenche `municipios.codigo_rfb` casando a descrição TOM com `municipios.nome + uf` já seedados (match normalizado: uppercase + unaccent + trim). Não-casados entram numa tela de **resolução manual** (dropdown com busca). Sem esse de-para completo para MG, a importação de estabelecimentos falha na coluna Município — o sistema avisa isso explicitamente.

---

## 3. Formatos por entidade

Convenções gerais: delimitador `;` · primeira linha = cabeçalho · encoding UTF-8 (com detecção e fallback Latin-1, comum em exports da Receita) · datas aceitas em `AAAAMMDD`, `AAAA-MM-DD` e `DD/MM/AAAA`.

### 3.1 `empresas` — espelho exato do CSV da Receita que Maxwell já possui

| Coluna | Obrigatória | Destino | Normalização |
|---|:--:|---|---|
| CNPJ básico | ✅ | `cnpj_basico` | Só dígitos, **zero-pad para 8** |
| Razão social | ✅ | `razao_social` | trim |
| Natureza jurídica | — | `natureza_juridica` (FK) | zero-pad 4 |
| Qualificação do responsável | — | `qualificacao_responsavel` (FK) | zero-pad 2 |
| Capital | — | `capital_social` | vírgula → ponto decimal |
| Porte | — | `porte` | como vem |

### 3.2 `estabelecimentos` — espelho do CSV da Receita

Todas as colunas listadas por Maxwell (CNPJ básico/ordem/DV, identificador, fantasia, situação, datas, motivo, CNAE, endereço completo, DDDs/telefones, e-mail, situação especial) mapeiam 1:1 para as colunas homônimas do schema. Pontos críticos:

- **CNPJ ordem zero-pad 4, DV zero-pad 2** (Excel come zeros à esquerda — ver §6).
- **Município:** valor é o **código TOM** → resolvido via `municipios.codigo_rfb` (exige §2 item 5).
- **UF ≠ MG:** aviso (não bloqueia — matriz fora do estado com filial na base é possível).
- FK `cnpj_basico`: a **empresa precisa existir** — o wizard impõe a ordem empresas → estabelecimentos e acusa órfãos como erro bloqueante.
- `convencao_id` **não vem no CSV** — vínculo com CCT é feito depois, em lote, na tela `/convencoes` (a dica SEM_CCT monitora o que faltar).

### 3.3 `trabalhadores` — template próprio do Sindcom (download do modelo na tela)

| Coluna | Obrigatória | Normalização / regra |
|---|:--:|---|
| `cpf` | ✅ | Só dígitos, zero-pad 11, **validação de dígito verificador** |
| `nome` | ✅ | trim |
| `data_nascimento` | — | formatos aceitos acima |
| `telefone_whatsapp` | — | só dígitos; aviso se sem DDD (≠ 10-11 dígitos) |
| `email` | — | regex simples; aviso se inválido (não bloqueia) |
| `municipio` | — | aceita nome (resolvido por nome+`MG` default) ou código IBGE |
| `recolhe_contribuicao` | — | sim/não/1/0 · **default: sim** (padrão legal) |
| `recolhe_mensalidade` | — | idem · default: não · bloqueante se sim + contribuição não (CHECK do banco) |
| `forma_pagamento` | — | holerite/boleto · default holerite |
| `cnpj_estabelecimento` | — | 14 dígitos; se presente e válido, **cria o vínculo empregatício** (principal) |
| `funcao`, `data_admissao`, `salario_informado` | — | alimentam o vínculo, se houver |

Registros importados entram com `status_cadastro = 'aprovado'` e `origem_cadastro = 'csv'` — a importação é ato do Admin, que já é a instância de aprovação; não faz sentido o Admin aprovar a si mesmo depois.

### 3.4 `beneficiados` — template próprio

| Coluna | Obrigatória | Regra |
|---|:--:|---|
| `cpf_titular` | ✅ | Deve existir em `trabalhadores` (erro bloqueante se não) |
| `cpf` | ✅ | DV válido, único |
| `nome` | ✅ | — |
| `data_nascimento`, `parentesco` | — | — |
| `tipo` | ✅ | direto/indireto/adicional |

Aviso (não bloqueante): titular que não é Ouro — o beneficiado entra, mas só terá cobertura quando o titular subir de nível.

---

## 4. Validações — bloqueantes × avisos

| Tipo | Bloqueante (linha rejeitada) | Aviso (importa, sinaliza) |
|---|---|---|
| Identificadores | CPF/CNPJ com DV inválido; vazio quando obrigatório | — |
| FKs | Empresa inexistente (estabelecimento); titular inexistente (beneficiado); município não resolvido | UF ≠ MG |
| Domínios | ENUM inválido (tipo, situação, forma); data não-parseável | Situação cadastral ≠ 02-Ativa |
| Regras de negócio | mensalidade=sim + contribuição=não | Titular não-Ouro com beneficiado; telefone sem DDD; e-mail inválido |
| Estrutura | Cabeçalho não reconhecido (aborta antes do preview, com diff das colunas esperadas × encontradas) | Colunas extras (ignoradas) |

## 5. Duplicatas — política por entidade

| Entidade | Chave | Política default | Alternativa (radio no preview) |
|---|---|---|---|
| empresas | `cnpj_basico` | **Atualizar** dados cadastrais | Ignorar existentes |
| estabelecimentos | CNPJ completo | **Atualizar** | Ignorar |
| trabalhadores | `cpf` | **Ignorar existentes** | Atualizar dados de contato |
| beneficiados | `cpf` | **Ignorar existentes** | Atualizar |

**Regra de proteção inegociável (implementada na Edge Function):** importação **nunca altera `recolhe_contribuicao_sindical`, `recolhe_mensalidade_convenio` nem `forma_pagamento_preferida` de registros existentes** — mesmo no modo "atualizar", esses campos são excluídos do upsert. Mudança de nível é ato deliberado (manual ou reclassificação anual), não efeito colateral de uma planilha. Um CSV com flag errada reclassificando 500 pessoas silenciosamente é o pior acidente possível deste sistema.

## 6. Preview — a tela que evita desastres

- Tabela virtualizada com **todas** as linhas, coloridas: 🟢 inserir · 🟡 atualizar/aviso · 🔴 rejeitada (tooltip com o(s) erro(s) por célula).
- Contadores no topo: total · a inserir · a atualizar · avisos · rejeitadas.
- Filtro rápido "só problemas".
- **Detector de zeros comidos pelo Excel:** se ≥5% dos CPFs/CNPJs da coluna têm menos dígitos que o esperado, banner explicando o problema clássico (Excel converte `01234567` em número) e instruindo a reexportar como texto — com o zero-pad automático aplicado e destacado em amarelo para conferência.
- Botão "Importar N válidas" só habilita após o preview renderizar por completo.

## 7. Execução e log

- Lotes de 500 · barra de progresso por lote · retry 1x por lote em falha de rede.
- Ao final: card-resumo (inseridos / atualizados / rejeitados / duração) + download das rejeitadas + linha gravada em `importacoes_csv` (`erros` JSONB = array `{linha, coluna, mensagem}`).
- Toda importação de trabalhadores dispara os triggers normais: `eventos_nivel` marca origem `importacao` — o gráfico de conversões distingue crescimento orgânico de carga em massa.

## 8. Exportação (qualquer DataTable do sistema)

- Botão "Exportar CSV" em toda listagem: exporta **o resultado da query atual** (filtros aplicados, todas as páginas — busca server-side completa, não só a página visível).
- Respeita RLS por construção: cada role exporta exatamente o que enxergaria paginando.
- Formato: `;` como delimitador, **UTF-8 com BOM** (Excel brasileiro abre acentuação corretamente sem assistente de importação), datas `DD/MM/AAAA`.
- **Escolha explícita no momento do download** (modal com duas opções, atendendo às duas funções do dado):
  1. **Dados crus (tratamento)** — CPF/CNPJ sem máscara, no formato exato dos templates do §3, prontos para edição/correção em massa e reimportação. **Exclusivo do Admin** (coerente com o requisito original de download em massa) — para os demais roles a opção nem aparece.
  2. **Dados mascarados (divulgação)** — CPF `***.456.789-**`, CNPJ parcial, sem telefone/e-mail completos; seguro para compartilhamento externo. Disponível a todos os roles com SELECT na listagem.
- Toda exportação **crua** é registrada em `importacoes_csv` com `entidade` prefixada `export:` (tabela, filtros aplicados, quem, quando) — planilha com milhares de CPFs em circulação exige trilha de auditoria.
