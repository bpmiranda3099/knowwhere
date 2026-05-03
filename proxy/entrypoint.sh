#!/usr/bin/env sh
set -eu

# Render nginx config from template using env vars.
# Required:
# - PROXY_UPSTREAM (e.g. http://api:3000)
# - PROXY_API_KEY  (the value to send as x-api-key)
# - PROXY_ALLOWED_ORIGIN (e.g. https://knowWHERE-team.github.io)

if [ -z "${PROXY_UPSTREAM:-}" ]; then
  echo "Missing PROXY_UPSTREAM" >&2
  exit 1
fi

if [ -z "${PROXY_API_KEY:-}" ]; then
  echo "Missing PROXY_API_KEY" >&2
  exit 1
fi

if [ -z "${PROXY_ALLOWED_ORIGIN:-}" ]; then
  echo "Missing PROXY_ALLOWED_ORIGIN" >&2
  exit 1
fi

envsubst '${PROXY_UPSTREAM} ${PROXY_API_KEY} ${PROXY_ALLOWED_ORIGIN}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

