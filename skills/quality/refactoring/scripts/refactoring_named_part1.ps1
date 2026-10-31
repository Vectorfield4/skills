$ErrorActionPreference = "Stop"
$repo = node -e "const p=require('path'),f=require('fs');process.stdout.write(p.resolve(f.realpathSync(process.argv[1]),'../../../..'))" "$PSScriptRoot"
$engine = Join-Path $repo "lib/refactor/utilities/inventory.mjs"
if (-not (Test-Path $engine)) { Write-Error "engine not found: $engine"; exit 2 }
& node $engine @args
exit $LASTEXITCODE
