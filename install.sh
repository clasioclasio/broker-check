#!/usr/bin/env bash
# BROKER CHECK — entry point included at the root of the public repository.
set -Eeuo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ ! -f "$HERE/deployment/install.sh" ]]; then
  printf 'Не найден %s/deployment/install.sh\nЗагрузите ВСЕ файлы проекта в GitHub, а не только корневой install.sh.\n' "$HERE" >&2
  exit 1
fi
exec bash "$HERE/deployment/install.sh" "$@"
