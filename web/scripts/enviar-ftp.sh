#!/usr/bin/env bash
# Envia web/dist para o FTP do subdomínio de teste (novo.sindcompassos.org) e confere o tamanho de cada arquivo.
# Uso: bash web/scripts/enviar-ftp.sh      (credenciais FTP_*_NOVO lidas de .env.deploy; nunca impressas)
# Regras (orientacoes.md §1.1, §1.2): host real da Hostgator, TLS só no canal de controle, conferir tamanho depois.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$RAIZ/web/dist"
set -a; . "$RAIZ/.env.deploy"; set +a
: "${FTP_HOST_NOVO:?}" "${FTP_USER_NOVO:?}" "${FTP_PASS_NOVO:?}"
BASE="ftp://${FTP_HOST_NOVO}:${FTP_PORT_NOVO:-21}${FTP_DIR_NOVO:-/}"
BASE="${BASE%/}"
export BASE DIST FTP_USER_NOVO FTP_PASS_NOVO

enviar() {
  local rel="$1" tentativa
  for tentativa in 1 2 3; do
    if curl -sS --ftp-ssl-control --ftp-create-dirs -T "$DIST/$rel" --user "$FTP_USER_NOVO:$FTP_PASS_NOVO" "$BASE/$rel" 2>/dev/null; then return 0; fi
    sleep 2
  done
  echo "FALHOU: $rel"; return 1
}
export -f enviar

cd "$DIST"
echo "Enviando $(find . -type f | wc -l) arquivos…"
find . -type f | sed 's#^\./##' | xargs -P 4 -I{} bash -c 'enviar "$1"' _ {}

echo "Conferindo tamanhos pela URL pública…"
conferir() {
  local rel="$1" local_sz remoto_sz
  local_sz=$(stat -c %s "$DIST/$rel")
  remoto_sz=$(curl -sI --max-time 30 "https://novo.sindcompassos.org/$rel" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
  # arquivos comprimidos (html/css/js) podem não trazer Content-Length exato: só os binários são comparados
  case "$rel" in *.html|*.css|*.js|*.json|*.xml|*.txt|.htaccess|*.svg) return 0;; esac
  [ "$local_sz" = "${remoto_sz:-x}" ] || echo "DIVERGE: $rel local=$local_sz remoto=${remoto_sz:-?}"
}
export -f conferir
export DIST
find . -type f | sed 's#^\./##' | xargs -P 8 -I{} bash -c 'conferir "$1"' _ {}
echo "Concluído."
