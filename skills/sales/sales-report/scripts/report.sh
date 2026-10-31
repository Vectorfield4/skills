#!/usr/bin/env sh
# Runs the sales-report engine (report.mjs) in the same directory.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/report.mjs"

if [ ! -f "$engine" ]; then
    printf 'report.sh: engine not found: %s\n' "$engine" >&2
    exit 2
fi

exec node "$engine" "$@"