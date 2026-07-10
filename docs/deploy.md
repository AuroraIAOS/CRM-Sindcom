# Deploy — CRM Sindcom (Hostgator, subdomínio isolado)

Runbook do deploy de produção. **Nenhuma credencial aqui** — elas vivem só em
`.env.deploy` (gitignored). Este documento é o mapa do terreno + o passo a passo.

## Alvo e isolamento

- **URL:** `https://crm.sindcompassos.org`
- **Docroot:** `/home2/davide59/crm.sindcompassos.org` (subdomínio próprio no cPanel).
- A conta cPanel hospeda outros sites que **NÃO devem ser tocados**: `isepem.org`
  (domínio principal, WordPress em `/public_html`), `sindcompassos.org`
  (institucional), `isepem.com`, `isepem.com.br`.
- **Salvaguarda:** a conta FTP `deploycrm@sindcompassos.org` é **restrita (chroot)
  ao docroot do CRM** — com `FTP_DIR=/`, o envio cai dentro da pasta do CRM e
  não alcança os demais sites. Impressão digital da pasta vazia (antes do 1º
  deploy): apenas `.well-known/` e `.ftpquota`.

## Armadilha do host FTP (importante)

- **NÃO** use `ftp.isepem.org` nem `ftp.sindcompassos.org`: esses nomes resolvem
  para a **Cloudflare**, que só faz proxy de HTTP/HTTPS e **não repassa FTP (21)**
  — a conexão expira (timeout).
- **Use o servidor real da Hostgator:** `FTP_HOST=br998.hostgator.com.br`
  (aparece na URL do cPanel/Gerenciador de Arquivos: `br998.hostgator.com.br:2083`).

## Procedimento

```bash
# 1) Build (gera dist/ já com .htaccess de SPA fallback)
npm run build

# 2) Enviar dist/ via FTPS para a raiz da conta (= docroot do CRM)
#    Credenciais lidas de .env.deploy (FTP_HOST, FTP_USER, FTP_PASS, FTP_PORT, FTP_DIR)
#    Segurança: sempre TLS no canal de CONTROLE (protege a senha).
```

- Envio por arquivo com `curl -T <arquivo> --ftp-create-dirs "ftp://$HOST:21/<rel>"`,
  autenticando com `--user "$FTP_USER:$FTP_PASS"`.
- **451 em alguns uploads:** o pure-ftpd da Hostgator às vezes aborta o **canal
  de dados sob TLS** (erro `451`, arquivo fica 0/parcial). Solução: reenviar esses
  arquivos com **`--ftp-ssl-control`** (TLS só no controle; dados em claro). Os
  assets são públicos (JS/CSS/logos/ícones) — sem segredo no canal de dados. A
  senha permanece protegida pelo TLS do controle.

## Verificação pós-deploy

- **Integridade:** comparar tamanho local × remoto de cada arquivo (`curl -I`
  no FTP devolve `Content-Length`). Esperado: 0 divergências.
- **HTTP:** `GET /` → 200 · `GET /dashboard` (rota profunda, fallback do
  `.htaccess`) → 200 · `GET /assets/index-*.js` → 200.
- **HTML servido** deve conter `id="root"` e as tags `/assets/index-*.{js,css}`.

## Configuração relacionada (fora do repo)

- **Supabase Auth → URL Configuration:** Site URL `https://crm.sindcompassos.org`
  e Redirect URL `https://crm.sindcompassos.org/login` (necessário só para o
  fluxo de recuperação de senha; o login por e-mail/senha independe disso).
- **HTTPS/AutoSSL** ativo no subdomínio (o PWA não instala sem HTTPS).
- Trocar a senha FTP periodicamente e refletir em `.env.deploy` (nunca commitar).
