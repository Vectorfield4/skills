#!/usr/bin/env sh
# Runs the wp-record engine (record.mjs) in the same directory.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/record.mjs"

if [ ! -f "$engine" ]; then
    printf 'record.sh: engine not found: %s\n' "$engine" >&2
    exit 2
fi

exec node "$engine" "$@"