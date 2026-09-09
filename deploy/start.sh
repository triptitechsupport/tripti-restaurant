#!/usr/bin/env bash
set -Eeuo pipefail
cd /app
node deploy/validate-env.mjs
export CORS_ORIGIN="${CORS_ORIGIN:-${RENDER_EXTERNAL_URL:-}}"
export PORT="${PORT:-10000}"
pids=()
cleanup() {
  trap - EXIT TERM INT
  if ((${#pids[@]})); then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 0' TERM INT
apps/pocketbase/pocketbase serve --http=127.0.0.1:8090 \
  --dir=/data --encryptionEnv=PB_ENCRYPTION_KEY \
  --migrationsDir=/app/apps/pocketbase/pb_migrations \
  --hooksDir=/app/apps/pocketbase/pb_hooks --hooksWatch=false &
pids+=("$!")
node deploy/wait-for.mjs http://127.0.0.1:8090/api/health
# The public listener stays closed until seeded passwords have been replaced.
node deploy/bootstrap.mjs
PORT=3001 HOST=127.0.0.1 node --dns-result-order=ipv4first apps/api/src/main.js &
pids+=("$!")
node deploy/wait-for.mjs http://127.0.0.1:3001/health
envsubst '${PORT}' < deploy/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t
nginx -g 'daemon off;' &
pids+=("$!")
# Any child exit must stop the whole service so Render can restart it.
set +e
wait -n "${pids[@]}"
exit 1
