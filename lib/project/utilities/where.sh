#!/usr/bin/env sh
# Prints the project root and its skill config as JSON on stdout.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SCRIPT="$DIR/where.mjs"

if [ ! -f "$SCRIPT" ]; then
  printf 'where.sh: cannot find where.mjs next to this script (%s)\n' "$SCRIPT" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'where.sh: node is not on PATH (the repo needs Node 24+)\n' >&2
  exit 2
fi

exec node "$SCRIPT" "$@"