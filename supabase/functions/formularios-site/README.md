# formularios-site

Recebe os formulários públicos do site novo: `POST /functions/v1/formularios-site/{contato|curriculo|vaga|denuncia}` (multipart/form-data).
Filiação NÃO passa aqui (segue em `formulario-filiacao`, que grava em `trabalhadores`; ajustá-la ao formulário novo é um item separado).

**Status: escrita e testada com dependências simuladas (11/11 em `deno test`); NÃO implantada.** Depende do `sql/35_formularios_site.sql` aplicado e dos secrets abaixo. Deploy e SQL em produção são decisão do Maxwell, depois do portão adversarial.

## Fluxo de cada envio
origem permitida (CORS) → honeypot (`_hp`) → Turnstile (sem secret a função recusa tudo, falha fechada) → limite por hora (`fn_site_limite`, hash de IP + sal; denúncia anônima usa sal diário e não grava nada derivado do IP) → validação dos campos (`esquemas.ts`) e dos arquivos **pelos bytes** (`arquivos.ts`) → grava com `service_role` → e-mail (`mailer.ts`).

- **Anexo e e-mail:** o arquivo só existe no e-mail. Se o envio falhar com anexo, o registro é **desfeito** e a pessoa vê o erro (502), sem duplicata no reenvio. Sem anexo, responde sucesso e marca `email_status='falhou'` (reenvio futuro).
- **Denúncia:** o e-mail a `juridico@` é só aviso (protocolo, urgência, tipos) + evidências em anexo. O relato nunca vai por e-mail (teste prova).
- Hash de IP só em envio identificado; a denúncia anônima não grava IP nem derivado (o CHECK do banco também impede).

## Secrets (Supabase → Edge Functions → Secrets; nunca no repositório)
| Secret | Para quê |
|---|---|
| `TURNSTILE_SECRET` | chave secreta do Cloudflare Turnstile (a chave pública fica em `web/src/_data/formularios.json`) |
| `SITE_SAL` | sal dos hashes (string longa e aleatória) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | provedor de e-mail, definido pelo teste do WP 2.0 (nunca Google, Brevo ou n8n) |
| `SITE_EMAIL_CONTATO`, `SITE_EMAIL_JURIDICO` | opcionais; padrão `contato@` e `juridico@sindcompassos.org` |
| `SITE_ORIGENS` | opcional; origens do site separadas por vírgula (padrão em `cors.ts`) |

`verify_jwt = false` (função pública; a proteção é a lista acima).

## Testar
```bash
deno test --no-check supabase/functions/formularios-site/tests/
```
Em bench, depois de implantar: `curl -i -X POST -H "Origin: http://localhost:8099" -F consentimento=1 ... .../formularios-site/contato` (o Turnstile exige token real; para testar de ponta a ponta use a chave de teste da Cloudflare `1x0000000000000000000000000000000AA` / secret `1x0000000000000000000000000000000AA`).

## Limites conhecidos
- O envio de e-mail por SMTP (`denomailer`) **não foi testado contra servidor real**: é o primeiro item do WP 2.0.
- O reenvio de e-mails com `email_status='falhou'` ainda não existe (job `pg_cron` ou tela no CRM).
- Checagem de tipos com `deno check` não roda neste repositório (resolução do `node_modules`); os testes rodam com `--no-check`.
