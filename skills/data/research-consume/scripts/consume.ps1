$engine = Join-Path $PSScriptRoot "consume.mjs"
& node $engine @args
exit $LASTEXITCODE
