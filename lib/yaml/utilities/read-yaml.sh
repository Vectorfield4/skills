#!/usr/bin/env sh
# Reads a YAML domain file, validates it against its TypeScript contract and
# prints JSON. POSIX wrapper over read-yaml.mjs in the same directory, so a
# chain of skills keeps one contract: JSON on stdout, exit 0/1/2.
#
#   ./read-yaml.sh -type=content/precedent-questionnaire \
#                  -file=data/content/precedent-questionnaire.yaml
#
#   ./read-yaml.sh --type content/precedent-questionnaire --report --pretty
#
# Exit codes: 0 valid, 1 schema violations, 2 broken YAML, type or arguments.

set -eu

SELF=$0
DIR=$(CDPATH= cd -- "$(dirname -- "$SELF")" && pwd)
SCRIPT="$DIR/read-yaml.mjs"

if [ ! -f "$SCRIPT" ]; then
  printf 'read-yaml.sh: cannot find read-yaml.mjs next to this script (%s)\n' "$SCRIPT" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'read-yaml.sh: node is not on PATH (the repo needs Node 24+)\n' >&2
  exit 2
fi

exec node "$SCRIPT" "$@"
