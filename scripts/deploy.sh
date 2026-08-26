#!/usr/bin/env bash
# ============================================================================
# CRM SINDCOM — scripts/deploy.sh
# Publica dist/ em crm.sindcompassos.org. Runbook completo: docs/deploy.md
#
# POR QUE ESTE SCRIPT EXISTE
# O deploy é manual (orientacoes.md §1.4: `git push` NÃO publica nada) e
# acontece ao fim de toda subetapa que mexa no frontend. Repetir a sequência de
# `curl -T` à mão a cada vez é onde se esquece um arquivo — e um asset faltando
# só aparece como tela branca no navegador do usuário.
#
# DUAS ARMADILHAS JÁ DOCUMENTADAS, e as duas estão tratadas aqui:
#  · §1.1 — `ftp.sindcompassos.org` resolve para a Cloudflare, que não repassa
#    FTP. O host real da Hostgator vem do .env.deploy e não se inventa.
#  · §1.2 — o pure-ftpd às vezes aborta o canal de DADOS sob TLS (erro 451,
#    arquivo fica 0 bytes). Por isso `--ftp-ssl-control`: TLS no canal de
#    controle, que é onde a senha trafega; os assets são públicos.
#
# Uso: bash scripts/deploy.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.deploy ] || { echo "ABORTADO: .env.deploy não encontrado."; exit 1; }
set -a; . ./.env.deploy; set +a
: "${FTP_HOST:?falta FTP_HOST}" "${FTP_USER:?falta FTP_USER}" "${FTP_PASS:?falta FTP_PASS}"
PORTA="${FTP_PORT:-21}"
DESTINO="${FTP_DIR:-/}"
[ -d dist ] || { echo "ABORTADO: dist/ não existe. Rode 'npm run build' antes."; exit 1; }

echo "Enviando dist/ para ftp://$FTP_HOST:$PORTA$DESTINO"
enviados=0
falhas=0
while IFS= read -r arquivo; do
  rel="${arquivo#dist/}"
  if curl -sS --fail --ftp-ssl-control --ftp-create-dirs \
       --user "$FTP_USER:$FTP_PASS" \
       -T "$arquivo" "ftp://$FTP_HOST:$PORTA${DESTINO%/}/$rel" >/dev/null 2>&1; then
    enviados=$((enviados + 1))
    printf "\r  enviados: %d" "$enviados"
  else
    falhas=$((falhas + 1))
    printf "\n  FALHA: %s\n" "$rel"
  fi
done < <(find dist -type f | sort)
printf "\n%d arquivo(s) enviado(s), %d falha(s).\n" "$enviados" "$falhas"

# --- Verificação de integridade: tamanho local × remoto (docs/deploy.md) ----
# "Enviou sem erro" não é o mesmo que "chegou inteiro" — é exatamente o 451 da
# §1.2, que deixa o arquivo com 0 bytes sem o curl reclamar.
echo "Conferindo tamanho de cada arquivo no servidor..."
divergencias=0
while IFS= read -r arquivo; do
  rel="${arquivo#dist/}"
  local_bytes=$(wc -c < "$arquivo" | tr -d ' ')
  remoto=$(curl -sS -I --ftp-ssl-control --user "$FTP_USER:$FTP_PASS" \
            "ftp://$FTP_HOST:$PORTA${DESTINO%/}/$rel" 2>/dev/null \
            | tr -d '\r' | awk -F': ' '/^Content-Length/{print $2}')
  if [ "$local_bytes" != "${remoto:-ausente}" ]; then
    divergencias=$((divergencias + 1))
    printf "  DIVERGE: %s  local=%s remoto=%s\n" "$rel" "$local_bytes" "${remoto:-ausente}"
  fi
done < <(find dist -type f | sort)
echo "$divergencias divergência(s) de tamanho."

[ "$falhas" -eq 0 ] && [ "$divergencias" -eq 0 ] || exit 1
echo "Deploy concluído. Verifique as rotas conforme docs/deploy.md."
