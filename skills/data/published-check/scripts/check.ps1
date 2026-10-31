$engine = Join-Path $PSScriptRoot "check.mjs"
& node $engine @args
exit $LASTEXITCODE
