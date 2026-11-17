# Plano de Ação — Site institucional em HTML (v3, 2026-10-29)

> Status (2026-11-17): **ETAPA 1 concluída em teste** (11 páginas aprovadas em `novo.sindcompassos.org`); **ETAPA 2 parcial** (componente de formulário pronto, em modo demonstração; SQL 35 e Edge Function escritos, não implantados); **ETAPA 3 não iniciada**. A virada **não** foi feita. Esta tabela é o painel de progresso do site; o resumo está na ETAPA 11 de `specs/plano_fases.md`.
> Motivo: o WordPress + Elementor + cache NFD EPC derrubou o site em 2026-09-01, 2026-09-09 e 2026-10-29
> (`orientacoes.md` §1.6–1.9). A causa é a pilha, não o conteúdo.

## 0. Regras que valem para as 3 etapas

1. **`site/` nunca vai para o GitHub.** Contém respostas de formulários (CPF, PIS, denúncias). Já está no `.gitignore`
   (conferido com `git check-ignore`; a alteração ainda não foi commitada). O código do site novo mora em **`web/`**:
   só código, textos públicos e imagens tratadas, nenhum dado de pessoa.
2. **Nada do Google.** Sem Google Forms, Drive, Gmail, Maps ou Fonts. Fontes servidas do próprio site, mapa com
   Leaflet + OpenStreetMap, PDFs na hospedagem, e-mail sem passar por conta Gmail.
3. **Sem Brevo e sem n8n** em nada do que for construído aqui. Os fluxos antigos (guias, campanhas) não são tocados.
4. **O banco guarda os campos de texto; os arquivos vão como anexo de e-mail** para `contato@` ou `juridico@`, como
   você definiu. Arquivo não fica guardado em nenhum bucket.
5. Textos em português do Brasil, identidade conforme `docs/design-tokens.md`. Superfície nova passa pelo portão
   adversarial do `CLAUDE.md`, e o merge é sempre decisão sua.

## 1. O que foi medido no material

| Item | Achado |
|---|---|
| Páginas | 11 JSONs do Elementor (01_home … 11_dados). |
| Imagens / logos / Lottie | 61 imagens (**17 MB**), 21 logos (muitas variantes), 3 animações. |
| Formulários a recriar | **Cinco**: filiação, contato, denúncia (o antigo "comunicado" foi fundido nela, decisão de 2026-10-29), currículo e vaga. **Beneficiários está fora do escopo** (ferramenta nova). |
| Respostas históricas | contato ≈ 65, denúncia ≈ 18, comunicado ≈ 4. Filiação, currículo e vaga: sem planilha. |
| Campos | Filiação: 20 (CPF, PIS, nascimento, endereço, empresa, RH, estado civil, documentos, consentimentos). Contato: 10. Comunicado: 7. Denúncia: 14 (direitos infringidos em 4 grupos, urgência, anexo, consentimento). |
| CCTs / Nota Técnica | 5 CCTs (19 MB). `nota.2026` é um PDF de 13 páginas com extensão errada → `nota-tecnica-01-2026.pdf`. |
| Dependências do Google hoje | 7 iframes do Google Forms, 3 pastas do Drive, 8 mapas do Google Maps, fontes do Google. Tudo sai. |
| Links internos | Apontam para `/filie/` e `/denuncia`: exigem 301 para as páginas novas. |

**Atenção, perda de dados:** as 18 denúncias têm evidências **guardadas no Drive** (o CSV só tem os links). Quando o
Drive sair do ar, esses arquivos somem. Baixe-os antes e coloque numa pasta local (por exemplo `site/evidencias/`).

## 2. Decisões já tomadas

Currículos não são listados (chegam por e-mail a `contato@`); sem Drive; denúncia dispara **só aviso** a `juridico@`
(o relato fica no banco); histórico de respostas será migrado; beneficiários fora; subdomínio de teste autorizado
(você já está logado no cPanel; abro a aba quando for a hora); gerador **Eleventy**.

## 3. ETAPA 1 — Construção das 11 páginas e hospedagem

**Meta:** site novo pronto em subdomínio de teste (`novo.sindcompassos.org`), rápido, sem WordPress e sem Google.
**Mudança importante:** sem Google Forms, a página nova só pode **substituir** o site atual quando as 5 páginas com
formulário estiverem funcionando (Etapa 2). Enquanto isso o WordPress segue no ar, sem urgência. A Etapa 1 monta tudo
com o componente de formulário já visível, e a troca é a última coisa.

**Arquitetura:** Eleventy. Cabeçalho, rodapé, menu, botões e mapa são componentes únicos; o texto de cada página fica
em Markdown/JSON. Imagens em AVIF/WebP com `srcset` (17 MB devem cair para cerca de 3 MB). Lottie e mapa só carregam
quando aparecem na tela. CCTs e Nota Técnica em `/downloads/`, com nomes limpos. A biblioteca de livros e cartilhas
**fica de fora**.

| WP | Entrega | Depende de | Paralelo? | Status |
|---|---|---|---|---|
| 1.0 | **Fundação:** Eleventy, tokens, layout, cabeçalho/rodapé, fontes locais, pipeline de imagens, Lighthouse da página-modelo | nada | Não, é a base | ✅ |
| 1.1 | Extração: textos, links e imagens realmente usadas por página; mapa de URLs antigas → novas | nada | Sim, junto com 1.0 | ✅ |
| 1.2 | Home + Institucional (mapa Leaflet) + Termos + Dados (Nota Técnica) | 1.0, 1.1 | Sim | ✅ |
| 1.3 | Serviços (CCTs) + Benefícios | 1.0, 1.1 | Sim | ✅ |
| 1.4 | Contato + Filie-se + Denuncie + Currículo + Vaga (visual completo; o formulário real entra na Etapa 2) | 1.0, 1.1 | Sim | ✅ visual; formulário em demonstração |
| 1.5 | SEO e acessibilidade: sitemap, robots, dados estruturados, 301 das URLs antigas | 1.2–1.4 | Não | ✅ |
| 1.6 | Subdomínio de teste criado no cPanel (aba aberta por comando seu) e site publicado nele | 1.5 | Não | ✅ (`novo.sindcompassos.org`) |
| 1.7 | **Virada:** só depois da Etapa 2 (§4). HTTPS e HSTS mantidos (§1.5 do `orientacoes.md`) | 2.7 | Não | ⬜ aguarda Etapa 2 e portão |
| 1.8 | Aposentadoria: WordPress desativado por 30 dias como rollback, depois remoção do plugin de cache | 1.7 | Não | ⬜ |

**Critérios de aceite:** Lighthouse ≥ 95 no celular, LCP < 2 s, home < 500 KB sem imagens; 11/11 páginas conferidas lado a lado; nenhuma requisição a domínio do Google
(conferido no painel de rede); `site/` ausente do `git ls-files`.

## 4. ETAPA 2 — Formulários próprios, e-mail e banco

**Meta:** cinco formulários próprios com a estética do Sindcom. Reduzo as perguntas que não forem necessárias.

### 4.1 Destinos

| Formulário | Banco | E-mail | Anexos |
|---|---|---|---|
| Contato | sim | `contato@`, com o texto completo | — |
| Currículo | sim (dados de contato, sem o arquivo) | `contato@` | PDF/DOC como anexo |
| Vaga | sim, **moderada** antes de aparecer no site | `contato@` | — |
| Filiação | sim, via função `formulario-filiacao` já em produção (`trabalhadores` pendente) | `contato@` | documentos pessoais como anexo |
| **Denúncia/comunicado (formulário único, objetivo)** | sim (só Admin/Jurídico leem) | **só aviso** a `juridico@` | evidências como anexo |

**Ponto que quero confirmar:** entendi que o e-mail de denúncia leva só o aviso (número do protocolo, urgência e data)
**e** as evidências em anexo, enquanto o relato fica apenas no banco. Se for assim, **ninguém consegue ler o relato até
a aba Jurídico existir** (ETAPA 3). Por isso o WP 3.1 passa a ser pré-requisito da virada (ver §5).

### 4.2 Entrega na caixa de entrada (sem login no Titan, sem envio em massa)

Os e-mails `contato@` e `juridico@` são **só portas de entrada**. Não há login no Titan nem campanha. O formulário só
precisa **depositar** a mensagem na caixa, e isso fica em segundo plano: o **banco do CRM é o destino principal** e
nada depende de o e-mail chegar. O caminho exato (caixa SMTP da Hostgator, script PHP ou outro) é decidido no WP 2.0
por medição, sem bloquear as Etapas 1 e 3. Condição inegociável: sem Google, sem Brevo, sem n8n.

**Falha de entrega:** o texto já está gravado no banco com a marca "e-mail pendente"; o anexo, que só existe no e-mail,
exige envio síncrono: se falhar, a pessoa vê o erro e não perde o que digitou.

### 4.3 Proteção e privacidade

Cloudflare Turnstile (o domínio já passa pela Cloudflare; não é Google), campo-isca, limite por IP, validação no servidor,
consentimento LGPD com o texto da página de Termos, tipo e tamanho de anexo validados (limite de 5 MB por arquivo).
Denúncia anônima: sem IP e sem e-mail obrigatório. Tabelas novas com RLS (negação por padrão) e testes
em `tests/rls` + `tests/adversarial` **antes** de qualquer tela.

| WP | Entrega | Depende de | Paralelo? | Status |
|---|---|---|---|---|
| 2.0 | **Spike:** testar A/B/C, Turnstile, anexo por e-mail; esqueleto compartilhado (validação, gravação, limite) | 1.6 | Não | ⬜ (e-mail real adiado) |
| 2.1 | SQL: tabelas, RLS, marca "e-mail pendente", retenção; testes RLS | 2.0 | Não | 🟡 SQL 35 e testes escritos, não aplicados |
| 2.2 | Contato | 2.1 | Sim | 🟡 função escrita, não implantada |
| 2.3 | Denúncia (anexos, modo anônimo) | 2.1 | Sim | 🟡 idem |
| 2.4 | Currículo + Vaga (moderação) | 2.1 | Sim | 🟡 idem |
| 2.5 | Filiação (reaproveita a função do CRM; a ponte do Google Apps Script deixa de existir) | 2.1 | Sim | 🟡 idem |
| 2.6 | Componente de formulário único (estética Sindcom, erros/sucesso, acessível) ligado a cada função | 2.2–2.5 | Parcialmente | ✅ componente único (modelo: Contato) |
| 2.7 | **Portão adversarial** (varredura de catálogo, funções expostas, endpoints públicos, abuso de upload) | 2.2–2.6 | Não | ⬜ |
| 2.8 | Migração do histórico: contato (≈65), denúncia (≈18) e comunicado (≈4, entram como denúncia), por script local lendo `site/forms/`. **Eu vou ler esses dados pessoais** para importá-los; o script não é commitado | 2.1 | Sim | ⬜ |

**Critérios de aceite:** cada formulário de teste chega na caixa certa **e** está no banco; falha de envio simulada não
perde o texto; anônimo não lê nada das tabelas; sem token do Turnstile o envio é recusado; relatório do portão
entregue e **parado aguardando seu merge**. Dado de teste é removido ao fim de cada WP (regra do `CLAUDE.md`).

## 5. ETAPA 3 — Integração dentro do CRM

| WP | Entrega | Quem vê (por RLS) | Status |
|---|---|---|---|
| 3.1 | Aba **Jurídico**: denúncias (lista, detalhe, urgência, status, responsável) | Admin e Jurídico | ⬜ |
| 3.2 | Notificações no sino para cada novo envio | por papel | ⬜ |
| 3.3 | Filiações pendentes na fila de aprovação (a regra "não aprovar sem ordem" continua) | Admin e Secretaria | ⬜ |
| 3.4 | Caixa de mensagens do site (contato) | Admin e Secretaria | ⬜ |
| 3.5 | Moderação de vagas, com publicação automática no site | Admin e Secretaria | ⬜ |

**Ordem de virada:** o formulário de **denúncia só vai ao ar depois do WP 3.1**, senão ninguém lê o relato.
Os demais (contato, currículo, vaga, filiação) já entregam tudo por e-mail e podem ir antes. Cada WP segue as regras do
projeto (hook em `features/<domínio>/api.ts`, erros traduzidos, testes RLS verdes antes da tela, status em
`specs/plano_fases.md`).

## 6. Riscos conhecidos

1. **Entrega de e-mail é o ponto mais frágil** (SPF/DKIM, spam, anexos). Por isso é o primeiro teste da Etapa 2.
2. **A conta FTP atual não alcança a pasta do site** (§1.5d). O cPanel resolve; a aba é aberta por comando seu.
3. **O `.htaccess` do site é reescrito pelo plugin de cache.** O WordPress sai antes de eu mexer no arquivo, e o novo
   nunca cita marcadores de blocos gerenciados (§1.9).
4. **Endpoints públicos aumentam a superfície de ataque** (spam, denúncia falsa, anexo malicioso): Turnstile, limite e portão 2.7.
5. **Perda de posição no Google** sem 301: o mapa de redirecionamento sai do WP 1.1.
6. **Evidências das denúncias antigas somem com o Drive** se não forem baixadas antes.

## 7. O que preciso do Maxwell

- **Autorização para começar** pelos WP 1.0 e 1.1, que andam em paralelo e não tocam em nada em produção.
- **Confirmar o item do §4.1** (denúncia: aviso + evidências em anexo, relato só no banco).
- **Baixar as evidências das denúncias do Drive** para uma pasta local antes de desligá-lo.
- Para o WP 2.0: dizer se há **orçamento** para o plano pago do Titan, caso A e B falhem.
