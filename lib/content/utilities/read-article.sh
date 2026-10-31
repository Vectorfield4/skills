#!/usr/bin/env sh
# Reads one article file as JSON. POSIX wrapper over read-article.mjs in the
# same directory: it forwards every argument and nothing else, so the engine
# stays the only place that parses flags and the only thing writing stdout.
#
#   ./read-article.sh --file articles/<slug>.ru.md --field tags
#
# Exit codes: 0 read, 1 unreadable file, 2 bad usage.

set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
engine="$here/read-article.mjs"

if [ ! -f "$engine" ]; then
  printf 'read-article.sh: engine not found: %s\n' "$engine" >&2
  exit 2
fi

exec node "$engine" "$@"
