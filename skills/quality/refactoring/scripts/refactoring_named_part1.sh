#!/usr/bin/env sh
set -eu
here="$(cd "$(dirname "$0")" && pwd -P)"
repo="$(cd "$here/../../../.." && pwd -P)"
engine="$repo/lib/refactor/utilities/inventory.mjs"
[ -f "$engine" ] || { echo "engine not found: $engine" >&2; exit 2; }
exec node "$engine" "$@"
