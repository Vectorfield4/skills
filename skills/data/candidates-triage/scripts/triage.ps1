$engine = Join-Path $PSScriptRoot "triage.mjs"
& node $engine @args
exit $LASTEXITCODE
