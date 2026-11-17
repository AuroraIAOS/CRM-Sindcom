# Runbook — virada do site institucional (WordPress → HTML estático)

> Nada aqui é executado sem ordem do Maxwell (deploy e virada são ações de superfície pública).
> Lições que moldam este roteiro: `orientacoes.md` §1.1 (FTP não passa pela Cloudflare), §1.2 (erro 451: verificar tamanhos), §1.5/§1.9 (ordem e marcadores do `.htaccess`), §1.6 (teste do estático), §1.7 (cache de borda).

## Pré-requisitos (todos precisam estar verdes antes da virada)
1. Formulários próprios funcionando e testados (WP 2.x); denúncia só após a aba Jurídico do CRM (WP 3.1).
2. Revisão jurídica dos Termos concluída.
3. `cd web && npm run build` sem erro; `node scripts/verificar-dist.mjs` com 0 problemas; QA visual e Lighthouse feitos.
4. Acesso à pasta do site (`/home2/davide59/sindcompassos.org`) pelo cPanel ou FTP dedicado.

## Fase A — teste em subdomínio (sem tocar no site atual)
1. cPanel → Subdomínios: criar `novo.sindcompassos.org`, com pasta própria (nunca dentro da do site atual).
2. Enviar o conteúdo de `web/dist/` (inclui o `.htaccess`) para essa pasta. Se por FTP: host de origem `br998.hostgator.com.br`, `--ftp-ssl-control`, conferir tamanho local x `Content-Length` arquivo a arquivo (§1.2).
3. Verificar (com 5 s entre requisições e cache-buster `?v=$(date +%s)`):
   ```bash
   for u in / /institucional/ /servicos/ /beneficios/ /contato/ /filie-se/ /denuncie/ /curriculo/ /vaga/ /termos/ /dados/ /sitemap.xml /downloads/nota-tecnica-01-2026.pdf; do
     curl -sL -o /dev/null -w "$u -> %{http_code} saltos=%{num_redirects}\n" "https://novo.sindcompassos.org$u?v=$(date +%s)"; sleep 5; done
   curl -s -o /dev/null -w "404: %{http_code}\n" https://novo.sindcompassos.org/nao-existe/
   for u in /filie/ /denuncia /servicos-sindicais/; do curl -sI "https://novo.sindcompassos.org$u" | grep -iE "^HTTP|^location"; done
   ```
   Esperado: 200 e `saltos=0` nas páginas; 404 real na inexistente; 301 para `/filie-se/`, `/denuncie/`, `/servicos/`.
4. Conferir no navegador (celular e desktop) e que nenhuma requisição vai a domínio do Google.

## Fase B — virada
1. **Backup completo** da pasta atual do site (cPanel → Backup ou compactar a pasta) e cópia do `.htaccess` atual para `docs/` com a data (padrão dos arquivos `htaccess_site_institucional_backup_*`).
2. Anotar o estado do WordPress: banco, `wp-content` e plugins ficam **intocados em disco** (rollback).
3. Mover o WordPress para uma subpasta (ex.: `/_wp_aposentado/`), sem apagar. Colocar o conteúdo de `web/dist/` na raiz do site. O `.htaccess` novo **substitui** o antigo; nunca mesclar com blocos de plugin.
4. Verificar com o mesmo `curl` da Fase A, agora em `https://sindcompassos.org`, e `http://` → `https://` com 1 salto (§1.5). Lembrar do cache de borda de até 2 h (§1.7): testar com `?v=`.
5. Teste do estático (§1.6): `curl -s -o /dev/null -w '%{http_code}' https://sindcompassos.org/assets/css/site.css` deve dar 200.
6. Enviar o `sitemap.xml` no Search Console, se houver conta.

## Reversão (se algo der errado)
1. Restaurar o `.htaccess` antigo do backup e mover o WordPress de volta à raiz (ele continua intacto em disco).
2. Reabrir Configurações → Links permanentes → Salvar, se as páginas voltarem com 404 (§1.8).
3. Medir com cache-buster antes de concluir que algo falhou.

## Fase C — aposentadoria (após 30 dias estáveis)
Desativar plugin de cache de página, remover o WordPress e plugins, manter o backup do banco por mais um período definido pelo Maxwell. Registrar a lição no `orientacoes.md`.
