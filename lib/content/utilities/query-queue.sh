#!/usr/bin/env sh
# Reads the pending image queue (list or get) as JSON on stdout.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SCRIPT="$DIR/query-queue.mjs"

if [ ! -f "$SCRIPT" ]; then
  printf 'query-queue.sh: cannot find query-queue.mjs next to this script (%s)\n' "$SCRIPT" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'query-queue.sh: node is not on PATH (the repo needs Node 24+)\n' >&2
  exit 2
fi

exec node "$SCRIPT" "$@"