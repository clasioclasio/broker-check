#!/usr/bin/env bash
# BROKER CHECK: NEW Ubuntu 22.04/24.04 or Debian 12/13 x86_64 VPS.
# Never run untrusted repository code. This installer does not register domains.
set +x
set -Eeuo pipefail
umask 077

APP_ROOT=/opt/broker-check
TOOLS=/opt/broker-check-tools
APP_USER=brokercheck
APP_HOME=/var/lib/broker-check
CONFIG=/etc/broker-check
API_PORT=3100
PNPM_VERSION=10.26.1
WORK=
SSL_EMAIL=
LOCAL_SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

fail() { printf '\nОшибка: %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }
validate_repo() {
  [[ "$1" =~ ^https://github\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+(\.git)?/?$ ]] &&
    [[ "$1" != *"/../"* && "$1" != *"/./"* ]]
}
validate_domain() {
  local domain=$1 label
  [[ ${#domain} -le 253 && "$domain" == *.* && "$domain" != *..* ]] || return 1
  [[ "$domain" =~ ^[a-z0-9.-]+$ && ! "$domain" =~ ^[0-9.]+$ ]] || return 1
  local -a labels
  IFS=. read -r -a labels <<< "$domain"
  for label in "${labels[@]}"; do
    [[ ${#label} -ge 1 && ${#label} -le 63 &&
       "$label" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || return 1
  done
  [[ "$domain" != *. ]]
}
validate_email() {
  local email=$1
  [[ "$email" =~ ^[A-Za-z0-9._%+-]+@ ]] &&
    [[ "$email" != *$'\n'* && ${#email} -le 254 ]] &&
    validate_domain "${email#*@}"
}
project_sources_present() {
  local root=$1 file
  for file in package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json \
    artifacts/broker-check/package.json artifacts/api-server/package.json lib/db/drizzle.config.ts; do
    [[ -f "$root/$file" ]] || return 1
  done
}
copy_project_sources() {
  local from=$1 target=$2 entry
  local -a entries=(package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json
    artifacts/broker-check artifacts/api-server lib scripts deployment)
  for entry in .npmrc .gitignore install.sh README.ru.md; do
    [[ ! -f "$from/$entry" ]] || entries+=("$entry")
  done
  # No .env, Git metadata, build outputs or customer exports enter the new source tree.
  tar -C "$from" --exclude=node_modules --exclude=dist --exclude=.git \
    --exclude='.env' --exclude='.env.*' --exclude='*.dump' --exclude='*.backup' \
    --exclude='*.log' --exclude='*.pem' --exclude='*.key' --exclude='*.tsbuildinfo' \
    --exclude=__pycache__ --exclude=runtime.env --exclude=credentials.json \
    -cf - "${entries[@]}" | as_app tar --no-same-owner -C "$target" -xf -
}
env_line() {
  # systemd EnvironmentFile syntax, NOT shell syntax; no eval or sourcing.
  local value=$2
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s="%s"\n' "$1" "$value"
}
as_app() {
  runuser -u "$APP_USER" -- env -i \
    HOME="$APP_HOME" USER="$APP_USER" LOGNAME="$APP_USER" \
    PATH="$TOOLS/node/bin:$TOOLS/node_modules/.bin:/usr/bin:/bin" \
    CI=true GIT_TERMINAL_PROMPT=0 "$@"
}
cleanup() {
  [[ -z "$WORK" ]] || rm -rf -- "$WORK"
}
on_error() {
  local code=$?
  printf '\nУстановка остановлена (шаг/строка %s, код %s).\n' "$1" "$code" >&2
  printf 'База и файлы автоматически НЕ удаляются. Не запускайте установку поверх существующей.\n' >&2
  printf 'Журналы: journalctl -u broker-check-api -u broker-check-web -n 80 --no-pager\n' >&2
  exit "$code"
}

check_dns() {
  local public_ip records record ipv6 local_v6
  public_ip=$(curl -4fsS --connect-timeout 10 --max-time 20 https://api.ipify.org)
  [[ "$public_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    fail "Не удалось определить публичный IPv4 сервера."
  records=$(dig +short A "$DOMAIN" @1.1.1.1 | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
  [[ -n "$records" ]] || fail "DNS: добавьте A-запись $DOMAIN → $public_ip у регистратора и дождитесь обновления DNS."
  while IFS= read -r record; do
    [[ "$record" == "$public_ip" ]] ||
      fail "DNS: $DOMAIN указывает на $record, а сервер — $public_ip. Нужна прямая A-запись без прокси CDN."
  done <<< "$records"
  ipv6=$(dig +short AAAA "$DOMAIN" @1.1.1.1 | grep ':' || true)
  local_v6=$(ip -o -6 addr show scope global | awk '{print $4}' | cut -d/ -f1)
  if [[ -n "$ipv6" ]]; then
    # Compare canonical IPv6 addresses, not different textual representations.
    printf '%s\n---\n%s\n' "$ipv6" "$local_v6" | python3 -c '
import ipaddress, sys
remote, local = sys.stdin.read().split("\n---\n", 1)
remote = {ipaddress.ip_address(s) for s in remote.split()}
local = {ipaddress.ip_address(s) for s in local.split()}
sys.exit(0 if remote <= local else 1)
' || fail "Есть AAAA-запись не этого сервера. Исправьте или удалите её перед выпуском SSL."
  fi
}

install_node() {
  local archive
  curl -fsS --retry 3 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$WORK/SHASUMS256.txt"
  archive=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$WORK/SHASUMS256.txt")
  [[ "$archive" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] ||
    fail "Не удалось найти официальный архив Node.js 22."
  curl -fsS --retry 3 "https://nodejs.org/dist/latest-v22.x/$archive" -o "$WORK/$archive"
  (cd "$WORK"; grep "  $archive\$" SHASUMS256.txt | sha256sum --check --status)
  install -d -m 755 "$TOOLS/node"
  tar -xJf "$WORK/$archive" --strip-components=1 -C "$TOOLS/node"
  PATH="$TOOLS/node/bin:/usr/bin:/bin" "$TOOLS/node/bin/npm" install \
    --prefix "$TOOLS" --ignore-scripts --no-audit --no-fund "pnpm@$PNPM_VERSION"
  chmod -R a+rX "$TOOLS"
}

write_config() {
  install -d -m 700 "$CONFIG"
  {
    env_line NODE_ENV production
    env_line HOST 127.0.0.1
    env_line PORT "$API_PORT"
    env_line DATABASE_URL 'postgresql://brokercheck@localhost/brokercheck?host=/var/run/postgresql'
    env_line SESSION_SECRET "$(openssl rand -hex 48)"
    env_line ADMIN_USERNAME "$ADMIN_LOGIN"
    env_line ADMIN_PASSWORD "$ADMIN_PASS"
  } > "$CONFIG/runtime.env"
  chmod 600 "$CONFIG/runtime.env"
  unset ADMIN_PASS ADMIN_PASS_CONFIRM
  # Caddy runs as its own user; this file contains a domain, NOT secrets.
  chmod 755 "$CONFIG"
  {
    if [[ -n "$SSL_EMAIL" ]]; then
      printf '{\n    email %s\n}\n\n' "$SSL_EMAIL"
    fi
    cat <<EOF
$DOMAIN {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
    @api path /api /api/*
    handle @api {
        reverse_proxy 127.0.0.1:$API_PORT
    }
    handle {
        root * /var/www/broker-check
        try_files {path} /index.html
        file_server
    }
}
EOF
  } > "$CONFIG/Caddyfile"
  chmod 644 "$CONFIG/Caddyfile"
}

write_services() {
  cat > /etc/systemd/system/broker-check-api.service <<EOF
[Unit]
Description=BROKER CHECK API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_ROOT/source
EnvironmentFile=$CONFIG/runtime.env
ExecStart=$TOOLS/node/bin/node --enable-source-maps $APP_ROOT/source/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_HOME
RestrictSUIDSGID=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
  cat > /etc/systemd/system/broker-check-web.service <<EOF
[Unit]
Description=BROKER CHECK HTTPS server
After=network-online.target broker-check-api.service
Wants=network-online.target

[Service]
Type=simple
User=caddy
Group=caddy
Environment=HOME=/var/lib/caddy
Environment=XDG_DATA_HOME=/var/lib/caddy
Environment=XDG_CONFIG_HOME=/var/lib/caddy/.config
ExecStart=/usr/bin/caddy run --config $CONFIG/Caddyfile --adapter caddyfile
ExecReload=/usr/bin/caddy reload --config $CONFIG/Caddyfile --adapter caddyfile
Restart=on-failure
RestartSec=5
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/var/lib/caddy

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 /etc/systemd/system/broker-check-{api,web}.service
}

verify_https() {
  local deadline=$((SECONDS + 180))
  info "Ожидание SSL-сертификата (до 3 минут)"
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" \
      "https://$DOMAIN/api/healthz" >/dev/null 2>&1; then
      curl -fsS --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/admin" >/dev/null
      return
    fi
    sleep 3
  done
  fail "SSL ещё не выпущен. Проверьте DNS, CAA, входящие TCP 80/443 в панели хостинга и journalctl -u broker-check-web. Сервисы оставлены запущенными; Caddy продолжит попытки."
}

main() {
  if [[ "${1:-}" == --help ]]; then
    printf 'Запуск из корня скачанного проекта: sudo bash install.sh\nНужен НОВЫЙ Ubuntu 22.04/24.04 или Debian 12/13 x86_64, systemd, домен с DNS на этот сервер.\nЕсли исходники рядом, установка использует их без повторного скачивания.\n'
    return
  fi
  [[ $# -eq 0 ]] || fail "Неизвестные аргументы. Используйте --help."
  [[ $EUID -eq 0 ]] || fail "Запустите: sudo bash install.sh"
  [[ -e /dev/tty ]] || fail "Нужен интерактивный терминал SSH, не curl | bash."
  exec 3<>/dev/tty
  trap cleanup EXIT
  trap 'on_error "$LINENO"' ERR
  [[ -f /etc/os-release ]] || fail "Не удалось определить ОС."
  # This file is owned by the OS administrator, not a repository.
  . /etc/os-release
  case "$ID:$VERSION_ID" in
    ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) ;;
    *) fail "Поддерживаются Ubuntu 22.04/24.04 и Debian 12/13." ;;
  esac
  [[ "$(uname -m)" == x86_64 ]] || fail "Нужен сервер x86_64 (AMD64), не ARM."
  [[ -d /run/systemd/system ]] || fail "Нужен обычный VPS с systemd."
  for path in "$APP_ROOT" "$TOOLS" "$CONFIG" "$APP_HOME" /var/www/broker-check \
    /etc/systemd/system/broker-check-api.service /etc/systemd/system/broker-check-web.service; do
    [[ ! -e "$path" ]] || fail "$path уже существует. Эта установка только для нового сервера; существующие файлы не изменены."
  done
  id "$APP_USER" >/dev/null 2>&1 && fail "Пользователь $APP_USER уже существует; установка поверх существующей запрещена."
  if command -v ss >/dev/null; then
    [[ -z "$(ss -H -ltn "( sport = :80 or sport = :443 or sport = :$API_PORT )")" ]] ||
      fail "Порты 80, 443 или $API_PORT заняты. Используйте отдельный новый сервер."
  fi
  command -v caddy >/dev/null && fail "Caddy уже установлен. Для безопасности нужен новый сервер."

  printf '\nBROKER CHECK — автоматическая установка\n'
  printf 'Будут установлены PostgreSQL, Node.js 22, pnpm и Caddy; созданы отдельная база,\n'
  printf 'системный пользователь и службы автозапуска. Существующие данные не импортируются.\n'
  printf 'Код репозитория выполняется при сборке. Используйте только свой доверенный репозиторий.\n'
  if project_sources_present "$LOCAL_SOURCE"; then
    printf 'Найдены исходники: %s\nБудет установлена именно эта скачанная версия сайта.\n' "$LOCAL_SOURCE"
  else
    LOCAL_SOURCE=
    printf 'Исходников рядом нет: потребуется ссылка на публичный GitHub-репозиторий.\n'
  fi
  read -r -u 3 -p 'Продолжить на этом сервере? Введите ДА: ' answer
  [[ "$answer" == ДА ]] || fail "Установка отменена."
  if [[ -z "$LOCAL_SOURCE" ]]; then
    read -r -u 3 -p 'Ссылка на ПУБЛИЧНЫЙ GitHub-репозиторий (https://github.com/owner/repo): ' REPO
    validate_repo "$REPO" || fail "Нужна HTTPS-ссылка на корень публичного GitHub-репозитория, без токенов и параметров."
  fi
  read -r -u 3 -p 'Домен сайта (например check.example.com, без https://): ' DOMAIN
  DOMAIN=${DOMAIN,,}
  validate_domain "$DOMAIN" || fail "Некорректный домен. Кириллические домены вводите в формате punycode."
  read -r -u 3 -p 'Email для SSL-сертификата (необязательно, Enter — пропустить): ' SSL_EMAIL
  [[ -z "$SSL_EMAIL" ]] || validate_email "$SSL_EMAIL" || fail "Некорректный email для SSL."
  printf 'HTTPS-сертификат будет выпущен и будет продлеваться автоматически.\n'
  read -r -u 3 -p 'Создайте логин администратора (латиница, цифры, _, -; 3–64 символа): ' ADMIN_LOGIN
  [[ "$ADMIN_LOGIN" =~ ^[A-Za-z0-9_-]{3,64}$ ]] || fail "Некорректный логин."
  read -r -s -u 3 -p 'Создайте пароль администратора (12–128 символов): ' ADMIN_PASS; printf '\n' >&3
  read -r -s -u 3 -p 'Повторите пароль: ' ADMIN_PASS_CONFIRM; printf '\n' >&3
  [[ ${#ADMIN_PASS} -ge 12 && ${#ADMIN_PASS} -le 128 && "$ADMIN_PASS" != *$'\r'* ]] ||
    fail "Пароль должен содержать 12–128 символов, без перевода строки."
  [[ "$ADMIN_PASS" == "$ADMIN_PASS_CONFIRM" ]] || fail "Пароли не совпадают."
  local free_kb
  free_kb=$(df -Pk /opt | awk 'NR == 2 {print $4}')
  [[ "$free_kb" =~ ^[0-9]+$ && "$free_kb" -ge 8388608 ]] ||
    fail "Нужно не менее 8 ГБ свободного места на разделе /opt (рекомендуется 15 ГБ)."

  WORK=$(mktemp -d /tmp/broker-check-install.XXXXXXXX)
  info "Установка системных зависимостей"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git xz-utils openssl python3 dnsutils iproute2 build-essential
  # Check DNS before installing Caddy or creating any application directories.
  # A failed DNS check can therefore be corrected and retried safely.
  check_dns
  apt-get install -y postgresql postgresql-client caddy
  systemctl disable --now caddy
  systemctl enable --now postgresql
  # An existing PostgreSQL cluster is allowed only if our names are unused.
  [[ "$(runuser -u postgres -- psql -X -Atqc "SELECT count(*) FROM pg_roles WHERE rolname = 'brokercheck'")" == 0 ]] ||
    fail "Роль PostgreSQL brokercheck уже существует; ничего не перезаписываем."
  [[ "$(runuser -u postgres -- psql -X -Atqc "SELECT count(*) FROM pg_database WHERE datname = 'brokercheck'")" == 0 ]] ||
    fail "База brokercheck уже существует; ничего не перезаписываем."
  if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
    ufw allow 80/tcp
    ufw allow 443/tcp
  fi
  info "Установка Node.js и pnpm (без изменения системного Node.js)"
  install -d -m 755 "$TOOLS"
  install_node
  useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
  chmod 750 "$APP_HOME"
  install -d -m 755 "$APP_ROOT"
  install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$APP_ROOT/source"
  if [[ -n "$LOCAL_SOURCE" ]]; then
    info "Подготовка скачанной версии сайта"
    copy_project_sources "$LOCAL_SOURCE" "$APP_ROOT/source"
  else
    info "Загрузка публичного репозитория"
    as_app git -c credential.helper= clone --depth 1 -- "$REPO" "$APP_ROOT/source"
  fi
  project_sources_present "$APP_ROOT/source" ||
    fail "В скачанном проекте нет необходимых исходников. Проверьте, что все файлы загружены в корень репозитория."
  cd "$APP_ROOT/source"
  info "Установка зависимостей и сборка"
  as_app pnpm install --frozen-lockfile
  as_app pnpm run typecheck:libs
  as_app pnpm --filter @workspace/api-server run typecheck
  as_app pnpm --filter @workspace/broker-check run typecheck
  as_app pnpm --filter @workspace/api-server run build
  as_app env NODE_ENV=production BASE_PATH=/ PORT=23001 pnpm --filter @workspace/broker-check run build
  # Caddy can only see compiled public files; no sources or configuration files.
  install -d -m 755 /var/www/broker-check
  cp -R artifacts/broker-check/dist/public/. /var/www/broker-check/
  find /var/www/broker-check -type d -exec chmod 755 {} +
  find /var/www/broker-check -type f -exec chmod 644 {} +

  info "Создание новой пустой базы (локальный Unix socket, без открытого сетевого доступа)"
  runuser -u postgres -- createuser --no-superuser --no-createdb --no-createrole "$APP_USER"
  runuser -u postgres -- createdb --owner "$APP_USER" brokercheck
  local schema
  schema=$(mktemp "$APP_HOME/schema.XXXXXXXX.sql")
  as_app env DATABASE_URL='postgresql://brokercheck@localhost/brokercheck?host=/var/run/postgresql' \
    pnpm --filter @workspace/db exec drizzle-kit export --config ./drizzle.config.ts > "$schema"
  chown "$APP_USER:$APP_USER" "$schema"
  grep -q 'CREATE TABLE "consultation_requests"' "$schema" || fail "Не удалось подготовить схему базы."
  as_app psql -X -h /var/run/postgresql -d brokercheck --set ON_ERROR_STOP=1 --single-transaction --file "$schema"
  rm -- "$schema"

  info "Настройка доступа администратора, HTTPS и автозапуска"
  write_config
  write_services
  caddy validate --config "$CONFIG/Caddyfile" --adapter caddyfile
  systemctl daemon-reload
  systemctl enable --now broker-check-api
  local attempt
  for attempt in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$API_PORT/api/healthz" >/dev/null 2>&1 && break
    sleep 2
  done
  curl -fsS "http://127.0.0.1:$API_PORT/api/healthz" >/dev/null ||
    fail "API не запустился; проверьте journalctl -u broker-check-api."
  systemctl enable --now broker-check-web
  verify_https
  printf '\nУстановка завершена.\nСайт: https://%s\nАдмин-панель: https://%s/admin\n' "$DOMAIN" "$DOMAIN"
  printf 'Логин: %s\nПароль не выводится. SSL продлевается автоматически Caddy.\n' "$ADMIN_LOGIN"
  printf 'Резервное копирование и обслуживание: deployment/README.ru.md в репозитории.\n'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
