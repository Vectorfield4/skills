#!/usr/bin/env sh
# Runs the product-match engine (tags.mjs) in the same directory.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/tags.mjs"

if [ ! -f "$engine" ]; then
    printf 'tags.sh: engine not found: %s\n' "$engine" >&2
    exit 2
fi

exec node "$engine" "$@"