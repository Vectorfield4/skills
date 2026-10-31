#!/usr/bin/env sh
# Read-only geo domain guard. Prints JSON on stdout, exit 1 when a check fails.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SCRIPT="$DIR/check-domain.mjs"

if [ ! -f "$SCRIPT" ]; then
  printf 'check-domain.sh: cannot find check-domain.mjs next to this script (%s)\n' "$SCRIPT" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'check-domain.sh: node is not on PATH (the repo needs Node 24+)\n' >&2
  exit 2
fi

exec node "$SCRIPT" "$@"