#!/usr/bin/env bash
# BROKER CHECK: update an installation created by deployment/install.sh.
# No schema changes, no credential changes, no database deletion.
set +x
set -Eeuo pipefail
umask 077

fail() { printf '\nОшибка: %s\n' "$*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || fail "Запустите от root: sudo bash deployment/update.sh"
REPO=${1:-https://github.com/clasioclasio/proverka.git}
[[ "$REPO" =~ ^https://github\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+(\.git)?/?$ ]] ||
  fail "Нужна ссылка на корень публичного GitHub-репозитория без токенов."
ROOT=/opt/broker-check
TOOLS=/opt/broker-check-tools
PUBLIC=/var/www/broker-check
STAMP=$(date -u +%Y%m%d-%H%M%S)-$$
STAGE=$ROOT/update-$STAMP
OLD=$ROOT/source-before-$STAMP
OLD_PUBLIC=/var/www/broker-check-before-$STAMP
BACKUP=/var/backups/broker-check
SWITCHED=0
PUBLIC_SWITCHED=0
API_STOPPED=0
as_app() {
  runuser -u brokercheck -- env -i HOME=/var/lib/broker-check USER=brokercheck LOGNAME=brokercheck \
    PATH="$TOOLS/node/bin:$TOOLS/node_modules/.bin:/usr/bin:/bin" CI=true GIT_TERMINAL_PROMPT=0 "$@"
}
rollback() {
  local code=$?
  [[ "$code" != 0 ]] || code=1
  trap - ERR INT TERM
  if [[ "$PUBLIC_SWITCHED" == 1 ]]; then
    mv "$PUBLIC" "$ROOT/failed-public-$STAMP" || true
    mv "$OLD_PUBLIC" "$PUBLIC" || true
  fi
  if [[ "$SWITCHED" == 1 ]]; then
    mv "$ROOT/source" "$ROOT/failed-source-$STAMP" || true
    mv "$OLD" "$ROOT/source" || true
  fi
  if [[ "$API_STOPPED" == 1 ]]; then systemctl start broker-check-api || true; fi
  printf '\nОбновление остановлено. База и настройки не удалены. Предыдущая версия восстановлена, если переключение уже началось.\n' >&2
  exit "${code:-1}"
}
[[ -f /etc/broker-check/runtime.env && -f /etc/broker-check/Caddyfile &&
   -d "$ROOT/source" && -d "$PUBLIC" && -x "$TOOLS/node/bin/node" ]] ||
  fail "Не найдена установка нашего install.sh. Повторную установку не запускаем."
systemctl is-active --quiet broker-check-api || fail "Сначала восстановите работающий API."
[[ ! -e "$STAGE" && ! -e "$OLD" && ! -e "$OLD_PUBLIC" ]] || fail "Пути обновления уже заняты."
# Prevent two updates from switching releases at the same time.
exec 9>/run/lock/broker-check-update.lock
flock -n 9 || fail "Другое обновление уже выполняется."
trap rollback ERR INT TERM
printf 'Загрузка новой версии из %s\n' "$REPO"
install -d -m 755 -o brokercheck -g brokercheck "$STAGE"
as_app git -c credential.helper= clone --depth 1 -- "$REPO" "$STAGE"
[[ -f "$STAGE/deployment/update.sh" && -f "$STAGE/artifacts/broker-check/src/lib/submission-lock.ts" ]] ||
  fail "В GitHub ещё нет обновления запрета повторных заявок. Сначала загрузите новые исходники."
cd "$STAGE"
as_app pnpm install --frozen-lockfile
as_app pnpm run typecheck:libs
as_app pnpm --filter @workspace/api-server run typecheck
as_app pnpm --filter @workspace/broker-check run typecheck
as_app pnpm --filter @workspace/api-server run build
as_app env NODE_ENV=production BASE_PATH=/ PORT=23001 pnpm --filter @workspace/broker-check run build
[[ -f artifacts/api-server/dist/index.mjs && -f artifacts/broker-check/dist/public/index.html ]] ||
  fail "Сборка не создала необходимые файлы."
install -d -m 700 "$BACKUP"
# Existing live data stays in place; this is only a protected recovery copy.
runuser -u postgres -- pg_dump -Fc brokercheck > "$BACKUP/database-$STAMP.dump"
install -d -m 755 "$ROOT/public-$STAMP"
cp -R artifacts/broker-check/dist/public/. "$ROOT/public-$STAMP/"
find "$ROOT/public-$STAMP" -type d -exec chmod 755 {} +
find "$ROOT/public-$STAMP" -type f -exec chmod 644 {} +
cd "$ROOT"
systemctl stop broker-check-api
API_STOPPED=1
mv "$ROOT/source" "$OLD"
SWITCHED=1
mv "$STAGE" "$ROOT/source"
systemctl start broker-check-api
healthy=0
for ((i=0; i<30; i++)); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3100/api/healthz >/dev/null; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { printf 'API новой версии не запустился.\n' >&2; false; }
mv "$PUBLIC" "$OLD_PUBLIC"
PUBLIC_SWITCHED=1
mv "$ROOT/public-$STAMP" "$PUBLIC"
trap - ERR INT TERM
printf '\nОбновление завершено. Повторные заявки заблокированы.\n'
printf 'База, домен, SSL и учётная запись администратора сохранены.\n'
printf 'Резервная копия базы: %s/database-%s.dump\nПредыдущие исходники: %s\n' "$BACKUP" "$STAMP" "$OLD"
