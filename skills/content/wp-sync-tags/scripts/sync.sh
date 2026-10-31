#!/usr/bin/env sh
# Runs the wp-sync-tags engine (sync.mjs) in the same directory.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/sync.mjs"

if [ ! -f "$engine" ]; then
    printf 'sync.sh: engine not found: %s\n' "$engine" >&2
    exit 2
fi

exec node "$engine" "$@"