# Prompt para a próxima sessão — teste do site HTML em novo.sindcompassos.org

Cole o bloco abaixo como primeira mensagem da nova sessão.

---

CODE, retomamos a migração do site sindcompassos.org (WordPress) para HTML estático. Leia, nesta ordem, antes de agir: `CLAUDE.md`, `docs/plano_site_html.md`, `docs/site_deploy_runbook.md` e as seções 1.1, 1.2, 1.5 a 1.9 do `orientacoes.md`. Memória do projeto: `site/` nunca vai ao GitHub; evitar Brevo e n8n; nada do Google.

**Onde estamos.** O site novo está pronto em `web/` (Eleventy; 11 páginas, 244 arquivos, 35 MB; `npm run build`, `npm test` com 13 testes e `node web/scripts/verificar-dist.mjs` com 0 problemas). Os 5 formulários rodam em **modo demonstração** (validam, mas não enviam; `endpoint` vazio em `web/src/_data/formularios.json`). A função `supabase/functions/formularios-site/` e o SQL 35 estão escritos e testados com dependências simuladas, mas **não aplicados nem implantados**. Nada foi commitado.

**Objetivo desta sessão: testar o site novo no subdomínio `novo.sindcompassos.org`. Não é a virada.** O WordPress em `sindcompassos.org` não pode ser tocado.

**Já resolvido:** o subdomínio existe, o DNS e o HTTPS funcionam (nameservers da Hostgator, IP 162.241.203.75; hoje responde 403, pasta vazia). A conta FTP está em `.env.deploy` como `FTP_*_NOVO` (host `br998.hostgator.com.br`, TLS só no controle). Uma tentativa de envio foi interrompida no meio: pode haver arquivos parciais no servidor.

**Passos:**
1. Gerar a versão de teste bloqueada para buscadores: `cd web && SITE_STAGING=1 npx eleventy` (gera `noindex`, `robots.txt` com `Disallow: /` e `X-Robots-Tag` no `.htaccess`). Conferir `dist/robots.txt` e `dist/.htaccess`.
2. Enviar com `bash web/scripts/enviar-ftp.sh` (idempotente; lê as credenciais do `.env.deploy` sem imprimi-las). Rodar em segundo plano ou em partes, porque são 244 arquivos; o script já confere os tamanhos dos binários no fim.
3. Verificar por requisição, com 5 s entre elas e cache-buster, o roteiro da Fase A do `docs/site_deploy_runbook.md`: as 11 páginas, `sitemap.xml`, `404` real, os 301 (`/filie/`→`/filie-se/`, `/denuncia`→`/denuncie/`, `/servicos-sindicais/`→`/servicos/`), os PDFs das CCTs e da Nota Técnica, HTTP→HTTPS e o cabeçalho `X-Robots-Tag`.
4. Revisão visual pelo Chrome (extensão Claude in Chrome; abrir aba própria, nunca reusar as do Maxwell): capturas em celular (360 px) e desktop das 11 páginas, comparando com as páginas do site atual que o Maxwell deixou abertas. Conferir mapa Leaflet, contadores, Lottie, carrossel, menu móvel e formulários em modo demonstração. Listar defeitos por severidade, sem corrigir às cegas.
5. Reexecutar o Lighthouse (mobile) em `/`, `/servicos/` e `/contato/` já no servidor real (com compressão e cache da Hostgator) e comparar com o resultado local (85 a 95 de desempenho; 100 nas demais categorias).
6. Corrigir o que o teste achar, uma coisa por vez, reconstruir, reenviar só o necessário e medir de novo.

**Regras desta sessão:** não faça commit, merge nem virada sem ordem expressa do Maxwell; nunca digite senha ou credencial (o login é do Maxwell); não mexa no `.htaccess` nem na pasta do WordPress; mude uma coisa por vez e prove por requisição; relate falhas com transparência. A sessão anterior ficou curta de cota: trabalhe uma ação por vez, sem agentes paralelos, salvo pedido.

**Fica para depois (não é requisito do teste):** teste real de entrega de e-mail (sem Google, Brevo ou n8n), portão adversarial, importação do histórico de respostas, aba Jurídico no CRM, migração da filiação, revisão jurídica dos Termos, chave real do Turnstile e a virada de verdade.
