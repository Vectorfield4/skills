#!/usr/bin/env sh
cd "$(dirname "$0")" && pwd -P
exec node consume.mjs "$@"
