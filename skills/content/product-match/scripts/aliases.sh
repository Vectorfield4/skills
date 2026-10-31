#!/usr/bin/env sh
# Runs the product-match engine (aliases.mjs) in the same directory.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/aliases.mjs"

if [ ! -f "$engine" ]; then
    printf 'aliases.sh: engine not found: %s\n' "$engine" >&2
    exit 2
fi

exec node "$engine" "$@"